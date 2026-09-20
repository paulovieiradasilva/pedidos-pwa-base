import { describe, it, expect } from 'vitest';
import { DEFAULT_CATALOG, seedProductsIfEmpty, listProducts, listActiveProducts, saveProduct, setProductActive } from '../js/products.js';

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

  it('creates a product without a brand', async () => {
    const saved = await saveProduct({ name: 'Gás P13', brand: '', prices: { dinheiro: 110, pix: 110, cartao: 110 } });
    const products = await listProducts();
    expect(products.find(p => p.id === saved.id).brand).toBe('');
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

  it('creates a product sold by weight with pricePerKg and no fixed prices', async () => {
    const saved = await saveProduct({ name: 'Ração X', brand: '', soldByWeight: true, pricePerKg: 12.5 });
    const products = await listProducts();
    const found = products.find(p => p.id === saved.id);
    expect(found.soldByWeight).toBe(true);
    expect(found.pricePerKg).toBe(12.5);
    expect(found.prices).toBe(null);
  });
});

describe('default catalog', () => {
  it('has unique ids, active items and valid prices (card never cheaper than cash/pix)', () => {
    const ids = DEFAULT_CATALOG.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const product of DEFAULT_CATALOG) {
      const { dinheiro, pix, cartao } = product.prices;
      expect(product.active).toBe(true);
      expect(dinheiro).toBeGreaterThan(0);
      expect(pix).toBe(dinheiro);
      expect(cartao).toBeGreaterThanOrEqual(pix);
    }
  });

  it('matches the supplier price table', () => {
    const byId = Object.fromEntries(DEFAULT_CATALOG.map(p => [p.id, p.prices]));
    expect(byId['agua-barata']).toEqual({ dinheiro: 7, pix: 7, cartao: 8 });
    expect(byId['agua-barata-completa']).toEqual({ dinheiro: 30, pix: 30, cartao: 33 });
    expect(byId['agua-cristalina']).toEqual({ dinheiro: 9, pix: 9, cartao: 9.5 });
    expect(byId['agua-santa-joana']).toEqual({ dinheiro: 12, pix: 12, cartao: 12.5 });
    expect(byId['agua-indaia']).toEqual({ dinheiro: 18, pix: 18, cartao: 18.5 });
    expect(byId['gelo-3kg']).toEqual({ dinheiro: 9, pix: 9, cartao: 9.5 });
    expect(byId['gelo-10kg']).toEqual({ dinheiro: 14, pix: 14, cartao: 14.5 });
    expect(byId['carvao']).toEqual({ dinheiro: 9, pix: 9, cartao: 9.5 });
    expect(byId['gas-p13']).toEqual({ dinheiro: 115, pix: 115, cartao: 120 });
  });
});
