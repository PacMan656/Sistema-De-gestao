import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

test('Firebase enforces identity, sector isolation and private-data access', async t => {
  const rules = readFileSync('firestore.rules', 'utf8').replace('BOOTSTRAP_TI_UID_NOT_CONFIGURED', 'bootstrap-ti-test-uid');
  const environment = await initializeTestEnvironment({ projectId: 'demo-patriti', firestore: { rules } });
  const profile = (uid: string, id: number, departmentId: number, role = 'colaborador') => ({ id, uid, email: '', fullName: uid, matricula: 'SETOR', jobTitle: 'Acesso do setor', role, departmentId, departmentName: 'Setor', departmentCode: 'SET', departmentLocation: 'Sede', active: true, onboardingCompleted: true });
  try {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, id, department, role] of [['ti', 1, 1, 'admin_ti'], ['rh', 2, 2, 'colaborador'], ['fin', 3, 3, 'colaborador']] as const) await setDoc(doc(db, 'profiles', uid), profile(uid, id, department, role));
      for (const id of [1, 2, 3]) await setDoc(doc(db, 'departments', String(id)), { id, name: 'Setor', code: id === 1 ? 'TI' : 'SET' + id, accessConfigured: true, accessActive: true, accessUid: id === 1 ? 'ti' : 'rh' });
      await setDoc(doc(db, 'equipments', '10'), { id: 10, departmentId: 2, equipmentType: 'Desktop', parentEquipmentId: null, linkedEquipmentIds: [] });
      await setDoc(doc(db, 'equipments', '11'), { id: 11, departmentId: 3, equipmentType: 'Desktop', parentEquipmentId: null, linkedEquipmentIds: [] });
      await setDoc(doc(db, 'equipmentPrivate', '10'), { id: 10, currentHolderDocument: 'DOCUMENTO-RESTRITO' });
      await setDoc(doc(db, 'sectorLogins', 'RH'), { email: 'sector-example@patriti.invalid' });
    });
    const guest = environment.unauthenticatedContext().firestore();
    const rh = environment.authenticatedContext('rh').firestore();
    const fin = environment.authenticatedContext('fin').firestore();
    const ti = environment.authenticatedContext('ti').firestore();
    await t.test('anonymous callers cannot read inventory or profiles', async () => {
      await assertFails(getDoc(doc(guest, 'equipments', '10')));
      await assertFails(getDoc(doc(guest, 'profiles', 'ti')));
      await assertFails(getDocs(collection(guest, 'equipments')));
    });
    await t.test('only a single login identifier is public, without listing', async () => {
      const row = await assertSucceeds(getDoc(doc(guest, 'sectorLogins', 'RH')));
      assert.deepEqual(Object.keys(row.data()!), ['email']);
      await assertFails(getDocs(collection(guest, 'sectorLogins')));
    });
    await t.test('a signed-in but unapproved Firebase account has no access', async () => {
      const unknown = environment.authenticatedContext('unapproved').firestore();
      await assertFails(getDoc(doc(unknown, 'equipments', '10')));
      await assertFails(setDoc(doc(unknown, 'profiles', 'unapproved'), profile('unapproved', 9, 2, 'admin_ti')));
    });
    await t.test('sector reads are restricted both by document and query', async () => {
      await assertSucceeds(getDoc(doc(rh, 'equipments', '10')));
      await assertFails(getDoc(doc(fin, 'equipments', '10')));
      await assertFails(getDocs(collection(rh, 'equipments')));
      await assertSucceeds(getDocs(query(collection(rh, 'equipments'), where('departmentId', '==', 2))));
    });
    await t.test('personal documents stay private even to the equipment sector', async () => {
      await assertFails(getDoc(doc(rh, 'equipmentPrivate', '10')));
      await assertSucceeds(getDoc(doc(ti, 'equipmentPrivate', '10')));
    });
    await t.test('a sector cannot grant itself TI privileges or change a sector', async () => {
      await assertFails(updateDoc(doc(rh, 'profiles', 'rh'), { role: 'admin_ti' }));
      await assertFails(updateDoc(doc(rh, 'departments', '2'), { accessUid: 'rh' }));
      await assertFails(updateDoc(doc(rh, 'equipments', '10'), { departmentId: 3 }));
    });
    await t.test('admin may create peripherals only with a parent in the same sector', async () => {
      const peripheral = { id: 20, departmentId: 2, equipmentType: 'Monitor', parentEquipmentId: 10, linkedEquipmentIds: [] };
      await assertSucceeds(setDoc(doc(ti, 'equipments', '20'), peripheral));
      await assertFails(setDoc(doc(ti, 'equipments', '21'), { ...peripheral, id: 21, parentEquipmentId: 11 }));
      await assertFails(setDoc(doc(ti, 'equipments', '22'), { ...peripheral, id: 22, equipmentType: 'Notebook' }));
      await assertFails(setDoc(doc(ti, 'equipments', '23'), { ...peripheral, id: 23, currentHolderDocument: 'leak' }));
    });
    await t.test('chat cannot forge another sender or another department', async () => {
      const message = { id: 30, departmentId: 2, departmentName: 'Setor', departmentCode: 'RH', incidentId: null, senderId: 2, senderUid: 'rh', senderName: 'rh', senderRole: 'colaborador', messageType: 'CHAT', content: 'Mensagem de teste', createdAt: new Date().toISOString() };
      await assertSucceeds(setDoc(doc(rh, 'chatMessages', '30'), message));
      await assertFails(setDoc(doc(fin, 'chatMessages', '31'), { ...message, id: 31 }));
      await assertFails(setDoc(doc(rh, 'chatMessages', '32'), { ...message, id: 32, senderRole: 'admin_ti' }));
      await assertFails(setDoc(doc(rh, 'chatMessages', '33'), { ...message, id: 33, departmentId: 3 }));
      await assertFails(getDoc(doc(fin, 'chatMessages', '30')));
    });
    await t.test('resetting a sector profile blocks the old authenticated UID', async () => {
      await assertSucceeds(updateDoc(doc(ti, 'profiles', 'rh'), { active: false }));
      await assertFails(getDoc(doc(rh, 'equipments', '10')));
      await assertSucceeds(updateDoc(doc(ti, 'profiles', 'rh'), { active: true }));
    });
    await t.test('TI cannot promote a new administrator or disable itself', async () => {
      await assertFails(setDoc(doc(ti, 'profiles', 'extra-ti'), profile('extra-ti', 4, 4, 'admin_ti')));
      await assertFails(updateDoc(doc(ti, 'profiles', 'ti'), { active: false }));
    });
    await t.test('bootstrap is bound to the preselected UID, then permanently closed', async () => {
      const bootstrap = environment.authenticatedContext('bootstrap-ti-test-uid').firestore();
      const batch = writeBatch(bootstrap);
      batch.set(doc(bootstrap, 'profiles', 'bootstrap-ti-test-uid'), profile('bootstrap-ti-test-uid', 1, 1, 'admin_ti'));
      batch.set(doc(bootstrap, 'system', 'bootstrap'), { completed: true });
      await assertSucceeds(batch.commit());
      await assertFails(updateDoc(doc(bootstrap, 'system', 'bootstrap'), { completed: false }));
      await assertFails(setDoc(doc(bootstrap, 'profiles', 'another-ti'), profile('another-ti', 1, 1, 'admin_ti')));
    });
  } finally { await environment.cleanup(); }
});
