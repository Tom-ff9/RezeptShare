// Fail-closed target checks shared by local setup and release preparation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const FUNCTIONS = Object.freeze(['rezept-speichern', 'rezept-gruppen', 'gruppe-loeschen', 'konto-loeschen', 'rezept-importieren']);
const TARGET_FILE = '.supabase-test/target.json';
// Bekannte bisherige Projekte dürfen auch bei versehentlicher Bestätigung nie Testziele sein.
const BLOCKED_PROJECTS = Object.freeze(['gcncxupedhwieybpiupi', 'pwrrqwojvjoyclfmebnl']);
const PUBLIC_FIELDS = Object.freeze(['supabaseUrl', 'supabasePublishableKey', 'kiUrl', 'kiPublishableKey', 'kiProgressUrl']);
function validateReference(ref) {
    if (typeof ref !== 'string' || !/^[a-z]{20}$/.test(ref) || BLOCKED_PROJECTS.includes(ref)) {
        throw new Error('Unzulässige Testreferenz: bisherige Projekte sind gesperrt.');
    }
    return ref;
}
function validateTarget(target, confirmation) {
    if (target?.projectName !== 'RezeptShare-Test' || target.confirmedByUser !== true || target.environment !== 'test'
        || confirmation !== target.projectRef || Object.keys(target).some(key => !['projectRef','projectName','environment','confirmedByUser'].includes(key))) {
        throw new Error('Abbruch: bestätigte Testprojekt-Referenz fehlt oder stimmt nicht überein.');
    }
    return validateReference(target.projectRef);
}
function readTarget(root, confirmation) {
    let target;
    try {
        const file = path.join(root, TARGET_FILE);
        if (!fs.lstatSync(file).isFile() || fs.lstatSync(path.dirname(file)).isSymbolicLink()) throw new Error();
        target = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { throw new Error('Testziel-Datei fehlt oder ist ungültig; keine Dateiinhalte werden ausgegeben.'); }
    validateTarget(target, confirmation);
    return target;
}
function validatePublicConfig(config, ref) {
    validateReference(ref);
    const clean = publicValues(config);
    if (clean.supabaseUrl !== `https://${ref}.supabase.co`) throw new Error('Lokale Supabase-URL stimmt nicht mit dem bestätigten Testprojekt überein.');
    const key = clean.supabasePublishableKey;
    if (typeof key !== 'string' || !key) throw new Error('Öffentlicher Testprojekt-Key fehlt.');
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
        let claims;
        try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); }
        catch { throw new Error('Nur Publishable-Key oder projektgebundener anon-Key erlaubt.'); }
        if (key.split('.').length !== 3 || claims.role !== 'anon' || claims.ref !== ref) {
            throw new Error('Secret-/Service-Role-Key oder Key eines anderen Projekts ist unzulässig.');
        }
    }
    if (['kiUrl', 'kiPublishableKey', 'kiProgressUrl'].some(key => clean[key])) {
        throw new Error('Für den Buchimport bleiben zusätzliche KI-Endpunkte leer.');
    }
    return Object.freeze(clean);
}
function publicValues(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)
        || Object.keys(config).some(key => !PUBLIC_FIELDS.includes(key))) {
        throw new Error('Nur die freigegebenen öffentlichen Konfigurationsfelder sind erlaubt; keine Secrets.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(config);
    const clean = {};
    for (const key of PUBLIC_FIELDS) {
        const item = descriptors[key];
        if (item && (!Object.hasOwn(item, 'value') || typeof item.value !== 'string')) throw new Error('Konfigurationswerte müssen einfache Zeichenketten sein.');
        clean[key] = item?.value ?? '';
    }
    return clean;
}
function readConfig(root, filename) {
    const context = { window: {} };
    try {
        const file = path.join(root, filename);
        if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error();
        vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
        if (Object.keys(context.window).some(key => key !== 'REZEPT_SHARE_KONFIGURATION')) throw new Error();
        return publicValues(context.window.REZEPT_SHARE_KONFIGURATION);
    } catch { throw new Error('Konfiguration konnte nicht sicher gelesen werden; keine Werte werden ausgegeben.'); }
}
function readPublicConfig(root, ref) {
    return validatePublicConfig(readConfig(root, 'konfiguration.lokal.js'), ref);
}
function readOfflineConfig(root, { ignoreLocal = false } = {}) {
    if (!ignoreLocal && fs.existsSync(path.join(root, 'konfiguration.lokal.js'))) throw new Error('Lokale Live-Konfiguration vorhanden: nur mit npm run start:test und bestätigter Testreferenz starten.');
    const config = readConfig(root, 'konfiguration.js');
    if (Object.values(config).some(Boolean)) throw new Error('Ohne bestätigtes Testziel sind ausschließlich leere Projektvorgaben erlaubt.');
    return config;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function collectFiles(root, directory, result = []) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
        const relative = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Symlinks sind im Deploymentpaket nicht erlaubt.');
        if (entry.isDirectory()) collectFiles(root, relative, result);
        else if (entry.isFile()) result.push(relative);
        else throw new Error('Unbekannter Dateityp im Deploymentpaket.');
    }
    return result;
}
function verifyPackage(root) {
    const prefix = '.supabase-test/supabase/';
    const expectedMigration = prefix + 'migrations/202611150001_test_bootstrap.sql';
    const migrations = fs.readdirSync(path.join(root, prefix, 'migrations')).sort();
    if (JSON.stringify(migrations) !== JSON.stringify(['202611150001_test_bootstrap.sql'])) {
        throw new Error('Das Testpaket darf ausschließlich die geprüfte Bootstrap-Migration enthalten.');
    }
    if (!fs.readFileSync(path.join(root, expectedMigration)).equals(fs.readFileSync(path.join(root, 'supabase/schema.sql')))) {
        throw new Error('Bootstrap und aktuelles Vollschema unterscheiden sich. Paket neu vorbereiten.');
    }
    const sourceFiles = collectFiles(root, 'supabase/functions');
    const packagedFiles = collectFiles(root, prefix + 'functions');
    if (JSON.stringify(packagedFiles.map(p => p.slice('.supabase-test/'.length))) !== JSON.stringify(sourceFiles)) {
        throw new Error('Dateiliste des Funktionspakets ist veraltet.');
    }
    for (const source of sourceFiles) {
        if (!fs.readFileSync(path.join(root, source)).equals(fs.readFileSync(path.join(root, '.supabase-test', source)))) {
            throw new Error('Veraltete Function im Testpaket: ' + source);
        }
    }
    const expectedConfig = 'project_id = "rezeptshare-isolated-test"\n\n' + fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
    if (fs.readFileSync(path.join(root, prefix, 'config.toml'), 'utf8') !== expectedConfig) {
        throw new Error('Abweichende Function-Konfiguration im Testpaket.');
    }
    const files = [expectedMigration, prefix + 'config.toml', ...packagedFiles];
    return Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
}
function makePlan(root, target, confirmation) {
    const ref = validateTarget(target, confirmation);
    const manifest = verifyPackage(root);
    manifest['scripts/supabase-test-audit.sql'] = hash(fs.readFileSync(path.join(root, 'scripts/supabase-test-audit.sql')));
    const base = ['--workdir', '.supabase-test'];
    const commands = {
        audit: [...base, 'db', 'query', `--remote=${ref}`, '--read-only', '--file', path.join(root, 'scripts/supabase-test-audit.sql')],
        dryRun: [...base, 'db', 'push', `--remote=${ref}`, '--dry-run', '--skip-vault'],
        migrate: [...base, 'db', 'push', `--remote=${ref}`, '--skip-vault'],
        deployImport: [...base, 'functions', 'deploy', 'rezept-importieren', `--remote=${ref}`, '--use-api', '--yes'],
        deploy: FUNCTIONS.map(name => [...base, 'functions', 'deploy', name, `--remote=${ref}`, '--use-api']),
        secret: [...base, 'secrets', 'set', `--remote=${ref}`, '--env-file', '/dev/stdin']
    };
    const plan = { projectRef: ref, projectName: target.projectName, manifest, commands };
    return { ...plan, planHash: hash(JSON.stringify(plan)) };
}
module.exports = { FUNCTIONS, TARGET_FILE, BLOCKED_PROJECTS, validateReference, validateTarget, readTarget, validatePublicConfig,
    readPublicConfig, readOfflineConfig, verifyPackage, makePlan };
