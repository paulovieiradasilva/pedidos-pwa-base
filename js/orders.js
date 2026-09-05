import { getAll, put } from './db.js';
import { listProducts } from './products.js';

export async function createOrder(input) {
  const products = await listProducts();
  const priceById = Object.fromEntries(products.map(p => [p.id, p.price]));

  const total = input.items.reduce((sum, item) => {
    const price = priceById[item.productId];
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
  return all.filter(o => o.createdAt.slice(0, 10) === dateISO);
}
