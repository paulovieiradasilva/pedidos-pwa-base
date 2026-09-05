// Placeholder UUIDs for a common ESC/POS BLE clone chipset — Task 7 Step 0
// requires swapping these for the exact values read from the Task 0 spike log
// before connecting to the real printer.
const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

const ESC_INIT = new Uint8Array([0x1b, 0x40]); // ESC @

export function buildReceiptBytes(order, customer, products) {
  const priceById = Object.fromEntries(products.map(p => [p.id, p]));

  const lines = [];
  lines.push('=== PEDIDO ===');
  lines.push(customer.address);
  lines.push('');
  for (const item of order.items) {
    const product = priceById[item.productId];
    lines.push(`${product.name} ${product.brand} x${item.qty}`);
  }
  lines.push('');
  lines.push(`Total: R$ ${order.total.toFixed(2)}`);
  lines.push(`Pagamento: ${order.paymentMethod}`);
  if (order.paymentMethod === 'dinheiro' && order.changeFor) {
    lines.push(`Troco para R$ ${order.changeFor.toFixed(2)} (devolver R$ ${order.changeAmount.toFixed(2)})`);
  }
  lines.push('\n\n');

  const text = lines.join('\n');
  const body = new TextEncoder().encode(text);

  const result = new Uint8Array(ESC_INIT.length + body.length);
  result.set(ESC_INIT, 0);
  result.set(body, ESC_INIT.length);
  return result;
}

export async function connectPrinter() {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }]
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
