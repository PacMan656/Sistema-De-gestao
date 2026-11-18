import { randomBytes } from 'node:crypto';
import { db, usingLocalDatabase, dataDirectory } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const setupTokenPath = path.join(dataDirectory, '.setup-token');
function readSetupToken() {
  try { return readFileSync(setupTokenPath, 'utf8').trim(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return randomBytes(24).toString('hex'); }
}
export const setupToken = process.env.SETUP_TOKEN || (usingLocalDatabase ? readSetupToken() : randomBytes(24).toString('hex'));
export async function needsSetup() {
  const required = usingLocalDatabase && (await db.select({ id: users.id }).from(users).limit(1)).length === 0;
  if (required && !process.env.SETUP_TOKEN) writeFileSync(setupTokenPath, setupToken, { mode: 0o600 });
  return required;
}
