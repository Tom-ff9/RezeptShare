const TEST_PROJECT_REF = 'hmjtzcebgbkryucvkndu';
const CAPTCHA_SITE_KEY = '34a0447a-5f2e-45b4-93ca-2f22783a4392';

function buildPublicConfig({ projectRef, supabaseUrl, publishableKey, keyProjectRef }) {
    if (!/^[a-z]{20}$/.test(projectRef || '') || projectRef === TEST_PROJECT_REF) {
        throw new Error('Produktionsreferenz fehlt oder zeigt auf das gesperrte Testprojekt.');
    }
    if (keyProjectRef !== projectRef) throw new Error('Projektbindung des öffentlichen Keys muss separat bestätigt werden.');
    const expectedUrl = `https://${projectRef}.supabase.co`;
    if (supabaseUrl !== expectedUrl) throw new Error('Supabase-URL passt nicht zur bestätigten Produktionsreferenz.');
    if (typeof publishableKey !== 'string' || !publishableKey || /[\r\n]/.test(publishableKey)) {
        throw new Error('Öffentlicher Supabase-Publishable-Key fehlt.');
    }
    if (publishableKey.startsWith('sb_publishable_')) {
        if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey)) throw new Error('Publishable-Key-Format ungültig.');
    } else {
        let claims;
        try { claims = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()); }
        catch { throw new Error('Nur Publishable-Key oder projektgebundener anon-Key erlaubt.'); }
        if (publishableKey.split('.').length !== 3 || claims.role !== 'anon' || claims.ref !== projectRef) {
            throw new Error('Secret-/Service-Role-Key oder Key eines anderen Projekts ist unzulässig.');
        }
    }
    return Object.freeze({
        supabaseUrl,
        supabasePublishableKey: publishableKey,
        kiUrl: `${supabaseUrl}/functions/v1/ki-assistent`,
        kiPublishableKey: '',
        kiProgressUrl: `${supabaseUrl}/functions/v1/ki-fortschritt`
    });
}

function narrowCsp(html, projectRef) {
    if (!/^[a-z]{20}$/.test(projectRef || '') || projectRef === TEST_PROJECT_REF) {
        throw new Error('Unzulässige CSP-Projektreferenz.');
    }
    if (!html.includes('https://*.supabase.co') || !html.includes('wss://*.supabase.co')) {
        throw new Error('Unerwartete Pages-CSP; keine automatische Änderung vorgenommen.');
    }
    return html
        .replaceAll('https://*.supabase.co', `https://${projectRef}.supabase.co`)
        .replaceAll('wss://*.supabase.co', `wss://${projectRef}.supabase.co`);
}

module.exports = { TEST_PROJECT_REF, CAPTCHA_SITE_KEY, buildPublicConfig, narrowCsp };
