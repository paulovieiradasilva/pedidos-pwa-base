import { describe, it, expect } from 'vitest';
import { buildReceiptBytes, buildClosingReceiptBytes, connectPrinter } from '../js/printer.js';

const decode = bytes => new TextDecoder('windows-1252').decode(bytes);

describe('buildReceiptBytes - acentos', () => {
  it('strips accents and ordinal indicators so the text always prints on printers that ignore the codepage command', () => {
    const order = {
      createdAt: '2026-09-25T10:00:00.000Z',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix',
      total: 10,
      changeAmount: 0
    };
    const customer = { phone: '11988887777', address: 'Rua da Água, Endereço com ç e ã' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Rua da Agua, Endereco com c e a');
    expect(text).toContain('Agua 20L Marca C x1');
    expect(text).not.toMatch(/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/);
  });

  it('turns the ordinal "ª" of the second-copy marker into a plain "a"', () => {
    const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [], paymentMethod: 'pix', total: 10, changeAmount: 0 };
    const customer = { phone: '11988887777', address: 'Rua A, 1' };

    const bytes = buildReceiptBytes(order, customer, [], { copy: true });
    const text = decode(bytes);

    expect(text).toContain('*** 2a VIA ***');
    expect(text).not.toContain('ª');
    expect(Array.from(bytes)).not.toContain(0xaa);
  });
});

describe('buildReceiptBytes - segunda via', () => {
  const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix', changeFor: null, total: 10, changeAmount: 0 };
  const customer = { phone: '11988887777', address: 'Rua A, 1' };
  const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

  it('marks a reprint as second copy at the very top, keeping the rest identical', () => {
    const original = decode(buildReceiptBytes(order, customer, products));
    const copy = decode(buildReceiptBytes(order, customer, products, { copy: true }));

    expect(copy).toContain('*** 2a VIA ***');
    expect(copy.replace('*** 2a VIA ***\n', '')).toBe(original);
    expect(copy.indexOf('*** 2a VIA ***')).toBeLessThan(copy.indexOf('=== PEDIDO ==='));
  });

  it('does not mark the normal receipt as second copy', () => {
    expect(decode(buildReceiptBytes(order, customer, products))).not.toContain('VIA');
    expect(decode(buildReceiptBytes(order, customer, products, {}))).not.toContain('VIA');
  });
});

describe('buildReceiptBytes - número do pedido e data', () => {
  const customer = { phone: '11988887777', address: 'Rua A, 1' };
  const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

  it('prints the daily order number and the creation date/time', () => {
    const order = { createdAt: '2026-09-25T13:05:00.000Z', dailyNumber: 3, items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix', total: 10, changeAmount: 0 };

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Pedido #3 -');
    expect(text.indexOf('Pedido #3')).toBeLessThan(text.indexOf('Rua A, 1'));
  });

  it('falls back to just the date, without a number, for orders created before this feature existed', () => {
    const order = { createdAt: '2026-09-25T13:05:00.000Z', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix', total: 10, changeAmount: 0 };

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).not.toContain('Pedido #');
    expect(text.split('\n')[1]).not.toBe('');
  });
});

describe('buildReceiptBytes', () => {
  it('includes address, product names and total in the printed text', () => {
    const order = {
      createdAt: '2026-09-25T10:00:00.000Z',
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'dinheiro',
      changeFor: 50,
      total: 20,
      changeAmount: 30
    };
    const customer = { phone: '11988887777', address: 'Rua Joaquim Possidônio, 40' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Rua Joaquim Possidonio, 40');
    expect(text).toContain('Agua 20L Marca C x2');
    expect(text).toContain('Total: R$ 20.00');
    expect(text).toContain('Troco para R$ 50.00 (devolver R$ 30.00)');
  });

  it('still resolves the product name/brand when the product has since been deactivated', () => {
    const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix', total: 10, changeAmount: 0 };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: false }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Agua 20L Marca C x1');
  });

  it('prints just the product name, with no trailing space, when brand is empty', () => {
    const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [{ productId: 'gas-p13', qty: 1 }], paymentMethod: 'pix', total: 110, changeAmount: 0 };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'gas-p13', name: 'Gás P13', brand: '', prices: { dinheiro: 110, pix: 110, cartao: 110 }, active: true }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Gas P13 x1');
    expect(text).not.toContain('Gas P13  x1');
  });

  it('prints the weight in kg instead of a unit count for weight-based items', () => {
    const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [{ productId: 'racao-10', grams: 1200 }], paymentMethod: 'dinheiro', total: 12, changeAmount: 0 };
    const customer = { phone: '11988887777', address: 'Rua Teste, 1' };
    const products = [{ id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true, pricePerKg: 10, active: true }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Racao X 1,2kg');
  });

  it('prints one line per item when the order has multiple different products', () => {
    const order = {
      createdAt: '2026-09-25T10:00:00.000Z',
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

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('Agua 20L Marca C x2');
    expect(text).toContain('Racao X 1,5kg');
  });
});

