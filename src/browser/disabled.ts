export const localEvents = new EventTarget();
export async function localFetch(_url: string, _options?: RequestInit): Promise<Response> {
  throw new Error('Esta edição utiliza a API do servidor.');
}
