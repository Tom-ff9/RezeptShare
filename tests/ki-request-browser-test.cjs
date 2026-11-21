// Reale Browser-Nachrichtenaufbereitung gegen lokalen Mock, keine KI-Aufrufe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtureFile = fs.readFileSync(require.resolve('./browser-test.cjs'), 'utf8');
const fixture = fixtureFile.slice(fixtureFile.indexOf('function mockInstall()'), fixtureFile.indexOf('\n(async()=>'));
(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_BINARY });
    try {
        const page = await browser.newPage();
        const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:3190';
        const requests = [], errors = [];
        let answer = 'L'.repeat(20_000);
        let progressUrl = '';
        page.on('pageerror', e => errors.push(e.message));
        await page.route('https://**/*', route => route.request().url().includes('cdn.jsdelivr.net')
            ? route.fulfill({ contentType: 'application/javascript', body: fixture + ';mockInstall();' }) : route.abort());
        await page.route('**/konfiguration.js', route => route.fulfill({ contentType: 'application/javascript', body:
            'window.REZEPT_SHARE_KONFIGURATION=' + JSON.stringify({ supabaseUrl: 'https://isoliert.invalid',
                supabasePublishableKey: 'mock-public', kiUrl: baseUrl + '/__test/chat', kiProgressUrl: progressUrl }) + ';' }));
        await page.route('**/__test/progress?*', route => route.fulfill({ contentType: 'application/json', body: '{"phase":"waiting"}' }));
        await page.route('**/__test/chat', route => {
            const raw = route.request().postData();
            const body = JSON.parse(raw);
            assert.ok(Buffer.byteLength(raw, 'utf8') <= 50_000);
            assert.ok(body.messages.length <= 12);
            assert.ok(body.messages.every(m => m.content.length <= 4000));
            assert.equal(body.messages.at(-1).role, 'user');
            requests.push(body);
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer }) });
        });
        await page.goto(baseUrl);
        await page.getByRole('button', { name: 'später festlegen' }).click();
        await page.getByRole('button', { name: 'KI-Assistent', exact: true }).click();
        const limit = await page.locator('#ki-eingabe').getAttribute('maxlength');
        assert.ok(Number(limit) > 2000 && Number(limit) < 4000);
        async function send(question) {
            await page.locator('#ki-eingabe').fill(question);
            await page.locator('#ki-senden').click();
            await page.waitForFunction(() => !document.querySelector('#ki-senden').disabled);
        }
        await send('x'.repeat(Number(limit)));
        assert.equal(requests[0].messages[0].content.length, 4000);
        assert.equal(await page.locator('.ki-bot .ki-nachricht-text').first().textContent(), answer);
        assert.match(await page.locator('#ki-status').textContent(), /neuen Gesprächsabschnitt/);
        answer = 'Kurze Antwort.';
        await send('Neue Frage');
        assert.equal(requests.at(-1).messages.length, 1, 'Lange Antworten dürfen Folgefragen nicht ungültig machen');
        // Mehrbytezeichen: Zeichenlimit allein würde das Bodylimit überschreiten.
        answer = '界'.repeat(4000);
        for (let i = 0; i < 6; i++) await send('界'.repeat(2800) + i);
        assert.match(await page.locator('#ki-status').textContent(), /neuere Gesprächsverlauf/);
        assert.ok(requests.at(-1).messages.length < 11);
        assert.equal(await page.locator('.ki-bot .ki-nachricht-text').last().textContent(), answer);
        const before = requests.length;
        const failure = await page.evaluate(async () => {
            try { await window.rezeptKIAnfrage('x'.repeat(4001)); return ''; }
            catch (error) { return error.message; }
        });
        assert.match(failure, /höchstens/);
        assert.equal(requests.length, before, 'Überlange programmgesteuerte Fragen dürfen keinen Request starten');
        // Auch die optionale Statuskennung muss in das Zeichenbudget passen.
        progressUrl = baseUrl + '/__test/progress';
        answer = 'Kurze Antwort.';
        await page.reload();
        await page.getByRole('button', { name: 'später festlegen' }).click();
        await page.getByRole('button', { name: 'KI-Assistent', exact: true }).click();
        const progressLimit = Number(await page.locator('#ki-eingabe').getAttribute('maxlength'));
        assert.ok(progressLimit < Number(limit));
        await send('x'.repeat(progressLimit));
        assert.equal(requests.at(-1).messages[0].content.length, 4000);
        assert.match(requests.at(-1).messages[0].content, /REZEPT_PROGRESS_ID/);
        assert.deepEqual(errors, []);
        console.log('KI-Browsergrenzen geprüft: Formatbudget, 20.000-Zeichen-Antwort, Folgefrage, UTF-8-Bodylimit und vollständige Texte.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
