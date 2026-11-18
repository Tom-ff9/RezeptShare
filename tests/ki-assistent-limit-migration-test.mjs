import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PGLITE_MODULE;
if (!moduleName) throw new Error('PGLITE_MODULE auf die lokale PGlite-Installation setzen.');
const { PGlite } = await import(pathToFileURL(moduleName));
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  create table auth.users(id uuid primary key);
  create function private.konto_aktiv(uuid) returns boolean language sql as $$ select true $$;
  insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
`);
const migration = await fs.readFile(new URL('../supabase/migrations/202611170002_ki_assistent_nutzungslimit.sql', import.meta.url), 'utf8');
const handoverMigration = await fs.readFile(new URL('../docs/migrationen/ki-assistent-nutzungslimit.sql', import.meta.url), 'utf8');
assert.equal(handoverMigration, migration, 'Übergabeentwurf und versionierte Migration müssen identisch bleiben');
await db.exec(migration);

const privileges = await db.query(`
  select (select relrowsecurity from pg_class where oid='public.ki_assistent_nutzung'::regclass) as rls,
    has_table_privilege('authenticated','public.ki_assistent_nutzung','SELECT') as user_read,
    has_function_privilege('authenticated','public.ki_assistent_reservieren(uuid,uuid)','EXECUTE') as user_reserve,
    has_function_privilege('service_role','public.ki_assistent_reservieren(uuid,uuid)','EXECUTE') as service_reserve,
    has_function_privilege('service_role','public.ki_assistent_freigeben(uuid,uuid)','EXECUTE') as service_release
`);
assert.deepEqual(privileges.rows[0], { rls: true, user_read: false, user_reserve: false, service_reserve: true, service_release: true });
const columns = await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='ki_assistent_nutzung' order by ordinal_position`);
assert.deepEqual(columns.rows.map(row => row.column_name), ['benutzer_id', 'utc_tag', 'anzahl', 'aktive_anfrage', 'reserviert_am']);

const userId = '11111111-1111-4111-8111-111111111111';
const req1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const req2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reserve = async id => (await db.query('select * from public.ki_assistent_reservieren($1,$2)', [userId, id])).rows[0];
const release = async id => (await db.query('select public.ki_assistent_freigeben($1,$2) as released', [userId, id])).rows[0].released;

await db.exec('set role service_role');
assert.deepEqual(await reserve(req1), { entscheidung: 'allowed', verbleibend: 19, retry_after_seconds: 0 });
const busy = await reserve(req2);
assert.equal(busy.entscheidung, 'in_progress');
assert.ok(busy.retry_after_seconds > 0 && busy.retry_after_seconds <= 180);
assert.equal(await release(req2), false, 'falsche Anfrage-ID darf keine laufende Reservierung freigeben');
assert.equal(await release(req1), true);

for (let i = 0; i < 19; i++) {
  const next = await reserve(`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`);
  assert.equal(next.entscheidung, 'allowed');
  assert.equal(await release(`cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`), true);
}
const limited = await reserve(req2);
assert.equal(limited.entscheidung, 'daily_limit');
assert.equal(limited.verbleibend, 0);
assert.ok(limited.retry_after_seconds > 0 && limited.retry_after_seconds <= 86_400);

await db.exec('reset role');
await db.query(`update public.ki_assistent_nutzung set utc_tag=(clock_timestamp() at time zone 'UTC')::date - 1 where benutzer_id=$1`, [userId]);
await db.exec('set role service_role');
const nextDay = await reserve(req2);
assert.equal(nextDay.entscheidung, 'allowed', 'UTC-Tageswechsel setzt das Kontingent zurück');
assert.equal(nextDay.verbleibend, 19);

await db.exec('reset role');
await db.query(`update public.ki_assistent_nutzung set reserviert_am=clock_timestamp()-interval '4 minutes' where benutzer_id=$1`, [userId]);
await db.exec('set role service_role');
const recovered = await reserve(req1);
assert.equal(recovered.entscheidung, 'allowed', 'verwaiste Reservierung wird nach Lease-Ablauf freigegeben');
await db.exec('reset role');
const state = await db.query('select anzahl, aktive_anfrage from public.ki_assistent_nutzung where benutzer_id=$1', [userId]);
assert.equal(state.rows[0].anzahl, 2);
assert.equal(state.rows[0].aktive_anfrage, req1);
await db.exec('set role service_role');
assert.equal(await release(req1), true);
await db.exec('reset role');
await db.close();
console.log('KI-Assistent-Limitmigration geprüft: RLS/Grants, 20 pro UTC-Tag, 1 aktive Anfrage, Request-ID-Freigabe und verwaiste Lease-Bereinigung.');
