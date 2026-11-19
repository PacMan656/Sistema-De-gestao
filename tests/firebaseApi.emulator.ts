import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { deleteApp, initializeApp } from 'firebase/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDoc, getDocFromServer, getFirestore, terminate } from 'firebase/firestore';
import { firebaseClient } from './firebaseClient.fixture.ts';
import { firebaseFetch } from '../src/firebase/api.ts';
import { watchSharedWorkspace, type SharedWorkspaceSnapshot } from '../src/firebase/workspace.ts';
import type { AppUser } from '../src/types/domain.ts';

Object.defineProperty(globalThis, 'location', { value: { origin: 'http://localhost' }, configurable: true });
test('Firebase edition: first TI, sectors, workstation links, movements, chat and password reset', async () => {
  const { auth } = await firebaseClient();
  const password = randomBytes(24).toString('hex');
  const first = await createUserWithEmailAndPassword(auth, 'patriti-ti@patriti.invalid', password);
  const environment = await initializeTestEnvironment({ projectId: 'demo-patriti', firestore: { rules: readFileSync('firestore.rules', 'utf8').replace('BOOTSTRAP_TI_UID_NOT_CONFIGURED', first.user.uid) } });
  const call = (route: string, method = 'GET', body?: unknown) => firebaseFetch('/api' + route, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = async (route: string, method = 'GET', body?: unknown) => { const response = await call(route, method, body); const data = await response.json(); assert.ok(response.ok, `${route}: ${data.error || response.status}`); return data; };
  const remoteApp = initializeApp(auth.app.options, 'second-computer');
  const remoteAuth = getAuth(remoteApp); const remoteDb = getFirestore(remoteApp);
  connectAuthEmulator(remoteAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  connectFirestoreEmulator(remoteDb, host, Number(port));
  const updates = new EventEmitter();
  let remoteData: SharedWorkspaceSnapshot | null = null;
  let stopRemote = () => {};
  let remoteRevoked = false;
  let remoteConnected = false;
  const remoteErrors: string[] = [];
  const waitForRemote = async (stage: string, predicate: (data: SharedWorkspaceSnapshot) => boolean) => {
    const signal = AbortSignal.timeout(10000);
    try { while (!remoteData || !predicate(remoteData)) await once(updates, 'data', { signal }); }
    catch { throw new Error(`Shared sync timed out at ${stage}; streams: ${remoteErrors.join(',')}; inventory: ${remoteData?.equipments.length ?? 'not-ready'}`); }
    return remoteData;
  };
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
    const directory = await getDoc(doc(remoteDb, 'sectorLogins', 'RH'));
    await signInWithEmailAndPassword(remoteAuth, directory.data()!.email, password);
    const remoteProfile = await getDoc(doc(remoteDb, 'profiles', remoteAuth.currentUser!.uid));
    stopRemote = watchSharedWorkspace(remoteDb, remoteProfile.data() as AppUser, {
      data: data => { remoteData = data; updates.emit('data'); },
      connection: connected => { remoteConnected = connected; updates.emit('connection'); }, profile: () => {}, error: scope => { remoteErrors.push(scope); },
      revoked: () => { remoteRevoked = true; updates.emit('revoked'); },
    });
    await waitForRemote('initial inventory', data => data.equipments.length === 0);
    while (!remoteConnected) await once(updates, 'connection', { signal: AbortSignal.timeout(10000) });
    await disableNetwork(remoteDb);
    while (remoteConnected) await once(updates, 'connection', { signal: AbortSignal.timeout(10000) });
    const fields = { brand: 'Teste', model: 'Modelo', departmentId: rh.id, responsibleCompany: 'Empresa', ownershipType: 'Próprio', operationalStatus: 'Disponível', manufactureYear: 2026, connectionInterface: 'N/A', connectionStatus: 'Não Verificado', parentEquipmentId: null, linkedEquipmentIds: [], notes: 'Restrito ao TI' };
    const computer = await result('/equipments', 'POST', { ...fields, assetTag: 'PC-001', serialNumber: 'SER-PC-001', equipmentType: 'Desktop' });
    const monitor = await result('/equipments', 'POST', { ...fields, assetTag: 'MON-001', serialNumber: 'SER-MON-001', equipmentType: 'Monitor', parentEquipmentId: computer.id });
    assert.equal(remoteData!.equipments.length, 0, 'An offline computer must not claim to receive remote saves');
    await enableNetwork(remoteDb);
    const shared = await waitForRemote('new computer and peripheral', data => data.equipments.length === 2 && data.equipments.find(row => row.id === monitor.id)?.parentEquipmentId === computer.id);
    while (!remoteConnected) await once(updates, 'connection', { signal: AbortSignal.timeout(10000) });
    assert.deepEqual(shared.departments.map(row => row.id), [rh.id]);
    assert.equal(shared.departments[0].equipmentCount, 2);
    assert.equal(shared.movements.length, 0);
    let detail = await result(`/equipments/${computer.id}`);
    assert.equal(detail.linkedEquipments[0].id, monitor.id);
    assert.deepEqual(detail.equipment.linkedEquipmentIds, [monitor.id]);
    const invalid = await call('/equipments', 'POST', { ...fields, departmentId: fin.id, assetTag: 'BAD-001', serialNumber: 'BAD-SER', equipmentType: 'Monitor', parentEquipmentId: computer.id });
    assert.equal(invalid.status, 400);
    await result('/auth/logout', 'POST');
    assert.ok(remoteAuth.currentUser, 'Logging out on one computer must not log out another');
    assert.equal((await getDoc(doc(remoteDb, 'equipments', String(computer.id)))).exists(), true);
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
    const moved = await waitForRemote('equipment checkout', data => data.equipments.find(row => row.id === computer.id)?.operationalStatus === 'Em Uso');
    assert.equal(moved.equipments.find(row => row.id === computer.id)!.currentHolderDocument, null);
    assert.equal(moved.movements.length, 0, 'A sector must not receive private movement records');
    const pdf = await call(`/movements/${movement.movement.id}/term-pdf`);
    assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const nextPassword = randomBytes(24).toString('hex');
    await result(`/departments/${rh.id}/access`, 'PUT', { password: nextPassword });
    if (!remoteRevoked) await once(updates, 'revoked', { signal: AbortSignal.timeout(10000) });
    assert.equal(remoteRevoked, true, 'Password reset must revoke old sessions on other computers');
    await assert.rejects(getDocFromServer(doc(remoteDb, 'equipments', String(computer.id))), { code: 'permission-denied' });
    await result('/auth/logout', 'POST');
    assert.equal((await call('/auth/login', 'POST', { sector: 'RH', password })).status, 401);
    await result('/auth/login', 'POST', { sector: 'RH', password: nextPassword });
    assert.equal((await result('/equipments')).length, 2);
    console.log('Firebase API smoke passed: real Auth and Firestore emulators, credentials never logged.');
  } finally { stopRemote(); await signOut(remoteAuth); await terminate(remoteDb); await deleteApp(remoteApp); await signOut(auth); await environment.cleanup(); }
});
