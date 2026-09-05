import { findCustomerByPhone, saveCustomer } from './customers.js';
import { seedProductsIfEmpty, listProducts } from './products.js';
import { createOrder, listOrdersForDay } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

window.pedidosApp = function () {
  return {
    phone: '',
    address: '',
    newAddress: '',
    products: [],
    selectedProductId: '',
    qty: 1,
    paymentMethod: 'dinheiro',
    changeFor: null,
    statusMessage: '',
    todayOrders: [],
    printerCharacteristic: null,

    async init() {
      await seedProductsIfEmpty();
      this.products = await listProducts();
      if (this.products.length > 0) this.selectedProductId = this.products[0].id;
      await this.refreshTodayOrders();
    },

    async lookupCustomer() {
      const customer = await findCustomerByPhone(this.phone);
      this.address = customer ? customer.address : '';
    },

    async confirmOrder() {
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
        this.statusMessage = 'Pedido salvo, mas falha ao imprimir: ' + err.message + '. Copie manualmente: ' + new TextDecoder().decode(bytes);
      }

      await this.refreshTodayOrders();
    },

    async refreshTodayOrders() {
      const today = new Date().toISOString().slice(0, 10);
      this.todayOrders = await listOrdersForDay(today);
    }
  };
};
