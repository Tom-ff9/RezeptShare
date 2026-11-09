const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(root, 'scripts/build-pages.cjs')]);
const dist = path.join(root, 'dist');
const files = fs.readdirSync(dist, { recursive: true }).filter(file => fs.statSync(path.join(dist, file)).isFile()).sort();
assert.deepEqual(files, ['.nojekyll','assets/profil-standard.svg','captcha.js','funktionen.js','gruppen.js','index.html','konfiguration.js','script.js','style.css'].sort());
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (ref.startsWith('https:') || ref === './') continue;
    const url = new URL(ref, 'https://Tom-ff9.github.io/RezeptShare/');
    assert(url.pathname.startsWith('/RezeptShare/'));
    assert(fs.existsSync(path.join(dist, url.pathname.slice('/RezeptShare/'.length))), ref);
}
assert(!html.includes('bestaetigungs-email-formular'));
console.log('Pages-Test erfolgreich: freigegebene Dateien und Ressourcen unter /RezeptShare/.');
