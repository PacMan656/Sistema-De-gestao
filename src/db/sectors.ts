import { randomUUID } from '../shared/random.ts';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { departments, equipments, users } from './schema.ts';
import type { DepartmentInput } from '../shared/validation.ts';
import { hashPassword } from '../server/services/passwordService.ts';

export async function listSectorDepartments(onlyId?: number) {
  return db.select({
    id: departments.id, name: departments.name, code: departments.code,
    location: departments.location, costCenter: departments.costCenter,
    accountId: users.id, accessConfigured: sql<boolean>`${users.id} is not null`,
    accessActive: sql<boolean>`coalesce(${users.active}, false)`,
    equipmentCount: sql<number>`(select count(*)::int from ${equipments} where ${equipments.departmentId} = ${departments.id})`,
  }).from(departments).leftJoin(users, and(eq(users.departmentId, departments.id), eq(users.sectorAccount, true)))
    .where(onlyId === undefined ? undefined : eq(departments.id, onlyId)).orderBy(departments.name);
}

export async function saveDepartment(input: DepartmentInput, id?: number, password?: string) {
  const passwordHash = password ? await hashPassword(password) : undefined;
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE departments IN EXCLUSIVE MODE`);
    const matches = await tx.select({ id: departments.id }).from(departments)
      .where(sql`upper(${departments.code}) = ${input.code} or lower(${departments.name}) = lower(${input.name})`);
    if (matches.some((row) => row.id !== id)) throw new Error('Já existe um setor com esse código ou nome.');
    const [department] = id
      ? await tx.update(departments).set({ ...input, costCenter: input.costCenter || null }).where(eq(departments.id, id)).returning()
      : await tx.insert(departments).values({ ...input, costCenter: input.costCenter || null }).returning();
    if (!department) throw new Error('Setor não encontrado.');
    const [account] = await tx.select().from(users).where(and(eq(users.departmentId, department.id), eq(users.sectorAccount, true)));
    if (account) {
      await tx.update(users).set({ fullName: department.name, ...(passwordHash ? { passwordHash, authVersion: sql`${users.authVersion} + 1` } : {}) }).where(eq(users.id, account.id));
    } else if (passwordHash) {
      await tx.insert(users).values({ uid: `local:${randomUUID()}`, email: `sector-${department.id}@patriti.local`, fullName: department.name, role: 'colaborador', departmentId: department.id, sectorAccount: true, passwordHash, onboardingCompleted: true });
    }
    return department;
  });
}
