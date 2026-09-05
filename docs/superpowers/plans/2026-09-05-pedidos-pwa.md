# Pedidos PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side PWA that lets the distributor's owner turn a WhatsApp order into a printed slip (Bluetooth thermal printer) and a daily list, without writing anything by hand twice.

**Architecture:** Static PWA (HTML/CSS/JS, no backend). Data lives in IndexedDB in the browser. Printing goes straight from the browser to a BLE thermal printer via the Web Bluetooth API. Hosted on GitHub Pages; a service worker caches everything for offline daily use.

**Tech Stack:** Vanilla JS (ES modules), Alpine.js (CDN) for UI reactivity, Tailwind CSS (CDN) for styling, native `indexedDB`, native `navigator.bluetooth`. Vitest + `fake-indexeddb` for unit tests of pure logic (no build step for the shipped app itself — Vitest is a dev-only dependency).

## Global Constraints

- No backend server, no cloud database — every write happens in the browser's IndexedDB.
- No automated reading of WhatsApp messages — the owner types phone number and order manually.
- Must work fully offline after first install (service worker cache).
- Target browser: Chrome on Android only (Web Bluetooth is unavailable on iOS Safari) — do not add iOS-specific code paths.
- Printer communication must go through Web Bluetooth (BLE GATT); do not assume Bluetooth Classic/SPP.
- Delivery person never touches a device — the only physical artifact they receive is the printed slip.
- Reconciliation (cash/change handoff) stays fully outside the app (paper + camera, per owner's existing process).

---

## File Structure

```
/
├── index.html                  # App shell, loads Alpine/Tailwind via CDN, mounts app.js
├── manifest.json                # PWA manifest
├── service-worker.js            # Offline cache
├── js/
│   ├── db.js                    # IndexedDB open/get/put/getAll wrapper
│   ├── customers.js             # findCustomerByPhone, saveCustomer
│   ├── products.js              # seedProducts, listProducts, addProduct
│   ├── orders.js                # createOrder (total/troco calc), listOrdersForDay
│   ├── printer.js                # buildReceiptBytes (pure), connectPrinter, printReceipt
│   └── app.js                    # Alpine components wiring screens to the modules above
├── tests/
│   ├── db.test.js
│   ├── customers.test.js
│   ├── products.test.js
│   ├── orders.test.js
│   └── printer.test.js          # only buildReceiptBytes (pure function) is tested
├── package.json
└── vitest.config.js
```

**Interfaces summary (so later tasks agree on names/types):**
- `db.js` exports `openDB(): Promise<IDBDatabase>`, `getAll(storeName): Promise<any[]>`, `get(storeName, key): Promise<any|undefined>`, `put(storeName, value): Promise<void>`.
- `customers.js` exports `findCustomerByPhone(phone: string): Promise<{phone: string, address: string}|undefined>`, `saveCustomer(phone: string, address: string): Promise<void>`.
- `products.js` exports `seedProductsIfEmpty(): Promise<void>`, `listProducts(): Promise<Product[]>`, `addProduct(product: Product): Promise<void>` where `Product = {id: string, name: string, brand: string, price: number, category: 'agua'|'gas'}`.
- `orders.js` exports `createOrder(input: OrderInput): Promise<Order>`, `listOrdersForDay(dateISO: string): Promise<Order[]>` where `OrderInput = {customerPhone: string, items: {productId: string, qty: number}[], paymentMethod: 'dinheiro'|'pix'|'cartao', changeFor?: number}` and `Order` adds `{id: string, total: number, changeAmount: number, createdAt: string}`.
- `printer.js` exports `buildReceiptBytes(order: Order, customer: Customer, products: Product[]): Uint8Array`, `connectPrinter(): Promise<BluetoothRemoteGATTCharacteristic>`, `printReceipt(characteristic, bytes): Promise<void>`.

---

### Task 0: Hardware spike — validate Bluetooth printing before building anything else

**Files:**
- Create: `spike/bluetooth-test.html`

**Interfaces:** none (standalone throwaway page, not part of the shipped app).

This task has no automated test — it validates a hardware assumption the whole architecture depends on (see Global Constraints: "must go through Web Bluetooth / BLE GATT").

- [ ] **Step 1: Buy one 58mm Bluetooth thermal printer** (any model listing "Bluetooth" support, e.g. the ones found earlier: XP-58IIH or similar USB+Bluetooth combo).

- [ ] **Step 2: Write the spike page**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Teste Bluetooth</title></head>
<body>
  <button id="connect">Conectar impressora</button>
  <pre id="log"></pre>
  <script>
    const log = (msg) => { document.getElementById('log').textContent += msg + '\n'; console.log(msg); };

    document.getElementById('connect').addEventListener('click', async () => {
      try {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [0x18F0, '000018f0-0000-1000-8000-00805f9b34fb']
        });
        log('Dispositivo encontrado: ' + device.name);
        const server = await device.gatt.connect();
        log('GATT conectado');
        const services = await server.getPrimaryServices();
        for (const service of services) {
          log('Service UUID: ' + service.uuid);
          const chars = await service.getCharacteristics();
          for (const c of chars) log('  Characteristic UUID: ' + c.uuid + ' properties: ' + JSON.stringify(c.properties));
        }
      } catch (err) {
        log('ERRO: ' + err.message);
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Serve it over HTTPS or localhost** (Web Bluetooth requires a secure context). Quickest option: `npx http-server -p 8080` and open `https://<lan-ip>:8080` is not enough (needs TLS) — instead use `npx localtunnel --port 8080` or just open the file via `chrome://flags` "Insecure origins treated as secure" pointing at your LAN IP during this spike only.

- [ ] **Step 4: Open the page in Chrome on the actual Android tablet**, click "Conectar impressora", pick the printer from the pairing dialog.

- [ ] **Step 5: Confirm the log shows at least one writable characteristic** (property `writeWithoutResponse` or `write` is `true`). Write down the exact **service UUID** and **characteristic UUID** shown — Task 5 (`printer.js`) needs these exact values hard-coded.

- [ ] **Step 6: Gate check.** If no writable BLE characteristic appears (device only exposes Bluetooth Classic/SPP), STOP. This plan's architecture assumed BLE. Re-open the design conversation before writing Tasks 1-8 — do not proceed on the assumption that any "Bluetooth printer" works with Web Bluetooth.

- [ ] **Step 7: Commit the spike for reference**

The git repository at `/home/linux/Projetos/WhatsApp` is already initialized (branch `main`, one empty initial commit) — just add and commit this task's file.

```bash
cd /home/linux/Projetos/WhatsApp
git add spike/bluetooth-test.html
git commit -m "chore: bluetooth printer spike (validates Web Bluetooth GATT support)"
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`

**Interfaces:** none yet — this just sets up tooling later tasks depend on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pedidos-pwa",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "fake-indexeddb": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js']
  }
});
```

- [ ] **Step 3: Create `tests/setup.js`**

```js
import 'fake-indexeddb/auto';
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.js tests/setup.js .gitignore package-lock.json
git commit -m "chore: project scaffold with vitest + fake-indexeddb"
```

---

### Task 2: `js/db.js` — IndexedDB wrapper

**Files:**
- Create: `js/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Produces: `openDB(): Promise<IDBDatabase>`, `getAll(storeName): Promise<any[]>`, `get(storeName, key): Promise<any|undefined>`, `put(storeName, value): Promise<void>`. Stores created: `customers` (keyPath `phone`), `products` (keyPath `id`), `orders` (keyPath `id`).

