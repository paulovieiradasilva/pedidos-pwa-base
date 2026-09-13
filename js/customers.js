// Cadastro de clientes — usado só para o autocomplete de telefone/endereço
// no formulário de novo pedido (não é uma tela própria no app).

import { get, getAll, put } from './db.js';

// Busca um cliente já cadastrado pelo telefone (preenche endereço automaticamente).
export async function findCustomerByPhone(phone) {
  return get('customers', phone);
}

// Lista todos os clientes já cadastrados (usado nas sugestões de telefone/endereço).
export async function listCustomers() {
  return getAll('customers');
}

// Salva/atualiza o endereço de um cliente pelo telefone (chamado ao criar um pedido).
export async function saveCustomer(phone, address) {
  await put('customers', { phone, address });
}
