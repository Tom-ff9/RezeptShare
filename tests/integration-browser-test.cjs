const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtureFile = fs.readFileSync(require.resolve('./browser-test.cjs'), 'utf8');
const base = fixtureFile.slice(fixtureFile.indexOf('function mockInstall()'), fixtureFile.indexOf('\n(async()=>'));
const sharingFile = fs.readFileSync(require.resolve('./rezeptgruppen-browser-test.cjs'), 'utf8');
const sharing = sharingFile.slice(sharingFile.indexOf('function sharingFixture()'), sharingFile.indexOf('\n(async()=>'));
const importFile = fs.readFileSync(require.resolve('./import-browser-test.cjs'), 'utf8');
const importer = importFile.slice(importFile.indexOf('function importFixture(result)'), importFile.indexOf('\n(async () =>'));
(async () => {
    const { rezept } = await import('./import-fixtures.mjs');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_BINARY });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        const answer = '### 1. Reisgericht\nPortionen: 2\n**Zutaten:**\n- 200 g Reis\n**Zubereitung:**\n1. Reis kochen und servieren.';
        let quotaBlocked = false;
        const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:3190';
        const config = { supabaseUrl: 'https://isoliert.invalid', supabasePublishableKey: 'mock-public', kiUrl: baseUrl + '/__test/chat', kiProgressUrl: baseUrl + '/__test/progress', kiPublishableKey: 'mock-public' };
        await page.route('https://**/*', route => {
            const url = route.request().url();
            if (url.includes('cdn.jsdelivr.net')) return route.fulfill({ contentType: 'application/javascript', body: `${base};mockInstall();${sharing};sharingFixture();${importer};importFixture(${JSON.stringify({hinweise:[],rezepte:[rezept()]})});` });
            throw new Error('Unerlaubte externe Anfrage im Test: ' + url);
        });
        await page.route('**/__test/*', route => {
            requests.push(route.request());
            if (route.request().url().endsWith('/chat') && quotaBlocked) return route.fulfill({
                status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'KI_TAGESLIMIT', message: 'Du hast das Tageslimit von 20 KI-Anfragen erreicht. Bitte versuche es nach dem nächsten UTC-Tageswechsel erneut.', retry_after_seconds: 600 })
            });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/progress') ? {phase:'waiting'} : {answer}) });
        });
        // CAPTCHA ist kein Bestandteil dieses Tests.
        await page.route('https://js.hcaptcha.com/**', route => route.fulfill({ contentType:'application/javascript',body:'' }));
        await page.route('**/konfiguration.js', route => route.fulfill({ contentType:'application/javascript',body:'window.REZEPT_SHARE_KONFIGURATION='+JSON.stringify(config)+';' }));
        await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3190');
        await page.getByRole('button',{name:'KI-Assistent',exact:true}).click();
        await page.locator('#ki-eingabe').fill('Rezept mit Reis'); await page.locator('#ki-senden').click();
        await page.getByRole('button',{name:'Rezeptkarten aus dieser Antwort erstellen'}).waitFor();
        quotaBlocked = true;
        await page.locator('#ki-eingabe').fill('Noch ein Gericht'); await page.locator('#ki-senden').click();
        await page.waitForFunction(()=>document.querySelector('#ki-status').textContent.includes('Tageslimit von 20'));
        assert.doesNotMatch(await page.locator('#ki-status').textContent(), /KI_TAGESLIMIT/);
        quotaBlocked = false;
        await page.getByRole('button',{name:'Rezeptkarten aus dieser Antwort erstellen'}).click();
        await page.getByLabel('Gewünschte Portionen',{exact:true}).fill('4');
        assert.match(await page.locator('.ki-rezept-vorschau').textContent(), /400 g Reis/);
        await page.getByRole('button',{name:'In meine Rezepte übernehmen',exact:true}).click();
        assert.equal(await page.locator('#rezept-name').inputValue(),'Reisgericht');
        assert.match(await page.locator('#rezept-text').inputValue(),/400 g Reis/);
        const chatPayload = requests.find(r => r.url().endsWith('/chat')).postDataJSON();
        assert.match(chatPayload.messages[0].content,/Antworte ausnahmslos auf Deutsch/);
        assert.match(chatPayload.messages[0].content,/REZEPT_PROGRESS_ID/);
        await page.locator('#speichern-button').click(); await page.waitForFunction(()=>mockState.extraRecipes.length===1);
        await page.getByRole('button',{name:'Hinzufügen',exact:true}).click(); await page.locator('#kochbuch-import-oeffnen').click();
        const image=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;return c.toDataURL('image/png').split(',')[1];}),'base64');
        await page.locator('#import-dateien').setInputFiles({name:'seite.png',mimeType:'image/png',buffer:image});
        await page.waitForFunction(()=>document.querySelectorAll('#import-seiten li').length===1);
        await page.locator('#import-einwilligung').check(); await page.locator('#import-erkennen').click();
        const card=page.locator('.import-rezept').first(); await card.waitFor();
        await card.getByText('Rezeptbild auswählen und Ausschnitt korrigieren',{exact:true}).click();
        await card.getByLabel('Bildquelle').selectOption('foto:0');
        await card.locator('input[type=checkbox]').check();
        await card.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        await page.locator('#kochbuch-import-dialog').waitFor({state:'hidden'});
        assert.equal(await page.locator('#rezept-name').inputValue(),'Kuchen');
        assert.equal(await page.evaluate(()=>importBildDatei.type),'image/jpeg');
        // KI darf einen importierten Entwurf nicht ohne Bestätigung ersetzen.
        await page.evaluate(()=>{window.pendingTransfer=window.rezeptShareKIRezeptUebernehmen({name:'Neuer KI-Entwurf',text:'Eigener Text'});});
        await page.locator('#bestaetigung-abbrechen').click();
        assert.equal(await page.evaluate(()=>window.pendingTransfer),false);
        assert.equal(await page.locator('#rezept-name').inputValue(),'Kuchen');
        await page.evaluate(()=>{window.pendingTransfer=window.rezeptShareKIRezeptUebernehmen({name:'Neuer KI-Entwurf',text:'Eigener Text'});});
        await page.locator('#bestaetigung-ok').click(); await page.evaluate(()=>window.pendingTransfer);
        assert.equal(await page.evaluate(()=>importBildDatei),null);
        assert.equal(await page.locator('#kalorien').inputValue(),'');
        // Entwurfswechsel schreibt selbst nichts in DB oder Storage.
        assert.equal(await page.evaluate(()=>mockState.extraRecipes.length),1);
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),0);
        await page.locator('#kochbuch-import-oeffnen').click();
        await card.locator('input[type=checkbox]').check(); await card.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        await page.locator('#bestaetigung-ok').click(); await page.locator('#kochbuch-import-dialog').waitFor({state:'hidden'});
        await page.locator('#speichern-button').click(); await page.waitForFunction(()=>mockState.extraRecipes.length===2);
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),1);
        await page.getByRole('button',{name:'Hinzufügen',exact:true}).click(); await page.locator('#kochbuch-import-oeffnen').click();
        assert.equal(await page.locator('.import-rezept').count(),1);
        await page.locator('#import-schliessen').click(); await page.locator('#profil-button').click(); await page.locator('#abmelden-button').click();
        assert.equal(await page.locator('.import-rezept').count(),0);
        assert.equal(await page.locator('#ki-nachrichten .ki-nachricht').count(),0);
        assert.deepEqual(errors,[]);
        console.log('Integration erfolgreich: KI-Chat/Status, Rezeptkarten/Portionen, Buchimport/Crop, bestätigter Entwurfswechsel, gemeinsamer Speicherweg und Logout-Isolation.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
