import { PGlite } from '@electric-sql/pglite';
import { worker } from '@electric-sql/pglite/worker';

worker({
  async init(options) {
    const client = await PGlite.create({ dataDir: options.dataDir });
    await client.exec('CREATE TABLE IF NOT EXISTS patriti_browser_migrations (name text PRIMARY KEY)');
    const migrations = import.meta.glob('/drizzle/*.sql', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
    for (const name of Object.keys(migrations).sort()) {
      if ((await client.query('SELECT name FROM patriti_browser_migrations WHERE name = $1', [name])).rows.length) continue;
      await client.transaction(async (tx) => {
        await tx.exec(migrations[name]);
        await tx.query('INSERT INTO patriti_browser_migrations (name) VALUES ($1)', [name]);
      });
    }
    await client.exec("INSERT INTO departments (name, code, location) VALUES ('Tecnologia da Informação', 'TI', 'Local'), ('Recursos Humanos', 'RH', 'Local'), ('Financeiro', 'FIN', 'Local'), ('Administrativo', 'ADM', 'Local') ON CONFLICT DO NOTHING");
    return client;
  },
});
