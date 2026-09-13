// Camada de acesso ao IndexedDB (o "banco de dados" do app, dentro do navegador/celular).
// Guarda 4 "gavetas" (stores): clientes, produtos, pedidos e o histórico de auditoria.
// Todas as outras partes do sistema leem/gravam dados só através das funções daqui.

const DB_NAME = 'pedidos-db';
const DB_VERSION = 2;
const STORES = {
  customers: 'phone',
  products: 'id',
  orders: 'id',
  auditLog: 'id'
};

let dbPromise = null;

// Abre a conexão com o banco (criando as gavetas na primeira vez que o app roda).
// Reaproveita a mesma conexão em chamadas seguintes (só abre uma vez).
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

// Cria ou atualiza um registro em uma gaveta (ex.: salvar um pedido).
export async function put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Busca um único registro pela sua chave (ex.: um pedido pelo id).
export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Busca todos os registros de uma gaveta (ex.: todos os produtos cadastrados).
export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Apaga um registro pela sua chave.
export async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Apaga o banco de dados inteiro (usado pelo menu "Limpar dados", modo desenvolvedor).
// Fecha a conexão aberta antes de apagar, senão o navegador bloqueia a exclusão.
export async function deleteDatabase() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
