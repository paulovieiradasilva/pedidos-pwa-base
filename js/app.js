import { findCustomerByPhone, saveCustomer, listCustomers } from './customers.js';
import { seedProductsIfEmpty, listProducts, listActiveProducts, saveProduct, setProductActive } from './products.js';
import { createOrder, updateOrder, listOrdersForDay, localDateString, updateOrderStatus } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('pedidosApp', () => ({
    currentView: 'pedidosDoDia',

    phone: '',
    address: '',
    newAddress: '',
    products: [],
    activeProducts: [],
    customers: [],
    phoneSuggestions: [],
    selectedProductId: '',
    qty: 1,
    weightGrams: null,
    weightManualTotal: null,
    weightTotalTouched: false,
    cartItems: [],
    editingOrderId: null,
    paymentMethod: '',
    changeFor: null,
    statusMessage: '',
    showOrderForm: false,
    todayOrders: [],
    visibleOrderCount: 15,
    selectedDate: localDateString(new Date()),
    paymentFilter: { dinheiro: true, pix: true, cartao: true },
    orderStatusTab: 'pendente',
    selectedOrderIds: [],
    batchPrintMessage: '',
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

    async setView(view) {
      this.currentView = view;
      if (view === 'produtos') {
        this.products = await listProducts();
      } else if (view === 'pedidosDoDia') {
        this.products = await listProducts();
        this.activeProducts = await listActiveProducts();
        this.customers = await listCustomers();
        this.selectedOrderIds = [];
        this.batchPrintMessage = '';
        await this.refreshOrders();
      }
    },

    setOrderStatusTab(tab) {
      this.orderStatusTab = tab;
      this.selectedOrderIds = [];
      this.batchPrintMessage = '';
    },

    formatPhoneMask(value) {
      const digits = value.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    },

    onPhoneInput(value) {
      this.phone = this.formatPhoneMask(value);
      const digits = this.phoneDigits();
      this.phoneSuggestions = digits.length >= 3
        ? this.customers.filter(c => c.phone.includes(digits)).slice(0, 8)
        : [];
    },

    selectPhoneSuggestion(customer) {
      this.phone = this.formatPhoneMask(customer.phone);
      this.address = customer.address;
      this.phoneSuggestions = [];
      if (document.activeElement) document.activeElement.blur();
    },

    phoneDigits() {
      return this.phone.replace(/\D/g, '');
    },

    async lookupCustomer() {
      const customer = await findCustomerByPhone(this.phoneDigits());
      this.address = customer ? customer.address : '';
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

    addCartItem() {
      const error = this.validateCurrentItem();
      if (error) {
        this.statusMessage = error;
        return;
      }

      const selectedProduct = this.selectedNewOrderProduct();
      const item = selectedProduct.soldByWeight
        ? { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), grams: this.weightGrams, manualTotal: this.weightManualTotal }
        : { productId: this.selectedProductId, productName: this.productDisplayName(selectedProduct), qty: this.qty };

      this.cartItems.push(item);
      this.selectedProductId = '';
      this.qty = 1;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.statusMessage = '';
    },

    removeCartItem(index) {
      this.cartItems.splice(index, 1);
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

    resetForm() {
      this.phone = '';
      this.address = '';
      this.newAddress = '';
      this.qty = 1;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.cartItems = [];
      this.paymentMethod = '';
      this.changeFor = null;
      this.selectedProductId = '';
      this.phoneSuggestions = [];
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
      this.newAddress = '';
      this.paymentMethod = order.paymentMethod;
      this.changeFor = order.changeFor ?? null;
      this.cartItems = order.items.map(item => ({
        ...item,
        productName: this.productDisplayName(this.products.find(p => p.id === item.productId))
      }));
      this.selectedProductId = '';
      this.qty = 1;
      this.weightGrams = null;
      this.weightManualTotal = null;
      this.weightTotalTouched = false;
      this.phoneSuggestions = [];
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
      if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
        this.statusMessage = 'Informe um telefone válido com DDD.';
        return;
      }

      if (this.cartItems.length === 0) {
        this.statusMessage = 'Adicione ao menos um item antes de gravar.';
        return;
      }

      const missingProduct = this.cartItems.find(item => !this.products.some(p => p.id === item.productId));
      if (missingProduct) {
        this.statusMessage = `Produto "${missingProduct.productName}" não está mais disponível. Remova esse item e tente novamente.`;
        return;
      }

      if (!this.paymentMethod) {
        this.statusMessage = 'Selecione a forma de pagamento antes de gravar.';
        return;
      }

      if (this.paymentMethod === 'dinheiro' && this.changeFor != null) {
        const prospectiveTotal = this.orderTotal();
        if (this.changeFor < prospectiveTotal) {
          this.statusMessage = 'Troco para valor menor que o total do pedido. Verifique o valor informado.';
          return;
        }
      }

      if (!this.address && this.newAddress) {
        await saveCustomer(phoneDigits, this.newAddress);
        this.address = this.newAddress;
      }
      if (!this.address) {
        this.statusMessage = 'Informe o endereço antes de gravar.';
        return;
      }

      const orderInput = {
        customerPhone: phoneDigits,
        address: this.address,
        items: this.cartItems.map(({ productName, ...item }) => item),
        paymentMethod: this.paymentMethod,
        changeFor: this.paymentMethod === 'dinheiro' ? this.changeFor : undefined
      };

      if (this.editingOrderId) {
        await updateOrder(this.editingOrderId, orderInput);
        this.statusMessage = 'Pedido atualizado.';
      } else {
        await createOrder(orderInput);
        this.statusMessage = 'Pedido gravado.';
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

      this.batchPrintMessage = failed > 0
        ? `${printed} de ${ids.length} impressos. ${failed} falhou/falharam: mantido(s) em pendente.`
        : `${printed} pedido(s) impresso(s).`;
      this.selectedOrderIds = [];
      await this.refreshOrders();
    },

    async markOrderDelivered(order) {
      await updateOrderStatus(order.id, 'entregue');
      await this.refreshOrders();
    },

    async cancelOrder(order) {
      if (!confirm('Cancelar este pedido?')) return;
      await updateOrderStatus(order.id, 'cancelado');
      await this.refreshOrders();
    },

    productDisplayName(product) {
      return product.brand ? `${product.name} ${product.brand}` : product.name;
    },

    productSubtitle(product) {
      return [product.brand, product.active ? null : 'inativo'].filter(Boolean).join(' · ');
    },

    orderSummary(order) {
      return order.items
        .map(item => {
          const product = this.products.find(p => p.id === item.productId);
          const quantityLabel = item.grams != null
            ? `${parseFloat((item.grams / 1000).toFixed(3))}kg`
            : `${item.qty}x`;
          return product ? `${quantityLabel} ${this.productDisplayName(product)}` : `${quantityLabel} Produto removido`;
        })
        .join(', ');
    },

    paymentMethodLabel(method) {
      return { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }[method] ?? method;
    },

    paymentMethodIcon(method) {
      return { dinheiro: '💵', pix: 'Pix', cartao: '💳' }[method] ?? '?';
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
