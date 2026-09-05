import { getAll, put } from './db.js';

const DEFAULT_CATALOG = [
  { id: 'agua-6.5-a', name: 'Água 20L', brand: 'Marca A', price: 6.5, category: 'agua' },
  { id: 'agua-6.5-b', name: 'Água 20L', brand: 'Marca B', price: 6.5, category: 'agua' },
  { id: 'agua-10-a', name: 'Água 20L', brand: 'Marca C', price: 10, category: 'agua' },
  { id: 'agua-10-b', name: 'Água 20L', brand: 'Marca D', price: 10, category: 'agua' },
  { id: 'gas-p13', name: 'Gás P13', brand: 'Marca A', price: 110, category: 'gas' }
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

export async function addProduct(product) {
  await put('products', product);
}
