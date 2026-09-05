import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, listOrdersForDay, localDateString } from '../js/orders.js';
import { saveProduct } from '../js/products.js';

beforeEach(async () => {
  await saveProduct({ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 9, cartao: 11 } });
});

describe('orders', () => {
  it('stores the customer address given at creation time', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      address: 'Rua das Flores, 55',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    expect(order.address).toBe('Rua das Flores, 55');
  });

  it('computes total using the price for the chosen payment method (dinheiro)', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro',
      changeFor: 50
    });
    expect(order.total).toBe(30);
  });

  it('computes total using the price for the chosen payment method (pix)', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'pix'
    });
    expect(order.total).toBe(27);
  });

  it('computes total using the price for the chosen payment method (cartao)', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'cartao'
    });
    expect(order.total).toBe(33);
  });

  it('computes change amount when paying in cash', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro',
      changeFor: 50
    });
    expect(order.changeAmount).toBe(20);
  });

  it('has zero change amount for pix/cartao', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'pix'
    });
    expect(order.changeAmount).toBe(0);
  });

  it('lists orders created on a given day', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    const today = localDateString(new Date(order.createdAt));
    const list = await listOrdersForDay(today);
    expect(list.some(o => o.id === order.id)).toBe(true);
  });

  it('does not list an order under a different day', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    const yesterday = localDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const list = await listOrdersForDay(yesterday);
    expect(list.some(o => o.id === order.id)).toBe(false);
  });

  it('lists orders newest first', async () => {
    const first = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await createOrder({
      customerPhone: '11999998888',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });

    const today = localDateString(new Date(second.createdAt));
    const list = await listOrdersForDay(today);
    const firstIndex = list.findIndex(o => o.id === first.id);
    const secondIndex = list.findIndex(o => o.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });
});
