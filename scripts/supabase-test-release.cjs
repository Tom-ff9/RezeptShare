// No default project. plan is offline; each other action checks the approved target again.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readTarget, makePlan } = require('./supabase-test-guard.cjs');
const root = path.resolve(__dirname, '..');

function main() {
    const [action = 'plan', ...args] = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!['--confirm-ref', '--approved-plan'].includes(args[i]) || !args[i + 1]) throw new Error('Unbekanntes oder unvollständiges Argument.');
        options[args[i]] = args[i + 1];
    }
    const confirmation = options['--confirm-ref'];
    let target = readTarget(root, confirmation);
    let plan = makePlan(root, target, confirmation);
    if (action === 'plan') { console.log(JSON.stringify(plan, null, 2)); return; }
    if (!['audit', 'dryRun', 'migrate', 'deployImport', 'deploy', 'secret'].includes(action)) throw new Error('Unbekannte Testaktion.');
    if (['migrate', 'deployImport', 'deploy', 'secret'].includes(action) && options['--approved-plan'] !== plan.planHash) {
        throw new Error('Für diese Änderung muss der aktuelle Plan ausdrücklich freigegeben sein (--approved-plan).');
    }
    let input;
    if (action === 'secret') {
        const key = process.env.OPENAI_API_KEY;
        if (!key || /[\r\n]/.test(key)) throw new Error('OPENAI_API_KEY fehlt in der Prozessumgebung oder ist ungültig.');
        // stdin only: no secret file, command argument, browser config or Git entry.
        input = 'OPENAI_API_KEY=' + key + '\nOPENAI_IMPORT_MODEL=gpt-4.1-mini\n';
    }
    for (const command of action === 'deploy' ? plan.commands.deploy : [plan.commands[action]]) {
        target = readTarget(root, confirmation);
        const current = makePlan(root, target, confirmation);
        if (current.planHash !== plan.planHash) throw new Error('Ziel oder Deploymentpaket wurde seit der Prüfung verändert.');
        console.log('Geprüftes Testziel: ' + current.projectRef + ' | Aktion: ' + action);
        const env = { ...process.env };
        for (const key of ['OPENAI_API_KEY', 'SUPABASE_YES', 'SUPABASE_SERVICE_ROLE_KEY',
            'SUPABASE_DB_URL', 'DATABASE_URL', 'SUPABASE_PROJECT_REF', 'SUPABASE_PROJECT_ID',
            'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) delete env[key];
        const result = spawnSync('supabase', command, { cwd: root, env,
            input, encoding: 'utf8', stdio: action === 'secret' ? ['pipe', 'pipe', 'pipe'] : 'inherit' });
        if (result.error) throw new Error('Supabase-CLI konnte nicht gestartet werden.');
        if (result.status !== 0) throw new Error('Supabase-Testaktion fehlgeschlagen; keine automatische Wiederholung.');
        if (action === 'secret') console.log('OpenAI-Secret im bestätigten Testprojekt gesetzt; Schlüsselwert nicht ausgegeben.');
    }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
