import { getAll, get, put, remove } from './db.js';
import { listProducts } from './products.js';
import { logOrderChange } from './auditLog.js';

const ROUTINE_STATUS_TRANSITIONS = new Set(['pendente>impresso', 'impresso>entregue']);

export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeOrderTotal(items, paymentMethod, productById) {
  return items.reduce((sum, item) => {
    const product = productById[item.productId];
    const itemTotal = product.soldByWeight
      ? item.manualTotal ?? product.pricePerKg * (item.grams / 1000)
      : product.prices[paymentMethod] * item.qty;
    return sum + itemTotal;
  }, 0);
}

export async function createOrder(input) {
  const products = await listProducts();
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const total = computeOrderTotal(input.items, input.paymentMethod, productById);

  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  const order = {
    id: crypto.randomUUID(),
    customerPhone: input.customerPhone,
    address: input.address ?? null,
    items: input.items,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    total,
    changeAmount,
    status: 'pendente',
    createdAt: new Date().toISOString()
  };

  await put('orders', order);
  return order;
}

export async function updateOrder(id, input) {
  const order = await get('orders', id);
  if (!order) return null;
  await logOrderChange('edit', order);

  const products = await listProducts();
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const total = computeOrderTotal(input.items, input.paymentMethod, productById);
  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  order.customerPhone = input.customerPhone;
  order.address = input.address ?? null;
  order.items = input.items;
  order.paymentMethod = input.paymentMethod;
  order.changeFor = input.changeFor ?? null;
  order.total = total;
  order.changeAmount = changeAmount;
  order.status = 'pendente';

  await put('orders', order);
  return order;
}

export async function listOrdersForDay(dateISO) {
  const all = await getAll('orders');
  return all
    .filter(o => localDateString(new Date(o.createdAt)) === dateISO)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateOrderStatus(id, status) {
  const order = await get('orders', id);
  if (!order) return;
  const transitionKey = `${order.status}>${status}`;
  if (!ROUTINE_STATUS_TRANSITIONS.has(transitionKey)) {
    await logOrderChange('status', order, { fromStatus: order.status, toStatus: status });
  }
  order.status = status;
  await put('orders', order);
}

export async function removeOrder(id) {
  const order = await get('orders', id);
  if (order) {
    await logOrderChange('delete', order);
  }
  await remove('orders', id);
}

export async function listAllOrders() {
  const all = await getAll('orders');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