describe('buildReceiptBytes - separador no fim', () => {
  it('ends with a dashed line the width of a 58mm printer, to tell orders apart when printed back-to-back for a route', () => {
    const order = { createdAt: '2026-09-25T10:00:00.000Z', items: [{ productId: 'agua-10', qty: 1 }], paymentMethod: 'pix', total: 10, changeAmount: 0 };
    const customer = { phone: '11988887777', address: 'Rua A, 1' };
    const products = [{ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true }];

    const text = decode(buildReceiptBytes(order, customer, products));

    expect(text).toContain('-'.repeat(32));
    expect(text.indexOf('-'.repeat(32))).toBeGreaterThan(text.indexOf('Total:'));
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

    const text = decode(buildClosingReceiptBytes(orders, '12/09/2026'));

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

    const text = decode(buildClosingReceiptBytes(orders, '12/09/2026'));

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

    const text = decode(buildClosingReceiptBytes(orders, '12/09/2026'));

    expect(text).toContain('Pedidos entregues: 0');
    expect(text).toContain('TOTAL DO DIA: R$ 0.00');
  });

  it('uses FECHAMENTO as the default title when none is given', () => {
    const text = decode(buildClosingReceiptBytes([], '12/09/2026'));

    expect(text).toContain('=== FECHAMENTO ===');
  });

  it('uses a custom title and includes the business name when given', () => {
    const text = decode(buildClosingReceiptBytes([], '12/09/2026', [], {
      businessName: 'Distribuidora Boa Água',
      title: 'FECHAMENTO DO DIA'
    }));

    expect(text).toContain('Distribuidora Boa Agua');
    expect(text).toContain('=== FECHAMENTO DO DIA ===');
  });

  it('omits the business name line when none is given', () => {
    const text = decode(buildClosingReceiptBytes([], '12/09/2026'));

    // A 1ª linha (depois dos bytes de comando ESC/POS que abrem o texto) já é
    // o cabeçalho — ou seja, nenhuma linha de nome do negócio foi inserida antes.
    expect(text.split('\n')[0].endsWith('=== FECHAMENTO ===')).toBe(true);
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

    const text = decode(buildClosingReceiptBytes(orders, '12/09/2026', products));

    expect(text).toContain('Itens entregues:');
    expect(text).toContain('3x Agua 20L Marca C');
    expect(text).toContain('1x Gas P13');
    expect(text).not.toContain('5x Gas P13');
  });

  it('aggregates weight-based items in kg', () => {
    const products = [{ id: 'racao-10', name: 'Ração X', brand: '', soldByWeight: true }];
    const orders = [
      { status: 'entregue', paymentMethod: 'dinheiro', total: 10, items: [{ productId: 'racao-10', grams: 1000 }] },
      { status: 'entregue', paymentMethod: 'pix', total: 5, items: [{ productId: 'racao-10', grams: 500 }] }
    ];

    const text = decode(buildClosingReceiptBytes(orders, '12/09/2026', products));

    expect(text).toContain('1,5kg Racao X');
  });

  it('omits the "Itens entregues" block when there are no delivered orders', () => {
    const text = decode(buildClosingReceiptBytes([], '12/09/2026'));

    expect(text).not.toContain('Itens entregues');
  });

  it('always includes a blank signature line for conference', () => {
    const text = decode(buildClosingReceiptBytes([], '12/09/2026'));

    expect(text).toContain('Conferido por:');
    expect(text).toContain('_____________________');
  });
});

describe('connectPrinter', () => {
  // A conexão fica guardada dentro do módulo (pra sobreviver entre chamadas
  // na mesma sessão da página), então este é um único teste sequencial em vez
  // de vários independentes — testes separados dividiriam esse estado entre si.
  it('opens the chooser only once per device: reconnects silently after, and only reopens it if the silent reconnect fails', async () => {
    function fakeDevice(connectImpl) {
      const device = { gatt: { connect: () => connectImpl(device) } };
      return device;
    }
    function serverFor(device) {
      return { getPrimaryService: async () => ({ getCharacteristic: async () => ({ device }) }) };
    }

    let firstDeviceConnectCalls = 0;
    const firstDevice = fakeDevice(async device => {
      firstDeviceConnectCalls++;
      // Funciona a 1ª e 2ª vez (conexão inicial + reconexão silenciosa);
      // na 3ª simula a impressora ter saído de alcance/desligado.
      if (firstDeviceConnectCalls <= 2) return serverFor(device);
      throw new Error('device unreachable');
    });
    const secondDevice = fakeDevice(async device => serverFor(device));
    let requestDeviceCalls = 0;
    const bluetooth = {
      requestDevice: async () => {
        requestDeviceCalls++;
        return requestDeviceCalls === 1 ? firstDevice : secondDevice;
      }
    };

    const first = await connectPrinter(bluetooth);
    expect(requestDeviceCalls).toBe(1); // 1ª vez: abre o seletor
    expect(first.device).toBe(firstDevice);

    const second = await connectPrinter(bluetooth);
    expect(requestDeviceCalls).toBe(1); // reconectou sozinho, sem abrir o seletor de novo
    expect(second.device).toBe(firstDevice);

    const third = await connectPrinter(bluetooth);
    expect(requestDeviceCalls).toBe(2); // reconexão falhou: abre o seletor de novo
    expect(third.device).toBe(secondDevice);
  });
});
