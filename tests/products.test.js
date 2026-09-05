import { describe, it, expect } from 'vitest';
import { seedProductsIfEmpty, listProducts, addProduct } from '../js/products.js';

describe('products', () => {
  it('seeds a default catalog when empty', async () => {
    await seedProductsIfEmpty();
    const products = await listProducts();
    expect(products.length).toBeGreaterThan(0);
  });

  it('does not duplicate the catalog on second seed call', async () => {
    await seedProductsIfEmpty();
    await seedProductsIfEmpty();
    const products = await listProducts();
    const ids = products.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds a custom product', async () => {
    await addProduct({ id: 'custom-1', name: 'Água 10L', brand: 'Marca Z', price: 8, category: 'agua' });
    const products = await listProducts();
    expect(products.some(p => p.id === 'custom-1')).toBe(true);
  });
});
