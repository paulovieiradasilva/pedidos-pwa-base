import { describe, it, expect } from 'vitest';
import { openDB, put, get, getAll, deleteDatabase } from '../js/db.js';

describe('db', () => {
  it('stores and retrieves a value by key', async () => {
    await openDB();
    await put('customers', { phone: '11999999999', address: 'Rua A, 1' });
    const result = await get('customers', '11999999999');
    expect(result).toEqual({ phone: '11999999999', address: 'Rua A, 1' });
  });

  it('lists all values in a store', async () => {
    await openDB();
    await put('products', { id: 'p1', name: 'Água 20L', brand: 'X', price: 10, category: 'agua' });
    const all = await getAll('products');
    expect(all.some(p => p.id === 'p1')).toBe(true);
  });

  it('deleteDatabase wipes every store so the app starts fresh', async () => {
    await put('customers', { phone: '11988887777', address: 'Rua B, 2' });
    await put('products', { id: 'p2', name: 'Gás P13', brand: '', price: 100 });

    await deleteDatabase();

    const customers = await getAll('customers');
    const products = await getAll('products');
    expect(customers).toEqual([]);
    expect(products).toEqual([]);
  });
});
