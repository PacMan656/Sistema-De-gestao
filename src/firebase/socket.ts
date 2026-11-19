import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import type { Socket } from 'socket.io-client';
import type { AppUser } from '../types/domain.ts';
import { firebaseClient } from './client.ts';
import { firebaseFetch } from './api.ts';

export function createFirebaseSocket(user: AppUser): Socket {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const subscriptions: Unsubscribe[] = [];
  let chat: Unsubscribe | undefined;
  let closed = false;
  const fire = (name: string, data?: unknown) => handlers.get(name)?.forEach(handler => handler(data));
  const connectChat = async (departmentId: number) => {
    if (user.role !== 'admin_ti' && departmentId !== user.departmentId) return;
    const { db } = await firebaseClient(); if (closed) return;
    chat?.(); let first = true;
    chat = onSnapshot(query(collection(db, 'chatMessages'), where('departmentId', '==', departmentId)), snapshot => {
      if (!first) for (const change of snapshot.docChanges()) if (change.type === 'added') fire('chat:message', change.doc.data());
      first = false;
    }, () => fire('disconnect'));
  };
  void firebaseClient().then(({ db }) => {
    if (closed) return;
    const source = collection(db, 'incidents'); let first = true;
    subscriptions.push(onSnapshot(user.role === 'admin_ti' ? source : query(source, where('departmentId', '==', user.departmentId)), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) { fire('disconnect'); return; }
      fire('connect');
      if (snapshot.metadata.hasPendingWrites) return;
      if (!first) for (const change of snapshot.docChanges()) {
        if (change.type === 'added') fire('incident:notify_ti', change.doc.data());
        if (change.type === 'modified') fire('incident:status_update', change.doc.data());
      }
      first = false;
    }, () => fire('disconnect')));
    // Firestore has no authoritative online-user presence in this edition.
    fire('presence:update', []);
    if (user.departmentId) void connectChat(user.departmentId);
  }).catch(() => fire('disconnect'));
  return {
    on(name: string, callback: (...args: any[]) => void) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(callback); return this; },
    disconnect() { closed = true; chat?.(); subscriptions.forEach(unsubscribe => unsubscribe()); fire('disconnect'); handlers.clear(); },
    emit(name: string, payload: any, ack?: (value: unknown) => void) {
      if (name === 'room:join') { void connectChat(payload.departmentId); return this; }
      if (closed) { ack?.({ ok: false, error: 'Sessão encerrada.' }); return this; }
      const url = name === 'chat:message' ? `/api/chat/${payload.departmentId}` : name === 'incident:create' ? '/api/incidents' : `/api/incidents/${payload.incidentId}/status`;
      void firebaseFetch(url, { method: name === 'incident:status_update' ? 'PATCH' : 'POST', body: JSON.stringify(payload) }).then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        ack?.(name === 'chat:message' ? { ok: true } : { ok: true, incident: result });
      }).catch(error => ack?.({ ok: false, error: error.message }));
      return this;
    },
  } as unknown as Socket;
}
