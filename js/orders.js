// CRUD de pedidos e cálculo de totais. É aqui que fica a regra de quais mudanças
// de pedido geram uma entrada no Histórico (auditoria) e quais não geram.

import { getAll, get, put, remove } from './db.js';
import { listProducts } from './products.js';
import { logOrderChange } from './auditLog.js';

// Transições de status consideradas "do dia a dia" (fluxo normal do negócio) —
// não geram registro no Histórico, porque não são sinal de possível fraude/erro.
// Qualquer outra transição (cancelar, reverter, etc.) é logada.
const ROUTINE_STATUS_TRANSITIONS = new Set(['pendente>impresso', 'impresso>entregue']);

// Formata uma data como "AAAA-MM-DD" no fuso horário local (usado para agrupar
// pedidos por dia, ex.: "pedidos de hoje").
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Soma o valor de todos os itens do carrinho. Produto vendido por peso usa
// `manualTotal` (se o valor foi digitado direto) ou preço/kg x peso; produto
// normal usa o preço da forma de pagamento escolhida x quantidade.
function computeOrderTotal(items, paymentMethod, productById) {
  return items.reduce((sum, item) => {
    const product = productById[item.productId];
    const itemTotal = product.soldByWeight
      ? item.manualTotal ?? product.pricePerKg * (item.grams / 1000)
      : product.prices[paymentMethod] * item.qty;
    return sum + itemTotal;
  }, 0);
}

// Cria um novo pedido (status inicial sempre "pendente"). Criação de pedido
// nunca é logada no Histórico — só alterações depois de criado.
export async function createOrder(input) {
  const products = await listProducts();
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const total = computeOrderTotal(input.items, input.paymentMethod, productById);

  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  const now = new Date();
  const createdAt = now.toISOString();
  // Número do pedido no dia (reinicia a cada dia) — só pra facilitar identificar
  // o pedido ("pedido 3 de hoje") no recibo. É fixado na criação e nunca muda
  // depois, mesmo se outro pedido do dia for excluído.
  const dailyNumber = (await getAll('orders'))
    .filter(o => localDateString(new Date(o.createdAt)) === localDateString(now)).length + 1;

  const order = {
    id: crypto.randomUUID(),
    dailyNumber,
    customerPhone: input.customerPhone,
    address: input.address ?? null,
    items: input.items,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    total,
    changeAmount,
    status: 'pendente',
    createdAt
  };

  await put('orders', order);
  return order;
}

// Edita um pedido existente (itens, endereço, forma de pagamento etc.) e volta
// o status para "pendente". Sempre gera uma entrada no Histórico com o estado
// de ANTES (`before`) e de DEPOIS (`orderAfter`) gravados no momento exato da
// edição — importante para o "antes -> depois" no Histórico não mudar mais
// tarde se o pedido for editado de novo (cada edição é uma foto congelada).
export async function updateOrder(id, input) {
  const order = await get('orders', id);
  if (!order) return null;
  const before = { ...order };

  const products = await listProducts();
  const productById = Object.fromEntries(products.map(p => [p.id, p]));

  const total = computeOrderTotal(input.items, input.paymentMethod, productById);
  const changeAmount = input.paymentMethod === 'dinheiro' && typeof input.changeFor === 'number'
    ? Math.max(input.changeFor - total, 0)
    : 0;

  order.customerPhone = input.customerPhone;
  order.address = input.address ?? null;
  order.items = input.items;
  order.paymentMethod = input.paymentMethod;
  order.changeFor = input.changeFor ?? null;
  order.total = total;
  order.changeAmount = changeAmount;
  order.status = 'pendente';

  await logOrderChange('edit', before, { orderAfter: { ...order } });
  await put('orders', order);
  return order;
}

// Lista os pedidos criados em um dia específico (usado na aba "Pedidos do Dia").
export async function listOrdersForDay(dateISO) {
  const all = await getAll('orders');
  return all
    .filter(o => localDateString(new Date(o.createdAt)) === dateISO)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Muda o status do pedido (ex.: marcar como impresso/entregue/cancelado).
// Só grava no Histórico se a transição não for uma das rotineiras acima.
export async function updateOrderStatus(id, status) {
  const order = await get('orders', id);
  if (!order) return;
  const transitionKey = `${order.status}>${status}`;
  if (!ROUTINE_STATUS_TRANSITIONS.has(transitionKey)) {
    await logOrderChange('status', order, { fromStatus: order.status, toStatus: status });
  }
  order.status = status;
  await put('orders', order);
}

// Exclui definitivamente um pedido, guardando no Histórico uma cópia dele antes
// de apagar (senão a exclusão não deixaria nenhum rastro).
export async function removeOrder(id) {
  const order = await get('orders', id);
  if (order) {
    await logOrderChange('delete', order);
  }
  await remove('orders', id);
}

// Lista todos os pedidos já feitos (qualquer dia) — usado na busca por
// telefone/endereço em todo o histórico e no fechamento de caixa.
export async function listAllOrders() {
  const all = await getAll('orders');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
