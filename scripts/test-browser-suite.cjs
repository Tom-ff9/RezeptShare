const { spawn } = require('node:child_process');
const port = process.env.TEST_PORT || '3190';
const url = 'http://127.0.0.1:' + port;
async function main() {
    const server = spawn(process.execPath, ['server.js'], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, PORT: port, REZEPTSHARE_OFFLINE_TEST: '1' }, stdio: 'inherit' });
    let stopped = false;
    server.on('exit', () => { stopped = true; });
    try {
        for (let i = 0; ; i++) {
            if (stopped || i >= 40) throw new Error('Testserver nicht gestartet.');
            try { if ((await fetch(url)).ok) break; } catch { /* Serverstart abwarten. */ }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        for (const file of ['browser-test.cjs','rezeptgruppen-browser-test.cjs','auth-browser-test.cjs','import-browser-test.cjs','integration-browser-test.cjs','import-fixture-browser-test.cjs']) {
            await new Promise((resolve, reject) => {
                const test = spawn(process.execPath, ['tests/' + file], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, TEST_URL: url }, stdio: 'inherit' });
                test.on('error', reject);
                test.on('exit', code => code === 0 ? resolve() : reject(new Error(file + ' fehlgeschlagen: ' + code)));
            });
        }
    } finally { server.kill('SIGTERM'); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
