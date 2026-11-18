// Do not log SQL queries, request bodies, passwords, tokens, or raw exceptions.
export function logFailure(context: string, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(JSON.stringify({ event: context, code: typeof code === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(code) ? code : 'INTERNAL_ERROR' }));
}
