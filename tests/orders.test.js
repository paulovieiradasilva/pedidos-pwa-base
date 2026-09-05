import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, listOrdersForDay, localDateString } from '../js/orders.js';
import { addProduct } from '../js/products.js';

beforeEach(async () => {
  await addProduct({ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', price: 10, category: 'agua' });
});

describe('orders', () => {
  it('computes total from item prices and quantities', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro',
      changeFor: 50
    });
    expect(order.total).toBe(30);
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
});
