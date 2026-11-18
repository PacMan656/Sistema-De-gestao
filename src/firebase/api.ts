import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, EmailAuthProvider, getAuth, inMemoryPersistence, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { deleteDoc, getDoc, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { firebaseClient } from './client.ts';
import { list, newId, ownDepartment, read, reference, requireAdmin, requireRow, scope, stamp, type Row } from './store.ts';
import { checkinMovementSchema, checkoutMovementSchema, createDepartmentSchema, createIncidentSchema, departmentSchema, equipmentFormSchema, loginSchema, passwordSchema, INCIDENT_STATUSES } from '../shared/validation.ts';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const privateFields = ['currentHolderName', 'currentHolderDocument', 'currentHolderRole', 'notes', 'networkAddress', 'portNumber'] as const;
const isComputer = (type: string) => type === 'Desktop' || type === 'Notebook';
const tiEmail = 'patriti-ti@patriti.invalid';
const publicUser = (profile: Row) => ({ ...profile, sectorAccount: true, onboardingCompleted: true });

export async function currentProfile() {
  const { auth, db } = await firebaseClient();
  if (!auth.currentUser) throw new Error('UNAUTHENTICATED');
  const profile = await read(db, 'profiles', auth.currentUser.uid);
  if (!profile?.active) { await signOut(auth); throw new Error('UNAUTHENTICATED'); }
  return profile;
}
async function session() {
  const { auth } = await firebaseClient();
  const profile = await currentProfile();
  return json({ user: publicUser(profile), rbacToken: await auth.currentUser!.getIdToken() });
}
async function bootstrapTi() {
  const { auth, db } = await firebaseClient();
  const account = auth.currentUser!;
  // Rules accept this transaction only for the UID chosen by the operator at
  // deployment. Signing up an arbitrary account never grants a role or data.
  const profile = { id: 1, uid: account.uid, email: '', fullName: 'Tecnologia da Informação', matricula: 'TI', jobTitle: 'Administração de TI', role: 'admin_ti', departmentId: 1, departmentName: 'Tecnologia da Informação', departmentCode: 'TI', departmentLocation: 'Sede', active: true, onboardingCompleted: true };
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(reference(db, 'profiles', account.uid));
    if (existing.exists()) return;
    tx.set(reference(db, 'departments', 1), { id: 1, name: profile.departmentName, code: 'TI', location: 'Sede', costCenter: '', accessUid: account.uid, accessActive: true, accessConfigured: true });
    tx.set(reference(db, 'profiles', account.uid), profile);
    tx.set(reference(db, 'sectorLogins', 'TI'), { email: tiEmail });
    tx.set(reference(db, 'system', 'bootstrap'), { completed: true });
  });
}
async function provisionSector(input: any, previous?: Row, password?: string) {
  const { auth, db } = await firebaseClient();
  requireAdmin(await currentProfile());
  const data = departmentSchema.parse(input);
  const id = previous?.id ?? newId();
  if (id === 1 && data.code !== 'TI') throw new Error('O código do setor TI não pode ser alterado.');
  if (!password) {
    await runTransaction(db, async tx => {
      const login = await tx.get(reference(db, 'sectorLogins', data.code));
      if (data.code !== previous?.code && login.exists()) throw new Error('Código de setor já cadastrado.');
      const oldLogin = previous && await tx.get(reference(db, 'sectorLogins', previous.code));
      tx.update(reference(db, 'departments', id), data);
      if (previous?.code !== data.code && oldLogin?.exists()) {
        tx.set(reference(db, 'sectorLogins', data.code), oldLogin.data());
        tx.delete(reference(db, 'sectorLogins', previous!.code));
      }
      if (previous?.accessUid) tx.update(reference(db, 'profiles', previous.accessUid), { fullName: data.name, departmentName: data.name, departmentCode: data.code, departmentLocation: data.location });
    });
    return { ...previous, ...data, id };
  }
  passwordSchema.parse(password);
  const secondary = initializeApp(auth.app.options, `provision-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondary);
  let created: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | undefined;
  try {
    await setPersistence(secondaryAuth, inMemoryPersistence);
    const email = `sector-${crypto.randomUUID()}@patriti.invalid`;
    created = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = created.user.uid;
    await runTransaction(db, async tx => {
      const login = await tx.get(reference(db, 'sectorLogins', data.code));
      const current = await read(db, 'departments', id, tx);
      if (login.exists() && (!current || current.code !== data.code)) throw new Error('Código de setor já cadastrado.');
      if (current?.accessUid) tx.update(reference(db, 'profiles', current.accessUid), { active: false });
      if (current?.code && current.code !== data.code) tx.delete(reference(db, 'sectorLogins', current.code));
      tx.set(reference(db, 'departments', id), { ...data, id, accessUid: uid, accessActive: true, accessConfigured: true });
      tx.set(reference(db, 'profiles', uid), { id, uid, email: '', fullName: data.name, matricula: data.code, jobTitle: 'Acesso do setor', role: 'colaborador', departmentId: id, departmentName: data.name, departmentCode: data.code, departmentLocation: data.location, active: true, onboardingCompleted: true });
      tx.set(reference(db, 'sectorLogins', data.code), { email });
    });
    return { ...data, id, accessConfigured: true, accessActive: true };
  } catch (error) {
    // An incomplete provisioning never leaves an authorized orphan account.
    if (created) await created.user.delete().catch(() => {});
    throw error;
  } finally { await signOut(secondaryAuth); await deleteApp(secondary); }
}
async function departmentRows(profile: Row) {
  const { db } = await firebaseClient();
  const rows = profile.role === 'admin_ti' ? await list(db, 'departments') : [requireRow(await read(db, 'departments', profile.departmentId))];
  const assets = await list(db, 'equipments', ownDepartment(profile));
  return rows.map(row => ({ ...row, equipmentCount: assets.filter(asset => asset.departmentId === row.id).length }));
}
async function equipmentRows(profile: Row, query = new URLSearchParams()) {
  const { db } = await firebaseClient();
  const rows = await list(db, 'equipments', ownDepartment(profile, Number(query.get('departmentId')) || undefined));
  const departments = await departmentRowsWithoutCount(profile);
  return rows.map((row): Row => ({ ...row, departmentName: departments.find(d => d.id === row.departmentId)?.name ?? '', departmentCode: departments.find(d => d.id === row.departmentId)?.code ?? '' }))
    .filter(row => ['status', 'equipmentType', 'ownershipType'].every(key => !query.get(key) || row[key === 'status' ? 'operationalStatus' : key] === query.get(key)))
    .filter(row => !query.get('search') || [row.assetTag, row.serialNumber, row.brand, row.model].some(value => String(value).toLowerCase().includes(query.get('search')!.toLowerCase())));
}
async function departmentRowsWithoutCount(profile: Row) {
  const { db } = await firebaseClient();
  return profile.role === 'admin_ti' ? list(db, 'departments') : [requireRow(await read(db, 'departments', profile.departmentId))];
}
async function saveEquipment(body: unknown, profile: Row, id = newId(), updating = false) {
  requireAdmin(profile);
  const input = equipmentFormSchema.parse(body);
  const { db } = await firebaseClient();
  const all = await list(db, 'equipments');
  const previous = updating ? requireRow(all.find(row => row.id === id) ?? null) : null;
  const parentId = input.parentEquipmentId === undefined ? previous?.parentEquipmentId ?? null : input.parentEquipmentId;
  const links = [...new Set(input.linkedEquipmentIds ?? previous?.linkedEquipmentIds ?? [])] as number[];
  const ids = [...new Set([id, parentId, previous?.parentEquipmentId, ...links, ...(previous?.linkedEquipmentIds ?? [])].filter(Boolean))] as number[];
  await runTransaction(db, async tx => {
    const department = requireRow(await read(db, 'departments', input.departmentId, tx));
    if (!department.accessConfigured) throw new Error('Configure o acesso do setor antes de vincular ativos.');
    const related = new Map<number, Row>();
    for (const key of ids) { const row = await read(db, 'equipments', key, tx); if (row) related.set(key, row); }
    const current = related.get(id);
    if (updating && !current) throw new Error('Equipamento não encontrado.');
    if (updating && JSON.stringify(current?.linkedEquipmentIds ?? []) !== JSON.stringify(previous?.linkedEquipmentIds ?? [])) throw new Error('O vínculo foi alterado por outro acesso. Atualize a tela.');
    if (parentId) {
      const parent = related.get(parentId);
      if (!parent || !isComputer(parent.equipmentType) || isComputer(input.equipmentType) || parentId === id || parent.departmentId !== input.departmentId) throw new Error('Vincule a um desktop ou notebook do mesmo setor.');
    }
    if (links.length && !isComputer(input.equipmentType)) throw new Error('Somente computadores recebem periféricos vinculados.');
    for (const childId of links) {
      const child = related.get(childId);
      if (!child || childId === id || isComputer(child.equipmentType) || child.departmentId !== input.departmentId || (child.parentEquipmentId && child.parentEquipmentId !== id)) throw new Error('Selecione periféricos livres do mesmo setor.');
    }
    const assetKey = `asset-${encodeURIComponent(input.assetTag.toUpperCase())}`;
    const serialKey = `serial-${encodeURIComponent(input.serialNumber.toUpperCase())}`;
    for (const key of [assetKey, serialKey]) { const existing = await read(db, 'assetKeys', key, tx); if (existing && existing.id !== id) throw new Error('Patrimônio ou número de série já cadastrado.'); }
    const { linkedEquipmentIds: _links, ...fields } = input;
    const record: Row = { ...current, ...fields, id, parentEquipmentId: parentId, linkedEquipmentIds: links, assetTag: input.assetTag.toUpperCase(), serialNumber: input.serialNumber.toUpperCase(), createdAt: current?.createdAt ?? stamp(), updatedAt: stamp(), createdById: current?.createdById ?? profile.id };
    const confidential: Row = { id };
    for (const key of privateFields) { if (key in record) confidential[key] = record[key] ?? null; delete record[key]; }
    for (const field of ['currentHolderName', 'currentHolderDocument', 'currentHolderRole']) if (!(field in confidential) && !current) confidential[field] = null;
    const changes = new Map<number, Partial<Row>>();
    const change = (key: number, values: Partial<Row>) => changes.set(key, { ...changes.get(key), ...values, updatedAt: stamp() });
    for (const childId of current?.linkedEquipmentIds ?? []) if (!links.includes(childId)) change(childId, { parentEquipmentId: null });
    for (const childId of links) change(childId, { parentEquipmentId: id });
    if (current?.parentEquipmentId && current.parentEquipmentId !== parentId) {
      const old = related.get(current.parentEquipmentId)!;
      change(old.id, { linkedEquipmentIds: old.linkedEquipmentIds.filter((key: number) => key !== id) });
    }
    if (parentId) { const parent = related.get(parentId)!; change(parentId, { linkedEquipmentIds: [...new Set([...(parent.linkedEquipmentIds ?? []), id])] }); }
    if (current?.assetTag && current.assetTag !== record.assetTag) tx.delete(reference(db, 'assetKeys', `asset-${encodeURIComponent(current.assetTag)}`));
    if (current?.serialNumber && current.serialNumber !== record.serialNumber) tx.delete(reference(db, 'assetKeys', `serial-${encodeURIComponent(current.serialNumber)}`));
    tx.set(reference(db, 'assetKeys', assetKey), { id }); tx.set(reference(db, 'assetKeys', serialKey), { id });
    tx.set(reference(db, 'equipments', id), record);
    tx.set(reference(db, 'equipmentPrivate', id), confidential, { merge: true });
    for (const [key, values] of changes) tx.update(reference(db, 'equipments', key), values);
  });
  return read(db, 'equipments', id);
}
async function equipmentDetail(id: number, profile: Row) {
  const { db } = await firebaseClient();
  const equipment = scope(profile, requireRow(await read(db, 'equipments', id)));
  const department = requireRow(await read(db, 'departments', equipment.departmentId));
  Object.assign(equipment, { departmentName: department.name, departmentCode: department.code, departmentLocation: department.location });
  const assets = await list(db, 'equipments', ownDepartment(profile));
  if (profile.role === 'admin_ti') Object.assign(equipment, await read(db, 'equipmentPrivate', id));
  const movements = profile.role === 'admin_ti' ? (await list(db, 'movements')).filter(row => row.equipmentId === id) : [];
  const inspections = profile.role === 'admin_ti' ? (await list(db, 'inspections')).filter(row => row.equipmentId === id) : [];
  return { equipment, movements, inspections, linkedEquipments: assets.filter(row => row.parentEquipmentId === id), parentEquipment: assets.find(row => row.id === equipment.parentEquipmentId) ?? null };
}
async function moveEquipment(body: unknown, profile: Row, checkout: boolean) {
  requireAdmin(profile);
  const input = (checkout ? checkoutMovementSchema : checkinMovementSchema).parse(body);
  const { db } = await firebaseClient();
  const id = newId();
  return runTransaction(db, async tx => {
    const equipment = requireRow(await read(db, 'equipments', input.equipmentId, tx));
    const department = requireRow(await read(db, 'departments', input.toDepartmentId, tx));
    if (!department.accessConfigured) throw new Error('Configure o acesso do setor de destino.');
    if (equipment.departmentId !== input.toDepartmentId && (equipment.parentEquipmentId || equipment.linkedEquipmentIds?.length)) throw new Error('Desvincule os periféricos antes de transferir para outro setor.');
    if (checkout && equipment.operationalStatus !== 'Disponível') throw new Error('Equipamento indisponível para saída.');
    const movement = { ...input, id, departmentId: input.toDepartmentId, movementType: checkout ? 'SAIDA' : 'ENTRADA', previousStatus: equipment.operationalStatus, newStatus: checkout ? 'Em Uso' : (input as any).targetStatus, fromDepartmentId: equipment.departmentId, collaboratorDepartment: department.name, performedById: profile.id, performedByName: profile.fullName, termNumber: checkout ? `TRM-${id}` : null, occurredAt: stamp(), assetTag: equipment.assetTag, equipmentBrand: equipment.brand, equipmentModel: equipment.model };
    const updated = { ...equipment, departmentId: department.id, operationalStatus: movement.newStatus, updatedAt: stamp() };
    if (!checkout) Object.assign(updated, { lastInspectionDate: stamp().slice(0, 10), nextInspectionDate: (input as any).nextInspectionDate || null });
    tx.set(reference(db, 'movements', id), movement);
    tx.update(reference(db, 'equipments', equipment.id), updated);
    tx.set(reference(db, 'equipmentPrivate', equipment.id), { id: equipment.id, currentHolderName: checkout ? input.collaboratorName : null, currentHolderDocument: checkout ? input.collaboratorDocument : null, currentHolderRole: checkout ? input.collaboratorRole : null }, { merge: true });
    if (!checkout) tx.set(reference(db, 'inspections', id), { id, equipmentId: equipment.id, movementId: id, inspectorId: profile.id, inspectorName: profile.fullName, inspectionDate: stamp().slice(0, 10), nextInspectionDate: (input as any).nextInspectionDate || null, physicalCondition: input.conditionState, checklistJson: (input as any).checklist, approvedForUse: (input as any).targetStatus === 'Disponível', findings: input.notes || null, createdAt: stamp() });
    return { movement, equipment: updated };
  });
}
export async function firebaseFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    const { auth, db } = await firebaseClient();
    const parsed = new URL(url, location.origin); const route = parsed.pathname.replace(/^\/api/, '');
    const method = (options.method || 'GET').toUpperCase(); const query = parsed.searchParams;
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    if (route === '/auth/setup') return json({ required: false });
    if (route === '/auth/login' && method === 'POST') {
      const input = loginSchema.parse(body);
      const directory = await getDoc(reference(db, 'sectorLogins', input.sector));
      await signInWithEmailAndPassword(auth, directory.data()?.email || (input.sector === 'TI' ? tiEmail : 'unregistered@patriti.invalid'), input.password);
      if (!await read(db, 'profiles', auth.currentUser!.uid)) await bootstrapTi();
      return session();
    }
    if (route === '/auth/logout') { await signOut(auth); return json({ ok: true }); }
    if (route === '/auth/session' || route === '/auth/me') return session();
    const profile = await currentProfile();
    if (route === '/auth/password' && method === 'POST') {
      requireAdmin(profile); passwordSchema.parse(body.password);
      await reauthenticateWithCredential(auth.currentUser!, EmailAuthProvider.credential(auth.currentUser!.email!, body.currentPassword));
      await updatePassword(auth.currentUser!, body.password); return session();
    }
    if (route === '/departments') {
      if (method === 'GET') return json(await departmentRows(profile));
      if (method === 'POST') { const input = createDepartmentSchema.parse(body); return json(await provisionSector(input, undefined, input.password), 201); }
    }
    const deptMatch = route.match(/^\/departments\/(\d+)(\/access)?$/);
    if (deptMatch) {
      requireAdmin(profile); const row = requireRow(await read(db, 'departments', Number(deptMatch[1])));
      if (deptMatch[2]) {
        if (row.id === profile.departmentId) throw new Error('Use a opção de alterar senha do TI.');
        if (method === 'PUT') return json(await provisionSector(row, row, passwordSchema.parse(body.password)));
        if (method === 'PATCH' && typeof body.active === 'boolean') {
          const batch = writeBatch(db); batch.update(reference(db, 'departments', row.id), { accessActive: body.active }); batch.update(reference(db, 'profiles', row.accessUid), { active: body.active }); await batch.commit(); return json({ ok: true });
        }
      } else if (method === 'PUT') return json(await provisionSector(body, row));
    }
    if (route === '/equipments' || route === '/incidents/sector-assets') {
      if (method === 'GET') return json(await equipmentRows(profile, query));
      if (method === 'POST' && route === '/equipments') return json(await saveEquipment(body, profile), 201);
    }
    if (route === '/equipments/export') {
      requireAdmin(profile); const rows = await equipmentRows(profile, query);
      if (query.get('format') === 'pdf') return pdf(await (await import('../shared/pdf.ts')).buildInventoryReportPdf(rows as any, 'Inventário por setor'));
      const columns = ['assetTag', 'serialNumber', 'equipmentType', 'brand', 'model', 'departmentCode', 'operationalStatus'];
      const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&")}"`;
      return new Response('\uFEFF' + [columns.map(cell).join(';'), ...rows.map(row => columns.map(column => cell(row[column])).join(';'))].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    if (route.startsWith('/equipments/by-barcode/')) {
      const code = decodeURIComponent(route.split('/').pop()!).toUpperCase();
      return json(requireRow((await equipmentRows(profile)).find(row => row.assetTag === code || row.serialNumber === code) ?? null));
    }
    const assetMatch = route.match(/^\/equipments\/(\d+)(?:\/([a-z-]+))?$/);
    if (assetMatch) {
      const id = Number(assetMatch[1]); const action = assetMatch[2];
      const detail = await equipmentDetail(id, profile);
      if (!action && method === 'GET') return json(detail);
      requireAdmin(profile);
      if (!action && method === 'PUT') return json(await saveEquipment(body, profile, id, true));
      if (action === 'incidents') return json((await list(db, 'incidents')).filter(row => row.equipmentId === id));
      if (action === 'remote-sessions') return json([]);
      if (action === 'barcode-label-pdf') return pdf(await (await import('../shared/pdf.ts')).buildBarcodeLabelPdf(detail.equipment as any));
      if (action === 'test-page-pdf') return pdf(await (await import('../shared/pdf.ts')).buildPrinterTestPagePdf(detail.equipment as any, profile.fullName));
      if (action === 'print-test-page') return json({ rawSent: false, message: 'Use o PDF para imprimir pelo navegador. O Firebase não acessa a rede interna da empresa.', sessions: [] });
      if (action === 'remote-diagnose') return json({ error: 'O diagnóstico da rede interna está disponível na versão de servidor local.' }, 501);
    }
    if (route === '/movements') { requireAdmin(profile); return json((await list(db, 'movements')).sort((a, b) => b.id - a.id)); }
    if (route === '/movements/checkout' && method === 'POST') return json(await moveEquipment(body, profile, true), 201);
    if (route === '/movements/checkin' && method === 'POST') return json(await moveEquipment(body, profile, false), 201);
    const term = route.match(/^\/movements\/(\d+)\/term-pdf$/);
    if (term) { requireAdmin(profile); const movement = requireRow(await read(db, 'movements', Number(term[1]))); const detail = await equipmentDetail(movement.equipmentId, profile); return pdf(await (await import('../shared/pdf.ts')).buildResponsibilityTermPdf({ movement: { ...movement, occurredAt: new Date(movement.occurredAt) }, equipment: detail.equipment } as any)); }
    if (route === '/incidents' && method === 'GET') return json((await list(db, 'incidents', ownDepartment(profile, Number(query.get('departmentId')) || undefined))).sort((a, b) => b.id - a.id));
    if (route === '/incidents' && method === 'POST') {
      const input = createIncidentSchema.parse(body); const departmentId = ownDepartment(profile, input.departmentId) || profile.departmentId;
      if (input.equipmentId) { const equipment = requireRow(await read(db, 'equipments', input.equipmentId)); if (equipment.departmentId !== departmentId) throw new Error('Selecione um equipamento do setor do chamado.'); }
      const department = requireRow(await read(db, 'departments', departmentId)); const equipment = input.equipmentId ? await read(db, 'equipments', input.equipmentId) : null;
      const id = newId(); const record = { ...input, id, ticketCode: `INC-${id}`, departmentId, departmentName: department.name, departmentCode: department.code, departmentLocation: department.location, requesterId: profile.id, requesterUid: auth.currentUser!.uid, requesterName: profile.fullName, requesterEmail: '', assignedTechnicianId: null, equipmentId: input.equipmentId ?? null, equipmentAssetTag: equipment?.assetTag ?? null, equipmentModel: equipment?.model ?? null, status: 'Aberto', createdAt: stamp(), updatedAt: stamp(), resolvedAt: null };
      await setDoc(reference(db, 'incidents', id), record); return json(record, 201);
    }
    const incidentMatch = route.match(/^\/incidents\/(\d+)\/status$/);
    if (incidentMatch && method === 'PATCH') {
      requireAdmin(profile); if (!INCIDENT_STATUSES.includes(body.status)) throw new Error('Status inválido.');
      const id = Number(incidentMatch[1]); const record = requireRow(await read(db, 'incidents', id));
      Object.assign(record, { status: body.status, assignedTechnicianId: profile.id, updatedAt: stamp(), resolvedAt: body.status === 'Resolvido' ? stamp() : null });
      await setDoc(reference(db, 'incidents', id), record); return json(record);
    }
    const chatMatch = route.match(/^\/chat\/(\d+)$/);
    if (chatMatch) {
      const departmentId = Number(chatMatch[1]); scope(profile, { id: departmentId, departmentId });
      if (method === 'GET') return json((await list(db, 'chatMessages', departmentId)).sort((a, b) => a.id - b.id).slice(-80));
      if (method === 'POST') {
        if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 4000) throw new Error('Informe uma mensagem de até 4000 caracteres.');
        const department = requireRow(await read(db, 'departments', departmentId)); const id = newId();
        const message = { id, departmentId, departmentName: department.name, departmentCode: department.code, incidentId: null, senderId: profile.id, senderUid: auth.currentUser!.uid, senderName: profile.fullName, senderRole: profile.role, messageType: 'CHAT', content: body.content.trim(), createdAt: stamp() };
        await setDoc(reference(db, 'chatMessages', id), message); return json(message, 201);
      }
    }
    return json({ error: 'Operação não encontrada.' }, 404);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : '';
    if (message === 'UNAUTHENTICATED') return json({ error: 'Sessão não autenticada.' }, 401);
    if (code === 'permission-denied' || code === 'firestore/permission-denied') return json({ error: 'Acesso negado pelas regras do Firebase. Consulte o TI para validar seu acesso.' }, 403);
    if (code?.startsWith('auth/')) return json({ error: code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde e tente novamente.' : 'Setor ou senha inválidos, ou acesso não configurado pelo TI.' }, 401);
    const issues = (error as { issues?: { message: string }[] }).issues;
    return json({ error: issues?.[0]?.message || (code ? 'Falha na conexão com o Firebase. Tente novamente.' : message) || 'Não foi possível concluir a operação.' }, 400);
  }
}
const pdf = (bytes: Uint8Array) => new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
