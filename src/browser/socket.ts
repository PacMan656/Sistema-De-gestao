import type { Socket } from 'socket.io-client';
import type { AppUser } from '../types/domain.ts';

// Same-browser events replace the network socket in the explicitly local edition.
export function createLocalSocket(token: string, user: AppUser): Socket {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  let closed = false;
  let target: EventTarget | undefined;
  const wrappers = new Map<string, EventListener>();
  const fire = (name: string, data?: unknown) => handlers.get(name)?.forEach((handler) => handler(data));
  const ready = import('./runtime.ts').then((runtime) => {
    if (closed) return runtime;
    target = runtime.localEvents;
    for (const name of ['chat:message', 'incident:notify_ti', 'incident:status_update']) {
      const listener: EventListener = (event) => {
        const data = (event as CustomEvent).detail;
        if (user.role === 'admin_ti' || data?.departmentId === user.departmentId) fire(name, data);
      };
      wrappers.set(name, listener); target.addEventListener(name, listener);
    }
    fire('connect'); fire('presence:update', [{ id: user.id, fullName: user.departmentName || user.fullName, role: user.role, departmentCode: user.departmentCode }]);
    return runtime;
  });
  return {
    on(name: string, callback: (...args: any[]) => void) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name)!.add(callback); return this; },
    disconnect() { closed = true; for (const [name, listener] of wrappers) target?.removeEventListener(name, listener); fire('disconnect'); handlers.clear(); },
    emit(name: string, payload: any, ack?: (result: unknown) => void) {
      if (name === 'room:join') return this;
      void ready.then(async ({ localFetch }) => {
        if (closed) throw new Error('Sessão local encerrada.');
        const url = name === 'chat:message' ? `/api/chat/${payload.departmentId}` : name === 'incident:create' ? '/api/incidents' : `/api/incidents/${payload.incidentId}/status`;
        const response = await localFetch(url, { method: name === 'incident:status_update' ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        ack?.(name === 'chat:message' ? { ok: true, message: result } : { ok: true, incident: result });
      }).catch((error) => ack?.({ ok: false, error: error instanceof Error ? error.message : 'Falha na operação local.' }));
      return this;
    },
  } as unknown as Socket;
}
