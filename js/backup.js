// Backup e restauração dos dados do app em um arquivo .json — pra trocar de
// celular, se o aparelho quebrar ou se o navegador apagar os dados.
// O arquivo é compartilhado pelo próprio celular (WhatsApp, Drive, e-mail...),
// quem escolhe onde guardar é o usuário; o app não tem servidor.

import { getAll, replaceAll, DB_VERSION, STORES } from './db.js';

const BACKUP_APP_ID = 'pedidos';
const DAY_MS = 24 * 60 * 60 * 1000;

// Erro com mensagem já pronta pra mostrar ao usuário.
export class BackupError extends Error {}

// Conta quantos registros existem em cada gaveta (usado no resumo do backup).
function countRecords(data) {
  return Object.fromEntries(Object.keys(STORES).map(name => [name, data[name].length]));
}

// Lê o banco inteiro e monta o objeto do backup.
export async function exportBackup(now = new Date()) {
  const data = {};
  for (const storeName of Object.keys(STORES)) {
    data[storeName] = await getAll(storeName);
  }
  return {
    app: BACKUP_APP_ID,
    schemaVersion: DB_VERSION,
    exportedAt: now.toISOString(),
    counts: countRecords(data),
    data
  };
}

// Nome do arquivo de backup, ex.: pedidos-backup-2026-09-20.json
export function backupFileName(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `pedidos-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Confere se o texto lido de um arquivo é mesmo um backup válido deste app.
// Lança BackupError com a explicação em português; devolve o backup se estiver ok.
export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new BackupError('Esse arquivo não é um backup válido.');
  }

  if (!backup || backup.app !== BACKUP_APP_ID || typeof backup.data !== 'object' || backup.data === null) {
    throw new BackupError('Esse arquivo não é um backup deste aplicativo.');
  }
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion > DB_VERSION) {
    throw new BackupError('Esse backup é de uma versão mais nova do aplicativo. Atualize o app e tente de novo.');
  }

  for (const [storeName, keyPath] of Object.entries(STORES)) {
    const records = backup.data[storeName];
    if (!Array.isArray(records)) {
      throw new BackupError('O backup está incompleto ou danificado.');
    }
    const valid = records.every(r => r && typeof r === 'object' && r[keyPath] != null && r[keyPath] !== '');
    if (!valid) {
      throw new BackupError('O backup está incompleto ou danificado.');
    }
  }

  return { ...backup, counts: countRecords(backup.data) };
}

// Substitui todos os dados do aparelho pelos do backup (tudo ou nada).
// A cópia via JSON tira qualquer Proxy (o Alpine embrulha os dados da tela
// em Proxy, e o IndexedDB não consegue gravar isso).
export async function restoreBackup(backup) {
  await replaceAll(JSON.parse(JSON.stringify(backup.data)));
}

// O backup está atrasado? (nunca feito ou mais de `days` dias atrás)
export function isBackupOverdue(lastBackupAt, days, now = new Date()) {
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() > days * DAY_MS;
}

// Há quantos dias foi o último backup (arredondado pra baixo); null se nunca.
export function daysSinceBackup(lastBackupAt, now = new Date()) {
  if (!lastBackupAt) return null;
  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY_MS));
}
