import { logFailure } from './safeLog.ts';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export const apiNotFound: RequestHandler = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'Rota da API não encontrada. Reinicie o servidor e recarregue a página.' });
};

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.setHeader('Cache-Control', 'no-store');
  const status = (error as { status?: number }).status;
  if (status === 400) return res.status(400).json({ error: 'O corpo da requisição deve ser um JSON válido.' });
  if (status === 413) return res.status(413).json({ error: 'A requisição excede o tamanho permitido.' });
  logFailure('api.request', error);
  return res.status(500).json({ error: 'Não foi possível processar a solicitação no servidor.' });
};
