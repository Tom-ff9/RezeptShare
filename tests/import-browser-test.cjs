const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixtureFile = fs.readFileSync(require.resolve('./browser-test.cjs'),'utf8');
const baseFixture = fixtureFile.slice(fixtureFile.indexOf('function mockInstall()'), fixtureFile.indexOf('\n(async()=>'));
const sharingFile = fs.readFileSync(require.resolve('./rezeptgruppen-browser-test.cjs'),'utf8');
const sharingFixture = sharingFile.slice(sharingFile.indexOf('function sharingFixture()'), sharingFile.indexOf('\n(async()=>'));
function importFixture(result) {
    window.importResult = result;
    const create = window.supabase.createClient;
    window.supabase.createClient = () => {
        const client = create(), invoke = client.functions.invoke;
        client.functions.invoke = async (name, args) => {
            if (name !== 'rezept-importieren') return invoke(name, args);
            mockState.calls.push([name, args.body]);
            if (mockState.importFails) return {data:{error:'Test: Importlimit erreicht'}};
            return {data:structuredClone(window.importResult)};
        };
        client.storage.from = () => ({
            upload: async (path,file) => { mockState.calls.push(['storage-upload',{path,type:file.type,size:file.size}]); return {data:{}}; },
            remove: async () => ({data:{}}), createSignedUrl: async () => ({data:{signedUrl:'/assets/profil-standard.svg'}})
        });
        return client;
    };
}
(async () => {
    const { rezept } = await import('./import-fixtures.mjs');
    const r = rezept(), b = rezept('Suppe'), c = rezept('Kuchen Fortsetzung',2); c.zuordnungUnsicher=true;
    const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY});
    try {
        const page = await browser.newPage({viewport:{width:390,height:844}}), errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://**/*', route => route.request().url().includes('cdn.jsdelivr.net')
            ? route.fulfill({contentType:'application/javascript',body:`${baseFixture};mockInstall();${sharingFixture};sharingFixture();(${importFixture.toString()})(${JSON.stringify({hinweise:['Ergebnis prüfen'],rezepte:[r,b,c]})});`}) : route.abort());
        await page.route('**/konfiguration.js', route => route.fulfill({contentType:'application/javascript',body: `window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:'https://isoliert.invalid',supabasePublishableKey:'mock-public'};`}));
        await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3188');
        await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
        await page.locator('#kochbuch-import-oeffnen').click();
        await page.locator('#import-erkennen').click();
        assert.match(await page.locator('#import-status').textContent(),/bestätigen/);
        const png = Buffer.from(await page.evaluate(() => {
            const c=document.createElement('canvas'); c.width=2800; c.height=1800;
            const x=c.getContext('2d'); x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='green';x.fillRect(280,360,1400,720);
            return c.toDataURL('image/png').split(',')[1];
        }), 'base64');
        await page.locator('#import-dateien').setInputFiles([{name:'seite1.png',mimeType:'image/png',buffer:png},{name:'seite2.png',mimeType:'image/png',buffer:png}]);
        await page.waitForFunction(()=>document.querySelectorAll('#import-seiten li').length===2);
        assert.equal(await page.locator('#import-kamera').getAttribute('capture'),'environment');
        await page.locator('#import-einwilligung').check(); await page.locator('#import-erkennen').click();
        await page.waitForFunction(()=>document.querySelectorAll('.import-rezept').length===3);
        const payload = await page.evaluate(()=>mockState.calls.find(c=>c[0]==='rezept-importieren')[1]);
        assert.equal(payload.bilder.length,2); assert.ok(payload.bilder[0].startsWith('data:image/jpeg;base64,'));
        assert.ok(payload.bilder[0].length<1400000);
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),0);
        let first = page.locator('.import-rezept').first();
        await first.getByText('Rezeptzuordnung korrigieren / aufteilen',{exact:true}).click();
        await first.getByLabel('Fortsetzungsrezept').selectOption('2');
        await first.getByRole('button',{name:'Mit Fortsetzung zusammenführen'}).click();
        assert.equal(await page.locator('.import-rezept').count(),2);
        first=page.locator('.import-rezept').first();
        await first.getByText('Rezeptzuordnung korrigieren / aufteilen',{exact:true}).click();
        await first.getByRole('button',{name:'Kopie zum Aufteilen erstellen'}).click();
        assert.equal(await page.locator('.import-rezept').count(),3);
        const copy=page.locator('.import-rezept').nth(1);
        await copy.getByText('Rezeptzuordnung korrigieren / aufteilen',{exact:true}).click();
        await copy.getByRole('button',{name:'Dieses Importrezept entfernen'}).click();
        first=page.locator('.import-rezept').first();
        await first.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        assert.match(await page.locator('#import-status').textContent(),/geprüft/);
        await first.locator('select').first().selectOption('original');
        await first.getByLabel('Notizen prüfen und bearbeiten').fill('Manuell geprüft, Randnotiz erhalten.');
        await first.getByText('Rezeptbild auswählen und Ausschnitt korrigieren',{exact:true}).click();
        await first.getByLabel('Bildquelle').selectOption('foto:0');
        await first.getByLabel('Links (%)',{exact:true}).fill('20');
        await page.waitForFunction(()=>document.querySelector('.import-ausschnitt')?.width>0);
        await first.locator('input[type=checkbox]').check();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:'/tmp/rezept-import-mobile.png',fullPage:true});
        await first.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        await page.locator('#kochbuch-import-dialog').waitFor({state:'hidden'});
        assert.equal(await page.locator('#rezept-name').inputValue(),'Kuchen');
        assert.match(await page.locator('#rezept-text').inputValue(),/100 g Zucker/);
        assert.match(await page.locator('#rezept-text').inputValue(),/Manuell geprüft/);
        assert.equal(await page.locator('#kalorien').inputValue(),'');
        assert.equal(await page.evaluate(()=>importBildDatei.type),'image/jpeg');
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),0);
        await page.locator('#gruppen-auswahl').click(); await page.locator('#gruppen-kontext input[data-gruppe="9"]').check();
        await page.locator('#gruppen-kontext').getByRole('button',{name:'Übernehmen',exact:true}).click();
        await page.locator('#speichern-button').click();
        await page.waitForFunction(()=>mockState.extraRecipes.length===2);
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),1);
        assert.deepEqual(await page.evaluate(()=>mockState.calls.find(c=>c[0]==='rezept-gruppen'&&c[1].aktion==='erstellen')[1].gruppen),[7,9]);
        await page.getByRole('button',{name:'Hinzufügen',exact:true}).click(); await page.locator('#kochbuch-import-oeffnen').click();
        assert.equal(await page.locator('.import-rezept').count(),2);
        const second=page.locator('.import-rezept').nth(1); await second.locator('input[type=checkbox]').check();
        await second.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        assert.equal(await page.evaluate(()=>importBildDatei),null);
        assert.equal(await page.locator('#rezept-name').inputValue(),'Suppe');
        await page.locator('#kochbuch-import-oeffnen').click();
        await page.locator('#import-verwerfen').click();
        await page.locator('#kochbuch-import-oeffnen').click();
        assert.equal(await page.locator('.import-rezept').count(),0); assert.equal(await page.locator('#import-seiten li').count(),0);
        assert.equal(await page.locator('#import-einwilligung').isChecked(),false);
        await page.locator('#import-dateien').setInputFiles({name:'nochmal.png',mimeType:'image/png',buffer:png});
        await page.waitForFunction(()=>document.querySelectorAll('#import-seiten li').length===1);
        await page.locator('#import-einwilligung').check();
        await page.evaluate(()=>{mockState.importFails=true;});
        await page.locator('#import-erkennen').click();
        await page.getByText('Test: Importlimit erreicht',{exact:true}).waitFor();
        assert.equal(await page.locator('#import-erkennen').isEnabled(),true);
        assert.equal(await page.locator('.import-rezept').count(),0);
        await page.evaluate(()=>anmeldeAnsichtAnzeigen());
        assert.equal(await page.locator('#import-seiten li').count(),0);
        assert.deepEqual(errors,[]);
        console.log('Import-Browsertest erfolgreich: Mobile/CSP, JPEG-Komprimierung, mehrere Rezepte, Zusammenführen/Aufteilen, Korrekturen, Crop, bewusste Bildwahl, Formular, Mehrfachgruppen, bestehender Upload und lokale Datenlöschung.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
