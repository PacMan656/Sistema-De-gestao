import { logFailure } from './safeLog.ts';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { createAccount, findSectorAccount, setAccountActive, setAccountPassword } from '../db/accounts.ts';
import { getUserWithDepartment } from '../db/queries.ts';
import { createUserSchema, loginSchema, passwordSchema } from '../shared/validation.ts';
import { authenticateToken, requireAdminTI, requireAuth, signRbacJwt, type AuthRequest, type AppUserContext } from './middleware/auth.ts';
import { hashPassword, verifyPassword } from './services/passwordService.ts';
import { needsSetup, setupToken } from './setup.ts';
import { timingSafeEqual } from 'node:crypto';
import { disconnectUserSockets } from './socket.ts';

export const accountRouter = Router();
const cookieName = 'patriti_session';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' && process.env.PATRITI_DESKTOP !== '1', sameSite: 'strict' as const, path: '/api/auth', maxAge: 12 * 60 * 60 * 1000 };
const { maxAge: _maxAge, ...clearCookieOptions } = cookieOptions;
const attempts = new Map<string, { count: number; expires: number }>();
const dummyHash = hashPassword('invalid-account-password');

accountRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
// Cookies are only used for restoring a session; mutations require a bearer token.
function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Origem não permitida.' });
  if (req.headers.origin) {
    const allowed = process.env.APP_URL && !process.env.APP_URL.startsWith('MY_') ? new URL(process.env.APP_URL).host : req.get('host');
    try { if (new URL(req.headers.origin).host !== allowed) return res.status(403).json({ error: 'Origem não permitida.' }); }
    catch { return res.status(403).json({ error: 'Origem inválida.' }); }
  }
  next();
}

accountRouter.get('/auth/setup', async (_req, res) => {
  try { res.json({ required: await needsSetup() }); }
  catch { res.status(503).json({ error: 'Não foi possível verificar a configuração.' }); }
});
accountRouter.post('/auth/setup', sameOrigin, async (req, res) => {
  const supplied = Buffer.from(typeof req.body?.setupToken === 'string' ? req.body.setupToken : '');
  const expected = Buffer.from(setupToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(403).json({ error: 'Código de configuração inválido. Consulte o terminal do servidor.' });
  const parsed = createUserSchema.safeParse({ ...req.body, email: 'sector-ti@patriti.local', fullName: 'Tecnologia da Informação', matricula: 'TI', jobTitle: 'Administração de TI', departmentId: 1, role: 'admin_ti' });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    if (!await needsSetup()) return res.status(409).json({ error: 'Configuração inicial já concluída.' });
    const id = await createAccount(parsed.data, true);
    return sendSession(res, (await getUserWithDepartment(id))!);
  } catch { return res.status(400).json({ error: 'Não foi possível concluir a configuração inicial.' }); }
});
export function sendSession(res: Response, user: AppUserContext) {
  const rbacToken = signRbacJwt(user);
  res.cookie(cookieName, rbacToken, cookieOptions);
  return res.json({ user, rbacToken });
}

accountRouter.post('/auth/login', sameOrigin, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.ip || 'unknown';
  const attempt = attempts.get(key) || { count: 0, expires: now + 15 * 60 * 1000 };
  if (attempt.count >= 20) {
    res.setHeader('Retry-After', Math.ceil((attempt.expires - now) / 1000));
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  }
  attempt.count++;
  attempts.set(key, attempt);
  try {
    const account = await findSectorAccount(parsed.data.sector);
    const valid = await verifyPassword(parsed.data.password, account?.passwordHash || await dummyHash);
    if (!account?.active || !account.passwordHash || !valid) return res.status(401).json({ error: 'Setor ou senha inválidos, ou acesso desativado. Consulte o TI.' });
    const user = await getUserWithDepartment(account.id);
    if (!user) return res.status(401).json({ error: 'Acesso não encontrado.' });
    attempts.delete(key);
    return sendSession(res, user);
  } catch (error) {
    logFailure('auth.login', error);
    return res.status(503).json({ error: 'Não foi possível acessar o banco de dados. Solicite ao TI a verificação da configuração.' });
  }
});

accountRouter.get('/auth/session', sameOrigin, async (req, res) => {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  if (!cookie) return res.status(401).json({ error: 'Sessão não autenticada.' });
  try { return sendSession(res, await authenticateToken(decodeURIComponent(cookie.slice(cookieName.length + 1)))); }
  catch { res.clearCookie(cookieName, clearCookieOptions); return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }
});

accountRouter.post('/auth/logout', sameOrigin, (_req, res, next) => {
  res.clearCookie(cookieName, clearCookieOptions);
  next();
}, requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(users).set({ authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, req.appUser!.id));
    disconnectUserSockets(req.appUser!.id);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Não foi possível encerrar as sessões no servidor.' }); }
});

accountRouter.post('/auth/password', requireAuth, async (req: AuthRequest, res) => {
  if (req.appUser!.role !== 'admin_ti') return res.status(403).json({ error: 'A senha do setor é gerenciada pelo TI.' });
  const parsed = z.object({ currentPassword: z.string().min(1).max(128), password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const [account] = await db.select().from(users).where(eq(users.id, req.appUser!.id));
    if (!account.passwordHash || !await verifyPassword(parsed.data.currentPassword, account.passwordHash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
    await setAccountPassword(account.id, parsed.data.password);
    disconnectUserSockets(account.id);
    return sendSession(res, (await getUserWithDepartment(account.id))!);
  } catch { return res.status(500).json({ error: 'Não foi possível alterar a senha.' }); }
});

accountRouter.post('/users', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const id = await createAccount(parsed.data);
    return res.status(201).json(await getUserWithDepartment(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const cause = error instanceof Error ? error.cause : undefined;
    if ((error as { code?: string }).code === '23505' || (cause as { code?: string } | undefined)?.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' });
    if (message.startsWith('Já existe')) return res.status(409).json({ error: message });
    if (message.startsWith('Selecione')) return res.status(400).json({ error: message });
    logFailure('auth.create', error);
    return res.status(500).json({ error: 'Não foi possível cadastrar o usuário.' });
  }
});

accountRouter.patch('/users/:id/access', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const userId = Number(req.params.id);
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!Number.isSafeInteger(userId) || userId < 1 || !parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  if (userId === req.appUser!.id) return res.status(400).json({ error: 'Você não pode desativar o próprio acesso.' });
  try {
    if (!await setAccountActive(userId, parsed.data.active)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    disconnectUserSockets(userId);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Não foi possível atualizar o acesso.' }); }
});

accountRouter.post('/users/:id/password', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const userId = Number(req.params.id);
  const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!Number.isSafeInteger(userId) || userId < 1 || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Usuário inválido.' : parsed.error.issues[0].message });
  try {
    if (!await setAccountPassword(userId, parsed.data.password)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    disconnectUserSockets(userId);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Não foi possível redefinir a senha.' }); }
});
