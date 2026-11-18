import 'dotenv/config';
import { drizzle as pgDrizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as localDrizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema.ts';
import { logFailure } from '../server/safeLog.ts';

export const usingLocalDatabase = !process.env.SQL_HOST;
export const dataDirectory = path.resolve(process.env.PATRITI_DATA_DIR || path.join(import.meta.dirname, '../../data'));
let local: PGlite | undefined;
let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema>;
if (usingLocalDatabase) {
  mkdirSync(dataDirectory, { recursive: true });
  local = new PGlite(process.env.PATRITI_TEST_MEMORY === 'true' ? 'memory://' : path.join(dataDirectory, 'postgres'));
  const localDb = localDrizzle(local, { schema });
  await migrate(localDb, { migrationsFolder: path.join(process.env.PATRITI_ROOT_DIR || path.resolve(import.meta.dirname, '../..'), 'drizzle') });
  // Both Drizzle adapters expose the same query/transaction API used by the app.
  database = localDb as unknown as NodePgDatabase<typeof schema>;
  await localDb.insert(schema.departments).values([
    { name: 'Tecnologia da Informação', code: 'TI', location: 'Sede' },
    { name: 'Recursos Humanos', code: 'RH', location: 'Sede' },
    { name: 'Financeiro', code: 'FIN', location: 'Sede' },
    { name: 'Administrativo', code: 'ADM', location: 'Sede' },
  ]).onConflictDoNothing();
} else {
  pool = new Pool({ host: process.env.SQL_HOST, port: Number(process.env.SQL_PORT) || 5432, user: process.env.SQL_USER, password: process.env.SQL_PASSWORD, database: process.env.SQL_DB_NAME, max: 10, connectionTimeoutMillis: 15000 });
  pool.on('error', (error) => logFailure('db.connection', error));
  database = pgDrizzle(pool, { schema });
}
export const db = database;
export async function closeDatabase() { await local?.close(); await pool?.end(); }
