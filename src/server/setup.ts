import { randomBytes } from 'node:crypto';
import { db, usingLocalDatabase } from '../db/index.ts';
import { users } from '../db/schema.ts';

export const setupToken = process.env.SETUP_TOKEN || randomBytes(16).toString('hex');
export async function needsSetup() {
  return usingLocalDatabase && (await db.select({ id: users.id }).from(users).limit(1)).length === 0;
}
