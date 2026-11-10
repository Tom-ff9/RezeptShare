const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(root, 'scripts/build-pages.cjs')]);
const dist = path.join(root, 'dist');
const files = fs.readdirSync(dist, { recursive: true }).filter(file => fs.statSync(path.join(dist, file)).isFile()).sort();
assert.deepEqual(files, ['.nojekyll','assets/profil-standard.svg','manifest.webmanifest','assets/icons/favicon-32.png','assets/icons/apple-touch-icon.png','assets/icons/icon-192.png','assets/icons/icon-512.png','captcha.js','funktionen.js','gruppen.js','rezeptgruppen.js','index.html','konfiguration.js','script.js','style.css'].sort());
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (ref.startsWith('https:') || ref === './') continue;
    const url = new URL(ref, 'https://Tom-ff9.github.io/RezeptShare/');
    assert(url.pathname.startsWith('/RezeptShare/'));
    assert(fs.existsSync(path.join(dist, url.pathname.slice('/RezeptShare/'.length))), ref);
}
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
for (const icon of manifest.icons) {
    const data = fs.readFileSync(path.join(dist, icon.src));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.sizes, `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`);
}
assert(!html.includes('bestaetigungs-email-formular'));
console.log('Pages-Test erfolgreich: freigegebene Dateien und Ressourcen unter /RezeptShare/.');