- [ ] **Step 1: Write the failing test**

```js
// tests/db.test.js
import { describe, it, expect } from 'vitest';
import { openDB, put, get, getAll } from '../js/db.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/db.js` does not exist / export not found.

- [ ] **Step 3: Write the implementation**

```js
// js/db.js
const DB_NAME = 'pedidos-db';
const DB_VERSION = 1;
const STORES = {
  customers: 'phone',
  products: 'id',
  orders: 'id'
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add js/db.js tests/db.test.js
git commit -m "feat: add IndexedDB wrapper (open/get/put/getAll)"
```

---

### Task 3: `js/customers.js` — phone → address lookup

**Files:**
- Create: `js/customers.js`
- Test: `tests/customers.test.js`

**Interfaces:**
- Consumes: `get('customers', phone)` and `put('customers', value)` from `js/db.js` (Task 2).
- Produces: `findCustomerByPhone(phone: string): Promise<{phone: string, address: string}|undefined>`, `saveCustomer(phone: string, address: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/customers.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/customers.js` does not exist.

- [ ] **Step 3: Write the implementation**

```js
// js/customers.js
import { get, put } from './db.js';

export async function findCustomerByPhone(phone) {
  return get('customers', phone);
}

export async function saveCustomer(phone, address) {
  await put('customers', { phone, address });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/customers.js tests/customers.test.js
git commit -m "feat: add customer lookup/save by phone"
```

---

### Task 4: `js/products.js` — fixed, editable catalog

**Files:**
- Create: `js/products.js`
- Test: `tests/products.test.js`

