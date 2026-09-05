import { describe, it, expect } from 'vitest';
import { findCustomerByPhone, saveCustomer } from '../js/customers.js';

describe('customers', () => {
  it('returns undefined for unknown phone', async () => {
    const result = await findCustomerByPhone('11900000000');
    expect(result).toBeUndefined();
  });

  it('saves a customer and finds it back by phone', async () => {
    await saveCustomer('11988887777', 'Rua Joaquim Possidônio, 40');
    const result = await findCustomerByPhone('11988887777');
    expect(result).toEqual({ phone: '11988887777', address: 'Rua Joaquim Possidônio, 40' });
  });
});
