import { describe, it, expect } from 'vitest';
import { buildReceiptBytes } from '../js/printer.js';

describe('buildReceiptBytes', () => {
  it('includes address, product names and total in the printed text', () => {
    const order = {
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'dinheiro',
      changeFor: 50,
      total: 20,
      changeAmount: 30
    };
    const customer = { phone: '11988887777', address: 'Rua Joaquim Possidônio, 40' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', price: 10, category: 'agua' }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain('Rua Joaquim Possidônio, 40');
    expect(text).toContain('Água 20L Marca C x2');
    expect(text).toContain('Total: R$ 20.00');
    expect(text).toContain('Troco para R$ 50.00 (devolver R$ 30.00)');
  });
});
