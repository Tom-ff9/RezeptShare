#!/usr/bin/env node
// Packages the existing importer and its shared modules without editing their sources.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOM_PROJECT_REF = 'gcncxupedhwieybpiupi';
const TEST_PROJECT_REF = 'hmjtzcebgbkryucvkndu';
const SOURCES = Object.freeze([
    ['supabase/functions/rezept-importieren/index.ts', 'supabase/functions/rezept-importieren/index.ts'],
    ['supabase/functions/_shared/http.ts', 'supabase/functions/_shared/http.ts'],
    ['supabase/functions/_shared/import-handler.mjs', 'supabase/functions/_shared/import-handler.mjs'],
    ['supabase/functions/_shared/import-format.mjs', 'supabase/functions/_shared/import-format.mjs'],
    ['docs/migrationen/kochbuchimport-produktiv.sql', 'migration/kochbuchimport-produktiv.sql'],
    ['docs/migrationen/kochbuchimport-audit-readonly.sql', 'migration/kochbuchimport-audit-readonly.sql']
]);

function deploymentReadme() {
    return `# RezeptShare – Supabase-Paket für Tom\n\n`+
        + `Zielprojekt: ${TOM_PROJECT_REF} (URL https://${TOM_PROJECT_REF}.supabase.co).\n`
        + `Gesperrtes Testprojekt: ${TEST_PROJECT_REF}. Dieses Paket enthält keine Zugangsdaten.\n\n`
        + `## Inhalt\n\n`
        + `- Die bestehende Function rezept-importieren, unverändert aus dem Release-Branch kopiert.\n`
        + `- Ausschließlich ihre benötigten gemeinsamen Module.\n`
        + `- Read-only Schemaaudit und additive Produktionsmigration (nicht angewendet).\n\n`
        + `## Vorbereitung und Deploy\n\n`
        + `1. Im Dashboard die Projekt-ID ${TOM_PROJECT_REF} und URL unabhängig bestätigen.\n`
        + `2. migration/kochbuchimport-audit-readonly.sql im SQL Editor ausführen; nur Schema-Metadaten zurückgeben lassen.\n`
        + `3. Migration nur anwenden, wenn private.konto_aktiv(uuid), auth.users und alle erwarteten Objekte fehlen/vorliegen wie dokumentiert, und Tom die Migration freigegeben hat.\n`
        + `4. OPENAI_API_KEY und OPENAI_IMPORT_MODEL ausschließlich im Tom-Projekt unter Edge Function Secrets einrichten. Nie in Browsercode/Git.\n`
        + `5. Aus diesem Verzeichnis deployen: supabase functions deploy rezept-importieren --project-ref ${TOM_PROJECT_REF} --use-api\n`
        + `6. Danach read-only Version prüfen und unauthentifiziert HTTP 401 erwarten.\n\n`
        + `## Warum nicht die Test-Function-URL\n\n`
        + `Supabase-Zugriffstoken sind an das jeweilige Projekt gebunden. rezept-importieren prüft jedes JWT mit auth.getUser() über die Umgebung, in der die Function deployed ist. Eine im Testprojekt deployte Function kann daher Toms Benutzer nicht dort authentifizieren; außerdem würde sie an dessen Testdatenbank und Secrets hängen. Derselbe Quellcode muss im Supabase-Projekt ${TOM_PROJECT_REF} ausgeführt werden.\n`;
}

async function createPackage(outputFile) {
    const out = path.resolve(outputFile);
    if (out === ROOT || out.startsWith(ROOT + path.sep) && !out.startsWith(path.join(ROOT, '.release-artifacts') + path.sep)) {
        throw new Error('Paketdatei darf nur außerhalb des Repositorys oder unter .release-artifacts/ angelegt werden.');
    }
    await fs.mkdir(path.dirname(out), { recursive: true });
    try { await fs.access(out); throw new Error('Paketdatei existiert bereits; sie wird nicht überschrieben.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'rezeptshare-tom-supabase-'));
    try {
        const hashes = [];
        for (const [source, target] of SOURCES) {
            const sourcePath = path.join(ROOT, source);
            const info = await fs.lstat(sourcePath);
            if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Keine normale Quelldatei: ${source}`);
            const bytes = await fs.readFile(sourcePath);
            const targetPath = path.join(stage, target);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, bytes, { flag: 'wx' });
            hashes.push(`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${target}`);
        }
        const config = `[functions.rezept-importieren]\nverify_jwt = false\n`;
        await fs.mkdir(path.join(stage, 'supabase'), { recursive: true });
        await fs.writeFile(path.join(stage, 'supabase/config.toml'), config, { flag: 'wx' });
        hashes.push(`${crypto.createHash('sha256').update(config).digest('hex')}  supabase/config.toml`);
        await fs.writeFile(path.join(stage, 'README-DEPLOY.md'), deploymentReadme(), { flag: 'wx' });
        hashes.sort();
        await fs.writeFile(path.join(stage, 'SHA256SUMS'), hashes.join('\n') + '\n', { flag: 'wx' });
        const tar = spawnSync('tar', ['-czf', out, '-C', stage, '.'], { encoding: 'utf8' });
        if (tar.error || tar.status !== 0) throw new Error(tar.error?.message || tar.stderr || 'tar konnte das Releasepaket nicht erstellen.');
        return { path: out, entries: SOURCES.length + 3, projectRef: TOM_PROJECT_REF };
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    let output = path.join(ROOT, '.release-artifacts', `rezeptshare-tom-supabase-${require('node:child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()}.tar.gz`);
    if (args.length) {
        if (args.length !== 2 || args[0] !== '--out') throw new Error('Verwendung: node scripts/package-tom-supabase.cjs [--out DATEI.tar.gz]');
        output = path.resolve(args[1]);
    }
    createPackage(output).then(result => console.log(`Tom-Supabase-Paket erstellt: ${result.path} (${result.entries} Dateien, Ziel ${result.projectRef}).`))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { SOURCES, TEST_PROJECT_REF, TOM_PROJECT_REF, createPackage, deploymentReadme };
