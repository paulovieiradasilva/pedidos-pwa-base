// Histórico/log de auditoria: guarda um "retrato" (snapshot) de cada alteração
// não-rotineira feita em um pedido (editar, cancelar, excluir, reverter status).
// Alterações rotineiras (pendente -> impresso -> entregue) não entram aqui —
// isso é decidido em js/orders.js, não neste arquivo.
// Alimenta a aba "Histórico" do app.

import { getAll, put } from './db.js';

// Grava uma entrada no histórico. `orderBeforeChange` é o estado do pedido ANTES
// da mudança (a "foto de antes"); `extra` pode trazer `orderAfter` (o estado depois,
// gravado no exato momento da edição, pra nunca mais mudar) ou `fromStatus`/`toStatus`
// no caso de mudança de status. Cada entrada é permanente: não é recalculada depois.
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

// Lista todo o histórico, do mais recente para o mais antigo.
export async function listAuditLog() {
  const all = await getAll('auditLog');
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
