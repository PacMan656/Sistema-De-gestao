import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { io } from 'socket.io-client';
import { fileURLToPath } from 'node:url';

process.env.PATRITI_TEST_MEMORY = 'true';
process.env.PATRITI_DATA_DIR = fileURLToPath(new URL('../.test-data/sectors', import.meta.url));
process.env.SETUP_TOKEN = 'integration-test-setup';
process.env.JWT_SECRET = 'integration-tests-only-secret-at-least-32-chars';
delete process.env.SQL_HOST;
const { apiRouter } = await import('../src/server/routes.ts');
const { closeDatabase } = await import('../src/db/index.ts');
const { attachSocketServer } = await import('../src/server/socket.ts');
let sockets: ReturnType<typeof attachSocketServer>;
let base: string;
before(async () => {
  const app = express(); app.use(express.json()); app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1'); sockets = attachSocketServer(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
after(async () => { await new Promise<void>((resolve) => sockets.close(() => resolve())); await closeDatabase(); });
async function request(path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { response, data: await response.json() };
}
const adminPassword = 'Senha-segura-admin-123';
const sectorPassword = 'Senha-inicial-setor-123';
function asset(tag: string, departmentId: number, equipmentType = 'Monitor') {
  return { assetTag: tag, serialNumber: `SN-${tag}`, equipmentType, brand: 'Fabricante', model: 'Modelo', departmentId, responsibleCompany: 'Empresa', ownershipType: 'Próprio', operationalStatus: 'Disponível', manufactureYear: 2026, connectionInterface: 'N/A', connectionStatus: 'Não Verificado' };
}

test('TI provisions sectors; sector passwords authenticate and inventory is isolated', async () => {
  assert.equal((await request('/auth/setup')).data.required, true);
  assert.equal((await request('/auth/setup', 'POST', { password: adminPassword, setupToken: 'wrong' })).response.status, 403);
  const setup = await request('/auth/setup', 'POST', { password: adminPassword, setupToken: process.env.SETUP_TOKEN });
  assert.equal(setup.response.status, 200, JSON.stringify(setup.data));
  let adminToken = setup.data.rbacToken;
  assert.equal(setup.data.user.departmentCode, 'TI'); assert.equal(setup.data.user.role, 'admin_ti');
  const cookie = setup.response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
  assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: cookie.split(';')[0] } })).status, 200);
  assert.equal((await request('/auth/setup')).data.required, false);
  assert.equal((await request('/auth/login', 'POST', { email: 'ti@example.test', password: adminPassword })).response.status, 400);
  assert.equal((await request('/auth/login', 'POST', { sector: 'TI', password: adminPassword })).response.status, 200);
  assert.equal((await request('/auth/login', 'POST', { sector: 'RH', password: sectorPassword })).response.status, 401);
  assert.equal((await request('/departments/2/access', 'PUT', { password: 'short' }, adminToken)).response.status, 400);
  assert.equal((await request('/departments/2/access', 'PUT', { password: sectorPassword }, adminToken)).response.status, 200);
  const sector = { name: 'Operações', code: 'OPS', location: 'Sede', password: sectorPassword, role: 'admin_ti' };
  assert.equal((await request('/departments', 'POST', sector)).response.status, 401);
  const ops = await request('/departments', 'POST', sector, adminToken);
  assert.equal(ops.response.status, 201, JSON.stringify(ops.data));
  assert.equal((await request('/departments', 'POST', { ...sector, code: 'ops' }, adminToken)).response.status, 400);
  const login = await request('/auth/login', 'POST', { sector: ' rh ', password: sectorPassword });
  assert.equal(login.response.status, 200);
  let token = login.data.rbacToken;
  assert.equal(login.data.user.departmentId, 2); assert.equal(login.data.user.role, 'colaborador');
  assert.equal((await request('/departments', 'POST', sector, token)).response.status, 403);
  assert.equal((await request('/departments/2/access', 'PUT', { password: sectorPassword }, token)).response.status, 403);
  assert.equal((await request('/auth/password', 'POST', { currentPassword: sectorPassword, password: 'Nova-senha-setor-123' }, token)).response.status, 403);
  assert.equal((await request('/departments', 'GET', undefined, token)).data.length, 1);
  assert.equal((await request('/incidents', 'GET', undefined, token)).response.status, 200);
  const opsLogin = await request('/auth/login', 'POST', { sector: 'OPS', password: sectorPassword });
  assert.equal(opsLogin.data.user.role, 'colaborador');

  const create = async (data: object) => {
    const result = await request('/equipments', 'POST', data, adminToken);
    assert.equal(result.response.status, 201, JSON.stringify(result.data)); return result.data;
  };
  assert.equal((await request('/equipments', 'POST', asset('UNCONFIGURED', 3), adminToken)).response.status, 400);
  assert.equal((await request('/equipments', 'POST', asset('FORBIDDEN', 2), token)).response.status, 403);
  const monitor = await create(asset('MON-001', 2));
  const keyboard = await create(asset('KEY-001', 2, 'Periférico'));
  const desktopData = { ...asset('PC-001', 2, 'Desktop'), linkedEquipmentIds: [monitor.id, keyboard.id] };
  const desktop = await create(desktopData);
  const notebook = await create(asset('NB-001', 2, 'Notebook'));
  const foreign = await create(asset('OPS-001', ops.data.id));
  const mine = await request(`/equipments?departmentId=${ops.data.id}`, 'GET', undefined, token);
  assert.equal(mine.data.length, 4); assert.ok(mine.data.every((item: any) => item.departmentId === 2));
  assert.equal((await request(`/equipments/${foreign.id}`, 'GET', undefined, token)).response.status, 404);
  assert.equal((await request('/equipments/by-barcode/OPS-001', 'GET', undefined, token)).response.status, 404);
  const details = await request(`/equipments/${desktop.id}`, 'GET', undefined, token);
  assert.equal(details.data.linkedEquipments.length, 2);
  assert.deepEqual(details.data.movements, []);
  assert.equal((await request(`/equipments/${monitor.id}`, 'GET', undefined, token)).data.parentEquipment.id, desktop.id);
  assert.equal((await request('/equipments', 'POST', { ...asset('CROSS-001', ops.data.id), parentEquipmentId: desktop.id }, adminToken)).response.status, 400);
  assert.equal((await request('/equipments', 'POST', { ...asset('BAD-PARENT', 2), parentEquipmentId: monitor.id }, adminToken)).response.status, 400);
  assert.equal((await request(`/equipments/${notebook.id}`, 'PUT', { ...asset('NB-001', 2, 'Notebook'), linkedEquipmentIds: [monitor.id] }, adminToken)).response.status, 400);
  assert.equal((await request(`/equipments/${desktop.id}`, 'PUT', { ...desktopData, departmentId: ops.data.id }, adminToken)).response.status, 400);
  const movement = { equipmentId: desktop.id, toDepartmentId: ops.data.id, collaboratorName: 'Responsável', collaboratorDocument: 'MAT-001', collaboratorRole: 'Analista', reason: 'Transferência de setor', conditionState: 'Bom' };
  assert.equal((await request('/movements/checkout', 'POST', movement, adminToken)).response.status, 400);
  const afterMove = await request(`/equipments/${desktop.id}`, 'GET', undefined, adminToken);
  assert.equal(afterMove.data.equipment.departmentId, 2); assert.equal(afterMove.data.movements.length, 0);
  const directory = await request('/departments', 'GET', undefined, adminToken);
  assert.equal(directory.data.find((row: any) => row.id === 2).equipmentCount, 4);
  assert.equal(JSON.stringify(directory.data).includes('passwordHash'), false);
  // Detaching a peripheral explicitly allows a subsequent transfer to another sector.
  assert.equal((await request(`/equipments/${monitor.id}`, 'PUT', { ...asset('MON-001', 2), parentEquipmentId: null }, adminToken)).response.status, 200);
  assert.equal((await request(`/equipments/${monitor.id}`, 'PUT', { ...asset('MON-001', ops.data.id), parentEquipmentId: null }, adminToken)).response.status, 200);

  const socket = io(base.replace('/api', ''), { auth: { token }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
  assert.equal((await request('/departments/2/access', 'PUT', { password: 'Senha-redefinida-123' }, adminToken)).response.status, 200);
  await disconnected;
  assert.equal((await request('/auth/me', 'GET', undefined, token)).response.status, 401);
  assert.equal((await request('/auth/login', 'POST', { sector: 'RH', password: sectorPassword })).response.status, 401);
  token = (await request('/auth/login', 'POST', { sector: 'RH', password: 'Senha-redefinida-123' })).data.rbacToken;
  assert.equal((await request('/departments/2/access', 'PATCH', { active: false }, adminToken)).response.status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, token)).response.status, 401);
  assert.equal((await request('/auth/login', 'POST', { sector: 'RH', password: 'Senha-redefinida-123' })).response.status, 401);
  await request('/departments/2/access', 'PATCH', { active: true }, adminToken);
  assert.equal((await request('/auth/me', 'GET', undefined, token)).response.status, 401);
  assert.equal((await request('/departments/1/access', 'PATCH', { active: false }, adminToken)).response.status, 400);
  const changed = await request('/auth/password', 'POST', { currentPassword: adminPassword, password: 'Nova-senha-TI-12345' }, adminToken);
  assert.equal(changed.response.status, 200); adminToken = changed.data.rbacToken;
  assert.equal((await request('/auth/logout', 'POST', undefined, adminToken)).response.status, 200);
  assert.equal((await request('/auth/me', 'GET', undefined, adminToken)).response.status, 401);
});

test('sector login rejects cross-site requests and repeated incorrect passwords', async () => {
  const crossSite = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: 'https://untrusted.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ sector: 'TI', password: adminPassword }) });
  assert.equal(crossSite.status, 403);
  let status = 0;
  for (let i = 0; i < 21; i++) status = (await request('/auth/login', 'POST', { sector: 'MISSING', password: 'invalid-password' })).response.status;
  assert.equal(status, 429);
});
