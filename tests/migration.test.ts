import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/server/services/passwordService.ts';

test('existing passwords and inventory survive the migration to sector login', async () => {
  const client = new PGlite('memory://');
  try {
    await client.exec(readFileSync(new URL('../drizzle/0000_robust_romulus.sql', import.meta.url), 'utf8'));
    await client.exec("INSERT INTO departments (id, name, code, location) VALUES (1, 'Tecnologia', 'TI', 'Sede'), (2, 'Recursos Humanos', 'RH', 'Sede')");
    const hash = await hashPassword('Senha-existente-1234');
    await client.query("INSERT INTO users (uid, email, full_name, department_id, role, password_hash) VALUES ('old-admin', 'ti@example.test', 'Admin anterior', 1, 'admin_ti', $1), ('old-rh', 'rh@example.test', 'Usuário anterior', 2, 'colaborador', $1), ('second-rh', 'rh2@example.test', 'Segundo usuário', 2, 'colaborador', $1)", [hash]);
    await client.exec("INSERT INTO equipments (asset_tag, serial_number, equipment_type, brand, model, department_id, responsible_company, ownership_type, manufacture_year) VALUES ('OLD-PC', 'SN-OLD-PC', 'Desktop', 'Marca', 'Modelo', 2, 'Empresa', 'Próprio', 2026)");
    await client.exec(readFileSync(new URL('../drizzle/0001_mixed_exiles.sql', import.meta.url), 'utf8'));
    const accounts = await client.query<{ uid: string; sector_account: boolean; password_hash: string; onboarding_completed: boolean }>('select uid, sector_account, password_hash, onboarding_completed from users order by id');
    assert.equal(accounts.rows.length, 3);
    assert.equal(accounts.rows[0].sector_account, true);
    assert.equal(accounts.rows[1].sector_account, true);
    assert.equal(accounts.rows[2].sector_account, false);
    assert.equal(accounts.rows[0].onboarding_completed, true);
    assert.equal(await verifyPassword('Senha-existente-1234', accounts.rows[0].password_hash), true);
    const equipment = await client.query<{ asset_tag: string; department_id: number; parent_equipment_id: number | null }>('select asset_tag, department_id, parent_equipment_id from equipments');
    assert.equal(equipment.rows[0].asset_tag, 'OLD-PC');
    assert.equal(equipment.rows[0].department_id, 2);
    assert.equal(equipment.rows[0].parent_equipment_id, null);
  } finally { await client.close(); }
});
