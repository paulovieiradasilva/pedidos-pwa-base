import { describe, it, expect } from 'vitest';
import { buildReceiptBytes, buildClosingReceiptBytes } from '../js/printer.js';

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
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Rua Joaquim Possidônio, 40');
    expect(text).toContain('Água 20L Marca C x2');
    expect(text).toContain('Total: R$ 20.00');
    expect(text).toContain('Troco para R$ 50.00 (devolver R$ 30.00)');
  });

  it('round-trips accented Portuguese characters through Latin-1/CP1252 encoding', () => {
    const order = {
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix',
      total: 10,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua da Água, Endereço com ç e ã' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Rua da Água, Endereço com ç e ã');
  });

  it('still resolves the product name/brand when the product has since been deactivated', () => {
    const order = {
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix',
      total: 10,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: false }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Água 20L Marca C x1');
  });

  it('prints just the product name, with no trailing space, when brand is empty', () => {
    const order = {
      items: [{ productId: 'gas-p13', qty: 1 }],
      paymentMethod: 'pix',
      total: 110,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'gas-p13', name: 'Gás P13', brand: '', prices: { dinheiro: 110, pix: 110, cartao: 110 }, active: true }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Gás P13 x1');
    expect(text).not.toContain('Gás P13  x1');
  });

  it('prints the weight in kg instead of a unit count for weight-based items', () => {
    const order = {
      items: [{ productId: 'racao-10', grams: 1200 }],
      paymentMethod: 'dinheiro',
      total: 12,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true, pricePerKg: 10, active: true }];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Ração X 1,2kg');
  });

  it('prints one line per item when the order has multiple different products', () => {
    const order = {
      items: [
        { productId: 'agua-10', qty: 2 },
        { productId: 'racao-10', grams: 1500 }
      ],
      paymentMethod: 'dinheiro',
      total: 35,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [
      { id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true },
      { id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true, pricePerKg: 10, active: true }
    ];

    const bytes = buildReceiptBytes(order, customer, products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Água 20L Marca C x2');
    expect(text).toContain('Ração X 1,5kg');
  });
});

describe('buildClosingReceiptBytes', () => {
  it('sums delivered orders by payment method and reports the overall total', () => {
    const orders = [
      { status: 'entregue', paymentMethod: 'dinheiro', total: 20 },
      { status: 'entregue', paymentMethod: 'dinheiro', total: 10 },
      { status: 'entregue', paymentMethod: 'pix', total: 15 },
      { status: 'entregue', paymentMethod: 'cartao', total: 30 }
    ];

    const bytes = buildClosingReceiptBytes(orders, '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Dinheiro: R$ 30.00');
    expect(text).toContain('Pix: R$ 15.00');
    expect(text).toContain('Cartao: R$ 30.00');
    expect(text).toContain('TOTAL DO DIA: R$ 75.00');
    expect(text).toContain('Pedidos entregues: 4');
  });

  it('ignores cancelled orders in the totals but still counts them', () => {
    const orders = [
      { status: 'entregue', paymentMethod: 'dinheiro', total: 50 },
      { status: 'cancelado', paymentMethod: 'dinheiro', total: 999 }
    ];

    const bytes = buildClosingReceiptBytes(orders, '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Dinheiro: R$ 50.00');
    expect(text).toContain('TOTAL DO DIA: R$ 50.00');
    expect(text).toContain('Pedidos entregues: 1');
    expect(text).toContain('Pedidos cancelados: 1');
  });

  it('does not count pending or printed orders as delivered', () => {
    const orders = [
      { status: 'pendente', paymentMethod: 'dinheiro', total: 20 },
      { status: 'impresso', paymentMethod: 'pix', total: 30 }
    ];

    const bytes = buildClosingReceiptBytes(orders, '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Pedidos entregues: 0');
    expect(text).toContain('TOTAL DO DIA: R$ 0.00');
  });

  it('uses FECHAMENTO as the default title when none is given', () => {
    const bytes = buildClosingReceiptBytes([], '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('=== FECHAMENTO ===');
  });

  it('uses a custom title and includes the business name when given', () => {
    const bytes = buildClosingReceiptBytes([], '12/09/2026', [], {
      businessName: 'Distribuidora Boa Água',
      title: 'FECHAMENTO DO DIA'
    });
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Distribuidora Boa Água');
    expect(text).toContain('=== FECHAMENTO DO DIA ===');
  });

  it('omits the business name line when none is given', () => {
    const bytes = buildClosingReceiptBytes([], '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text.startsWith('@t=== FECHAMENTO ===')).toBe(true);
  });

  it('sums delivered items by product across orders, ignoring cancelled ones', () => {
    const products = [
      { id: 'agua-10', name: 'Água 20L', brand: 'Marca C' },
      { id: 'gas-p13', name: 'Gás P13', brand: '' }
    ];
    const orders = [
      { status: 'entregue', paymentMethod: 'dinheiro', total: 20, items: [{ productId: 'agua-10', qty: 2 }] },
      { status: 'entregue', paymentMethod: 'pix', total: 15, items: [{ productId: 'agua-10', qty: 1 }] },
      { status: 'entregue', paymentMethod: 'cartao', total: 110, items: [{ productId: 'gas-p13', qty: 1 }] },
      { status: 'cancelado', paymentMethod: 'dinheiro', total: 999, items: [{ productId: 'gas-p13', qty: 5 }] }
    ];

    const bytes = buildClosingReceiptBytes(orders, '12/09/2026', products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Itens entregues:');
    expect(text).toContain('3x Água 20L Marca C');
    expect(text).toContain('1x Gás P13');
    expect(text).not.toContain('5x Gás P13');
  });

  it('aggregates weight-based items in kg', () => {
    const products = [{ id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true }];
    const orders = [
      { status: 'entregue', paymentMethod: 'dinheiro', total: 10, items: [{ productId: 'racao-10', grams: 1000 }] },
      { status: 'entregue', paymentMethod: 'pix', total: 5, items: [{ productId: 'racao-10', grams: 500 }] }
    ];

    const bytes = buildClosingReceiptBytes(orders, '12/09/2026', products);
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('1,5kg Ração X');
  });

  it('omits the "Itens entregues" block when there are no delivered orders', () => {
    const bytes = buildClosingReceiptBytes([], '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).not.toContain('Itens entregues');
  });

  it('always includes a blank signature line for conference', () => {
    const bytes = buildClosingReceiptBytes([], '12/09/2026');
    const text = new TextDecoder('windows-1252').decode(bytes);

    expect(text).toContain('Conferido por:');
    expect(text).toContain('_____________________');
  });
});
