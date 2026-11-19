import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseClient } from './firebaseClient.fixture.ts';
import { firebaseFetch } from '../src/firebase/api.ts';

Object.defineProperty(globalThis, 'location', { value: { origin: 'http://localhost' }, configurable: true });
test('Firebase edition: first TI, sectors, workstation links, movements, chat and password reset', async () => {
  const { auth } = await firebaseClient();
  const password = randomBytes(24).toString('hex');
  const first = await createUserWithEmailAndPassword(auth, 'patriti-ti@patriti.invalid', password);
  const environment = await initializeTestEnvironment({ projectId: 'demo-patriti', firestore: { rules: readFileSync('firestore.rules', 'utf8').replace('BOOTSTRAP_TI_UID_NOT_CONFIGURED', first.user.uid) } });
  const call = (route: string, method = 'GET', body?: unknown) => firebaseFetch('/api' + route, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = async (route: string, method = 'GET', body?: unknown) => { const response = await call(route, method, body); const data = await response.json(); assert.ok(response.ok, `${route}: ${data.error || response.status}`); return data; };
  try {
    await signOut(auth);
    for (const route of ['/auth/session', '/auth/me']) {
      const unauthenticated = await call(route);
      assert.equal(unauthenticated.status, 401);
      assert.match(unauthenticated.headers.get('Content-Type') || '', /application\/json/);
      assert.deepEqual(await unauthenticated.json(), { error: 'Sessão não autenticada.' });
    }
    const ti = await result('/auth/login', 'POST', { sector: 'TI', password });
    assert.equal(ti.user.role, 'admin_ti');
    const rh = await result('/departments', 'POST', { name: 'Recursos Humanos', code: 'RH', location: 'Sede', password });
    const fin = await result('/departments', 'POST', { name: 'Financeiro', code: 'FIN', location: 'Sede', password });
    const fields = { brand: 'Teste', model: 'Modelo', departmentId: rh.id, responsibleCompany: 'Empresa', ownershipType: 'Próprio', operationalStatus: 'Disponível', manufactureYear: 2026, connectionInterface: 'N/A', connectionStatus: 'Não Verificado', parentEquipmentId: null, linkedEquipmentIds: [], notes: 'Restrito ao TI' };
    const computer = await result('/equipments', 'POST', { ...fields, assetTag: 'PC-001', serialNumber: 'SER-PC-001', equipmentType: 'Desktop' });
    const monitor = await result('/equipments', 'POST', { ...fields, assetTag: 'MON-001', serialNumber: 'SER-MON-001', equipmentType: 'Monitor', parentEquipmentId: computer.id });
    let detail = await result(`/equipments/${computer.id}`);
    assert.equal(detail.linkedEquipments[0].id, monitor.id);
    assert.deepEqual(detail.equipment.linkedEquipmentIds, [monitor.id]);
    const invalid = await call('/equipments', 'POST', { ...fields, departmentId: fin.id, assetTag: 'BAD-001', serialNumber: 'BAD-SER', equipmentType: 'Monitor', parentEquipmentId: computer.id });
    assert.equal(invalid.status, 400);
    await result('/auth/logout', 'POST');
    assert.equal((await call('/auth/session')).status, 401);
    await result('/auth/login', 'POST', { sector: 'RH', password });
    assert.equal((await result('/equipments')).length, 2);
    detail = await result(`/equipments/${computer.id}`);
    assert.equal(detail.equipment.notes, undefined);
    assert.equal(detail.equipment.currentHolderDocument, undefined);
    const incident = await result('/incidents', 'POST', { title: 'Computador sem imagem', description: 'O monitor não apresenta imagem.', priority: 'Média', equipmentId: computer.id });
    assert.equal(incident.departmentId, rh.id);
    await result(`/chat/${rh.id}`, 'POST', { content: 'Solicito atendimento do TI.' });
    assert.equal((await call(`/chat/${fin.id}`)).status, 400);
    await result('/auth/logout', 'POST');
    await result('/auth/login', 'POST', { sector: 'TI', password });
    await result(`/incidents/${incident.id}/status`, 'PATCH', { status: 'Resolvido' });
    const movement = await result('/movements/checkout', 'POST', { equipmentId: computer.id, toDepartmentId: rh.id, collaboratorName: 'Responsável de Teste', collaboratorDocument: 'MAT-001', collaboratorRole: 'Analista', reason: 'Uso no setor', conditionState: 'Bom' });
    const pdf = await call(`/movements/${movement.movement.id}/term-pdf`);
    assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const nextPassword = randomBytes(24).toString('hex');
    await result(`/departments/${rh.id}/access`, 'PUT', { password: nextPassword });
    await result('/auth/logout', 'POST');
    assert.equal((await call('/auth/login', 'POST', { sector: 'RH', password })).status, 401);
    await result('/auth/login', 'POST', { sector: 'RH', password: nextPassword });
    assert.equal((await result('/equipments')).length, 2);
    console.log('Firebase API smoke passed: real Auth and Firestore emulators, credentials never logged.');
  } finally { await signOut(auth); await environment.cleanup(); }
});
