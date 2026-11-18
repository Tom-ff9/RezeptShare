const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const extract=(file,start,end)=>{const source=fs.readFileSync(path.join(__dirname,file),'utf8');const a=source.indexOf(start),b=source.indexOf(end);assert.ok(a>=0&&b>a);return source.slice(a,b);};
(async()=>{
    const {pruefeFassung,normalisiereText}=await import('./import-vergleich.mjs');
    const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/live-kochbuch/erwartung.json'),'utf8'));
    const answer=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/live-kochbuch/mock-antwort.json'),'utf8'));
    const base=extract('browser-test.cjs','function mockInstall()','\n(async()=>');
    const sharing=extract('rezeptgruppen-browser-test.cjs','function sharingFixture()','\n(async()=>');
    const importer=extract('import-browser-test.cjs','function importFixture(result)','\n(async () =>');
    const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BINARY});
    try {
        const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net')
            ?route.fulfill({contentType:'application/javascript',body:`${base};mockInstall();${sharing};sharingFixture();${importer};importFixture(${JSON.stringify(answer)});`})
            :route.abort());
        await page.route('**/konfiguration.js',route=>route.fulfill({contentType:'application/javascript',body:"window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:'https://isoliert.invalid',supabasePublishableKey:'mock-public'};"}));
        await page.goto(process.env.TEST_URL||'http://127.0.0.1:3190');
        await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();
        await page.locator('#kochbuch-import-oeffnen').click();
        const importImage=path.resolve(process.env.IMPORT_TEST_IMAGE||path.join(root,'tests/fixtures/live-kochbuch/kartoffelsuppe-testseite.jpg'));
        const sourceSize=fs.statSync(importImage).size;
        await page.locator('#import-dateien').setInputFiles(importImage);
        await page.waitForFunction(()=>document.querySelectorAll('#import-seiten li').length===1);
        await page.locator('#import-einwilligung').check();await page.locator('#import-erkennen').click();
        await page.waitForFunction(()=>document.querySelectorAll('.import-rezept').length===1);
        assert.equal(await page.locator('.import-rezept').count(),expected.rezepte);
        const sent=await page.evaluate(()=>mockState.calls.find(c=>c[0]==='rezept-importieren')[1]);
        assert.equal(sent.bilder.length,expected.seiten);assert.match(sent.bilder[0],/^data:image\/jpeg;base64,/);assert.ok(sent.bilder[0].length<=1400000);
        const compressed=await page.evaluate(async data=>{const [header,encoded]=data.split(','),bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:header.slice(5,header.indexOf(';'))}),bitmap=await createImageBitmap(blob);const result={width:bitmap.width,height:bitmap.height,size:blob.size,type:blob.type};bitmap.close();return result;},sent.bilder[0]);
        assert.equal(compressed.type,'image/jpeg');assert.ok(Math.max(compressed.width,compressed.height)<=2304);assert.ok(compressed.size<=1024*1024);
        const card=page.locator('.import-rezept').first();await card.locator('input[type=checkbox]').check();
        await card.getByRole('button',{name:'Dieses Rezept ins Formular übernehmen'}).click();
        await page.locator('#kochbuch-import-dialog').waitFor({state:'hidden'});
        const text=await page.locator('#rezept-text').inputValue();
        assert.doesNotMatch(text,/--- Importprotokoll ---|Bildkoordinaten|Unsicherheiten/);
        const [selected,notes='']=text.split('\n\nNotizen\n');
        const [ingredients,steps]=selected.replace(/^Zutaten\s*\n/,'').split('\n\nZubereitung\n');
        const nutrients={quelle:''};
        for(const key of ['kalorien','protein','kohlenhydrate','fett']){assert.equal(await page.locator('#'+key).inputValue(),'');nutrients[key]=null;}
        pruefeFassung({name:await page.locator('#rezept-name').inputValue(),zutaten:ingredients,zubereitung:steps,naehrwerte:nutrients},expected);
        assert.ok(normalisiereText(notes).includes(normalisiereText(expected.notiz)));
        assert.equal(await page.evaluate(()=>importBildDatei),null,'Textseite ist kein automatisch gespeichertes Gerichtsfoto');
        assert.equal(await page.evaluate(()=>mockState.extraRecipes.length),0);
        await page.locator('#speichern-button').click();await page.waitForFunction(()=>mockState.extraRecipes.length===1);
        assert.equal(await page.evaluate(()=>mockState.extraRecipes[0].name),expected.name);
        assert.equal(await page.evaluate(()=>mockState.calls.filter(c=>c[0]==='storage-upload').length),0);
        assert.deepEqual(errors,[]);
        console.log(`Fixture-Browsertest erfolgreich: JPEG lokal verarbeitet (${sourceSize} B → ${compressed.width}×${compressed.height}, ${compressed.size} B), feste Antwort, Rezeptfelder, Formular und simuliertes Speichern ohne Seitenbild-Upload.`);
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
