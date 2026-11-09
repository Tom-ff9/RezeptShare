const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(id = '') {
    return { id, hidden: false, value: '', textContent: '', disabled: false, open: false,
        dataset: {}, handlers: {}, classList: { add() {}, remove() {} },
        addEventListener(name, fn) { this.handlers[name] = fn; },
        querySelector() { return { dataset: { sitekey: 'public-test-key' }, focus() {} }; },
        querySelectorAll() { return []; },
        focus() {}, showModal() { this.open = true; }, close() { this.open = false; }
    };
}
(async () => {
    const nodes = new Map();
    const get = selector => { if (!nodes.has(selector)) nodes.set(selector, element(selector.slice(1))); return nodes.get(selector); };
    let resets = [], token = 'first-token', options, apiCalls = 0;
    const window = { location: { pathname: '/rezept-share/', origin: 'https://example.test', search: '?einladung=invite&other=no', hash: '#access_token=secret' } };
    window.hcaptcha = { render(_box, opts) { options = opts; return 0; }, getResponse() { return token; }, reset(id) { resets.push(id); token = ''; } };
    const context = vm.createContext({ window, document: { querySelector: get, querySelectorAll: () => [] },
        URL, URLSearchParams, Date, Error, Set, Map, console,
        anmeldeFormular: get('#anmelde-formular'), registrierFormular: get('#registrier-formular'), authMeldung: get('#auth-meldung'),
        aktiverBenutzer: null, benutzerAusSitzungLaden: async user => user, angemeldeteAppLaden: async () => {}, fehlerText: e => e.message,
        supabaseClient: { auth: {
            signInWithPassword: async () => { apiCalls++; return { error: { message: 'Falsches Passwort' } }; },
            signUp: async () => ({ data: { session: null } }),
            resend: async () => ({ error: null })
        } }
    });
    vm.runInContext(fs.readFileSync('captcha.js', 'utf8'), context);
    assert.throws(() => window.rezeptCaptcha.entnehmen(context.anmeldeFormular), /geladen/);
    window.captchaInitialisieren();
    window.rezeptCaptcha.aktivieren(context.anmeldeFormular);
    assert.equal(window.rezeptCaptcha.entnehmen(context.anmeldeFormular), 'first-token');
    assert.throws(() => window.rezeptCaptcha.entnehmen(context.anmeldeFormular), /erneut/);
    options['expired-callback']();
    assert.deepEqual(resets, [0]); // Widget-ID 0 ist gültig.
    const source = fs.readFileSync('script.js', 'utf8');
    vm.runInContext(source.slice(source.indexOf('const authDialog ='), source.indexOf('abmeldenButton.addEventListener')), context);
    assert.equal(context.authRedirectUrl(), 'https://example.test/rezept-share/?einladung=invite');
    context.authFormularOeffnen('anmelden');
    assert.equal(context.anmeldeFormular.hidden, false);
    assert.equal(context.registrierFormular.hidden, true);
    get('#anmelde-email').value = 'person@example.test';
    get('#anmelde-passwort').value = 'password';
    token = 'login-1';
    await context.anmeldeFormular.handlers.submit({ preventDefault() {} });
    assert.equal(apiCalls, 1);
    assert.equal(token, '');
    assert.equal(context.authMeldung.textContent, 'Falsches Passwort');
    await context.anmeldeFormular.handlers.submit({ preventDefault() {} });
    assert.equal(apiCalls, 1); // Ohne frisches CAPTCHA keine zweite Anfrage.
    token = 'login-2';
    await context.anmeldeFormular.handlers.submit({ preventDefault() {} });
    assert.equal(apiCalls, 2);
    let resolve;
    context.supabaseClient.auth.signInWithPassword = () => { apiCalls++; return new Promise(r => { resolve = r; }); };
    token = 'login-3';
    const running = context.anmeldeFormular.handlers.submit({ preventDefault() {} });
    await context.anmeldeFormular.handlers.submit({ preventDefault() {} });
    assert.equal(apiCalls, 3); // Doppelklick ist gesperrt.
    resolve({ error: { code: 'email_not_confirmed' } });
    await running;
    assert.match(context.authMeldung.textContent, /bestätige zuerst/);
    context.authFormularOeffnen('registrieren');
    get('#registrier-name').value = 'Test'; get('#registrier-email').value = 'person@example.test'; get('#registrier-passwort').value = 'password';
    token = 'signup-1';
    await context.registrierFormular.handlers.submit({ preventDefault() {} });
    assert.equal(get('#bestaetigungs-email-formular').hidden, false);
    assert.equal(get('#bestaetigungs-email').value, 'person@example.test');
    assert.equal(get('#registrier-passwort').value, '');
    vm.runInContext('erneutSendenAb = 0', context);
    let sent;
    context.supabaseClient.auth.resend = async args => { sent = args; return {}; };
    token = 'resend-1';
    await get('#bestaetigungs-email-formular').handlers.submit({ preventDefault() {} });
    assert.equal(sent.options.captchaToken, 'resend-1');
    assert.equal(sent.type, 'signup');
    assert.equal(token, '');
    await get('#bestaetigungs-email-formular').handlers.submit({ preventDefault() {} });
    assert.match(context.authMeldung.textContent, /Sekunden/);
    console.log('Auth-Tests erfolgreich: Widget 0, Ablauf, Einmal-Token, falsches Passwort/erneuter Versuch, Doppelklick, Formularwechsel, Bestätigung, erneuter Versand und sichere Redirect-URL.');
})().catch(error => { console.error(error); process.exitCode = 1; });
