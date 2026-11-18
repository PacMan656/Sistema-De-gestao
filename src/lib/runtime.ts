export const isLocalMode = import.meta.env.MODE === 'pages';
export async function appFetch(url: string, options: RequestInit = {}) {
  if (isLocalMode && url.startsWith('/api/')) {
    const { localFetch } = await import('../browser/runtime.ts');
    return localFetch(url, options);
  }
  return fetch(url, options);
}
