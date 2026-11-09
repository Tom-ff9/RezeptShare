const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['index.html', 'style.css', 'konfiguration.js', 'captcha.js', 'script.js', 'funktionen.js', 'gruppen.js', 'assets/profil-standard.svg'];
(async () => {
    const out = path.join(root, 'dist');
    await fs.rm(out, { recursive: true, force: true });
    for (const file of files) {
        const source = path.join(root, file);
        if (!(await fs.lstat(source)).isFile()) throw new Error('Keine normale Datei: ' + file);
        await fs.mkdir(path.dirname(path.join(out, file)), { recursive: true });
        await fs.copyFile(source, path.join(out, file));
    }
    await fs.writeFile(path.join(out, '.nojekyll'), '');
    console.log('Pages-Artefakt erstellt: ' + files.length + ' freigegebene Dateien und .nojekyll.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
