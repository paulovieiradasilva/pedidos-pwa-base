import { getAll, put } from './db.js';
import { listProducts } from './products.js';

export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function createOrder(input) {
  const products = await listProducts();
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const total = input.items.reduce((sum, item) => {
    const price = productById[item.productId].prices[input.paymentMethod];
    return sum + price * item.qty;
  }, 0);

  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  const order = {
    id: crypto.randomUUID(),
    customerPhone: input.customerPhone,
    items: input.items,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    total,
    changeAmount,
    createdAt: new Date().toISOString()
  };

  await put('orders', order);
  return order;
}

export async function listOrdersForDay(dateISO) {
  const all = await getAll('orders');
  return all
    .filter(o => localDateString(new Date(o.createdAt)) === dateISO)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
