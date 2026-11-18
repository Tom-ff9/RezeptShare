// Starts the existing integrated app only after matching the confirmed test target.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readTarget, readPublicConfig, makePlan } = require('./supabase-test-guard.cjs');
const root = path.resolve(__dirname, '..');
try {
    const [flag, confirmation, ...extra] = process.argv.slice(2);
    if (flag !== '--confirm-ref' || extra.length) throw new Error('--confirm-ref TESTREFERENZ erforderlich.');
    const target = readTarget(root, confirmation);
    makePlan(root, target, confirmation);
    readPublicConfig(root, target.projectRef);
    const env = { ...process.env, REZEPTSHARE_TEST_PROJECT_REF: target.projectRef };
    delete env.OPENAI_API_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.SUPABASE_ACCESS_TOKEN;
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('Lokaler Testserver konnte nicht gestartet werden.'); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