**Interfaces:**
- Consumes: `getAll('products', ...)`, `put('products', value)` from `js/db.js` (Task 2).
- Produces: `seedProductsIfEmpty(): Promise<void>`, `listProducts(): Promise<Product[]>`, `addProduct(product: Product): Promise<void>` where `Product = {id: string, name: string, brand: string, price: number, category: 'agua'|'gas'}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/products.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/products.js` does not exist.

- [ ] **Step 3: Write the implementation**

```js
// js/products.js
import { getAll, put } from './db.js';

const DEFAULT_CATALOG = [
  { id: 'agua-6.5-a', name: 'Água 20L', brand: 'Marca A', price: 6.5, category: 'agua' },
  { id: 'agua-6.5-b', name: 'Água 20L', brand: 'Marca B', price: 6.5, category: 'agua' },
  { id: 'agua-10-a', name: 'Água 20L', brand: 'Marca C', price: 10, category: 'agua' },
  { id: 'gas-p13', name: 'Gás P13', brand: 'Marca A', price: 110, category: 'gas' }
];

export async function seedProductsIfEmpty() {
  const existing = await getAll('products');
  if (existing.length > 0) return;
  for (const product of DEFAULT_CATALOG) {
    await put('products', product);
  }
}

export async function listProducts() {
  return getAll('products');
}

export async function addProduct(product) {
  await put('products', product);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/products.js tests/products.test.js
git commit -m "feat: add product catalog with default seed"
```

---

### Task 5: `js/orders.js` — order creation, total/troco calculation, daily list

**Files:**
- Create: `js/orders.js`
- Test: `tests/orders.test.js`

**Interfaces:**
- Consumes: `getAll('orders')`, `put('orders', value)` from `js/db.js` (Task 2); `listProducts()` from `js/products.js` (Task 4) to resolve item prices.
- Produces: `createOrder(input: OrderInput): Promise<Order>`, `listOrdersForDay(dateISO: string): Promise<Order[]>` where `OrderInput = {customerPhone: string, items: {productId: string, qty: number}[], paymentMethod: 'dinheiro'|'pix'|'cartao', changeFor?: number}` and `Order` adds `{id: string, total: number, changeAmount: number, createdAt: string}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/orders.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, listOrdersForDay } from '../js/orders.js';
import { addProduct } from '../js/products.js';

beforeEach(async () => {
  await addProduct({ id: 'agua-10', name: 'Água 20L', brand: 'Marca C', price: 10, category: 'agua' });
});

describe('orders', () => {
  it('computes total from item prices and quantities', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro',
      changeFor: 50
    });
    expect(order.total).toBe(30);
  });

  it('computes change amount when paying in cash', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 3 }],
      paymentMethod: 'dinheiro',
      changeFor: 50
    });
    expect(order.changeAmount).toBe(20);
  });

  it('has zero change amount for pix/cartao', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 2 }],
      paymentMethod: 'pix'
    });
    expect(order.changeAmount).toBe(0);
  });

  it('lists orders created on a given day', async () => {
    const order = await createOrder({
      customerPhone: '11988887777',
      items: [{ productId: 'agua-10', qty: 1 }],
      paymentMethod: 'pix'
    });
    const today = order.createdAt.slice(0, 10);
    const list = await listOrdersForDay(today);
    expect(list.some(o => o.id === order.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/orders.js` does not exist.

- [ ] **Step 3: Write the implementation**

```js
// js/orders.js
import { getAll, put } from './db.js';
import { listProducts } from './products.js';

export async function createOrder(input) {
  const products = await listProducts();
  const priceById = Object.fromEntries(products.map(p => [p.id, p.price]));

  const total = input.items.reduce((sum, item) => {
    const price = priceById[item.productId];
    return sum + price * item.qty;
  }, 0);

  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  const order = {
    id: crypto.randomUUID(),
    customerPhone: input.customerPhone,
    items: input.items,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    total,
    changeAmount,
    createdAt: new Date().toISOString()
  };

  await put('orders', order);
  return order;
}

export async function listOrdersForDay(dateISO) {
  const all = await getAll('orders');
  return all.filter(o => o.createdAt.slice(0, 10) === dateISO);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/orders.js tests/orders.test.js
git commit -m "feat: add order creation with total/troco calculation and daily listing"
```

---

### Task 6: `js/printer.js` — ESC/POS receipt builder + Web Bluetooth send

**Files:**
- Create: `js/printer.js`
- Test: `tests/printer.test.js` (covers `buildReceiptBytes` only — `connectPrinter`/`printReceipt` need real Bluetooth hardware and are verified manually in Task 7)

