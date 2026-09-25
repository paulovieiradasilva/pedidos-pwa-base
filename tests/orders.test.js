import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, updateOrder, listOrdersForDay, localDateString, updateOrderStatus } from '../js/orders.js';
import { saveProduct } from '../js/products.js';
import { put, getAll } from '../js/db.js';

beforeEach(async () => {
  await saveProduct({ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 9, cartao: 11 } });
  await saveProduct({ id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true, pricePerKg: 10 });
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

  it('creates orders with pendente status', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    expect(order.status).toBe('pendente');
  });

  it('updates the status of an existing order', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    await updateOrderStatus(order.id, 'impresso');
    const today = localDateString(new Date(order.createdAt));
    const list = await listOrdersForDay(today);
    expect(list.find(o => o.id === order.id).status).toBe('impresso');
  });

  it('computes total for a weight-based item using pricePerKg and grams', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'racao-10', grams: 1500 }],
      paymentMethod: 'dinheiro'
    });
    expect(order.total).toBe(15);
  });

  it('uses manualTotal instead of the computed weight price when provided', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'racao-10', grams: 1500, manualTotal: 12 }],
      paymentMethod: 'dinheiro'
    });
    expect(order.total).toBe(12);
  });

  it('sums the total across multiple different items in the same order', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [
        { productId: 'agua-10', qty: 2 },
        { productId: 'racao-10', grams: 1500 }
      ],
      paymentMethod: 'dinheiro'
    });
    expect(order.total).toBe(35);
  });

  it('updateOrder recalculates the total when items change', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'dinheiro'
    });
    const updated = await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: order.address,
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro'
    });
    expect(updated.total).toBe(30);
  });

  it('updateOrder always resets status to pendente, even for a printed order', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    await updateOrderStatus(order.id, 'impresso');
    const updated = await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: 'Novo endereço',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    expect(updated.status).toBe('pendente');
  });

  it('updateOrder preserves the original id and createdAt', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    const updated = await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: 'Novo endereço',
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'pix'
    });
    expect(updated.id).toBe(order.id);
    expect(updated.createdAt).toBe(order.createdAt);
  });

  it('allows marking an order as cancelado', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    await updateOrderStatus(order.id, 'cancelado');
    const today = localDateString(new Date(order.createdAt));
    const list = await listOrdersForDay(today);
    expect(list.find(o => o.id === order.id).status).toBe('cancelado');
  });

  describe('dailyNumber', () => {
    // Outros testes deste arquivo já criaram pedidos "hoje" e não limpam o
    // banco entre si, então não dá pra assumir que o próximo número é 1 —
    // só que ele segue de onde os pedidos de hoje já criados pararam.
    async function todaysOrderCount() {
      const today = localDateString(new Date());
      return (await getAll('orders')).filter(o => localDateString(new Date(o.createdAt)) === today).length;
    }

    it('numbers orders sequentially through the day, starting from what already exists today', async () => {
      const before = await todaysOrderCount();

      const first = await createOrder({ customerPhone: '11988887777', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix' });
      const second = await createOrder({ customerPhone: '11988887777', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix' });

      expect(first.dailyNumber).toBe(before + 1);
      expect(second.dailyNumber).toBe(before + 2);
    });

    it('does not count orders from other days', async () => {
      await put('orders', {
        id: 'old-order', dailyNumber: 1, customerPhone: '11988887777', items: [], paymentMethod: 'pix',
        total: 0, changeAmount: 0, status: 'entregue', createdAt: '2020-01-01T10:00:00.000Z'
      });
      const before = await todaysOrderCount();

      const order = await createOrder({ customerPhone: '11988887777', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix' });

      expect(order.dailyNumber).toBe(before + 1);
    });

    it('keeps a permanent number: editing the order does not change it', async () => {
      const order = await createOrder({ customerPhone: '11988887777', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix' });

      const updated = await updateOrder(order.id, {
        customerPhone: order.customerPhone, address: 'Novo endereço',
        items: [{ productId: 'agua-10', qty: 2 }], paymentMethod: 'pix'
      });

      expect(updated.dailyNumber).toBe(order.dailyNumber);
    });
  });
});
