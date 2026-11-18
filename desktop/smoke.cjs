const { app, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.PATRITI_SMOKE_ROOT || 'desktop/staging');
const directory = path.resolve('.test-data', 'desktop-smoke-' + crypto.randomUUID());
fs.mkdirSync(directory, { recursive: true });
const launch = () => new Promise((resolve, reject) => {
  const child = utilityProcess.fork(path.join(root, 'server.mjs'), [], { env: { ...process.env, NODE_ENV: 'production', PATRITI_DESKTOP: '1', PATRITI_ROOT_DIR: root, PATRITI_DATA_DIR: directory, HOST: '127.0.0.1', PORT: '0', SQL_HOST: '', JWT_SECRET: '', SETUP_TOKEN: '', APP_URL: '' }, stdio: 'pipe' });
  let errors = '';
  child.stderr.on('data', data => { errors += data.toString(); });
  child.once('message', message => resolve({ child, ...message }));
  child.once('exit', code => reject(new Error(`Backend exited ${code}: ${errors.replace(/(?:token|password|secret)[^\n]*/gi, '[redacted]')}`)));
});
const stop = child => new Promise(resolve => { child.once('exit', resolve); child.postMessage('shutdown'); });
app.whenReady().then(async () => {
  let server;
  try {
    server = await launch();
    const base = `http://127.0.0.1:${server.port}`;
    const password = crypto.randomBytes(24).toString('hex');
    let response = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupToken: server.setupToken, password }) });
    const session = await response.json(); assert.equal(response.status, 200, JSON.stringify(session));
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.rbacToken}` };
    assert.equal((await fetch(base + '/api/equipments?token=' + encodeURIComponent(session.rbacToken))).status, 401);
    response = await fetch(base + '/api/departments', { method: 'POST', headers, body: JSON.stringify({ name: 'Setor de Teste', code: 'TESTE', location: 'Teste', costCenter: '', password }) });
    const department = await response.json(); assert.equal(response.status, 201, JSON.stringify(department));
    response = await fetch(base + '/api/equipments', { method: 'POST', headers, body: JSON.stringify({ assetTag: 'SMOKE-001', serialNumber: 'SMOKE-SERIAL', equipmentType: 'Desktop', brand: 'Teste', model: 'Teste', departmentId: department.id, responsibleCompany: 'Teste', ownershipType: 'Próprio', operationalStatus: 'Disponível', manufactureYear: 2026, connectionInterface: 'N/A', connectionStatus: 'Não Verificado' }) });
    const equipment = await response.json(); assert.equal(response.status, 201, JSON.stringify(equipment));
    response = await fetch(base + `/api/equipments/${equipment.id}/barcode-label-pdf`, { headers });
    assert.equal(response.status, 200); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    await stop(server.child); server = await launch();
    response = await fetch(`http://127.0.0.1:${server.port}/api/equipments`, { headers });
    assert.equal(response.status, 200); assert.ok((await response.json()).some(row => row.assetTag === 'SMOKE-001'));
    await stop(server.child); server = null;
    console.log('Desktop smoke passed: setup, sector, inventory, PDF and persistence after restart.'); app.exit(0);
  } catch (error) { server?.child.kill(); console.error(error.message); app.exit(1); }
});
setTimeout(() => { console.error('Desktop smoke timed out.'); app.exit(1); }, 90000).unref();
