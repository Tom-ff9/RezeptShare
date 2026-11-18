// Exercise the real request handler with a fake socket layer: no local port needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const realRequire = require;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rezeptshare-server-'));
const ref = 'a'.repeat(20), other = 'b'.repeat(20);
const config = r => `window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:'https://${r}.supabase.co',supabasePublishableKey:'sb_publishable_synthetic',kiUrl:'',kiPublishableKey:'',kiProgressUrl:''};`;
async function main() {
    try {
        fs.mkdirSync(path.join(temp, '.supabase-test'), { recursive: true });
        const targetFile = path.join(temp, '.supabase-test/target.json');
        const target = { projectRef: ref, projectName: 'RezeptShare-Test', environment: 'test', confirmedByUser: true };
        fs.writeFileSync(targetFile, JSON.stringify(target));
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(ref));
        fs.writeFileSync(path.join(temp, 'index.html'), '<h1>Synthetic test</h1>');
        fs.writeFileSync(path.join(temp, 'rezept-anzeige.js'), 'window.rezeptTextAufteilen = function () {};');
        let handler;
        const context = { __dirname: temp, URL, Buffer, console: { log() {}, error() {} },
            process: { env: { REZEPTSHARE_TEST_PROJECT_REF: ref } },
            require(name) {
                if (name === 'node:http') return { createServer(fn) { handler = fn; return { listen(port, host, ready) { assert.equal(host, '127.0.0.1'); ready(); } }; } };
                if (name.startsWith('./scripts/')) return realRequire('../' + name.slice(2));
                return realRequire(name);
            }
        };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
        async function request(url) {
            const result = {};
            await handler({ url }, { writeHead(status, headers) { Object.assign(result, { status, headers }); }, end(body) { result.body = String(body); } });
            return result;
        }
        const page = await request('/');
        assert.equal(page.status, 200);
        assert.equal((await request('/rezept-anzeige.js')).status, 200, 'Die freigegebene Anzeigeformatierung muss über den geschützten Testserver verfügbar sein.');
        assert.ok(page.headers['Content-Security-Policy'].includes(`https://${ref}.supabase.co`));
        assert.ok(page.headers['Content-Security-Policy'].includes(`wss://${ref}.supabase.co`));
        assert.ok(!page.headers['Content-Security-Policy'].includes('*.supabase.co'));
        const settings = await request('/konfiguration.js');
        assert.equal(settings.status, 200);
        assert.equal(settings.headers['Cache-Control'], 'no-store');
        assert.ok(settings.body.startsWith('window.REZEPT_SHARE_KONFIGURATION=Object.freeze('));
        // Auch Kommentare oder Code neben dem Konfigurationsobjekt dürfen nicht ausgeliefert werden.
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(ref) + '\n// SYNTHETIC-NOT-FOR-BROWSER');
        assert.ok(!(await request('/konfiguration.js')).body.includes('SYNTHETIC-NOT-FOR-BROWSER'));
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(ref).replace("kiUrl:''", "OPENAI_API_KEY:'SYNTHETIC-NOT-A-SECRET',kiUrl:''"));
        assert.equal((await request('/konfiguration.js')).status, 500);
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(other));
        const swapped = await request('/konfiguration.js');
        assert.equal(swapped.status, 500);
        assert.ok(!swapped.body.includes(other));
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(ref));
        fs.writeFileSync(targetFile, JSON.stringify({ ...target, confirmedByUser: false }));
        assert.equal((await request('/')).status, 500, 'Ziel bei jeder Anfrage erneut prüfen');
        fs.writeFileSync(targetFile, JSON.stringify(target));
        assert.equal((await request('/.supabase-test/target.json')).status, 404);
        assert.equal((await request('/.env')).status, 404);
        // Normaler npm-start-Modus darf vorhandene Live-Konfiguration nicht still laden.
        context.process.env = {};
        assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), { ...context }), /start:test/);
        fs.unlinkSync(path.join(temp, 'konfiguration.lokal.js'));
        fs.writeFileSync(path.join(temp, 'konfiguration.js'), 'window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:"",supabasePublishableKey:"",kiUrl:"",kiPublishableKey:"",kiProgressUrl:""};');
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), { ...context });
        const offline = await request('/');
        assert.equal(offline.status, 200);
        assert.ok(!offline.headers['Content-Security-Policy'].includes('.supabase.co'));
        fs.writeFileSync(path.join(temp, 'konfiguration.js'), config(other));
        assert.equal((await request('/konfiguration.js')).status, 500);
        // Die Test-Harness darf Live-Konfiguration ignorieren, aber niemals ausliefern/erreichen.
        fs.writeFileSync(path.join(temp, 'konfiguration.js'), 'window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:"",supabasePublishableKey:"",kiUrl:"",kiPublishableKey:"",kiProgressUrl:""};');
        fs.writeFileSync(path.join(temp, 'konfiguration.lokal.js'), config(other));
        context.process.env = { REZEPTSHARE_OFFLINE_TEST:'1', REZEPTSHARE_TEST_PROJECT_REF:other };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), { ...context });
        const isolated = await request('/konfiguration.js');
        assert.equal(isolated.status, 200);
        assert.ok(!isolated.body.includes(other));
        assert.ok(!isolated.headers['Content-Security-Policy'].includes('.supabase.co'));
        console.log('Geschützter Testserver geprüft: exakte Supabase-CSP, erneute Konfigurationsprüfung, keine Secret-/Zieldateien ausgeliefert; kein Socket verwendet.');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
