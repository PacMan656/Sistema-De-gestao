import { PGliteWorker } from '@electric-sql/pglite/worker';
import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.ts';

const namespace = `patriti-${encodeURIComponent(import.meta.env.BASE_URL)}`;
export const client = await PGliteWorker.create(
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: namespace }),
  { id: namespace, dataDir: `idb://${namespace}` },
);
export const db = drizzle(client as unknown as PGlite, { schema }) as unknown as NodePgDatabase<typeof schema>;
