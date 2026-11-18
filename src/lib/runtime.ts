export const isLocalMode = import.meta.env.MODE === 'pages';
export const isFirebaseMode = import.meta.env.MODE === 'firebase';
export async function appFetch(url: string, options: RequestInit = {}) {
  if (isFirebaseMode && url.startsWith('/api/')) {
    const { firebaseFetch } = await import('../firebase/api.ts');
    return firebaseFetch(url, options);
  }
  if (isLocalMode && url.startsWith('/api/')) {
    const { localFetch } = await import('../browser/runtime.ts');
    return localFetch(url, options);
  }
  return fetch(url, options);
}
