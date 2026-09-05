import { describe, it, expect } from 'vitest';
import { seedProductsIfEmpty, listProducts, listActiveProducts, saveProduct, setProductActive } from '../js/products.js';

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

  it('creates a new product and generates an id when none is given', async () => {
    const saved = await saveProduct({ name: 'Água 10L', brand: 'Marca Z', prices: { dinheiro: 8, pix: 8, cartao: 9 } });
    expect(saved.id).toBeTruthy();
    const products = await listProducts();
    expect(products.some(p => p.id === saved.id)).toBe(true);
  });

  it('updates an existing product instead of duplicating it when saved again with the same id', async () => {
    const saved = await saveProduct({ name: 'Água 10L', brand: 'Marca Z', prices: { dinheiro: 8, pix: 8, cartao: 9 } });
    await saveProduct({ id: saved.id, name: 'Água 10L Editado', brand: 'Marca Z', prices: { dinheiro: 9, pix: 9, cartao: 10 } });

    const products = await listProducts();
    expect(products.filter(p => p.id === saved.id).length).toBe(1);
    const updated = products.find(p => p.id === saved.id);
    expect(updated.name).toBe('Água 10L Editado');
    expect(updated.prices.dinheiro).toBe(9);
  });

  it('excludes inactive products from listActiveProducts but keeps them in listProducts', async () => {
    const saved = await saveProduct({ name: 'Água 10L', brand: 'Marca Z', prices: { dinheiro: 8, pix: 8, cartao: 9 } });
    await setProductActive(saved.id, false);

    const active = await listActiveProducts();
    const all = await listProducts();
    expect(active.some(p => p.id === saved.id)).toBe(false);
    expect(all.some(p => p.id === saved.id)).toBe(true);
  });

  it('allows reactivating a product', async () => {
    const saved = await saveProduct({ name: 'Água 10L', brand: 'Marca Z', prices: { dinheiro: 8, pix: 8, cartao: 9 } });
    await setProductActive(saved.id, false);
    await setProductActive(saved.id, true);

    const active = await listActiveProducts();
    expect(active.some(p => p.id === saved.id)).toBe(true);
  });
});
