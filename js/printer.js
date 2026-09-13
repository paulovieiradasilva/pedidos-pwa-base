// Placeholder UUIDs for a common ESC/POS BLE clone chipset — Task 7 Step 0
// requires swapping these for the exact values read from the Task 0 spike log
// before connecting to the real printer.
const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

const ESC_INIT = new Uint8Array([0x1b, 0x40]); // ESC @
const ESC_CODEPAGE_WPC1252 = new Uint8Array([0x1b, 0x74, 0x10]); // ESC t 16 - select WPC1252 codepage

// Encodes text as single-byte Latin-1/CP1252 bytes (char code & 0xff). Portuguese
// accented characters (á é í ó ú â ê ô ã õ ç, upper/lowercase) all have code points
// <= 0xFF and map 1:1 to CP1252, so this is safe for our receipt text without
// pulling in a full CP1252 encoding table.
function encodeLatin1(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function gramsToKgLabel(grams) {
  const kg = grams / 1000;
  return `${parseFloat(kg.toFixed(3))}kg`.replace('.', ',');
}

function assembleReceiptBytes(text) {
  const body = encodeLatin1(text);
  const result = new Uint8Array(ESC_INIT.length + ESC_CODEPAGE_WPC1252.length + body.length);
  result.set(ESC_INIT, 0);
  result.set(ESC_CODEPAGE_WPC1252, ESC_INIT.length);
  result.set(body, ESC_INIT.length + ESC_CODEPAGE_WPC1252.length);
  return result;
}

export function buildReceiptBytes(order, customer, products) {
  const priceById = Object.fromEntries(products.map(p => [p.id, p]));

  const lines = [];
  lines.push('=== PEDIDO ===');
  lines.push(customer.address);
  lines.push('');
  for (const item of order.items) {
    const product = priceById[item.productId];
    const label = product.brand ? `${product.name} ${product.brand}` : product.name;
    const quantityLabel = item.grams != null ? gramsToKgLabel(item.grams) : `x${item.qty}`;
    lines.push(`${label} ${quantityLabel}`);
  }
  lines.push('');
  lines.push(`Total: R$ ${order.total.toFixed(2)}`);
  lines.push(`Pagamento: ${order.paymentMethod}`);
  if (order.paymentMethod === 'dinheiro' && order.changeFor) {
    lines.push(`Troco para R$ ${order.changeFor.toFixed(2)} (devolver R$ ${order.changeAmount.toFixed(2)})`);
  }
  lines.push('\n\n');

  return assembleReceiptBytes(lines.join('\n'));
}

function aggregateDeliveredItems(delivered, products) {
  const priceById = Object.fromEntries(products.map(p => [p.id, p]));
  const counts = {};
  for (const order of delivered) {
    for (const item of order.items ?? []) {
      const product = priceById[item.productId];
      const label = product ? (product.brand ? `${product.name} ${product.brand}` : product.name) : 'Produto removido';
      if (!counts[label]) counts[label] = { qty: 0, grams: 0 };
      if (item.grams != null) {
        counts[label].grams += item.grams;
      } else {
        counts[label].qty += item.qty ?? 0;
      }
    }
  }
  return counts;
}

export function buildClosingReceiptBytes(orders, dateLabel, products = [], options = {}) {
  const { businessName, title = 'FECHAMENTO' } = options;
  const delivered = orders.filter(o => o.status === 'entregue');
  const cancelled = orders.filter(o => o.status === 'cancelado');
  const totalsByPayment = { dinheiro: 0, pix: 0, cartao: 0 };
  for (const o of delivered) {
    totalsByPayment[o.paymentMethod] = (totalsByPayment[o.paymentMethod] ?? 0) + o.total;
  }
  const totalGeral = delivered.reduce((sum, o) => sum + o.total, 0);
  const itemCounts = aggregateDeliveredItems(delivered, products);

  const lines = [];
  if (businessName) lines.push(businessName);
  lines.push(`=== ${title} ===`);
  lines.push(dateLabel);
  lines.push('');
  lines.push(`Pedidos entregues: ${delivered.length}`);
  lines.push(`Pedidos cancelados: ${cancelled.length}`);
  lines.push('');
  lines.push(`Dinheiro: R$ ${totalsByPayment.dinheiro.toFixed(2)}`);
  lines.push(`Pix: R$ ${totalsByPayment.pix.toFixed(2)}`);
  lines.push(`Cartao: R$ ${totalsByPayment.cartao.toFixed(2)}`);
  lines.push('');
  lines.push(`TOTAL DO DIA: R$ ${totalGeral.toFixed(2)}`);

  const itemLines = Object.entries(itemCounts).map(([label, { qty, grams }]) => {
    const parts = [];
    if (qty > 0) parts.push(`${qty}x ${label}`);
    if (grams > 0) parts.push(`${gramsToKgLabel(grams)} ${label}`);
    return parts.join(' + ');
  });
  if (itemLines.length > 0) {
    lines.push('');
    lines.push('Itens entregues:');
    lines.push(...itemLines);
  }

  lines.push('');
  lines.push('Conferido por:');
  lines.push('');
  lines.push('_____________________');
  lines.push('\n\n');

  return assembleReceiptBytes(lines.join('\n'));
}

export async function connectPrinter() {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID]
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  return service.getCharacteristic(CHARACTERISTIC_UUID);
}

export async function printReceipt(characteristic, bytes) {
  const CHUNK_SIZE = 180; // BLE MTU-safe chunk
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    await characteristic.writeValueWithoutResponse(chunk);
  }
}
