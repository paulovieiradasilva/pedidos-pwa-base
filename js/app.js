import { findCustomerByPhone, saveCustomer, listCustomers } from './customers.js';
import { seedProductsIfEmpty, listProducts, listActiveProducts, saveProduct, setProductActive } from './products.js';
import { createOrder, updateOrder, listOrdersForDay, localDateString, updateOrderStatus } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

const VALID_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24',
  '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99'
]);

function isValidBrazilianPhone(digits) {
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) return false;
  const firstNumberDigit = digits[2];
  if (digits.length === 11) return firstNumberDigit === '9';
  return firstNumberDigit !== '0' && firstNumberDigit !== '1';
}

document.addEventListener('alpine:init', () => {
  Alpine.data('pedidosApp', () => ({
    currentView: 'pedidosDoDia',

    phone: '',
    address: '',
    products: [],
    activeProducts: [],
    customers: [],
    phoneSuggestions: [],
    addressSuggestions: [],
    customerMatchStatus: null,
    phoneError: '',
    selectedProductId: '',
    qty: null,
    weightGrams: null,
    weightManualTotal: null,
    weightTotalTouched: false,
    cartItems: [],
    editingOrderId: null,
    editingCartItemIndex: null,
    paymentMethod: '',
    changeFor: null,
    toastMessage: '',
    toastVisible: false,
    toastTimer: null,
    showOrderForm: false,
    todayOrders: [],
    visibleOrderCount: 15,
    selectedDate: localDateString(new Date()),
    paymentFilter: { dinheiro: true, pix: true, cartao: true },
    orderStatusTab: 'pendente',
    selectedOrderIds: [],
    printerCharacteristic: null,

    productForm: {
      id: null, name: '', brand: '',
      soldByWeight: false, pricePerKg: null,
      priceDinheiro: null, pricePix: null, priceCartao: null
    },
    priceSyncPix: true,
    priceSyncCartao: true,
    productFormError: '',
    showProductForm: false,
    productSearch: '',
    productFilter: 'active',

    async init() {
      await seedProductsIfEmpty();
      await this.setView('pedidosDoDia');
    },

    showToast(message) {
      clearTimeout(this.toastTimer);
      this.toastMessage = message;
      this.toastVisible = true;
      this.toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 4000);
    },

    async setView(view) {
      this.currentView = view;
      if (view === 'produtos') {
        this.products = await listProducts();
      } else if (view === 'pedidosDoDia') {
        this.products = await listProducts();
        this.activeProducts = await listActiveProducts();
        this.customers = await listCustomers();
        this.selectedOrderIds = [];
        await this.refreshOrders();
      }
    },

    setOrderStatusTab(tab) {
      this.orderStatusTab = tab;
      this.selectedOrderIds = [];
    },

    formatPhoneMask(value) {
      const digits = value.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    },

    onPhoneInput(event) {
      this.phone = this.formatPhoneMask(event.target.value);
      event.target.value = this.phone;
      this.phoneError = '';
      const digits = this.phoneDigits();
      this.phoneSuggestions = digits.length >= 3
        ? this.customers.filter(c => c.phone.includes(digits))
        : [];
    },

    normalizeSearchText(value) {
      return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase();
    },

    onAddressInput(value) {
      this.address = value;
      const query = this.normalizeSearchText(value);
      this.addressSuggestions = query.length >= 3
        ? this.customers.filter(c => this.normalizeSearchText(c.address ?? '').includes(query))
        : [];
    },

    applyCustomerSelection(customer) {
      this.phone = this.formatPhoneMask(customer.phone);
      this.address = customer.address;
      this.customerMatchStatus = 'existing';
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      if (document.activeElement) document.activeElement.blur();
    },

    selectPhoneSuggestion(customer) {
      this.applyCustomerSelection(customer);
    },

    selectAddressSuggestion(customer) {
      this.applyCustomerSelection(customer);
    },

    phoneDigits() {
      return this.phone.replace(/\D/g, '');
    },

    async lookupCustomer() {
      const digits = this.phoneDigits();
      if (digits.length !== 10 && digits.length !== 11) {
        this.customerMatchStatus = null;
        this.phoneError = '';
        return;
      }
      if (!isValidBrazilianPhone(digits)) {
        this.customerMatchStatus = null;
        this.phoneError = 'Telefone inválido — confira o DDD e o número.';
        return;
      }
      this.phoneError = '';
      const customer = await findCustomerByPhone(digits);
      if (customer) {
        this.address = customer.address;
        this.customerMatchStatus = 'existing';
      } else {
        this.customerMatchStatus = 'new';
      }
    },

    selectedNewOrderProduct() {
      return this.activeProducts.find(p => p.id === this.selectedProductId);
    },

    onWeightGramsInput(value) {
      this.weightGrams = value === '' ? null : Number(value);
      const product = this.selectedNewOrderProduct();
      if (!this.weightTotalTouched && product && this.weightGrams != null) {
        this.weightManualTotal = product.pricePerKg * (this.weightGrams / 1000);
      }
    },

    onWeightTotalInput(value) {
      this.weightManualTotal = value === '' ? null : Number(value);
      this.weightTotalTouched = true;
    },

    validateCurrentItem() {
      if (!this.selectedProductId) {
        return 'Selecione um produto antes de adicionar.';
      }
      const selectedProduct = this.selectedNewOrderProduct();
      if (!selectedProduct) {
        return 'Produto selecionado não está mais disponível. Selecione novamente.';
      }
      if (selectedProduct.soldByWeight) {
        if (!this.weightGrams || this.weightGrams <= 0) {
          return 'Informe a quantidade em gramas antes de adicionar.';
        }
      } else if (!Number.isInteger(this.qty) || this.qty <= 0) {
        return 'Informe uma quantidade válida antes de adicionar.';
      }
      return null;
    },

    onQtyInput(value) {
      this.qty = value === '' ? null : Number(value);
    },

    addCartItem() {
      const error = this.validateCurrentItem();
      if (error) {
        this.showToast(error);
        return;
      }

      const selectedProduct = this.selectedNewOrderProduct();
      const item = selectedProduct.soldByWeight
        ? { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), grams: this.weightGrams, manualTotal: this.weightManualTotal }
        : { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), qty: this.qty };

      if (this.editingCartItemIndex != null) {
        this.cartItems[this.editingCartItemIndex] = item;
        this.editingCartItemIndex = null;
      } else {
        this.cartItems.push(item);
      }

      this.selectedProductId = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
    },

    startEditCartItem(index) {
      const item = this.cartItems[index];
      this.selectedProductId = item.productId;
      if (item.grams != null) {
        this.weightGrams = item.grams;
        this.weightManualTotal = item.manualTotal;
        this.weightTotalTouched = true;
        this.qty = null;
      } else {
        this.qty = item.qty;
        this.weightGrams = null;
        this.weightManualTotal = null;
        this.weightTotalTouched = false;
      }
      this.editingCartItemIndex = index;
    },

    removeCartItem(index) {
      this.cartItems.splice(index, 1);
      if (this.editingCartItemIndex === index) {
        this.editingCartItemIndex = null;
      }
    },

    cartItemLineTotal(item) {
      if (item.grams != null) return item.manualTotal ?? 0;
      const product = this.products.find(p => p.id === item.productId);
      if (!product || !this.paymentMethod) return 0;
      return product.prices[this.paymentMethod] * item.qty;
    },

    orderTotal() {
      if (!this.paymentMethod) return 0;
      return this.cartItems.reduce((sum, item) => sum + this.cartItemLineTotal(item), 0);
    },

    changeAmountLive() {
      return Math.max((this.changeFor ?? 0) - this.orderTotal(), 0);
    },

    resetForm() {
      this.phone = '';
      this.address = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.cartItems = [];
      this.editingCartItemIndex = null;
      this.paymentMethod = '';
      this.changeFor = null;
      this.selectedProductId = '';
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      this.customerMatchStatus = null;
      this.phoneError = '';
    },

    async openNewOrderForm() {
      this.resetForm();
      this.editingOrderId = null;
      this.showOrderForm = true;
      this.customers = await listCustomers();
      this.activeProducts = await listActiveProducts();
    },

    async startEditOrder(order) {
      this.editingOrderId = order.id;
      this.phone = this.formatPhoneMask(order.customerPhone);
      this.address = order.address ?? '';
      this.paymentMethod = order.paymentMethod;
      this.changeFor = order.changeFor ?? null;
      this.cartItems = order.items.map(item => ({
        ...item,
        productName: this.productDisplayName(this.products.find(p => p.id === item.productId))
      }));
      this.selectedProductId = '';
      this.qty = null;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.editingCartItemIndex = null;
      this.phoneSuggestions = [];
      this.addressSuggestions = [];
      this.customerMatchStatus = null;
      this.phoneError = '';
      this.customers = await listCustomers();
      this.activeProducts = await listActiveProducts();
      this.showOrderForm = true;
    },

    closeOrderForm() {
      this.resetForm();
      this.editingOrderId = null;
      this.showOrderForm = false;
    },

    async saveOrder() {
      const phoneDigits = this.phoneDigits();
      if (!isValidBrazilianPhone(phoneDigits)) {
        this.phoneError = 'Telefone inválido — confira o DDD e o número.';
        this.showToast('Informe um telefone válido (DDD + número).');
        return;
      }

      if (this.cartItems.length === 0) {
        this.showToast('Adicione ao menos um item antes de gravar.');
        return;
      }

      const missingProduct = this.cartItems.find(item => !this.products.some(p => p.id === item.productId));
      if (missingProduct) {
        this.showToast(`Produto "${missingProduct.productName}" não está mais disponível. Remova esse item e tente novamente.`);
        return;
      }

      if (!this.paymentMethod) {
        this.showToast('Selecione a forma de pagamento antes de gravar.');
        return;
      }

      if (this.paymentMethod === 'dinheiro' && this.changeFor != null) {
        const prospectiveTotal = this.orderTotal();
        if (this.changeFor < prospectiveTotal) {
          this.showToast('Troco para valor menor que o total do pedido. Verifique o valor informado.');
          return;
        }
      }

      if (!this.address) {
        this.showToast('Informe o endereço antes de gravar.');
        return;
      }
      await saveCustomer(phoneDigits, this.address);

      const orderInput = {
        customerPhone: phoneDigits,
        address: this.address,
        items: this.cartItems.map(({ productName, ...item }) => item),
        paymentMethod: this.paymentMethod,
        changeFor: this.paymentMethod === 'dinheiro' ? this.changeFor : undefined
      };

      if (this.editingOrderId) {
        await updateOrder(this.editingOrderId, orderInput);
        this.showToast('Pedido atualizado.');
      } else {
        await createOrder(orderInput);
        this.showToast('Pedido gravado.');
      }

      this.closeOrderForm();
      if (this.selectedDate === localDateString(new Date())) {
        await this.refreshOrders();
      }
    },

    async refreshOrders() {
      this.todayOrders = await listOrdersForDay(this.selectedDate);
      this.visibleOrderCount = 15;
      this.selectedOrderIds = [];
    },

    async shiftDate(deltaDays) {
      const [y, m, d] = this.selectedDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + deltaDays);
      this.selectedDate = localDateString(date);
      await this.refreshOrders();
    },

    filteredOrders() {
      return this.todayOrders
        .filter(o => o.status === this.orderStatusTab)
        .filter(o => this.paymentFilter[o.paymentMethod]);
    },

    filteredTotal() {
      return this.filteredOrders().reduce((sum, o) => sum + o.total, 0);
    },

    visibleOrders() {
      return this.filteredOrders().slice(0, this.visibleOrderCount);
    },

    onFilterChange() {
      this.visibleOrderCount = 15;
    },

    showMoreOrders() {
      this.visibleOrderCount += 15;
    },

    toggleOrderSelected(orderId) {
      this.selectedOrderIds = this.selectedOrderIds.includes(orderId)
        ? this.selectedOrderIds.filter(id => id !== orderId)
        : [...this.selectedOrderIds, orderId];
    },

    async printSelectedOrders() {
      const ids = [...this.selectedOrderIds];
      let printed = 0;
      let failed = 0;

      for (const id of ids) {
        const order = this.todayOrders.find(o => o.id === id);
        if (!order) continue;
        try {
          const customer = { phone: order.customerPhone, address: order.address };
          const bytes = buildReceiptBytes(order, customer, this.products);
          if (!this.printerCharacteristic) {
            this.printerCharacteristic = await connectPrinter();
          }
          await printReceipt(this.printerCharacteristic, bytes);
          await updateOrderStatus(order.id, 'impresso');
          printed++;
        } catch (err) {
          this.printerCharacteristic = null;
          failed++;
        }
      }

      this.showToast(failed > 0
        ? `${printed} de ${ids.length} impressos. ${failed} falhou/falharam: mantido(s) em pendente.`
        : `${printed} pedido(s) impresso(s).`);
      this.selectedOrderIds = [];
      await this.refreshOrders();
    },

    async markOrderDelivered(order) {
      await updateOrderStatus(order.id, 'entregue');
      await this.refreshOrders();
    },

    async cancelOrder(order) {
      await updateOrderStatus(order.id, 'cancelado');
      await this.refreshOrders();
    },

    async revertOrderToPending(order) {
      await updateOrderStatus(order.id, 'pendente');
      await this.refreshOrders();
    },

    productDisplayName(product) {
      return product.brand ? `${product.name} ${product.brand}` : product.name;
    },

    productSubtitle(product) {
      return [product.brand, product.active ? null : 'inativo'].filter(Boolean).join(' · ');
    },

    orderItemLabels(order) {
      return order.items.map(item => {
        const product = this.products.find(p => p.id === item.productId);
        const quantityLabel = item.grams != null
          ? `${parseFloat((item.grams / 1000).toFixed(3))}kg`
          : `${item.qty}x`;
        return product ? `${quantityLabel} ${this.productDisplayName(product)}` : `${quantityLabel} Produto removido`;
      });
    },

    paymentMethodLabel(method) {
      return { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }[method] ?? method;
    },

    icon(name, size = 16) {
      const paths = {
        add: { strokeWidth: 2.2, body: '<path d="M12 5v14M5 12h14"/>' },
        edit: { strokeWidth: 2, body: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
        power: { strokeWidth: 2, body: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>' },
        close: { strokeWidth: 2, body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' },
        dinheiro: { strokeWidth: 2, body: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>' },
        cartao: { strokeWidth: 2, body: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
        pix: { strokeWidth: 2, body: '<rect x="4" y="4" width="16" height="16" rx="5" transform="rotate(45 12 12)"/>' },
        chevronDown: { strokeWidth: 2, body: '<path d="m6 9 6 6 6-6"/>' },
        chevronLeft: { strokeWidth: 2, body: '<path d="m15 18-6-6 6-6"/>' },
        chevronRight: { strokeWidth: 2, body: '<path d="m9 18 6-6-6-6"/>' },
        calendar: { strokeWidth: 2, body: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>' },
        person: { strokeWidth: 2, body: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
        package: { strokeWidth: 2, body: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>' },
        location: { strokeWidth: 2, body: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>' },
        shoppingBag: { strokeWidth: 2, body: '<path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>' },
        list: { strokeWidth: 2, body: '<path d="M4 6h16M4 12h16M4 18h10"/>' }
      };
      const spec = paths[name];
      if (!spec) return '';
      const valign = -Math.round(size / 7);
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${spec.strokeWidth}" style="display:inline;vertical-align:${valign}px">${spec.body}</svg>`;
    },

    soldByWeightEnabled() {
      return window.APP_CONFIG?.features?.soldByWeight ?? true;
    },

    paymentMethodAccentClass(method) {
      return { dinheiro: 'border-l-green-600', pix: 'border-l-blue-600', cartao: 'border-l-purple-600' }[method] ?? 'border-l-gray-400';
    },

    paymentMethodTextClass(method) {
      return { dinheiro: 'text-green-700', pix: 'text-blue-700', cartao: 'text-purple-700' }[method] ?? 'text-gray-600';
    },

    paymentMethodPillClass(method) {
      return {
        dinheiro: 'bg-green-50 text-green-700',
        pix: 'bg-blue-50 text-blue-700',
        cartao: 'bg-purple-50 text-purple-700'
      }[method] ?? 'bg-gray-100 text-gray-700';
    },

    paymentButtonClass(method) {
      return this.paymentMethod === method ? this.paymentMethodPillClass(method) : 'bg-gray-100 text-gray-600';
    },

    resetProductForm() {
      this.productForm = {
        id: null, name: '', brand: '',
        soldByWeight: false, pricePerKg: null,
        priceDinheiro: null, pricePix: null, priceCartao: null
      };
      this.priceSyncPix = true;
      this.priceSyncCartao = true;
      this.productFormError = '';
    },

    openNewProductForm() {
      this.resetProductForm();
      this.showProductForm = true;
    },

    startEditProduct(product) {
      this.productForm = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        soldByWeight: product.soldByWeight ?? false,
        pricePerKg: product.pricePerKg ?? null,
        priceDinheiro: product.prices ? product.prices.dinheiro : null,
        pricePix: product.prices ? product.prices.pix : null,
        priceCartao: product.prices ? product.prices.cartao : null
      };
      this.priceSyncPix = product.prices ? product.prices.pix === product.prices.dinheiro : true;
      this.priceSyncCartao = product.prices ? product.prices.cartao === product.prices.dinheiro : true;
      this.productFormError = '';
      this.showProductForm = true;
    },

    onPriceDinheiroInput(value) {
      const num = value === '' ? null : Number(value);
      this.productForm.priceDinheiro = num;
      if (this.priceSyncPix) this.productForm.pricePix = num;
      if (this.priceSyncCartao) this.productForm.priceCartao = num;
    },

    onPricePixInput(value) {
      this.productForm.pricePix = value === '' ? null : Number(value);
      this.priceSyncPix = false;
    },

    onPriceCartaoInput(value) {
      this.productForm.priceCartao = value === '' ? null : Number(value);
      this.priceSyncCartao = false;
    },

    closeProductForm() {
      this.resetProductForm();
      this.showProductForm = false;
    },

    async saveProductForm() {
      if (!this.productForm.name) {
        this.productFormError = 'Preencha o nome.';
        return;
      }

      if (this.productForm.soldByWeight) {
        if (typeof this.productForm.pricePerKg !== 'number' || !(this.productForm.pricePerKg > 0)) {
          this.productFormError = 'Informe o preço por kg.';
          return;
        }

        await saveProduct({
          id: this.productForm.id ?? undefined,
          name: this.productForm.name,
          brand: this.productForm.brand,
          soldByWeight: true,
          pricePerKg: this.productForm.pricePerKg
        });
      } else {
        const prices = {
          dinheiro: this.productForm.priceDinheiro,
          pix: this.productForm.pricePix,
          cartao: this.productForm.priceCartao
        };
        if (Object.values(prices).some(v => typeof v !== 'number' || !(v > 0))) {
          this.productFormError = 'Informe os 3 preços (maior que zero).';
          return;
        }

        await saveProduct({
          id: this.productForm.id ?? undefined,
          name: this.productForm.name,
          brand: this.productForm.brand,
          soldByWeight: false,
          prices
        });
      }

      this.products = await listProducts();
      this.closeProductForm();
    },

    activeProductCount() {
      return this.products.filter(p => p.active).length;
    },

    filteredProductList() {
      const query = this.productSearch.trim().toLowerCase();
      return this.products
        .filter(p => this.productFilter === 'all' || p.active)
        .filter(p => !query || this.productDisplayName(p).toLowerCase().includes(query));
    },

    async toggleProductActive(product) {
      await setProductActive(product.id, !product.active);
      this.products = await listProducts();
    }
  }));
});

// vendor/alpine.min.js is a plain (non-module) self-starting build: it calls
// Alpine.start() via queueMicrotask as soon as its own script body finishes
// executing. Its timing relative to a type="module" script is NOT reliably
// controlled by tag order in the document (confirmed empirically — module
// scripts and classic <script defer> scripts do not share a guaranteed
// relative execution order in Chromium). Loading it via dynamic import here,
// after the 'alpine:init' listener above has already been registered,
// guarantees Alpine.start() (and the 'alpine:init' event it fires) always
// runs after our Alpine.data('pedidosApp', ...) registration is in place.
import('../vendor/alpine.min.js');
