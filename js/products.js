// Catálogo de produtos (água, gás etc.) — CRUD usado pela aba "Produtos".

import { getAll, get, put } from './db.js';

// Catálogo inicial, usado só na primeira vez que o app abre (banco vazio).
const DEFAULT_CATALOG = [
  { id: 'agua-6.5-a', name: 'Água 20L', brand: 'Marca A', prices: { dinheiro: 6.5, pix: 6.5, cartao: 6.5 }, active: true },
  { id: 'agua-6.5-b', name: 'Água 20L', brand: 'Marca B', prices: { dinheiro: 6.5, pix: 6.5, cartao: 6.5 }, active: true },
  { id: 'agua-10-a', name: 'Água 20L', brand: 'Marca C', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true },
  { id: 'agua-10-b', name: 'Água 20L', brand: 'Marca D', prices: { dinheiro: 10, pix: 10, cartao: 10 }, active: true },
  { id: 'gas-p13', name: 'Gás P13', brand: 'Marca A', prices: { dinheiro: 110, pix: 110, cartao: 110 }, active: true }
];

// Popula o catálogo padrão apenas se o banco de produtos ainda estiver vazio.
export async function seedProductsIfEmpty() {
  const existing = await getAll('products');
  if (existing.length > 0) return;
  for (const product of DEFAULT_CATALOG) {
    await put('products', product);
  }
}

// Lista todos os produtos (ativos e inativos) — usado na tela de gerenciar produtos.
export async function listProducts() {
  return getAll('products');
}

// Lista só os produtos ativos — usado no formulário de novo pedido (não mostra os desativados).
export async function listActiveProducts() {
  const all = await getAll('products');
  return all.filter(p => p.active);
}

// Cria ou atualiza um produto. `soldByWeight` decide se o produto usa preço por kg
// (ex.: gás a granel) ou preços fixos por forma de pagamento (dinheiro/pix/cartão).
export async function saveProduct(product) {
  const soldByWeight = product.soldByWeight ?? false;
  const record = {
    id: product.id ?? crypto.randomUUID(),
    name: product.name,
    brand: product.brand,
    soldByWeight,
    pricePerKg: soldByWeight ? product.pricePerKg : null,
    prices: soldByWeight ? null : { ...product.prices },
    active: product.active ?? true
  };
  await put('products', record);
  return record;
}

// Ativa/desativa um produto (produto inativo some da lista de novo pedido, mas
// continua existindo para não quebrar pedidos antigos que já usaram ele).
export async function setProductActive(id, active) {
  const product = await get('products', id);
  if (!product) return;
  product.active = active;
  await put('products', product);
}
