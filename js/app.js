import { findCustomerByPhone, saveCustomer } from './customers.js';
import { seedProductsIfEmpty, listProducts, listActiveProducts, saveProduct, setProductActive } from './products.js';
import { createOrder, listOrdersForDay, localDateString } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('pedidosApp', () => ({
    currentView: 'novoPedido',

    phone: '',
    address: '',
    newAddress: '',
    products: [],
    activeProducts: [],
    selectedProductId: '',
    qty: 1,
    paymentMethod: '',
    changeFor: null,
    statusMessage: '',
    todayOrders: [],
    visibleOrderCount: 15,
    selectedDate: localDateString(new Date()),
    paymentFilter: { dinheiro: true, pix: true, cartao: true },
    printerCharacteristic: null,

    productForm: { id: null, name: '', brand: '', priceDinheiro: null, pricePix: null, priceCartao: null },
    productFormError: '',
    showProductForm: false,
    productSearch: '',
    productFilter: 'active',

    async init() {
      await seedProductsIfEmpty();
      await this.setView('novoPedido');
    },

    async setView(view) {
      this.currentView = view;
      if (view === 'produtos') {
        this.products = await listProducts();
      } else if (view === 'pedidosDoDia') {
        this.products = await listProducts();
        await this.refreshOrders();
      } else if (view === 'novoPedido') {
        this.activeProducts = await listActiveProducts();
      }
    },

    async lookupCustomer() {
      const customer = await findCustomerByPhone(this.phone);
      this.address = customer ? customer.address : '';
    },

    orderTotal() {
      const selectedProduct = this.activeProducts.find(p => p.id === this.selectedProductId);
      if (!selectedProduct || !this.paymentMethod) return 0;
      return selectedProduct.prices[this.paymentMethod] * this.qty;
    },

    resetForm() {
      this.phone = '';
      this.address = '';
      this.newAddress = '';
      this.qty = 1;
      this.paymentMethod = '';
      this.changeFor = null;
      this.selectedProductId = '';
    },

    async confirmOrder() {
      if (!this.phone) {
        this.statusMessage = 'Informe o telefone antes de confirmar.';
        return;
      }

      if (!this.selectedProductId) {
        this.statusMessage = 'Selecione um produto antes de confirmar.';
        return;
      }

      if (!this.activeProducts.some(p => p.id === this.selectedProductId)) {
        this.statusMessage = 'Produto selecionado não está mais disponível. Selecione novamente.';
        this.selectedProductId = '';
        return;
      }

      if (!Number.isInteger(this.qty) || this.qty <= 0) {
        this.statusMessage = 'Informe uma quantidade válida antes de confirmar.';
        return;
      }

      if (!this.paymentMethod) {
        this.statusMessage = 'Selecione a forma de pagamento antes de confirmar.';
        return;
      }

      if (this.paymentMethod === 'dinheiro' && this.changeFor != null) {
        const selectedProduct = this.activeProducts.find(p => p.id === this.selectedProductId);
        const prospectiveTotal = selectedProduct ? selectedProduct.prices[this.paymentMethod] * this.qty : 0;
        if (this.changeFor < prospectiveTotal) {
          this.statusMessage = 'Troco para valor menor que o total do pedido. Verifique o valor informado.';
          return;
        }
      }

      if (!this.address && this.newAddress) {
        await saveCustomer(this.phone, this.newAddress);
        this.address = this.newAddress;
      }
      if (!this.address) {
        this.statusMessage = 'Informe o endereço antes de confirmar.';
        return;
      }

      const order = await createOrder({
        customerPhone: this.phone,
        address: this.address,
        items: [{ productId: this.selectedProductId, qty: this.qty }],
        paymentMethod: this.paymentMethod,
        changeFor: this.paymentMethod === 'dinheiro' ? this.changeFor : undefined
      });

      const customer = { phone: this.phone, address: this.address };
      const bytes = buildReceiptBytes(order, customer, this.products);

      try {
        if (!this.printerCharacteristic) {
          this.printerCharacteristic = await connectPrinter();
        }
        await printReceipt(this.printerCharacteristic, bytes);
        this.statusMessage = 'Pedido salvo e enviado para impressão.';
      } catch (err) {
        this.printerCharacteristic = null;
        this.statusMessage = 'Pedido salvo, mas falha ao imprimir: ' + err.message + '. Copie manualmente: ' + new TextDecoder('windows-1252').decode(bytes);
      }

      this.resetForm();
      this.activeProducts = await listActiveProducts();
      if (this.selectedDate === localDateString(new Date())) {
        await this.refreshOrders();
      }
    },

    async refreshOrders() {
      this.todayOrders = await listOrdersForDay(this.selectedDate);
      this.visibleOrderCount = 15;
    },

    filteredOrders() {
      return this.todayOrders.filter(o => this.paymentFilter[o.paymentMethod]);
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

    orderSummary(order) {
      return order.items
        .map(item => {
          const product = this.products.find(p => p.id === item.productId);
          return product ? `${item.qty}x ${product.name} ${product.brand}` : `${item.qty}x Produto removido`;
        })
        .join(', ');
    },

    paymentMethodLabel(method) {
      return { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' }[method] ?? method;
    },

    paymentMethodIcon(method) {
      return { dinheiro: '💵', pix: '⚡', cartao: '💳' }[method] ?? '?';
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

    resetProductForm() {
      this.productForm = { id: null, name: '', brand: '', priceDinheiro: null, pricePix: null, priceCartao: null };
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
        priceDinheiro: product.prices.dinheiro,
        pricePix: product.prices.pix,
        priceCartao: product.prices.cartao
      };
      this.productFormError = '';
      this.showProductForm = true;
    },

    closeProductForm() {
      this.resetProductForm();
      this.showProductForm = false;
    },

    async saveProductForm() {
      if (!this.productForm.name || !this.productForm.brand) {
        this.productFormError = 'Preencha nome e marca.';
        return;
      }

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
        prices
      });
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
        .filter(p => !query || (p.name + ' ' + p.brand).toLowerCase().includes(query));
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
