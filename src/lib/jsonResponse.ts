export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    throw new Error('A API retornou uma página em vez de dados. Reinicie o servidor com npm run dev e recarregue a página em http://localhost:3000.');
  }
  let data: T & { error?: string };
  try { data = await response.json(); }
  catch { throw new Error('O servidor retornou dados inválidos. Recarregue a página e tente novamente.'); }
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Erro ${response.status} ao comunicar com o servidor.`);
  }
  return data;
}
