import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import * as schema from '../src/db/schema.ts';
import { hashPassword, verifyPassword } from '../src/server/services/passwordService.ts';

test('local database retains a provisioned account and password across restarts', async () => {
  const parent = path.resolve('.test-data');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'persistence-'));
  let client = new PGlite(directory);
  try {
    let db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: path.resolve('drizzle') });
    const passwordHash = await hashPassword('Persistent-user-password-123');
    await db.insert(schema.users).values({ uid: 'local:test', email: 'persist@example.test', fullName: 'Persistent User', role: 'admin_ti', passwordHash, onboardingCompleted: true });
    await client.close();
    client = new PGlite(directory);
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: path.resolve('drizzle') });
    const [user] = await db.select().from(schema.users);
    assert.equal(user.email, 'persist@example.test');
    assert.equal(user.onboardingCompleted, true);
    assert.equal(await verifyPassword('Persistent-user-password-123', user.passwordHash!), true);
    assert.equal(await verifyPassword('wrong-password', user.passwordHash!), false);
  } finally {
    await client.close();
    if (!directory.startsWith(parent + path.sep)) throw new Error('Unexpected test directory');
    await rm(directory, { recursive: true, force: true });
  }
});
