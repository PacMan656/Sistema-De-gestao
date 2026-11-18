import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';

const tables = [
  ['departments', schema.departments], ['users', schema.users], ['equipments', schema.equipments],
  ['assetMovements', schema.assetMovements], ['inspections', schema.inspections],
  ['incidents', schema.incidents], ['chatMessages', schema.chatMessages], ['remoteSessions', schema.remoteSessions],
] as const;
export async function exportBackup() {
  const data: Record<string, unknown> = {};
  for (const [name, table] of tables) data[name] = await db.select().from(table);
  return { format: 'patriti-browser-backup', version: 1, exportedAt: new Date().toISOString(), data };
}
export async function importBackup(input: unknown) {
  const backup = input as { format?: string; version?: number; data?: Record<string, unknown> };
  if (backup?.format !== 'patriti-browser-backup' || backup.version !== 1 || !backup.data) throw new Error('Arquivo de backup do PatriTI inválido.');
  const normalized = new Map<string, Record<string, unknown>[]>();
  for (const [name, table] of tables) {
    const rows = backup.data[name];
    if (!Array.isArray(rows) || rows.length > 50000) throw new Error(`Tabela inválida no backup: ${name}.`);
    const columns: Record<string, { dataType: string }> = getTableColumns(table);
    normalized.set(name, rows.map((row) => {
      if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.id) || row.id < 1) throw new Error('Registro inválido no backup.');
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!(key in columns)) throw new Error(`Campo não reconhecido no backup: ${key}.`);
        if (columns[key].dataType === 'date' && value !== null) {
          const date = new Date(String(value));
          if (!Number.isFinite(date.getTime())) throw new Error('Data inválida no backup.');
          result[key] = date;
        } else result[key] = value;
      }
      return result;
    }));
  }
  if (!normalized.get('users')!.some((row) => row.active === true && row.sectorAccount === true && row.role === 'admin_ti' && typeof row.passwordHash === 'string')) throw new Error('O backup deve conter um acesso ativo do TI.');
  await db.transaction(async (tx) => {
    for (const [, table] of [...tables].reverse()) await tx.delete(table);
    for (const [name, table] of tables) {
      const rows = normalized.get(name)!;
      if (name === 'equipments') rows.sort((a, b) => Number(Boolean(a.parentEquipmentId)) - Number(Boolean(b.parentEquipmentId)));
      for (const row of rows) await tx.insert(table as PgTable).values(row);
      // Table names come from the fixed schema list, never from the imported file.
      const sqlName = name === 'assetMovements' ? 'asset_movements' : name === 'chatMessages' ? 'chat_messages' : name === 'remoteSessions' ? 'remote_sessions' : name;
      await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${sqlName}', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM ${sqlName}`));
    }
  });
}
