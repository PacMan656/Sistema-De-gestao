import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { departments, users } from './schema.ts';
import type { CreateUserInput } from '../shared/validation.ts';
import { hashPassword } from '../server/services/passwordService.ts';

export async function findAccount(email: string) {
  const rows = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  return rows[0] ?? null;
}

export async function findSectorAccount(code: string) {
  const rows = await db.select({ account: users }).from(users)
    .innerJoin(departments, eq(users.departmentId, departments.id))
    .where(and(eq(users.sectorAccount, true), sql`upper(${departments.code}) = ${code.trim().toUpperCase()}`)).limit(1);
  return rows[0]?.account ?? null;
}

export async function createAccount(input: CreateUserInput, firstAdmin = false) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    if (firstAdmin) {
      await tx.execute(sql`LOCK TABLE users IN EXCLUSIVE MODE`);
      if ((await tx.select({ id: users.id }).from(users).limit(1)).length) throw new Error('Configuração inicial já concluída.');
    }
    const existing = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (existing.length) throw new Error('Já existe um usuário com esse e-mail.');
    const department = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId));
    if (!department.length) throw new Error('Selecione um departamento válido.');
    const { password: _password, ...profile } = input;
    const [created] = await tx.insert(users).values({ ...profile, uid: `local:${randomUUID()}`, passwordHash, sectorAccount: firstAdmin, onboardingCompleted: true }).returning({ id: users.id });
    return created.id;
  });
}

export async function setAccountPassword(userId: number, password: string) {
  const passwordHash = await hashPassword(password);
  const [updated] = await db.update(users).set({ passwordHash, authVersion: sql`${users.authVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
  return updated;
}

export async function setAccountActive(userId: number, active: boolean) {
  const [updated] = await db.update(users).set({ active, authVersion: sql`${users.authVersion} + 1`, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
  return updated;
}
