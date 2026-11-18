const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");

const port = Number(process.env.PORT || 3000);
const projektOrdner = __dirname;
// Automatisierte Tests ignorieren lokale Live-Werte vollständig und erhalten keine Supabase-CSP-Freigabe.
const offlineTest = process.env.REZEPTSHARE_OFFLINE_TEST === '1';
const testProjektRef = offlineTest ? undefined : process.env.REZEPTSHARE_TEST_PROJECT_REF;
const { readTarget, readPublicConfig, readOfflineConfig } = require('./scripts/supabase-test-guard.cjs');
function laufzeitKonfiguration() {
    if (testProjektRef) {
        readTarget(projektOrdner, testProjektRef);
        const config = readPublicConfig(projektOrdner, testProjektRef);
        // Der Mac-Studio-Assistent wird im lokalen Test ausschließlich über
        // diesen gleich-origin Loopback-Adapter angesprochen. In Dateien bleibt
        // der Endpunkt deaktiviert; die bestehende Testzielprüfung gilt weiter.
        return Object.freeze({ ...config, kiUrl: '/__local/ki-assistent', kiProgressUrl: '/__local/ki-fortschritt' });
    }
    return readOfflineConfig(projektOrdner, { ignoreLocal: offlineTest });
}
// Auch npm start ist offline, solange kein bestätigtes Testziel angegeben wurde.
laufzeitKonfiguration();

// Der lokale Server liefert nur die statischen Dateien aus. Alle dauerhaften
// Daten, Anmeldungen und Bilder werden von Supabase verwaltet.
const statischeDateien = {
    "/kochbuch-import.js": ["kochbuch-import.js", "text/javascript; charset=utf-8"],
    "/uuid.js": ["uuid.js", "text/javascript; charset=utf-8"],
    "/rezept-anzeige.js": ["rezept-anzeige.js", "text/javascript; charset=utf-8"],
    "/import-format.mjs": ["supabase/functions/_shared/import-format.mjs", "text/javascript; charset=utf-8"],
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/style.css": ["style.css", "text/css; charset=utf-8"],
    "/konfiguration.js": ["konfiguration.js", "text/javascript; charset=utf-8"],
    "/rezeptgruppen.js": ["rezeptgruppen.js", "text/javascript; charset=utf-8"],
    "/gruppen.js": ["gruppen.js", "text/javascript; charset=utf-8"],
    "/funktionen.js": ["funktionen.js", "text/javascript; charset=utf-8"],
    "/assets/profil-standard.svg": ["assets/profil-standard.svg", "image/svg+xml"],
    "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
    "/assets/icons/favicon-32.png": ["assets/icons/favicon-32.png", "image/png"],
    "/assets/icons/apple-touch-icon.png": ["assets/icons/apple-touch-icon.png", "image/png"],
    "/assets/icons/icon-192.png": ["assets/icons/icon-192.png", "image/png"],
    "/assets/icons/icon-512.png": ["assets/icons/icon-512.png", "image/png"],
	"/captcha.js": ["captcha.js", "text/javascript; charset=utf-8"],
	"/script.js": ["script.js", "text/javascript; charset=utf-8"],
	"/ki-assistent.js": ["ki-assistent.js", "text/javascript; charset=utf-8"],
    "/ki-rezept-v2.js": ["ki-rezept-v2.js", "text/javascript; charset=utf-8"]
};

const KI_LOCAL_API = 'http://127.0.0.1:8000';
const MAX_KI_BODY = 50000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function lokaleBrowserOrigin(request, origin) {
    if (!origin) return true;
    const host = request.headers.host || '';
    if (!host || origin !== `http://${host}`) return false;
    const hostname = host.replace(/:\d+$/, '').toLowerCase();
    return ['127.0.0.1', 'localhost', 'rezeptshare.test.example.com'].includes(hostname);
}

function json(response, status, value) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(value));
}

async function leseBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_KI_BODY) throw Object.assign(new Error('Anfrage zu groß.'), { status: 413 });
        chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 }); }
}

async function pruefeTestSitzung(request, response, config) {
    const authorization = request.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) { json(response, 401, { error: 'Bitte bei RezeptShare anmelden.' }); return false; }
    if (request.headers.apikey !== config.supabasePublishableKey) {
        json(response, 401, { error: 'Testprojekt-Schlüssel stimmt nicht.' }); return false;
    }
    try {
        const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
            headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${match[1]}` },
            signal: AbortSignal.timeout(8000)
        });
        if (userResponse.status === 401 || userResponse.status === 403) {
            json(response, 401, { error: 'Anmeldung ungültig oder abgelaufen.' }); return false;
        }
        if (!userResponse.ok) { json(response, 503, { error: 'Anmeldedienst nicht erreichbar.' }); return false; }
        const user = await userResponse.json();
        if (typeof user?.id !== 'string' || !user.id) {
            json(response, 401, { error: 'Anmeldung ungültig oder abgelaufen.' }); return false;
        }
        const profileResponse = await fetch(`${config.supabaseUrl}/rest/v1/profile?id=eq.${encodeURIComponent(user.id)}&select=wird_geloescht`, {
            headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${match[1]}` },
            signal: AbortSignal.timeout(8000)
        });
        if (!profileResponse.ok) { json(response, 503, { error: 'Kontostatus konnte nicht geprüft werden.' }); return false; }
        const profiles = await profileResponse.json();
        if (!Array.isArray(profiles) || !profiles.length || profiles[0]?.wird_geloescht) {
            json(response, 403, { error: 'Account nicht verfügbar.' }); return false;
        }
        return true;
    } catch {
        json(response, 503, { error: 'Anmeldedienst nicht erreichbar.' }); return false;
    }
}

