const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projektOrdner = path.resolve(__dirname, "..");
const testPort = 3177;
const basisUrl = "http://127.0.0.1:" + testPort;

async function aufServerWarten() {
    for (let versuch = 0; versuch < 30; versuch = versuch + 1) {
        try {
            if ((await fetch(basisUrl)).ok) return;
        } catch {
            await new Promise(function (resolve) { setTimeout(resolve, 100); });
        }
    }
    throw new Error("Der lokale Testserver ist nicht rechtzeitig gestartet.");
}

async function testAusfuehren() {
    const [html, browserCode, serverCode, schema, konfiguration] = await Promise.all([
        fs.readFile(path.join(projektOrdner, "index.html"), "utf8"),
        fs.readFile(path.join(projektOrdner, "script.js"), "utf8"),
        fs.readFile(path.join(projektOrdner, "server.js"), "utf8"),
        fs.readFile(path.join(projektOrdner, "supabase", "schema.sql"), "utf8"),
        fs.readFile(path.join(projektOrdner, "konfiguration.js"), "utf8")
    ]);

    assert.match(html, /href="\.\/"/);
    assert.match(html, /konfiguration\.js[\s\S]*supabase-js@2\.117\.1[\s\S]*script\.js/);
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.doesNotMatch(browserCode, /\/api\//);
    assert.doesNotMatch(browserCode, /readAsDataURL/);
    assert.match(browserCode, /signInWithPassword/);
    assert.match(browserCode, /createSignedUrl/);
    assert.match(browserCode, /einladung_annehmen/);
    assert.doesNotMatch(serverCode, /node:sqlite|DatabaseSync|scrypt/);
    assert.match(schema, /alter table public\.profile enable row level security/);
    assert.match(schema, /private\.ist_gruppenmitglied/);
    assert.match(schema, /storage\.buckets/);
    assert.match(schema, /rezept_zuordnung_schuetzen/);
    assert.doesNotMatch(konfiguration, /service_role/i);

    const server = spawn(process.execPath, ["server.js"], {
        cwd: projektOrdner,
        env: { ...process.env, PORT: String(testPort) },
        stdio: ["ignore", "pipe", "pipe"]
    });

    try {
        await aufServerWarten();
        for (const datei of ["/", "/captcha.js", "/style.css", "/konfiguration.js", "/script.js", "/funktionen.js", "/gruppen.js", "/assets/profil-standard.svg"]) {
            const antwort = await fetch(basisUrl + datei);
            assert.equal(antwort.status, 200, datei + " sollte erreichbar sein");
        }
        assert.equal((await fetch(basisUrl + "/api/sitzung")).status, 404);
    } finally {
        server.kill("SIGTERM");
        await new Promise(function (resolve) {
            server.once("exit", resolve);
            setTimeout(resolve, 1000);
        });
    }

    console.log("Projekt-Test erfolgreich: statische Auslieferung und Supabase-Umbau sind konsistent.");
}

testAusfuehren().catch(function (fehler) {
    console.error(fehler);
    process.exitCode = 1;
});
