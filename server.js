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
        return readPublicConfig(projektOrdner, testProjektRef);
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

async function anfrageBearbeiten(request, response) {
    const url = new URL(request.url, "http://localhost");
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
