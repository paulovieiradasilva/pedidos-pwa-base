import { describe, it, expect } from 'vitest';
import { uploadBackup, listBackups, downloadBackup, pruneOldBackups, MAX_DRIVE_BACKUPS, DriveError } from '../js/drive.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeFiles(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'f' + i, name: 'pedidos-backup-' + i + '.json', createdTime: '2026-09-' + String(20 - i).padStart(2, '0') }));
}

describe('drive', () => {
  it('uploads a multipart backup with the bearer token', async () => {
    const calls = [];
    const fetchFn = async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === 'POST') return jsonResponse({ id: 'novo', name: 'pedidos-backup-2026-09-20.json' });
      return jsonResponse({ files: [] });
    };
    const created = await uploadBackup('TOKEN', { app: 'pedidos', data: {} }, 'pedidos-backup-2026-09-20.json', fetchFn);

    expect(created.id).toBe('novo');
    const post = calls.find(c => c.options.method === 'POST');
    expect(post.url).toContain('uploadType=multipart');
    expect(post.options.headers.Authorization).toBe('Bearer TOKEN');
    expect(post.options.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(post.options.body).toContain('"name":"pedidos-backup-2026-09-20.json"');
    expect(post.options.body).toContain('"app":"pedidos"');
  });

  it('lists backups newest first, asking only for this app\'s files', async () => {
    let requested;
    const fetchFn = async url => { requested = new URL(url); return jsonResponse({ files: fakeFiles(3) }); };
    const files = await listBackups('T', fetchFn);

    expect(files).toHaveLength(3);
    expect(requested.searchParams.get('orderBy')).toBe('createdTime desc');
    expect(requested.searchParams.get('q')).toContain("name contains 'pedidos-backup'");
    expect(requested.searchParams.get('q')).toContain('trashed=false');
  });

  it('downloads the backup content as text', async () => {
    let requested;
    const fetchFn = async url => { requested = url; return new Response('{"app":"pedidos"}'); };
    expect(await downloadBackup('T', 'abc', fetchFn)).toBe('{"app":"pedidos"}');
    expect(requested).toContain('/files/abc?alt=media');
  });

  it('deletes backups beyond the limit and keeps the newest ones', async () => {
    const deleted = [];
    const fetchFn = async (url, options = {}) => {
      if (options.method === 'DELETE') { deleted.push(url.split('/').pop()); return new Response(null, { status: 204 }); }
      return jsonResponse({ files: fakeFiles(MAX_DRIVE_BACKUPS + 2) });
    };
    await pruneOldBackups('T', fetchFn);
    expect(deleted).toEqual(['f10', 'f11']);
  });

  it('still succeeds when cleanup of old backups fails', async () => {
    const fetchFn = async (url, options = {}) => {
      if (options.method === 'POST') return jsonResponse({ id: 'novo' });
      return jsonResponse({}, 500);
    };
    await expect(uploadBackup('T', {}, 'x.json', fetchFn)).resolves.toEqual({ id: 'novo' });
  });

  it('turns HTTP and network failures into messages in Portuguese', async () => {
    await expect(listBackups('T', async () => jsonResponse({}, 401))).rejects.toThrow(/não autorizou/);
    await expect(listBackups('T', async () => jsonResponse({}, 500))).rejects.toThrow(/Google Drive/);
    await expect(listBackups('T', async () => { throw new TypeError('fetch failed'); })).rejects.toThrow(/Sem internet/);
    await expect(listBackups('T', async () => jsonResponse({}, 429))).rejects.toBeInstanceOf(DriveError);
  });
});
