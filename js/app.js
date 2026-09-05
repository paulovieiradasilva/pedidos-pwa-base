import { findCustomerByPhone, saveCustomer } from './customers.js';
import { seedProductsIfEmpty, listProducts } from './products.js';
import { createOrder, listOrdersForDay, localDateString } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

document.addEventListener('alpine:init', () => {
  Alpine.data('pedidosApp', () => ({
    phone: '',
    address: '',
    newAddress: '',
    products: [],
    selectedProductId: '',
    qty: 1,
    paymentMethod: '',
    changeFor: null,
    statusMessage: '',
    todayOrders: [],
    printerCharacteristic: null,

    async init() {
      await seedProductsIfEmpty();
      this.products = await listProducts();
      await this.refreshTodayOrders();
    },

    async lookupCustomer() {
      const customer = await findCustomerByPhone(this.phone);
      this.address = customer ? customer.address : '';
    },

    orderTotal() {
      const selectedProduct = this.products.find(p => p.id === this.selectedProductId);
      return selectedProduct ? selectedProduct.price * this.qty : 0;
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

      if (!Number.isInteger(this.qty) || this.qty <= 0) {
        this.statusMessage = 'Informe uma quantidade válida antes de confirmar.';
        return;
      }

      if (!this.paymentMethod) {
        this.statusMessage = 'Selecione a forma de pagamento antes de confirmar.';
        return;
      }

      if (this.paymentMethod === 'dinheiro' && this.changeFor != null) {
        const selectedProduct = this.products.find(p => p.id === this.selectedProductId);
        const prospectiveTotal = selectedProduct ? selectedProduct.price * this.qty : 0;
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
      await this.refreshTodayOrders();
    },

    async refreshTodayOrders() {
      const today = localDateString(new Date());
      this.todayOrders = await listOrdersForDay(today);
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
