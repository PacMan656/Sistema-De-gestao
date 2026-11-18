import { logFailure } from '../safeLog.ts';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDirectory, usingLocalDatabase } from '../../db/index.ts';
import { getUserWithDepartment } from '../../db/queries.ts';

if (!usingLocalDatabase && process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
  throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres em produção.');
}
function sessionSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!usingLocalDatabase) return randomBytes(32).toString('hex');
  const secretPath = path.join(dataDirectory, '.session-secret');
  try { return readFileSync(secretPath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const secret = randomBytes(32).toString('hex');
    writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 });
    return secret;
  }
}
const JWT_SECRET = sessionSecret();

export interface AppUserContext {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  matricula: string | null;
  jobTitle: string | null;
  role: string;
  departmentId: number | null;
  onboardingCompleted: boolean;
  active: boolean;
  authVersion: number;
  sectorAccount: boolean;
  departmentName: string | null;
  departmentCode: string | null;
  departmentLocation: string | null;
}

export interface AuthRequest extends Request {
  appUser?: AppUserContext;
}

interface RbacJwtPayload {
  userId: number;
  uid: string;
  email: string;
  role: string;
  departmentId: number | null;
  iss?: string;
  authVersion: number;
}

export function signRbacJwt(user: AppUserContext): string {
  const payload: RbacJwtPayload = {
    userId: user.id,
    uid: user.uid,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    iss: 'patriti-rbac',
    authVersion: user.authVersion,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export async function authenticateToken(token: string): Promise<AppUserContext> {
  const hint = jwt.decode(token);
  if (hint && typeof hint === 'object' && hint.iss === 'patriti-rbac') {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'patriti-rbac' }) as RbacJwtPayload;
    const user = await getUserWithDepartment(decoded.userId);
    if (!user?.active || !user.sectorAccount || decoded.authVersion !== user.authVersion) throw new Error('SESSION_REVOKED');
    return user;
  }

  throw new Error('INVALID_SECTOR_SESSION');
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado: Token ausente.' });
  }

  try {
    req.appUser = await authenticateToken(token);
    return next();
  } catch (error) {
    logFailure('auth.verify', error);
    return res
      .status(401)
      .json({ error: 'Não autorizado: Token inválido ou expirado.' });
  }
}

export function requireAdminTI(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.appUser) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  if (req.appUser.role !== 'admin_ti') {
    return res.status(403).json({
      error:
        'Acesso negado: esta operação é restrita ao perfil Admin / Técnico de TI.',
    });
  }
  return next();
}
