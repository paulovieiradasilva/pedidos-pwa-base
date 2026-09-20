import { describe, it, expect, beforeEach } from 'vitest';
import { openDB, put, getAll, deleteDatabase, replaceAll, DB_VERSION } from '../js/db.js';
import {
  exportBackup,
  parseBackup,
  restoreBackup,
  backupFileName,
  isBackupOverdue,
  daysSinceBackup,
  encodeBackupText,
  decodeBackupText,
  parseBackupText,
  BACKUP_TEXT_SOFT_LIMIT,
  BackupError
} from '../js/backup.js';

async function seed() {
  await put('customers', { phone: '11999990001', address: 'Rua A, 1' });
  await put('products', { id: 'p1', name: 'Água 20L', brand: 'X', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true });
  await put('orders', { id: 'o1', customerPhone: '11999990001', items: [], status: 'pendente' });
  await put('auditLog', { id: 'a1', orderId: 'o1', action: 'edit' });
}

describe('backup', () => {
  beforeEach(async () => {
    await deleteDatabase();
    await openDB();
  });

  it('exports the four stores with counts and metadata', async () => {
    await seed();
    const backup = await exportBackup(new Date('2026-09-20T10:00:00Z'));
    expect(backup.app).toBe('pedidos');
    expect(backup.schemaVersion).toBe(DB_VERSION);
    expect(backup.exportedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(backup.counts).toEqual({ customers: 1, products: 1, orders: 1, auditLog: 1 });
    expect(backup.data.orders[0].id).toBe('o1');
  });

  it('round-trips: export, wipe, restore gives back identical data', async () => {
    await seed();
    const before = await exportBackup();
    const text = JSON.stringify(before);

    await deleteDatabase();
    expect(await getAll('orders')).toEqual([]);

    await restoreBackup(parseBackup(text));

    const after = await exportBackup();
    expect(after.data).toEqual(before.data);
  });

  it('restore replaces existing data instead of merging', async () => {
    await seed();
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    await put('orders', { id: 'extra', customerPhone: '11999990001', items: [], status: 'pendente' });

    await restoreBackup(backup);

    const orders = await getAll('orders');
    expect(orders.map(o => o.id)).toEqual(['o1']);
  });

  it('restores a backup wrapped in Proxy objects (as Alpine state is)', async () => {
    await seed();
    const backup = parseBackup(JSON.stringify(await exportBackup()));
    const wrap = value =>
      value && typeof value === 'object'
        ? new Proxy(Array.isArray(value) ? value.map(wrap) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wrap(v)])), {})
        : value;
    await deleteDatabase();

    await restoreBackup(wrap(backup));

    expect((await getAll('orders')).map(o => o.id)).toEqual(['o1']);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('isso nao e json')).toThrow(BackupError);
  });

  it('rejects a file from another app', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'outro', data: {} }))).toThrow(/não é um backup deste aplicativo/);
  });

  it('rejects a backup from a newer schema version', async () => {
    await seed();
    const backup = await exportBackup();
    backup.schemaVersion = DB_VERSION + 1;
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/mais nova/);
  });

  it('rejects a backup with a missing store or record without key', async () => {
    await seed();
    const backup = await exportBackup();

    const missingStore = structuredClone(backup);
    delete missingStore.data.orders;
    expect(() => parseBackup(JSON.stringify(missingStore))).toThrow(/incompleto/);

    const noKey = structuredClone(backup);
    noKey.data.products = [{ name: 'sem id' }];
    expect(() => parseBackup(JSON.stringify(noKey))).toThrow(/incompleto/);
  });

  it('replaceAll is all-or-nothing: a bad record leaves the old data untouched', async () => {
    await seed();
    await expect(
      replaceAll({ customers: [], products: [], orders: [{ semId: true }], auditLog: [] })
    ).rejects.toBeDefined();

    expect((await getAll('orders')).map(o => o.id)).toEqual(['o1']);
    expect((await getAll('customers')).length).toBe(1);
  });

  it('builds the file name from the local date', () => {
    expect(backupFileName(new Date(2026, 8, 5))).toBe('pedidos-backup-2026-09-05.json');
  });

  it('flags a backup as overdue when never done or older than the limit', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    expect(isBackupOverdue(null, 7, now)).toBe(true);
    expect(isBackupOverdue('2026-09-19T12:00:00Z', 7, now)).toBe(false);
    expect(isBackupOverdue('2026-09-10T12:00:00Z', 7, now)).toBe(true);
    expect(isBackupOverdue('lixo', 7, now)).toBe(true);
  });

  it('counts whole days since the last backup', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    expect(daysSinceBackup(null, now)).toBeNull();
    expect(daysSinceBackup('2026-09-11T12:00:00Z', now)).toBe(9);
    expect(daysSinceBackup('2026-09-20T09:00:00Z', now)).toBe(0);
  });
});

describe('backup em texto', () => {
  beforeEach(async () => {
    await deleteDatabase();
    await openDB();
  });

  it('round-trips through the text format', async () => {
    await seed();
    const backup = await exportBackup();
    const text = await encodeBackupText(backup);
    expect(text.startsWith('PEDIDOS1:')).toBe(true);
    const restored = await parseBackupText(text);
    expect(restored.data).toEqual(backup.data);
  });

  it('uses short lines so e-mail and WhatsApp do not break the text', async () => {
    await seed();
    const text = await encodeBackupText(await exportBackup());
    expect(Math.max(...text.split('\n').map(l => l.length))).toBeLessThanOrEqual(85);
  });

  it('tolerates quotes, reply markers, signature and blank lines around the text', async () => {
    await seed();
    const backup = await exportBackup();
    const text = await encodeBackupText(backup);
    const messy =
      'Segue o backup:\n\n' +
      text.split('\n').map(l => '> "' + l + '"').join('\r\n') +
      '\n\n--\nEnviado do meu celular Samsung';
    const restored = await parseBackupText(messy);
    expect(restored.data).toEqual(backup.data);
  });

  it('rejects text that is not a backup or was cut short', async () => {
    await seed();
    const text = await encodeBackupText(await exportBackup());
    await expect(decodeBackupText('bom dia')).rejects.toThrow(/não é um backup/);
    await expect(decodeBackupText(text.slice(0, Math.floor(text.length / 2)))).rejects.toThrow(/incompleto/);
    await expect(decodeBackupText('')).rejects.toBeInstanceOf(BackupError);
  });

  it('compresses: a 300-order backup fits under the WhatsApp-safe limit', async () => {
    for (let i = 0; i < 300; i++) {
      await put('orders', { id: 'o' + i, customerPhone: '11999990001', address: 'Rua das Flores, ' + i, items: [{ productId: 'p1', qty: 2 }], paymentMethod: 'pix', status: 'entregue', createdAt: '2026-09-20T10:00:00.000Z' });
    }
    const text = await encodeBackupText(await exportBackup());
    expect(text.length).toBeLessThan(BACKUP_TEXT_SOFT_LIMIT);
  });
});
