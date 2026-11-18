import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { departments, users } from '../db/schema.ts';
import { saveDepartment } from '../db/sectors.ts';
import { setAccountActive } from '../db/accounts.ts';
import { createDepartmentSchema, departmentSchema, passwordSchema } from '../shared/validation.ts';
import { requireAuth, requireAdminTI, type AuthRequest } from './middleware/auth.ts';
import { disconnectUserSockets } from './socket.ts';

export const sectorRouter = Router();
sectorRouter.post('/departments', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const parsed = createDepartmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try { return res.status(201).json(await saveDepartment(parsed.data, undefined, parsed.data.password)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível cadastrar o setor.' }); }
});
sectorRouter.put('/departments/:id', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = departmentSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Setor inválido.' : parsed.error.issues[0].message });
  try { return res.json(await saveDepartment(parsed.data, id)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar o setor.' }); }
});
sectorRouter.put('/departments/:id/access', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.appUser!.departmentId) return res.status(400).json({ error: 'Use a opção de alterar senha do TI na barra superior.' });
  const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Setor inválido.' : parsed.error.issues[0].message });
  try {
    const [department] = await db.select().from(departments).where(eq(departments.id, id));
    if (!department) return res.status(404).json({ error: 'Setor não encontrado.' });
    await saveDepartment({ ...department, costCenter: department.costCenter || '' }, id, parsed.data.password);
    const [account] = await db.select({ id: users.id }).from(users).where(and(eq(users.departmentId, id), eq(users.sectorAccount, true)));
    if (account) disconnectUserSockets(account.id);
    return res.json({ ok: true });
  } catch { return res.status(400).json({ error: 'Não foi possível definir a senha do setor.' }); }
});
sectorRouter.patch('/departments/:id/access', requireAuth, requireAdminTI, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ error: 'Dados inválidos.' });
  if (id === req.appUser!.departmentId) return res.status(400).json({ error: 'Não é possível bloquear o próprio setor de TI.' });
  try {
    const [account] = await db.select({ id: users.id }).from(users).where(and(eq(users.departmentId, id), eq(users.sectorAccount, true)));
    if (!account) return res.status(404).json({ error: 'Defina a senha do setor antes de ativar o acesso.' });
    await setAccountActive(account.id, parsed.data.active); disconnectUserSockets(account.id);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'Não foi possível atualizar o acesso.' }); }
});