async function kiRoute(request, response, pathname) {
    if (!testProjektRef) { json(response, 404, { error: 'KI-Testadapter ist nur im bestätigten Testprojekt verfügbar.' }); return; }
    const origin = request.headers.origin || null;
    if (!lokaleBrowserOrigin(request, origin)) { json(response, 403, { error: 'Origin nicht erlaubt.' }); return; }
    const config = readPublicConfig(projektOrdner, testProjektRef);
    if (pathname === '/__local/ki-assistent' && request.method !== 'POST') {
        json(response, 405, { error: 'Method not allowed' }); return;
    }
    if (pathname === '/__local/ki-fortschritt' && request.method !== 'GET') {
        json(response, 405, { error: 'Method not allowed' }); return;
    }
    if (!await pruefeTestSitzung(request, response, config)) return;

    try {
        let endpoint, body;
        if (pathname === '/__local/ki-assistent') {
            body = await leseBody(request);
            const messages = body?.messages;
            const valid = Array.isArray(messages) && messages.length >= 1 && messages.length <= 12
                && messages.every(m => m && typeof m === 'object' && ['user', 'assistant'].includes(m.role)
                    && typeof m.content === 'string' && m.content.trim() && m.content.length <= 4000)
                && messages[messages.length - 1]?.role === 'user' && JSON.stringify(messages).length <= MAX_KI_BODY;
            if (!valid) { json(response, 400, { error: 'Ungültiger Chatverlauf.' }); return; }
            endpoint = `${KI_LOCAL_API}/v1/chat/completions`;
            body = JSON.stringify({ model: 'recipe-assistant', messages, stream: false });
        } else {
            const id = new URL(request.url, 'http://localhost').searchParams.get('id') || '';
            if (!UUID_PATTERN.test(id)) { json(response, 400, { error: 'Ungültige Statuskennung.' }); return; }
            endpoint = `${KI_LOCAL_API}/v1/recipe-progress/${id}`;
        }
        const upstream = await fetch(endpoint, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
            ...(body ? { body } : {}),
            signal: AbortSignal.timeout(pathname === '/__local/ki-assistent' ? 120000 : 4000)
        });
        if (!upstream.ok) { json(response, 502, { error: 'Der lokale Mac-Studio-KI-Dienst ist nicht erreichbar oder hat die Anfrage abgelehnt.' }); return; }
        const result = await upstream.json();
        if (pathname === '/__local/ki-assistent') {
            const answer = result?.choices?.[0]?.message?.content;
            if (typeof answer !== 'string' || !answer.trim()) { json(response, 502, { error: 'Der lokale KI-Dienst lieferte keine gültige Antwort.' }); return; }
            json(response, 200, { answer: answer.slice(0, 20000) });
        } else {
            const phase = typeof result?.phase === 'string' && /^[a-z]+$/.test(result.phase) ? result.phase : 'waiting';
            const count = Number(result?.recipe_count);
            json(response, 200, { phase, ...(Number.isInteger(count) && count >= 0 && count <= 100 ? { recipe_count: count } : {}) });
        }
    } catch (error) {
        json(response, error.status || 502, { error: error.status ? error.message : 'Der lokale Mac-Studio-KI-Dienst ist nicht erreichbar.' });
    }
}

async function anfrageBearbeiten(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === '/__local/ki-assistent' || url.pathname === '/__local/ki-fortschritt') {
        await kiRoute(request, response, url.pathname);
        return;
    }
    const datei = statischeDateien[url.pathname];

    if (!datei) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Seite nicht gefunden");
        return;
    }

    try {
        const config = laufzeitKonfiguration();
        // Niemals den JS-Quelltext ausliefern: nur die geprüfte Feld-Allowlist serialisieren.
        const inhalt = datei[0] === 'konfiguration.js'
            ? 'window.REZEPT_SHARE_KONFIGURATION=Object.freeze(' + JSON.stringify(config) + ');'
            : await fs.readFile(path.join(projektOrdner, datei[0]));
        const https = testProjektRef ? ` https://${testProjektRef}.supabase.co` : '';
        const wss = testProjektRef ? ` wss://${testProjektRef}.supabase.co` : '';
        const csp = `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://hcaptcha.com https://*.hcaptcha.com; connect-src 'self'${https}${wss} https://hcaptcha.com https://*.hcaptcha.com; img-src 'self' data: blob:${https} https://hcaptcha.com https://*.hcaptcha.com; style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com; frame-src https://hcaptcha.com https://*.hcaptcha.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
        response.writeHead(200, {
            "Content-Type": datei[1],
            "Cache-Control": datei[0] === "konfiguration.js" ? "no-store" : "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": csp
        });
        response.end(inhalt);
    } catch (fehler) {
        console.error('Lokale Datei oder Testkonfiguration nicht verfügbar.');
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Die Datei konnte nicht geladen werden.");
    }
}

http.createServer(anfrageBearbeiten).listen(port, "127.0.0.1", function () {
    console.log("Rezept Share läuft auf http://127.0.0.1:" + port);
});
