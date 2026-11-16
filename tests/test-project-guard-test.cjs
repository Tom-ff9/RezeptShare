const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateTarget, validatePublicConfig, makePlan, BLOCKED_PROJECTS, readTarget } = require('../scripts/supabase-test-guard.cjs');

const ref = 'a'.repeat(20), other = 'b'.repeat(20);
const target = { projectRef: ref, projectName: 'RezeptShare-Test', environment: 'test', confirmedByUser: true };
assert.equal(validateTarget(target, ref), ref);
for (const invalid of [{ ...target, projectRef: other }, { ...target, confirmedByUser: false },
    { ...target, projectName: 'RezeptShare' }, { ...target, environment: 'production' },
    { ...target, OPENAI_API_KEY: 'synthetic' }, { ...target, projectRef: 'https://example.invalid' }]) {
    assert.throws(() => validateTarget(invalid, ref));
}
const publicConfig = { supabaseUrl: `https://${ref}.supabase.co`, supabasePublishableKey: 'sb_publishable_synthetic',
    kiUrl: '', kiPublishableKey: '', kiProgressUrl: '' };
assert.deepEqual(validatePublicConfig(publicConfig, ref), publicConfig);
for (const production of BLOCKED_PROJECTS) {
    assert.throws(() => validateTarget({ ...target, projectRef: production }, production), /gesperrt/);
    assert.throws(() => validatePublicConfig({ ...publicConfig, supabaseUrl: `https://${production}.supabase.co` }, production), /gesperrt/);
}
for (const invalid of [{ ...publicConfig, supabaseUrl: `https://${other}.supabase.co` },
    { ...publicConfig, supabaseUrl: `https://${ref}.supabase.co@evil.invalid` },
    { ...publicConfig, supabasePublishableKey: 'sb_secret_synthetic' },
    { ...publicConfig, kiUrl: 'https://unrelated.invalid' },
    { ...publicConfig, kiProgressUrl: `https://${ref}.supabase.co/functions/v1/ki-fortschritt` },
    { ...publicConfig, OPENAI_API_KEY: 'synthetic-not-a-secret' },
    { ...publicConfig, supabaseServiceRoleKey: 'synthetic-not-a-secret' }]) assert.throws(() => validatePublicConfig(invalid, ref));
function jwt(claims) { return 'synthetic.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.unsigned'; }
assert.doesNotThrow(() => validatePublicConfig({ ...publicConfig, supabasePublishableKey: jwt({ ref, role: 'anon' }) }, ref));
assert.throws(() => validatePublicConfig({ ...publicConfig, supabasePublishableKey: jwt({ ref, role: 'service_role' }) }, ref));
assert.throws(() => validatePublicConfig({ ...publicConfig, supabasePublishableKey: jwt({ ref: other, role: 'anon' }) }, ref));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rezeptshare-target-'));
try {
    fs.mkdirSync(path.join(temp, 'supabase/functions/rezept-importieren'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'supabase/functions/rezept-importieren/index.ts'), '// synthetic');
    fs.writeFileSync(path.join(temp, 'supabase/schema.sql'), '-- synthetic schema');
    fs.writeFileSync(path.join(temp, 'supabase/config.toml'), '[functions.rezept-importieren]\nverify_jwt=false\n');
    fs.mkdirSync(path.join(temp, '.supabase-test/supabase/migrations'), { recursive: true });
    fs.cpSync(path.join(temp, 'supabase/functions'), path.join(temp, '.supabase-test/supabase/functions'), { recursive: true });
    fs.copyFileSync(path.join(temp, 'supabase/schema.sql'), path.join(temp, '.supabase-test/supabase/migrations/202611150001_test_bootstrap.sql'));
    fs.writeFileSync(path.join(temp, '.supabase-test/supabase/config.toml'), 'project_id = "rezeptshare-isolated-test"\n\n' + fs.readFileSync(path.join(temp, 'supabase/config.toml')));
    fs.writeFileSync(path.join(temp, '.supabase-test/target.json'), '{invalid: "SYNTHETIC-PRIVATE-VALUE"');
    assert.throws(() => readTarget(temp, ref), error => !error.message.includes('SYNTHETIC-PRIVATE-VALUE'));
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.writeFileSync(path.join(temp, 'scripts/supabase-test-audit.sql'), 'select 1;');
    const plan = makePlan(temp, target, ref);
    for (const command of [plan.commands.audit, plan.commands.dryRun, plan.commands.migrate, plan.commands.secret, ...plan.commands.deploy]) {
        assert.ok(command.includes('--remote=' + ref), 'Jeder externe Befehl hat ein explizites Ziel');
        assert.ok(!command.includes('--prune'));
    }
    assert.ok(plan.commands.dryRun.includes('--skip-vault'));
    assert.ok(plan.commands.migrate.includes('--skip-vault'));
    assert.equal(plan.commands.deploy.length, 5);
    assert.ok(!plan.commands.deploy.some(c => c.includes('ki-fortschritt')));
    assert.ok(!JSON.stringify(plan).includes('OPENAI_API_KEY='));
    assert.throws(() => makePlan(temp, target, other));
    fs.writeFileSync(path.join(temp, 'scripts/supabase-test-audit.sql'), 'select current_database();');
    assert.notEqual(makePlan(temp, target, ref).planHash, plan.planHash, 'Audit-SQL muss an die Freigabe gebunden sein');
    const bootstrap = path.join(temp, '.supabase-test/supabase/migrations/202611150001_test_bootstrap.sql');
    fs.appendFileSync(bootstrap, '\n-- changed after preparation');
    assert.throws(() => makePlan(temp, target, ref), /Bootstrap/);
    fs.copyFileSync(path.join(temp, 'supabase/schema.sql'), bootstrap);
    fs.writeFileSync(path.join(temp, '.supabase-test/supabase/migrations/unexpected.sql'), '-- no');
    assert.throws(() => makePlan(temp, target, ref), /ausschließlich/);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('Testprojekt-Schutz geprüft: bestätigte Referenz, explizite Remote-Ziele, aktuelle Paketdateien, kein Secret im Plan und keine Fremd-KI-Endpunkte.');
