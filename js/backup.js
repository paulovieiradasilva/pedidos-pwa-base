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

// ===== Backup em texto (pra mandar por e-mail/WhatsApp e colar na restauração) =====

const TEXT_PREFIX_GZIP = 'PEDIDOS1:';
const TEXT_PREFIX_RAW = 'PEDIDOS1raw:';
// Acima disso o WhatsApp pode cortar a mensagem (limite ~65 mil caracteres).
export const BACKUP_TEXT_SOFT_LIMIT = 60000;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Transforma o backup num texto único (gzip + base64, em linhas curtas — e-mail
// e WhatsApp quebram linhas muito longas). Sem gzip no navegador, vai sem compressão.
export async function encodeBackupText(backup) {
  const raw = new TextEncoder().encode(JSON.stringify(backup));
  let prefix = TEXT_PREFIX_RAW;
  let bytes = raw;
  if (typeof CompressionStream === 'function') {
    bytes = await pipeBytes(raw, new CompressionStream('gzip'));
    prefix = TEXT_PREFIX_GZIP;
  }
  const lines = bytesToBase64(bytes).match(/.{1,76}/g) ?? [];
  return [prefix + (lines[0] ?? ''), ...lines.slice(1)].join('\n');
}

// Faz o caminho inverso: acha o backup no meio do texto colado (ignora
// assinatura do e-mail, aspas, ">" de resposta, quebras de linha) e devolve o JSON.
export async function decodeBackupText(text) {
  const incomplete = new BackupError('Texto do backup incompleto. Copie tudo, do início ao fim.');
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.replace(/^[\s>"'“”]+|[\s"'“”]+$/g, ''));

  const start = lines.findIndex(line => line.includes('PEDIDOS1'));
  if (start === -1) throw new BackupError('Esse texto não é um backup deste aplicativo.');

  const first = lines[start];
  const isRaw = first.includes(TEXT_PREFIX_RAW);
  const marker = isRaw ? TEXT_PREFIX_RAW : TEXT_PREFIX_GZIP;
  if (!first.includes(marker)) throw new BackupError('Esse texto não é um backup deste aplicativo.');

  let base64 = first.slice(first.indexOf(marker) + marker.length).match(/^[A-Za-z0-9+/=]*/)[0];
  for (const line of lines.slice(start + 1)) {
    if (!/^[A-Za-z0-9+/=]+$/.test(line)) break;
    base64 += line;
  }
  if (!base64) throw incomplete;

  try {
    let bytes = base64ToBytes(base64);
    if (!isRaw) bytes = await pipeBytes(bytes, new DecompressionStream('gzip'));
    return new TextDecoder().decode(bytes);
  } catch {
    throw incomplete;
  }
}

// Texto colado -> backup validado (ou BackupError).
export async function parseBackupText(text) {
  return parseBackup(await decodeBackupText(text));
}
