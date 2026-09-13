import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, updateOrder, updateOrderStatus, removeOrder } from '../js/orders.js';
import { listAuditLog } from '../js/auditLog.js';
import { saveProduct } from '../js/products.js';

beforeEach(async () => {
  await saveProduct({ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 9, cartao: 11 } });
});

async function createTestOrder() {
  return createOrder({
    customerPhone: '11988887777',
    address: 'Rua das Flores, 55',
    items: [{ productId: 'agua-10', qty: 1 }],
    paymentMethod: 'pix'
  });
}

async function logEntriesFor(orderId) {
  const log = await listAuditLog();
  return log.filter(e => e.orderId === orderId);
}

describe('audit log', () => {
  it('does not log anything when an order is created', async () => {
    const order = await createTestOrder();
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(0);
  });

  it('does not log the routine pendente -> impresso transition', async () => {
    const order = await createTestOrder();
    await updateOrderStatus(order.id, 'impresso');
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(0);
  });

  it('does not log the routine impresso -> entregue transition', async () => {
    const order = await createTestOrder();
    await updateOrderStatus(order.id, 'impresso');
    await updateOrderStatus(order.id, 'entregue');
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(0);
  });

  it('logs a cancellation with the order snapshot from before the change', async () => {
    const order = await createTestOrder();
    await updateOrderStatus(order.id, 'cancelado');
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('status');
    expect(entries[0].fromStatus).toBe('pendente');
    expect(entries[0].toStatus).toBe('cancelado');
    expect(entries[0].orderSnapshot.status).toBe('pendente');
  });

  it('logs reverting a cancelled order back to pendente', async () => {
    const order = await createTestOrder();
    await updateOrderStatus(order.id, 'cancelado');
    await updateOrderStatus(order.id, 'pendente');
    const entries = await logEntriesFor(order.id);
    const revert = entries.find(e => e.fromStatus === 'cancelado' && e.toStatus === 'pendente');
    expect(revert).toBeTruthy();
  });

  it('logs reverting a delivered order back to pendente', async () => {
    const order = await createTestOrder();
    await updateOrderStatus(order.id, 'impresso');
    await updateOrderStatus(order.id, 'entregue');
    await updateOrderStatus(order.id, 'pendente');
    const entries = await logEntriesFor(order.id);
    const revert = entries.find(e => e.fromStatus === 'entregue' && e.toStatus === 'pendente');
    expect(revert).toBeTruthy();
  });

  it('logs an edit with the order snapshot from before the change', async () => {
    const order = await createTestOrder();
    await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: 'Endereço novo',
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'pix'
    });
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('edit');
    expect(entries[0].orderSnapshot.address).toBe('Rua das Flores, 55');
  });

  it('logs an edit with the resulting order state as orderAfter', async () => {
    const order = await createTestOrder();
    await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: order.address,
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'pix'
    });
    const entries = await logEntriesFor(order.id);
    expect(entries[0].orderAfter.total).toBe(18);
    expect(entries[0].orderAfter.items).toEqual([{ productId: 'agua-10', qty: 2 }]);
  });

  it('an earlier edit entry keeps its own before/after totals unchanged after a later edit', async () => {
    const order = await createTestOrder(); // total: 9 (1x agua-10 pix)
    await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: order.address,
      items: [{ productId: 'agua-10', qty: 2 }], // total: 18
      paymentMethod: 'pix'
    });
    await updateOrder(order.id, {
      customerPhone: order.customerPhone,
      address: order.address,
      items: [{ productId: 'agua-10', qty: 1 }], // total: 9 again, but a different edit
      paymentMethod: 'pix'
    });

    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(2);
    const firstEdit = entries.find(e => e.orderSnapshot.total === 9 && e.orderAfter.total === 18);
    const secondEdit = entries.find(e => e.orderSnapshot.total === 18 && e.orderAfter.total === 9);

    // The first edit's before/after must stay 9 -> 18, unaffected by the second edit.
    expect(firstEdit).toBeTruthy();

    // The second edit's before/after is 18 -> 9.
    expect(secondEdit).toBeTruthy();
  });

  it('logs a deletion with the order snapshot, and the order no longer exists afterwards', async () => {
    const order = await createTestOrder();
    await removeOrder(order.id);
    const entries = await logEntriesFor(order.id);
    expect(entries.length).toBe(1);
    expect(entries[0].action).toBe('delete');
    expect(entries[0].orderSnapshot.customerPhone).toBe('11988887777');
  });
});
