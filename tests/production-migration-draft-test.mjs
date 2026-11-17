import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PGLITE_MODULE;
if (!moduleName) throw new Error('PGLITE_MODULE muss auf die lokale PGlite-Installation zeigen.');
const { PGlite } = await import(pathToFileURL(moduleName));
const migration = await fs.readFile(new URL('../docs/migrationen/kochbuchimport-produktiv.sql', import.meta.url), 'utf8');
const infrastructure = `
  create role anon; create role authenticated; create role service_role;
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
         has_function_privilege('anon','public.rezept_import_limit(uuid)','EXECUTE') as anon_can_execute,
         has_function_privilege('service_role','public.rezept_import_limit(uuid)','EXECUTE') as service_can_execute
`);
assert.deepEqual(created.rows[0], { table_exists: true, function_exists: true, rls_enabled: true, anon_can_execute: false, service_can_execute: true });
await clean.close();

const existing = new PGlite();
await existing.exec(infrastructure);
await existing.exec('create table public.rezept_import_nutzung(person uuid primary key)');
await assert.rejects(existing.exec(migration), /Importlimit-Objekte existieren bereits/);
await existing.exec('rollback');
const preserved = await existing.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='rezept_import_nutzung'");
assert.equal(preserved.rows[0].n, 1, 'Vorhandene Tabelle bleibt unverändert');
await existing.close();
console.log('Produktionsmigrations-Entwurf lokal geprüft: atomare Anlage bei erfüllten Voraussetzungen, Abbruch ohne Überschreiben vorhandener Importobjekte.');
