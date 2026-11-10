const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
function mockInstall() {
    const me = '11111111-1111-4111-8111-111111111111';
    window.mockState = {
        me, profile: {id:me,anzeigename:'Tom',bild_pfad:null,profilbild_festgelegt:false},
        group: {id:7,name:'Familienküche',ist_persoenlich:false,rolle:'admin',mitglieder_anzahl:2,rezepte_anzahl:1,neue_nur_ansehen:false},
        recipe: {id:9,gruppen_id:7,familie_id:'family-9',erstellt_von:'other',name:'Gemüsesuppe',text:'Gemüse mit Chili würzen.\nZehn Minuten köcheln lassen.',bild_pfad:null,version:1,kalorien:120,protein:3,kohlenhydrate:14,fett:4,ersteller:{id:'other',anzeigename:'Anna'}},
        extraGroups:[], extraRecipes:[], memberRole:'mitglied', kicked:false, groupDeleted:false, hidden:[], calls:[], mark:{id:'mark-1',rezept_id:9,feld:'text',start_pos:11,ende_pos:16,alter_text:'Salz',autor:{anzeigename:'Tom'},ablauf_am:new Date(Date.now()+86400000).toISOString()}
    };
    const s = window.mockState;
    window.supabase = { createClient: () => ({
        auth: {getSession:async()=>({data:{session:{user:{id:me,email:'tom@example.invalid'}}}}),signOut:async()=>({data:{}})},
        storage: {from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/assets/profil-standard.svg'}}),upload:async()=>s.uploadFails?{error:{message:'Test: Upload fehlgeschlagen'}}:{data:{}},remove:async()=>({data:{}})})},
        functions: {invoke:async(name,body)=>{s.calls.push([name,body]);if(name==='gruppe-loeschen') s.groupDeleted=true;return {data:{version:2,geloescht:true}};}},
        rpc:async(name,args)=>{
            s.calls.push([name,args]);
            if(name==='gruppen_auflisten') return {data:s.groupDeleted?[]:[s.group,...s.extraGroups]};
            if(name==='gruppe_einstellungen_speichern') {s.group.neue_nur_ansehen=args.p_nur_ansehen;s.group.name=args.p_name;}
            if(name==='mitglied_rolle') s.memberRole=args.p_rolle;
            if(name==='mitglied_entfernen') {s.kicked=true;s.group.mitglieder_anzahl=1;}
            if(name==='einladung_erstellen') return {data:[{token:'test-invitation'}]};
            return {data:null};
        },
        from:table=>{
            let op='select',values,single=false,head=false; const filters={};
            const q={
                select:(_,opts)=>{head=opts?.head;return q;},eq:(key,value)=>{filters[key]=value;return q;},in:(key,value)=>{filters[key]=value;return q;},order:()=>q,single:()=>{single=true;return q;},range:()=>q,
                update:v=>{op='update';values=v;return q;},upsert:v=>{op='upsert';values=v;return q;},
                then:resolve=>{
                    if(table==='profile') {if(op==='update') Object.assign(s.profile,values);return Promise.resolve(resolve({data:s.profile}));}
                    if(table==='rezepte') {
                        const rows=[s.recipe,...s.extraRecipes].filter(Boolean).filter(r=>(filters.gruppen_id===undefined || (Array.isArray(filters.gruppen_id)?filters.gruppen_id.includes(r.gruppen_id):r.gruppen_id===filters.gruppen_id)) && (filters.familie_id===undefined || filters.familie_id===r.familie_id) && (filters.id===undefined || filters.id===r.id));
                        return Promise.resolve(resolve(head?{data:null,count:filters.erstellt_von==='other'?1:0}:{data:single?rows[0]:rows}));
                    }
                    if(table==='gruppen_mitglieder') {
                        const rows=[{rolle:s.group.rolle,profil:{id:me,anzeigename:s.profile.anzeigename,bild_pfad:null}}];
                        if(!s.kicked) rows.push({rolle:s.memberRole,profil:{id:'other',anzeigename:'Anna',bild_pfad:null}});
                        return Promise.resolve(resolve({data:single?rows.find(r=>r.profil.id===filters.benutzer_id):rows}));
                    }
                    if(table==='rezept_aenderungen') return Promise.resolve(resolve({data:[s.mark]}));
                    if(table==='ausgeblendete_aenderungen') {if(op==='upsert') s.hidden.push(values);return Promise.resolve(resolve({data:s.hidden}));}
                    return Promise.resolve(resolve({data:[]}));
                }
            };return q;
        }
    })};
}
(async()=>{
    const browser = await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{})});
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net')
        ? route.fulfill({contentType:'application/javascript',body:`(${mockInstall.toString()})();`}) : route.abort());
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3188');
    await page.getByRole('button',{name:'später festlegen'}).click();
    await page.locator('#app-bereich').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>mockState.profile.profilbild_festgelegt),true);
    await page.locator('#profil-button').click();
    await page.getByRole('button',{name:'Accounteinstellungen',exact:true}).click();
    await page.locator('#profil-name').fill('Thomas');
    await page.screenshot({path:'/tmp/rezept-share-profil-desktop.png',fullPage:true});
    await page.locator('#profil-formular').getByRole('button',{name:'Speichern',exact:true}).click();
    assert.equal(await page.evaluate(()=>mockState.profile.anzeigename),'Thomas');
    await page.locator('#profil-button').click();
    await page.getByRole('button',{name:'Accounteinstellungen',exact:true}).click();
    // Gültiges PNG, anschließend simulierter Storage-Fehler: das alte Profil bleibt erhalten.
    const png = Buffer.from(await page.evaluate(()=>{ const c=document.createElement('canvas'); c.width=8; c.height=8; c.getContext('2d').fillRect(0,0,8,8); return c.toDataURL('image/png').split(',')[1]; }),'base64');
    await page.locator('#profil-datei').setInputFiles({name:'profil.png',mimeType:'image/png',buffer:png});
    await page.waitForFunction(()=>document.querySelector('#profil-vorschau').src.startsWith('blob:'));
    await page.evaluate(()=>{mockState.uploadFails=true;});
    await page.locator('#profil-formular').getByRole('button',{name:'Speichern',exact:true}).click();
    await page.getByText('Test: Upload fehlgeschlagen',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>mockState.profile.bild_pfad),null);
    await page.evaluate(()=>{mockState.uploadFails=false;});
    await page.locator('#profil-formular').getByRole('button',{name:'Speichern',exact:true}).click();
    await page.locator('#profil-dialog').waitFor({state:'hidden'});
    assert.ok((await page.evaluate(()=>mockState.profile.bild_pfad)).endsWith('.png'));
    await page.locator('#profil-button').click();
    await page.getByRole('button',{name:'Accounteinstellungen',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Foto entfernen',exact:true}).count(),0);
    const retainedPhoto = await page.evaluate(()=>mockState.profile.bild_pfad);
    await page.locator('#profil-formular').getByRole('button',{name:'Speichern',exact:true}).click();
    await page.locator('#profil-dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>mockState.profile.bild_pfad),retainedPhoto);
    // Gesamtliste mit unterschiedlichen Gruppenrechten; Zielgruppe beim Bearbeiten/Hinzufügen.
    await page.evaluate(async()=>{
        mockState.extraGroups=[{...mockState.group,id:8,name:'Nur lesen',rolle:'beobachter'}];
        mockState.extraRecipes=[{...mockState.recipe,id:10,gruppen_id:8,familie_id:'family-10',name:'Leserezept'}];
        await gruppenLaden(7);
    });
    async function waehleGruppen(ids) {
        await page.locator('#gruppen-auswahl').click();
        const panel=page.locator('#gruppen-kontext .gruppen-wahl-panel');
        if(ids==='alle') await panel.locator('input[data-gruppe="alle"]').check();
        else {
            for(const input of await panel.locator('input[data-gruppe]:not([data-gruppe="alle"])').all()) {
                if(!await input.isDisabled()) await input.setChecked(ids.includes(Number(await input.getAttribute('data-gruppe'))));
            }
        }
        await panel.getByRole('button',{name:'Übernehmen',exact:true}).click();
    }
    assert.match(await page.locator('#gruppen-auswahl').innerText(),/Gruppen filtern/);
    await waehleGruppen([8]);
    await page.getByRole('button',{name:'Leserezept öffnen',exact:true}).waitFor();
    assert.equal(await page.locator('.rezept-karte').count(),1);
    await waehleGruppen('alle');
    await page.getByRole('button',{name:'Gemüsesuppe öffnen',exact:true}).waitFor();
    assert.equal(await page.locator('.rezept-karte').count(),2);
    assert.equal(await page.locator('[data-ansicht="hinzufuegen"]').isVisible(),true);
    await page.getByRole('button',{name:'Leserezept öffnen',exact:true}).click();
    assert.equal(await page.locator('#rezept-bearbeiten-button').isVisible(),false);
    assert.equal(await page.locator('#rezept-loeschen-button').isVisible(),false);
    await page.getByRole('button',{name:'Rezept schließen'}).click();
    await page.getByRole('button',{name:'Gemüsesuppe öffnen',exact:true}).click();
    assert.equal(await page.locator('#rezept-bearbeiten-button').isVisible(),true);
    assert.equal(await page.locator('#rezept-loeschen-button').isVisible(),true);
    await page.locator('#rezept-bearbeiten-button').click();
    assert.deepEqual(await page.evaluate(()=>formularGruppenIds),[7]);
    assert.equal(await page.locator('#gruppen-kontext input[data-gruppe="alle"]').count(),0);
    await page.locator('#abbrechen-button').click();
    assert.equal(await page.evaluate(()=>filterGruppenIds),null);
    await waehleGruppen([8]);
    await waehleGruppen('alle');
    await page.locator('[data-ansicht="hinzufuegen"]').click();
    assert.deepEqual(await page.evaluate(()=>formularGruppenIds),[7]);
    assert.equal(await page.locator('#gruppen-kontext input[data-gruppe="alle"]').count(),0);
    assert.equal(await page.locator('.formular-aktionen #gruppen-kontext').count(),1);
    for (const width of [1280,390]) {
        await page.setViewportSize({width,height:900});
        await page.locator('#gruppen-auswahl').scrollIntoViewIfNeeded();
        const bounds=await page.evaluate(()=>{
            const save=document.querySelector('#speichern-button').getBoundingClientRect();
            const select=document.querySelector('#gruppen-auswahl').getBoundingClientRect();
            const box=document.querySelector('#gruppen-kontext').getBoundingClientRect();
            return {equalWidth:Math.abs(save.width-select.width)<1,equalHeight:Math.abs(save.height-select.height)<1,
                position:innerWidth<=600 ? select.bottom<=save.top : select.left>save.right,wholeBox:Math.abs(box.width-select.width)<1 && Math.abs(box.height-select.height)<1,
                hit:document.elementFromPoint(select.left+3,select.top+3)?.id};
        });
        assert.equal(bounds.position,true); assert.equal(bounds.hit,'gruppen-auswahl'); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.screenshot({path:'/tmp/rezept-share-gruppenauswahl-unten.png',fullPage:true});
    await page.evaluate(()=>{gruppen.push({id:9,name:'Weitere Gruppe',rolle:'mitglied'});gruppenAuswahlAktualisieren();});
    await page.locator('#rezept-name').fill('Entwurf behalten');
    await page.locator('#rezept-text').fill('Auch die Zubereitung bleibt erhalten.');
    await waehleGruppen([9]);
    assert.equal(await page.locator('#rezept-name').inputValue(),'Entwurf behalten');
    assert.equal(await page.locator('#rezept-text').inputValue(),'Auch die Zubereitung bleibt erhalten.');
    assert.equal(await page.locator('#bestaetigungs-dialog').isVisible(),false);
    await page.evaluate(()=>{formularZuruecksetzen();});
    await page.setViewportSize({width:1280,height:900});
    await page.getByRole('button',{name:'Rezepte',exact:true}).click();
    assert.equal(await page.evaluate(()=>filterGruppenIds),null);
    await waehleGruppen([7]);
    await page.evaluate(async()=>{mockState.extraGroups=[];mockState.extraRecipes=[];await gruppenLaden(7);});
    await page.getByRole('button',{name:'Gruppen',exact:true}).click();
    await page.locator('.gruppen-eintrag-kopf').click();
    assert.equal(await page.locator('#name-bearbeiten-button').count(),0);
    await page.getByRole('button',{name:'Profil von Thomas (Du) öffnen',exact:true}).waitFor();
    assert.equal(await page.locator('.gruppen-details input[type="email"]').count(),0);
    await page.getByRole('button',{name:'Einstellungen für Familienküche',exact:true}).click();
    const settings=page.getByRole('dialog',{name:'Gruppeneinstellungen',exact:true});
    await settings.getByLabel('Gruppenname',{exact:true}).fill('Familienrezepte');
    await settings.getByRole('switch',{name:'Neue Mitglieder dürfen nur Rezepte ansehen'}).check();
    await settings.getByRole('button',{name:'Speichern',exact:true}).click();
    await settings.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>mockState.group.neue_nur_ansehen),true);
    assert.equal(await page.evaluate(()=>mockState.group.name),'Familienrezepte');
    await page.getByRole('button',{name:'Mitglied hinzufügen',exact:true}).click();
    const invite=page.getByRole('dialog',{name:'Mitglied hinzufügen',exact:true});
    await invite.getByLabel('E-Mail-Adresse',{exact:true}).fill('new@example.invalid');
    await invite.getByRole('button',{name:'Link erstellen',exact:true}).click();
    await invite.getByLabel('Einladungslink',{exact:true}).waitFor();
    await invite.getByRole('button',{name:'Mitglied hinzufügen schließen',exact:true}).click();
    await page.getByRole('button',{name:'Profil von Anna öffnen',exact:true}).click();
    const member=page.getByRole('dialog',{name:'Mitgliederprofil',exact:true});
    await member.getByText('1 hinzugefügtes Rezept in dieser Gruppe',{exact:true}).waitFor();
    await member.getByRole('button',{name:'Zum Beobachter machen',exact:true}).click();
    await member.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>mockState.memberRole),'beobachter');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/rezept-share-gruppen-mobil.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.getByRole('button',{name:'Einstellungen für Familienrezepte',exact:true}).click();
    await page.screenshot({path:'/tmp/rezept-share-gruppeneinstellungen-mobil.png',fullPage:true});
    await page.getByRole('button',{name:'Gruppeneinstellungen schließen',exact:true}).click();
    await page.getByRole('button',{name:'Profil von Anna öffnen',exact:true}).click();
    await member.getByRole('button',{name:'Zum Mitglied befördern',exact:true}).waitFor();
    await page.screenshot({path:'/tmp/rezept-share-mitgliederprofil-mobil.png',fullPage:true});
    await member.getByRole('button',{name:'Zum Mitglied befördern',exact:true}).click();
    await member.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>mockState.memberRole),'mitglied');
    await page.getByRole('button',{name:'Profil von Thomas (Du) öffnen',exact:true}).click();
    await member.getByText('0 hinzugefügte Rezepte in dieser Gruppe',{exact:true}).waitFor();
    assert.equal(await member.getByRole('button',{name:'Aus Gruppe entfernen',exact:true}).count(),0);
    await member.getByRole('button',{name:'Mitgliederprofil schließen',exact:true}).click();
    await page.getByRole('button',{name:'Rezepte',exact:true}).click();
    await page.getByRole('button',{name:'Gemüsesuppe öffnen'}).click();
    await page.locator('.aenderung').waitFor();
    assert.equal(await page.locator('.aenderung del').innerText(),'Salz');
    await page.screenshot({path:'/tmp/rezept-share-aenderungen-mobil.png',fullPage:true});
    await page.getByRole('button',{name:'Diesen Änderungshinweis nur für mich ausblenden'}).click();
    await page.locator('.aenderung').waitFor({state:'detached'});
    await page.getByRole('button',{name:'Rezept schließen'}).click();
    await page.evaluate(async()=>{mockState.group.rolle='beobachter';await gruppenLaden(7);});
    assert.equal(await page.locator('[data-ansicht="hinzufuegen"]').isVisible(),false);
    await page.getByRole('button',{name:'Gemüsesuppe öffnen'}).click();
    assert.equal(await page.locator('#rezept-bearbeiten-button').isVisible(),false);
    assert.equal(await page.locator('#rezept-loeschen-button').isVisible(),false);
    await page.getByRole('button',{name:'Rezept schließen'}).click();
    await page.evaluate(async()=>{mockState.group.rolle='mitglied';await gruppenLaden(7);});
    await page.getByRole('button',{name:'Gemüsesuppe öffnen'}).click();
    assert.equal(await page.locator('#rezept-bearbeiten-button').isVisible(),true);
    assert.equal(await page.locator('#rezept-loeschen-button').isVisible(),false);
    await page.getByRole('button',{name:'Rezept schließen'}).click();
    await page.getByRole('button',{name:'Gruppen',exact:true}).click();
    await page.locator('.gruppen-eintrag-kopf').click();
    assert.equal(await page.locator('.gruppen-zahnrad').isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'Mitglied hinzufügen',exact:true}).count(),0);
    await page.getByRole('button',{name:'Profil von Anna öffnen',exact:true}).click();
    await member.getByText('1 hinzugefügtes Rezept in dieser Gruppe',{exact:true}).waitFor();
    assert.equal(await member.locator('.mitglied-profil-aktionen').count(),0);
    await member.getByRole('button',{name:'Mitgliederprofil schließen',exact:true}).click();
    await page.evaluate(async()=>{mockState.group.rolle='admin';await gruppenLaden(7);});
    await page.locator('.gruppen-eintrag-kopf').click();
    await page.getByRole('button',{name:'Profil von Anna öffnen',exact:true}).click();
    await member.getByRole('button',{name:'Aus Gruppe entfernen',exact:true}).click();
    await page.locator('#bestaetigung-abbrechen').click();
    assert.equal(await page.evaluate(()=>mockState.kicked),false);
    await member.getByRole('button',{name:'Aus Gruppe entfernen',exact:true}).click();
    await page.locator('#bestaetigung-ok').click();
    await member.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>mockState.kicked),true);
    await page.getByRole('button',{name:'Einstellungen für Familienrezepte',exact:true}).click();
    await settings.getByRole('button',{name:'Gruppe löschen',exact:true}).click();
    await page.locator('#bestaetigung-abbrechen').click();
    assert.equal(await page.evaluate(()=>mockState.groupDeleted),false);
    await settings.getByRole('button',{name:'Gruppe löschen',exact:true}).click();
    await page.locator('#bestaetigung-ok').click();
    await settings.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>mockState.groupDeleted),true);
    assert.deepEqual(errors,[]);
    await browser.close();
    console.log('Browsertests erfolgreich: Onboarding, Profil, Gruppenoption, Rollen, Markierungen, Ausblenden und mobile Darstellung (Supabase gemockt).');
})().catch(e=>{console.error(e);process.exit(1);});
