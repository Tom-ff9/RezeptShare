// Finalizes an already built Pages artifact using user-supplied public values.
// This writes only ignored dist/ files; it never deploys or accesses Supabase.
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildPublicConfig, narrowCsp, CAPTCHA_SITE_KEY } = require('./production-pages-config.cjs');
const root = path.resolve(__dirname, '..');

async function main() {
    const [flag, confirmation, ...extra] = process.argv.slice(2);
    if (flag !== '--confirm-ref' || extra.length || !confirmation) {
        throw new Error('Verwendung: node scripts/finalize-production-pages.cjs --confirm-ref PRODUKTIONSREFERENZ');
    }
    const config = buildPublicConfig({
        projectRef: confirmation,
        supabaseUrl: process.env.REZEPTSHARE_PROD_SUPABASE_URL || '',
        publishableKey: process.env.REZEPTSHARE_PROD_PUBLISHABLE_KEY || '',
        keyProjectRef: process.env.REZEPTSHARE_PROD_KEY_PROJECT_REF || ''
    });
    const dist = path.join(root, 'dist');
    const info = await fs.lstat(dist).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('Pages-Build fehlt oder ist kein normales Verzeichnis. Zuerst npm run build ausführen.');
    const htmlPath = path.join(dist, 'index.html');
    const configPath = path.join(dist, 'konfiguration.js');
    const htmlInfo = await fs.lstat(htmlPath);
    if (!htmlInfo.isFile() || htmlInfo.isSymbolicLink()) throw new Error('Pages-HTML ist keine normale Datei.');
    const html = await fs.readFile(htmlPath, 'utf8');
    if (!html.includes(`data-sitekey="${CAPTCHA_SITE_KEY}"`)) throw new Error('Der bestätigte hCaptcha-Site-Key fehlt im Pages-Artefakt.');
    const configInfo = await fs.lstat(configPath);
    if (!configInfo.isFile() || configInfo.isSymbolicLink()) throw new Error('Pages-Konfiguration ist keine normale Datei.');
    const narrowed = narrowCsp(html, confirmation);
    const generated = 'window.REZEPT_SHARE_KONFIGURATION=Object.freeze(' + JSON.stringify(config) + ');';
    await fs.writeFile(configPath, generated, { mode: 0o644 });
    await fs.writeFile(htmlPath, narrowed);
    console.log(`Pages-Konfiguration für bestätigte Projekt-ID ${confirmation} vorbereitet. Kein Deployment ausgeführt.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
