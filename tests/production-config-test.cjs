const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildPublicConfig, narrowCsp, TEST_PROJECT_REF, CAPTCHA_SITE_KEY } = require('../scripts/production-pages-config.cjs');

const ref = 'z'.repeat(20);
const key = 'sb_publishable_' + 'x'.repeat(32);
const config = buildPublicConfig({ projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, publishableKey: key, keyProjectRef: ref });
assert.equal(config.supabaseUrl, `https://${ref}.supabase.co`);
assert.equal(config.kiUrl, `https://${ref}.supabase.co/functions/v1/ki-assistent`);
assert.equal(config.kiProgressUrl, `https://${ref}.supabase.co/functions/v1/ki-fortschritt`);
assert.equal(config.kiPublishableKey, '');
for (const invalid of [
    { projectRef: TEST_PROJECT_REF, supabaseUrl: `https://${TEST_PROJECT_REF}.supabase.co`, publishableKey: key, keyProjectRef: TEST_PROJECT_REF },
    { projectRef: ref, supabaseUrl: 'https://other.supabase.co', publishableKey: key, keyProjectRef: ref },
    { projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, publishableKey: key, keyProjectRef: 'y'.repeat(20) },
    { projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, publishableKey: 'sb_secret_' + 'x'.repeat(32), keyProjectRef: ref }
]) assert.throws(() => buildPublicConfig(invalid));

const anon = (role, project) => ['header', Buffer.from(JSON.stringify({ role, ref: project })).toString('base64url'), 'signature'].join('.');
assert.equal(buildPublicConfig({ projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, publishableKey: anon('anon', ref), keyProjectRef: ref }).supabaseUrl, `https://${ref}.supabase.co`);
assert.throws(() => buildPublicConfig({ projectRef: ref, supabaseUrl: `https://${ref}.supabase.co`, publishableKey: anon('service_role', ref), keyProjectRef: ref }));

const sourceHtml = fs.readFileSync('index.html', 'utf8');
assert.ok(sourceHtml.includes(`data-sitekey="${CAPTCHA_SITE_KEY}"`));
const html = narrowCsp(sourceHtml, ref);
assert.ok(html.includes(`https://${ref}.supabase.co`));
assert.ok(html.includes(`wss://${ref}.supabase.co`));
assert.ok(!html.includes('*.supabase.co'));
assert.throws(() => narrowCsp(sourceHtml, TEST_PROJECT_REF));
assert.throws(() => narrowCsp('<meta>', ref));
console.log('Produktionskonfiguration geprüft: Testziel gesperrt, URL/Key projektgebunden, keine Secret-Keys, Edge-Endpunkte und CSP eng auf ein Projekt begrenzt.');