**Interfaces:**
- Consumes: `Order`/`Customer`/`Product` shapes from Tasks 3-5. Uses the **exact service/characteristic UUIDs found in Task 0, Step 5** — replace the `SERVICE_UUID`/`CHARACTERISTIC_UUID` placeholders below with those real values before running Task 7.
- Produces: `buildReceiptBytes(order, customer, products): Uint8Array`, `connectPrinter(): Promise<BluetoothRemoteGATTCharacteristic>`, `printReceipt(characteristic, bytes): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/printer.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `js/printer.js` does not exist.

- [ ] **Step 3: Write the implementation**

```js
// js/printer.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/printer.js tests/printer.test.js
git commit -m "feat: add ESC/POS receipt builder and Web Bluetooth print functions"
```

---

### Task 7: UI shell — `index.html` + `js/app.js` wiring the three screens

**Files:**
- Create: `index.html`
- Create: `js/app.js`

**Interfaces:**
- Consumes: `findCustomerByPhone`, `saveCustomer` (Task 3); `seedProductsIfEmpty`, `listProducts` (Task 4); `createOrder`, `listOrdersForDay` (Task 5); `buildReceiptBytes`, `connectPrinter`, `printReceipt` (Task 6).
- Produces: nothing consumed by later tasks — this is the top of the dependency graph.

No automated test — this is manual/browser-verified UI wiring on real hardware (Web Bluetooth cannot run in a headless test environment).

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pedidos</title>
  <link rel="manifest" href="manifest.json">
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-50 p-4 max-w-md mx-auto" x-data="pedidosApp()" x-init="init()">

  <h1 class="text-xl font-bold mb-4">Novo Pedido</h1>

  <label class="block mb-2">Telefone</label>
  <input type="tel" class="border p-2 w-full mb-1" x-model="phone" @blur="lookupCustomer()">
  <p class="text-sm text-gray-600 mb-3" x-text="address ? 'Endereço: ' + address : 'Cliente novo — informe o endereço abaixo'"></p>
  <template x-if="!address">
    <input type="text" placeholder="Endereço" class="border p-2 w-full mb-3" x-model="newAddress">
  </template>

  <label class="block mb-2">Produto</label>
  <select class="border p-2 w-full mb-3" x-model="selectedProductId">
    <template x-for="p in products" :key="p.id">
      <option :value="p.id" x-text="p.name + ' ' + p.brand + ' - R$ ' + p.price.toFixed(2)"></option>
    </template>
  </select>

  <label class="block mb-2">Quantidade</label>
  <input type="number" min="1" class="border p-2 w-full mb-3" x-model.number="qty">

  <label class="block mb-2">Pagamento</label>
  <select class="border p-2 w-full mb-3" x-model="paymentMethod">
    <option value="dinheiro">Dinheiro</option>
    <option value="pix">Pix</option>
    <option value="cartao">Cartão</option>
  </select>

  <template x-if="paymentMethod === 'dinheiro'">
    <div>
      <label class="block mb-2">Troco para quanto?</label>
      <input type="number" class="border p-2 w-full mb-3" x-model.number="changeFor">
    </div>
  </template>

  <button class="bg-blue-600 text-white p-3 w-full rounded" @click="confirmOrder()">Confirmar e Imprimir</button>

  <p class="mt-3 text-sm" x-text="statusMessage"></p>

  <h2 class="text-lg font-bold mt-8 mb-2">Pedidos de Hoje</h2>
  <ul>
    <template x-for="o in todayOrders" :key="o.id">
      <li class="border-b py-2 text-sm" x-text="o.customerPhone + ' - R$ ' + o.total.toFixed(2)"></li>
    </template>
  </ul>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `js/app.js`**

```js
import { findCustomerByPhone, saveCustomer } from './customers.js';
import { seedProductsIfEmpty, listProducts } from './products.js';
import { createOrder, listOrdersForDay } from './orders.js';
import { buildReceiptBytes, connectPrinter, printReceipt } from './printer.js';

