import { getAll, get, put } from './db.js';

const DEFAULT_CATALOG = [
  { id: 'agua-6.5-a', name: 'Água 20L', brand: 'Marca A', prices: { dinheiro: 6.5, pix: 6.5, cartao: 6.5 }, active: true },
  { id: 'agua-6.5-b', name: 'Água 20L', brand: 'Marca B', prices: { dinheiro: 6.5, pix: 6.5, cartao: 6.5 }, active: true },
  { id: 'agua-10-a', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true },
  { id: 'agua-10-b', name: 'Água 20L', brand: 'Marca D', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true },
  { id: 'gas-p13', name: 'Gás P13', brand: 'Marca A', prices: { dinheiro: 110, pix: 110, cartao: 110 }, active: true }
];

export async function seedProductsIfEmpty() {
  const existing = await getAll('products');
  if (existing.length > 0) return;
  for (const product of DEFAULT_CATALOG) {
    await put('products', product);
  }
}

export async function listProducts() {
  return getAll('products');
}

export async function listActiveProducts() {
  const all = await getAll('products');
  return all.filter(p => p.active);
}

export async function saveProduct(product) {
  const soldByWeight = product.soldByWeight ?? false;
  const record = {
    id: product.id ?? crypto.randomUUID(),
    name: product.name,
    brand: product.brand,
    soldByWeight,
    pricePerKg: soldByWeight ? product.pricePerKg : null,
    prices: soldByWeight ? null : { ...product.prices },
    active: product.active ?? true
  };
  await put('products', record);
  return record;
}

export async function setProductActive(id, active) {
  const product = await get('products', id);
  if (!product) return;
  product.active = active;
  await put('products', product);
}
