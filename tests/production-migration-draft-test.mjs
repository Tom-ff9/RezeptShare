import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PGLITE_MODULE;
if (!moduleName) throw new Error('PGLITE_MODULE muss auf die lokale PGlite-Installation zeigen.');
const { PGlite } = await import(pathToFileURL(moduleName));
const migration = await fs.readFile(new URL('../docs/migrationen/kochbuchimport-produktiv.sql', import.meta.url), 'utf8');
const infrastructure = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  create table auth.users(id uuid primary key);
  create function private.konto_aktiv(uuid) returns boolean language sql as $$ select true $$;
`;
const clean = new PGlite();
await clean.exec(infrastructure);
await clean.exec(migration);
const created = await clean.query(`
  select to_regclass('public.rezept_import_nutzung') is not null as table_exists,
         to_regprocedure('public.rezept_import_limit(uuid)') is not null as function_exists,
         (select relrowsecurity from pg_class where oid='public.rezept_import_nutzung'::regclass) as rls_enabled,
         to_regclass('public.rezept_import_api_nutzung') is not null as usage_table_exists,
         (select relrowsecurity from pg_class where oid='public.rezept_import_api_nutzung'::regclass) as usage_rls_enabled,
         has_function_privilege('anon','public.rezept_import_limit(uuid)','EXECUTE') as anon_can_execute,
         has_function_privilege('service_role','public.rezept_import_limit(uuid)','EXECUTE') as service_can_execute,
         has_table_privilege('anon','public.rezept_import_api_nutzung','SELECT') as anon_can_read_usage,
         has_table_privilege('anon','public.rezept_import_api_nutzung','INSERT') as anon_can_write_usage,
         has_table_privilege('service_role','public.rezept_import_api_nutzung','SELECT') as service_can_read_usage,
         has_table_privilege('service_role','public.rezept_import_api_nutzung','INSERT') as service_can_write_usage
`);
assert.deepEqual(created.rows[0], {
  table_exists: true, function_exists: true, rls_enabled: true,
  usage_table_exists: true, usage_rls_enabled: true,
  anon_can_execute: false, service_can_execute: true,
  anon_can_read_usage: false, anon_can_write_usage: false,
  service_can_read_usage: true, service_can_write_usage: true
});
await clean.exec("insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111')");
await clean.exec('set role service_role');
await clean.query(`insert into public.rezept_import_api_nutzung(person,openai_response_id,model,input_tokens,output_tokens,total_tokens,cached_input_tokens,reasoning_output_tokens) values($1,$2,$3,$4,$5,$6,$7,$8)`, ['11111111-1111-4111-8111-111111111111','resp_test','gpt-4.1-mini',100,50,150,10,20]);
await clean.exec('reset role');
const usage = await clean.query('select model,input_tokens,output_tokens,total_tokens,cached_input_tokens,reasoning_output_tokens from public.rezept_import_api_nutzung');
assert.deepEqual(usage.rows[0], {model:'gpt-4.1-mini',input_tokens:100,output_tokens:50,total_tokens:150,cached_input_tokens:10,reasoning_output_tokens:20});
await clean.close();

const existing = new PGlite();
await existing.exec(infrastructure);
await existing.exec('create table public.rezept_import_nutzung(person uuid primary key)');
await assert.rejects(existing.exec(migration), /Importlimit-Objekte existieren bereits/);
await existing.exec('rollback');
const preserved = await existing.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='rezept_import_nutzung'");
assert.equal(preserved.rows[0].n, 1, 'Vorhandene Tabelle bleibt unverändert');
await existing.close();
console.log('Produktionsmigrations-Entwurf lokal geprüft: Limits und datensparsame Token-Nutzung, RLS/Rollen, atomare Neuanlage und Abbruch ohne Überschreiben bestehender Importobjekte.');
