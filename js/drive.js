// Backup no Google Drive do próprio cliente (sem servidor nosso).
// Login pelo Google Identity Services e escopo "drive.file": o app só enxerga
// os arquivos que ele mesmo criou, e o escopo não exige verificação do Google.
// As funções de API recebem o token e o `fetch`, pra poder testar sem rede.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_PREFIX = 'pedidos-backup';

// Quantos backups ficam no Drive (os mais antigos são apagados).
export const MAX_DRIVE_BACKUPS = 10;

// Erro com mensagem pronta pra mostrar ao usuário.
export class DriveError extends Error {}

function friendlyError(status) {
  if (status === 401 || status === 403) return new DriveError('O Google não autorizou. Tente entrar de novo.');
  if (status === 429) return new DriveError('O Google está ocupado. Tente de novo em instantes.');
  return new DriveError('Não foi possível falar com o Google Drive. Tente de novo.');
}

async function driveFetch(fetchFn, url, options) {
  let response;
  try {
    response = await fetchFn(url, options);
  } catch {
    throw new DriveError('Sem internet. Use E-mail ou Arquivo.');
  }
  if (!response.ok) throw friendlyError(response.status);
  return response;
}

const authHeader = token => ({ Authorization: `Bearer ${token}` });

// Envia o backup como um arquivo novo no Drive e apaga os mais antigos
// além do limite. Devolve { id, name }.
export async function uploadBackup(token, backup, fileName, fetchFn = fetch) {
  const boundary = 'pedidos-' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(backup) +
    `\r\n--${boundary}--`;

  const response = await driveFetch(fetchFn, `${UPLOAD_API}?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  const created = await response.json();

  try {
    await pruneOldBackups(token, fetchFn);
  } catch {
    // limpeza é só conforto: se falhar, o backup novo já está salvo.
  }
  return created;
}

// Lista os backups do app no Drive, do mais novo pro mais antigo.
export async function listBackups(token, fetchFn = fetch, pageSize = MAX_DRIVE_BACKUPS) {
  const params = new URLSearchParams({
    q: `name contains '${FILE_PREFIX}' and trashed=false`,
    orderBy: 'createdTime desc',
    pageSize: String(pageSize),
    fields: 'files(id,name,createdTime,size)'
  });
  const response = await driveFetch(fetchFn, `${API}?${params}`, { headers: authHeader(token) });
  return (await response.json()).files ?? [];
}

// Baixa o conteúdo (texto JSON) de um backup do Drive.
export async function downloadBackup(token, fileId, fetchFn = fetch) {
  const response = await driveFetch(fetchFn, `${API}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: authHeader(token)
  });
  return response.text();
}

// Apaga os backups além do limite (mantém os MAX_DRIVE_BACKUPS mais recentes).
export async function pruneOldBackups(token, fetchFn = fetch) {
  const all = await listBackups(token, fetchFn, 100);
  for (const file of all.slice(MAX_DRIVE_BACKUPS)) {
    await driveFetch(fetchFn, `${API}/${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
      headers: authHeader(token)
    });
  }
}

// ===== Login (só no navegador; não testado em Node) =====

let gisPromise = null;

// Carrega o script do Google só quando precisa (o app continua funcionando offline).
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new DriveError('Sem internet. Use E-mail ou Arquivo.'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

let cachedToken = null;

// Pede a permissão ao usuário (janela do Google) e devolve o token de acesso.
// Precisa ser chamada logo após um toque do usuário. Reaproveita o token
// enquanto não expira (dura ~1 hora).
export async function requestDriveToken(clientId) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          reject(new DriveError('Não foi possível entrar no Google. Tente de novo.'));
          return;
        }
        cachedToken = {
          value: response.access_token,
          expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000
        };
        resolve(cachedToken.value);
      },
      error_callback: () => reject(new DriveError('Login cancelado.'))
    });
    client.requestAccessToken();
  });
}
