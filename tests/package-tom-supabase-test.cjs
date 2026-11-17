const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SOURCES, TEST_PROJECT_REF, TOM_PROJECT_REF, createPackage } = require('../scripts/package-tom-supabase.cjs');

async function main() {
assert.equal(TOM_PROJECT_REF, 'gcncxupedhwieybpiupi');
assert.equal(TEST_PROJECT_REF, 'hmjtzcebgbkryucvkndu');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'rezeptshare-package-test-'));
try {
    const archive = path.join(temp, 'release.tar.gz');
    const created = await createPackage(archive);
    assert.equal(created.entries, SOURCES.length + 3);
    const extraction = path.join(temp, 'unpacked');
    await fs.mkdir(extraction);
    const untar = spawnSync('tar', ['-xzf', archive, '-C', extraction], { encoding: 'utf8' });
    assert.equal(untar.status, 0, untar.stderr);
    const packed = [];
    async function walk(dir, base='') {
        for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
            const relative = path.posix.join(base, entry.name);
            if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
            else packed.push(relative);
        }
    }
    await walk(extraction);
    assert.equal(packed.length, created.entries);
    for (const [source,target] of SOURCES) {
        assert.ok(packed.includes(target));
        assert.deepEqual(await fs.readFile(path.join(extraction,target)), await fs.readFile(path.resolve(__dirname,'..',source)), `Paket enthält exakt ${source}`);
    }
    const config = await fs.readFile(path.join(extraction,'supabase/config.toml'),'utf8');
    assert.match(config,/\[functions\.rezept-importieren\][\s\S]*verify_jwt = false/);
    assert.doesNotMatch(packed.join('\n'),/ki-assistent|rezept-speichern|konfiguration\.lokal|target\.json|\.env/);
    const readme = await fs.readFile(path.join(extraction,'README-DEPLOY.md'),'utf8');
    assert.match(readme,/gcncxupedhwieybpiupi/);
    assert.match(readme,/Supabase-Zugriffstoken sind an das jeweilige Projekt gebunden/);
    assert.doesNotMatch(readme,/sk-[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}/);
    await assert.rejects(createPackage(archive),/existiert bereits/);
    await assert.rejects(createPackage(path.resolve(__dirname,'../dist/accidentally-public.tar.gz')),/\.release-artifacts/);
} finally { await fs.rm(temp,{recursive:true,force:true}); }
console.log('Tom-Supabase-Paket geprüft: nur bestehende Import-Function/Abhängigkeiten, SQL-Audit/Migration, Testziel gesperrt, keine lokalen Secrets.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
