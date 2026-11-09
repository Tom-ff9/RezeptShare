const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");

const port = Number(process.env.PORT || 3000);
const projektOrdner = __dirname;

// Der lokale Server liefert nur die statischen Dateien aus. Alle dauerhaften
// Daten, Anmeldungen und Bilder werden von Supabase verwaltet.
const statischeDateien = {
    "/": ["index.html", "text/html; charset=utf-8"],
    "/index.html": ["index.html", "text/html; charset=utf-8"],
    "/style.css": ["style.css", "text/css; charset=utf-8"],
    "/konfiguration.js": ["konfiguration.js", "text/javascript; charset=utf-8"],
    "/gruppen.js": ["gruppen.js", "text/javascript; charset=utf-8"],
    "/funktionen.js": ["funktionen.js", "text/javascript; charset=utf-8"],
    "/assets/profil-standard.svg": ["assets/profil-standard.svg", "image/svg+xml"],
    "/captcha.js": ["captcha.js", "text/javascript; charset=utf-8"],
    "/script.js": ["script.js", "text/javascript; charset=utf-8"]
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
        const inhalt = await fs.readFile(path.join(projektOrdner, datei[0]));
        response.writeHead(200, {
            "Content-Type": datei[1],
            "Cache-Control": datei[0] === "konfiguration.js" ? "no-store" : "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://hcaptcha.com https://*.hcaptcha.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://hcaptcha.com https://*.hcaptcha.com; img-src 'self' data: blob: https://*.supabase.co https://hcaptcha.com https://*.hcaptcha.com; style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com; frame-src https://hcaptcha.com https://*.hcaptcha.com; object-src 'none'; base-uri 'self'; form-action 'self'"
        });
        response.end(inhalt);
    } catch (fehler) {
        console.error(fehler);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Die Datei konnte nicht geladen werden.");
    }
}

http.createServer(anfrageBearbeiten).listen(port, "127.0.0.1", function () {
    console.log("Rezept Share läuft auf http://127.0.0.1:" + port);
});
