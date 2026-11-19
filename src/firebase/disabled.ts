import type { Socket } from 'socket.io-client';
export async function firebaseFetch(_url: string, _options?: RequestInit): Promise<Response> { throw new Error('Firebase is not enabled in this build.'); }
export function createFirebaseSocket(_user: unknown): Socket { throw new Error('Firebase is not enabled in this build.'); }
export async function firebaseClient(): Promise<never> { throw new Error('Firebase is not enabled in this build.'); }
export function watchSharedWorkspace(..._args: unknown[]): () => void { throw new Error('Firebase is not enabled in this build.'); }
