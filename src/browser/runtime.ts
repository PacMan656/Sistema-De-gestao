import { createLocalApi } from './api.ts';
import type { LocalSessionStore } from './api.ts';

const namespace = `patriti-local:${import.meta.env.BASE_URL}`;
const storage: LocalSessionStore = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};
export const localEvents = new EventTarget();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(namespace) : null;
function dispatch(name: string, data: unknown) { localEvents.dispatchEvent(new CustomEvent(name, { detail: data })); }
channel?.addEventListener('message', (event) => dispatch(event.data.name, event.data.data));
export const localFetch = createLocalApi(storage, namespace, (name, data) => {
  dispatch(name, data); channel?.postMessage({ name, data });
});
