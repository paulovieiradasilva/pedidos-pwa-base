import { get, put } from './db.js';

export async function findCustomerByPhone(phone) {
  return get('customers', phone);
}

export async function saveCustomer(phone, address) {
  await put('customers', { phone, address });
}