window.pedidosApp = function () {
  return {
    phone: '',
    address: '',
    newAddress: '',
    products: [],
    selectedProductId: '',
    qty: 1,
    paymentMethod: 'dinheiro',
    changeFor: null,
    statusMessage: '',
    todayOrders: [],
    printerCharacteristic: null,

    async init() {
      await seedProductsIfEmpty();
      this.products = await listProducts();
      if (this.products.length > 0) this.selectedProductId = this.products[0].id;
      await this.refreshTodayOrders();
    },

    async lookupCustomer() {
      const customer = await findCustomerByPhone(this.phone);
      this.address = customer ? customer.address : '';
    },

    async confirmOrder() {
      if (!this.address && this.newAddress) {
        await saveCustomer(this.phone, this.newAddress);
        this.address = this.newAddress;
      }
      if (!this.address) {
        this.statusMessage = 'Informe o endereço antes de confirmar.';
        return;
      }

      const order = await createOrder({
        customerPhone: this.phone,
        items: [{ productId: this.selectedProductId, qty: this.qty }],
        paymentMethod: this.paymentMethod,
        changeFor: this.paymentMethod === 'dinheiro' ? this.changeFor : undefined
      });

      const customer = { phone: this.phone, address: this.address };
      const bytes = buildReceiptBytes(order, customer, this.products);

      try {
        if (!this.printerCharacteristic) {
          this.printerCharacteristic = await connectPrinter();
        }
        await printReceipt(this.printerCharacteristic, bytes);
        this.statusMessage = 'Pedido salvo e enviado para impressão.';
      } catch (err) {
        this.statusMessage = 'Pedido salvo, mas falha ao imprimir: ' + err.message + '. Copie manualmente: ' + new TextDecoder().decode(bytes);
      }

      await this.refreshTodayOrders();
    },

    async refreshTodayOrders() {
      const today = new Date().toISOString().slice(0, 10);
      this.todayOrders = await listOrdersForDay(today);
    }
  };
};
```

- [ ] **Step 3: Manual test — new customer flow**

Serve the app locally (`npx http-server -p 8080`), open on the Android tablet over HTTPS (reuse the Task 0 secure-context setup), type a phone number never used before, confirm the address field appears empty and asks for input, type an address, confirm order, verify "Pedidos de Hoje" list updates.

Expected: order appears in the list; status message shows either print success or the manual-copy fallback text.

- [ ] **Step 4: Manual test — returning customer flow**

Type the same phone number again, confirm the address auto-fills without asking.

Expected: address field shows the previously saved address automatically.

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js
git commit -m "feat: add order screen UI wired to db/printer modules"
```

---

### Task 8: PWA installability + offline support

**Files:**
- Create: `manifest.json`
- Create: `service-worker.js`
- Modify: `index.html` (register service worker)

**Interfaces:** none — this is infrastructure, consumed by nothing else in the codebase.

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "name": "Pedidos",
  "short_name": "Pedidos",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f9fafb",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" }
  ]
}
```

Note: create a simple 192x192 PNG icon file at `icon-192.png` (any square logo/placeholder image) — required for install prompts to appear on Android.

- [ ] **Step 2: Create `service-worker.js`**

```js
const CACHE_NAME = 'pedidos-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/db.js',
  './js/customers.js',
  './js/products.js',
  './js/orders.js',
  './js/printer.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 3: Register the service worker in `index.html`** — add before the closing `</body>` tag, after the `js/app.js` script tag:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
  }
</script>
```

- [ ] **Step 4: Manual test — install and go offline**

Open the app on the Android tablet over HTTPS, use Chrome's "Add to Home Screen", open the installed icon, then enable airplane mode and reload the app.

Expected: app still loads and functions (order creation, printing) with airplane mode on, since data and assets are local.

- [ ] **Step 5: Commit**

```bash
git add manifest.json service-worker.js icon-192.png index.html
git commit -m "feat: add PWA manifest and offline service worker"
```

---

### Task 9: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml` (or configure Pages from the `main` branch directly — see Step 1 options)

**Interfaces:** none.

- [ ] **Step 1: Create a GitHub repository and push**

```bash
cd /home/linux/Projetos/WhatsApp
gh repo create pedidos-pwa --private --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 2: Enable GitHub Pages**

In the repo's Settings → Pages, set source to "Deploy from a branch", branch `main`, folder `/ (root)`.

- [ ] **Step 3: Confirm HTTPS access**

Open the published `https://<user>.github.io/pedidos-pwa/` URL — confirm it loads over HTTPS (required for Web Bluetooth to work in production, unlike the Task 0/7 localhost workaround).

- [ ] **Step 4: Manual test on the real tablet against the live URL**

Repeat Task 7 Steps 3-4 and Task 8 Step 4 against the GitHub Pages URL instead of the local server.

Expected: identical behavior to local testing — new customer flow, returning customer flow, offline reload all work from the public URL.

- [ ] **Step 5: Document the update process** (add a short section to a `README.md` at the repo root — create it if it doesn't exist) explaining: to ship a bug fix, commit and `git push`, then reload the app on the tablet with internet on once so the service worker fetches the new version.
