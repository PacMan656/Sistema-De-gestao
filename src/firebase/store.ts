import { collection, doc, getDoc, getDocs, query, where, type Firestore, type Transaction } from 'firebase/firestore';

export type Row = Record<string, any> & { id: number };
export const newId = () => Date.now() * 1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
export const stamp = () => new Date().toISOString();
export const reference = (db: Firestore, table: string, key: string | number) => doc(db, table, String(key));
export async function read(db: Firestore, table: string, id: number | string, tx?: Transaction): Promise<Row | null> {
  const snapshot = tx ? await tx.get(reference(db, table, id)) : await getDoc(reference(db, table, id));
  return snapshot.exists() ? snapshot.data() as Row : null;
}
export async function list(db: Firestore, table: string, departmentId?: number): Promise<Row[]> {
  const source = collection(db, table);
  const snapshot = await getDocs(departmentId === undefined ? source : query(source, where('departmentId', '==', departmentId)));
  return snapshot.docs.map((document) => document.data() as Row);
}
export function requireRow(row: Row | null, message = 'Registro não encontrado.'): Row {
  if (!row) throw new Error(message);
  return row;
}
export function ownDepartment(profile: Row, requested?: number) {
  return profile.role === 'admin_ti' ? requested : profile.departmentId;
}
export function requireAdmin(profile: Row) { if (profile.role !== 'admin_ti') throw new Error('Operação restrita ao TI.'); }
export function scope(profile: Row, row: Row) {
  if (profile.role !== 'admin_ti' && row.departmentId !== profile.departmentId) throw new Error('Acesso restrito ao seu setor.');
  return row;
}
