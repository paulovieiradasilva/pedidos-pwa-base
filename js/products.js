// Catálogo de produtos (água, gás etc.) — CRUD usado pela aba "Produtos".

import { getAll, get, put } from './db.js';

// Catálogo inicial, usado só na primeira vez que o app abre (banco vazio).
// Baseado na tabela de um fornecedor: dinheiro = Pix ("à vista ou Pix"), cartão
// é um pouco mais caro. O volume "20L" da água não vem na tabela (é o padrão do
// catálogo antigo) e o carvão vem sem unidade (saco): se for outro, edite o nome
// na aba Produtos. A cortesia do gás (ganha uma água) não entra: o app exige
// preço maior que zero.
function catalogItem(id, name, brand, cash, card) {
  return { id, name, brand, prices: { dinheiro: cash, pix: cash, cartao: card }, active: true };
}

export const DEFAULT_CATALOG = [
  catalogItem('agua-barata', 'Água 20L', 'Mais barata', 7, 8),
  catalogItem('agua-barata-completa', 'Água 20L completa (com galão)', 'Mais barata', 30, 33),
  catalogItem('agua-cristalina', 'Água 20L', 'Cristalina', 9, 9.5),
  catalogItem('agua-santa-joana', 'Água 20L', 'Santa Joana', 12, 12.5),
  catalogItem('agua-indaia', 'Água 20L', 'Indaiá', 18, 18.5),
  catalogItem('gelo-3kg', 'Gelo 3kg cubo', '', 9, 9.5),
  catalogItem('gelo-10kg', 'Gelo 10kg escama', '', 14, 14.5),
  catalogItem('carvao', 'Carvão', '', 9, 9.5),
  catalogItem('gas-p13', 'Gás P13', '', 115, 120)
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
