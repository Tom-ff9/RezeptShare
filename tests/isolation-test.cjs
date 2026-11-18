const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('konfiguration.js','utf8'),context);
for(const value of Object.values(context.window.REZEPT_SHARE_KONFIGURATION)) assert.equal(value,'');
const protectedFiles=['konfiguration.js','ki-assistent.js','supabase/functions/ki-fortschritt/index.ts'];
for(const file of protectedFiles) {
 const source=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(source,/gcncxupedhwieybpiupi|pwrrqwojvjoyclfmebnl|kronshagen\.hopto\.org|sb_secret_|sk-proj-/);
}
const build=fs.readFileSync('scripts/build-pages.cjs','utf8');
assert.ok(!build.includes('konfiguration.lokal.js'));
assert.ok(fs.readFileSync('.gitignore','utf8').includes('konfiguration.lokal.js'));
const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
assert.match(workflow,/deployment_bestaetigt == true/);
assert.ok(!/\n\s+push:/.test(workflow));
const migration=fs.readFileSync('supabase/migrations/202611140001_kochbuch_import.sql','utf8');
assert.doesNotMatch(migration,/alter table public\.(rezepte|gruppen|profile)\b|drop policy/i);
console.log('Isolation geprüft: leere Projektvorgaben, keine produktiven Endpunkte, lokale Konfiguration nicht im Build, kein automatisches Pages-Deployment.');
