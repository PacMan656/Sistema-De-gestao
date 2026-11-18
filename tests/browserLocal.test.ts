import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from '../src/browser/passwordService.ts';

process.env.PATRITI_TEST_MEMORY = 'true';
process.env.PATRITI_DATA_DIR = fileURLToPath(new URL('../.test-data/browser-local', import.meta.url));
delete process.env.SQL_HOST;
const { createLocalApi } = await import('../src/browser/api.ts');
const { closeDatabase } = await import('../src/db/index.ts');
after(closeDatabase);
const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
const api = createLocalApi(storage);
async function request(path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await api('/api' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, data: await response.json() };
}

test('browser passwords use salted PBKDF2 and validate without Node crypto', async () => {
  const first = await hashPassword('Senha-local-segura-123');
  const second = await hashPassword('Senha-local-segura-123');
  assert.notEqual(first, second); assert.ok(first.startsWith('pbkdf2:'));
  assert.equal(await verifyPassword('Senha-local-segura-123', first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword('wrong', 'invalid-hash'), false);
});

test('local adapter provisions sectors, equipment, PDFs and atomic backup restore', async () => {
  const setup = await request('/auth/setup', 'POST', { password: 'Senha-local-do-TI-123' });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  let token = setup.data.rbacToken;
  assert.equal((await request('/auth/setup')).data.required, false);
  assert.equal((await request('/auth/setup', 'POST', { password: 'Senha-local-do-TI-123' })).status, 400);
  assert.equal((await request('/auth/session')).status, 200);
  assert.equal((await request('/departments/2/access', 'PUT', { password: 'Senha-local-do-RH-123' }, token)).status, 200);
  const asset = { assetTag: 'LOCAL-MON', serialNumber: 'SN-LOCAL', equipmentType: 'Monitor', brand: 'Fabricante', model: 'Modelo', departmentId: 2, responsibleCompany: 'Empresa', ownershipType: 'Próprio', operationalStatus: 'Disponível', manufactureYear: 2026, connectionInterface: 'N/A', connectionStatus: 'Não Verificado' };
  const monitor = await request('/equipments', 'POST', asset, token);
  assert.equal(monitor.status, 201, JSON.stringify(monitor.data));
  const computer = await request('/equipments', 'POST', { ...asset, assetTag: 'LOCAL-PC', serialNumber: 'SN-PC', equipmentType: 'Desktop', linkedEquipmentIds: [monitor.data.id] }, token);
  assert.equal(computer.status, 201);
  const pdf = await api(`/api/equipments/${monitor.data.id}/barcode-label-pdf`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('Content-Type'), 'application/pdf');
  assert.equal((await pdf.text()).slice(0, 5), '%PDF-');
  const backup = (await request('/local/backup', 'GET', undefined, token)).data;
  assert.equal(backup.format, 'patriti-browser-backup');
  assert.equal((await request('/departments', 'POST', { name: 'Novo setor', code: 'NOVO', location: 'Local', password: 'Senha-local-setor-123' }, token)).status, 201);
  const invalid = structuredClone(backup); invalid.data.equipments[0].departmentId = 99999;
  assert.equal((await request('/local/backup', 'POST', invalid, token)).status, 400);
  assert.equal((await request('/equipments', 'GET', undefined, token)).data.length, 2);
  assert.equal((await request('/local/backup', 'POST', backup, token)).status, 200);
  assert.equal((await request('/auth/session')).status, 401);
  token = (await request('/auth/login', 'POST', { sector: 'TI', password: 'Senha-local-do-TI-123' })).data.rbacToken;
  assert.equal((await request('/departments', 'GET', undefined, token)).data.length, 4);
  assert.equal((await request(`/equipments/${computer.data.id}`, 'GET', undefined, token)).data.linkedEquipments.length, 1);
  const sectorToken = (await request('/auth/login', 'POST', { sector: 'RH', password: 'Senha-local-do-RH-123' })).data.rbacToken;
  assert.equal((await request('/local/backup', 'GET', undefined, sectorToken)).status, 403);
  assert.equal((await request('/equipments', 'GET', undefined, sectorToken)).data.length, 2);
  assert.equal((await request('/equipments', 'POST', asset, sectorToken)).status, 403);
});
