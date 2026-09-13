import { getAll, put } from './db.js';

export async function logOrderChange(action, orderBeforeChange, extra = {}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    orderId: orderBeforeChange.id,
    orderSnapshot: { ...orderBeforeChange },
    ...extra
  };
  await put('auditLog', entry);
}

export async function listAuditLog() {
  const all = await getAll('auditLog');
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
