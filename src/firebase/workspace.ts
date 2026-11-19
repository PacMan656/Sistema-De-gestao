import { collection, doc, onSnapshot, query, where, type Firestore, type Unsubscribe, type QuerySnapshot } from 'firebase/firestore';
import type { AppUser, Department, EquipmentItem, IncidentItem, MovementRecord } from '../types/domain.ts';

export interface SharedWorkspaceSnapshot {
  equipments: EquipmentItem[];
  departments: Department[];
  movements: MovementRecord[];
  incidents: IncidentItem[];
}
interface WorkspaceHandlers {
  data: (snapshot: SharedWorkspaceSnapshot) => void;
  connection: (connected: boolean) => void;
  profile: (user: AppUser) => void;
  revoked: () => void;
  error: (scope: string) => void;
}
// Every listener is authenticated by the Firebase SDK and checked by Firestore
// rules. Sector queries are scoped on the server, never just filtered in the UI.
export function watchSharedWorkspace(db: Firestore, user: AppUser, handlers: WorkspaceHandlers) {
  const subscriptions: Unsubscribe[] = [];
  let closed = false;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const connected = new Map<string, boolean>();
  const rows = new Map<string, Record<string, any>[]>();
  const stop = () => { closed = true; clearTimeout(scheduled); subscriptions.forEach(unsubscribe => unsubscribe()); rows.clear(); };
  const revoke = () => { if (!closed) { stop(); handlers.connection(false); handlers.revoked(); } };
  if (user.role !== 'admin_ti') rows.set('movements', []);
  const emit = () => {
    if (closed || !['equipments', 'departments', 'movements', 'incidents'].every(name => rows.has(name))) return;
    clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      if (closed) return;
      const departments = (rows.get('departments') || []).map(row => ({ ...row, equipmentCount: rows.get('equipments')!.filter(equipment => equipment.departmentId === row.id).length })) as Department[];
      const equipments = rows.get('equipments')!.map(row => {
        const department = departments.find(item => item.id === row.departmentId);
        return { currentHolderName: null, currentHolderDocument: null, currentHolderRole: null, notes: null, networkAddress: null, portNumber: null, ...row, departmentName: department?.name || '', departmentCode: department?.code || '', departmentLocation: department?.location || '' } as EquipmentItem;
      });
      handlers.data({ equipments, departments, movements: [...rows.get('movements')!].sort((a, b) => b.id - a.id) as MovementRecord[], incidents: [...rows.get('incidents')!].sort((a, b) => b.id - a.id) as IncidentItem[] });
    }, 30);
  };
  const status = (name: string, unconfirmed: boolean) => {
    connected.set(name, !unconfirmed);
    handlers.connection(connected.size === (user.role === 'admin_ti' ? 5 : 4) && [...connected.values()].every(Boolean));
  };
  const failed = (scope: string) => (error: { code: string }) => {
    if (closed) return;
    connected.set(scope, false);
    handlers.connection(false);
    // Access can be revoked before the profile listener delivers its update.
    // Discard the session immediately when the server denies a subscribed scope.
    if (error.code === 'permission-denied' || error.code === 'unauthenticated') revoke();
    else handlers.error(scope);
  };
  const watch = (name: string) => {
    const source = collection(db, name);
    const target = user.role === 'admin_ti' || name === 'movements' ? source : query(source, where('departmentId', '==', user.departmentId));
    subscriptions.push(onSnapshot(target, { includeMetadataChanges: true }, (snapshot: QuerySnapshot) => {
      if (closed) return;
      status(name, snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
      // Only publish server-confirmed data. Pending offline writes must not be
      // presented as saved or synchronized with another computer.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      rows.set(name, snapshot.docs.map(item => item.data())); emit();
    }, failed(name)));
  };
  watch('equipments'); watch('incidents');
  if (user.role === 'admin_ti') { watch('movements'); watch('departments'); }
  else subscriptions.push(onSnapshot(doc(db, 'departments', String(user.departmentId)), { includeMetadataChanges: true }, snapshot => {
    if (closed) return;
    status('departments', snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    rows.set('departments', snapshot.exists() ? [snapshot.data()] : []); emit();
  }, failed('departments')));
  subscriptions.push(onSnapshot(doc(db, 'profiles', user.uid), { includeMetadataChanges: true }, snapshot => {
    if (closed) return;
    status('profile', snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites);
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    if (!snapshot.exists() || snapshot.data().active !== true) { revoke(); return; }
    handlers.profile(snapshot.data() as AppUser);
  }, failed('profile')));
  return stop;
}
