import assert from 'node:assert/strict';
import { importPruefen, formularDaten, zusammenfuehren, importFehlerMeldung, initialesGerichtsfoto, zubereitungNummerieren } from '../supabase/functions/_shared/import-format.mjs';
import { importHandler, bilderPruefen, begrenztLesen, importAnweisung } from '../supabase/functions/_shared/import-handler.mjs';
import { rezept, jpeg } from './import-fixtures.mjs';
const result = { hinweise: [], rezepte: [rezept(), rezept('Suppe')] };
assert.equal(importPruefen(result, 1).rezepte.length, 2); // zwei eigenständige Rezepte auf einem Foto
const a = result.rezepte[0];
assert.equal(a.original.zutaten.includes('100 g'), true);
assert.equal(a.ueberarbeitet.zutaten.includes('80 g'), true);
const data = formularDaten(a, 'ueberarbeitet');
const imperialOriginal = rezept(); imperialOriginal.original.zutaten='1 cup Mehl';
assert.match(formularDaten(imperialOriginal,'original').text,/1 cup Mehl/); // Keine KI-Chat-Umrechnung auf Buchtexte anwenden.
assert.equal(data.kalorien, null); assert.match(data.text, /80 g Zucker/); assert.doesNotMatch(data.text,/100 g Zucker|Importprotokoll|Unsicherheiten|Bildkoordinaten|100 durchgestrichen|unleserlich|Original: Kuchen/);
assert.match(formularDaten(a, 'original').text, /100 g Zucker/); assert.doesNotMatch(formularDaten(a, 'original').text,/80 g Zucker|Importprotokoll|Änderungen/);
assert.match(data.text,/Notizen\nHandschrift: weniger süß/);
assert.equal(initialesGerichtsfoto(a),'foto:0');
const twoRecipesSamePage={hinweise:[],rezepte:[rezept('Gulasch'),rezept('Kuchen')]};
twoRecipesSamePage.rezepte[0].fotos[0].x=0.08; twoRecipesSamePage.rezepte[1].fotos[0].x=0.62;
assert.deepEqual(twoRecipesSamePage.rezepte.map(initialesGerichtsfoto),['foto:0','foto:0']);
assert.notEqual(twoRecipesSamePage.rezepte[0].fotos[0].x,twoRecipesSamePage.rezepte[1].fotos[0].x,'Jede Rezeptkarte behält ihren eigenen Bildausschnitt');
assert.equal(initialesGerichtsfoto({...rezept(),fotos:[]}),'kein');
assert.equal(initialesGerichtsfoto({...rezept(),zuordnungUnsicher:true}),'kein');
assert.equal(initialesGerichtsfoto({...rezept(),fotos:[{...rezept().fotos[0],unsicher:true}]}),'kein');
assert.equal(initialesGerichtsfoto({...rezept(),fotos:[{seite:1,x:0,y:0,breite:1,hoehe:1,unsicher:false}]}),'kein');
assert.equal(initialesGerichtsfoto({...rezept(),fotos:[rezept().fotos[0],{...rezept().fotos[0],x:0.55}]}),'kein');
assert.equal(zubereitungNummerieren('1) Das Fleisch abspülen,\nabtrocknen und würfeln.\n• Das Öl erhitzen.\n3. Tomatenmark hinzufügen.'),'1. Das Fleisch abspülen, abtrocknen und würfeln.\n2. Das Öl erhitzen.\n3. Tomatenmark hinzufügen.');

// Gulasch-Regression nach den vom Nutzer genannten Textfragmenten; ohne erfundene Mengen oder Garzeit.
const gulasch=rezept('Gulasch');
gulasch.original.zutaten='Rindfleisch\nÖl oder Pflanzenfett\nZwiebeln\nTomatenmark';
gulasch.original.zubereitung='unter fließendem kaltem Wasser abspülen, trockentupfen, in Würfel schneiden\nÖl oder Pflanzenfett erhitzen, das Fleisch in Portionen von allen Seiten gut darin anbraten\nZwiebeln hinzufügen\nTomatenmark hinzufügen';
gulasch.ueberarbeitet.zutaten=gulasch.original.zutaten;
gulasch.ueberarbeitet.zubereitung='Das Rindfleisch unter fließendem kaltem Wasser abspülen, trocken tupfen und in Würfel schneiden.\nDas Öl oder Pflanzenfett in einem Topf erhitzen und das Rindfleisch portionsweise von allen Seiten gut darin anbraten.\nDie Zwiebeln hinzufügen.\nDas Tomatenmark hinzufügen.';
const gulaschText=formularDaten(gulasch,'ueberarbeitet').text;
assert.match(gulaschText,/1\. Das Rindfleisch unter fließendem kaltem Wasser abspülen, trocken tupfen und in Würfel schneiden\./);
assert.match(gulaschText,/2\. Das Öl oder Pflanzenfett in einem Topf erhitzen und das Rindfleisch portionsweise von allen Seiten gut darin anbraten\./);
assert.match(gulaschText,/4\. Das Tomatenmark hinzufügen\./); assert.doesNotMatch(gulaschText,/rösten|\d+\s*(?:g|ml|Minuten)|90 Minuten/);
assert.match(importAnweisung,/nummerierte Kochanleitung mit vollständigen Sätzen/);
assert.match(importAnweisung,/Füge kein Rösten, Dünsten oder Mitgaren hinzu, wenn das Rezept nur „hinzufügen“ sagt/);
assert.match(importAnweisung,/handschriftliche Garzeitkorrekturen exakt/);
const b = rezept('Fortsetzung', 2); b.zuordnungUnsicher = true;
assert.throws(() => importPruefen({hinweise:[],rezepte:[b]}, 1), /Quellseite/);
const merged = zusammenfuehren(a, b);
assert.equal(merged.quellen.length, 2); assert.equal(merged.zuordnungUnsicher, true);
assert.equal(a.quellen.length, 1); assert.equal(merged.aenderungen.length, 2);
assert.equal(importFehlerMeldung({code:'IMPORT_COOLDOWN',retryAfterSeconds:17}), 'Bitte warte noch 17 Sekunden, bevor du erneut importierst.');
assert.match(importFehlerMeldung({code:'IMPORT_DAILY_LIMIT'}), /Tageslimit von 10/);
assert.equal(importFehlerMeldung({message:'Provider nicht erreichbar'}), 'Provider nicht erreichbar');
for (const mutate of [r => { r.fotos[0].x = 0.9; }, r => { r.original.naehrwerte.kalorien = 123; }, r => { r.original.name = 42; }, r => { r.quellen = []; }, r => { r.fotos[0].seite = 1.2; }, r => { r.unbekannt = 'x'; }]) {
    const r = rezept(); mutate(r); assert.throws(() => importPruefen({hinweise:[],rezepte:[r]}, 1));
}
assert.throws(() => bilderPruefen({ einwilligung: false, bilder: [jpeg] }), /bestätige/);
assert.throws(() => bilderPruefen({ einwilligung: true, bilder: Array(7).fill(jpeg) }), /1 bis 6/);
for (const image of ['https://image.invalid/a.jpg','data:image/png;base64,YWJj','data:image/jpeg;base64,YWJj','data:image/jpeg;base64,!!!!']) assert.throws(() => bilderPruefen({einwilligung:true,bilder:[image]}));
assert.deepEqual(bilderPruefen({einwilligung:true,bilder:[jpeg]}), [jpeg]);
await assert.rejects(begrenztLesen(new Response('x'.repeat(200)), 100), /zu groß/);
await assert.rejects(begrenztLesen(new Response('no json'), 100), /JSON/);

function harness(options = {}) {
    const calls = [];
    const handler = importHandler({
        apiKey: options.noKey ? '' : 'fake-secret',
        clients: () => ({ user: { auth: { getUser: async () => { calls.push('auth'); return { data: { user: options.anon ? null : {id:'person'} }, error: options.authError ? {message:'jwt'} : null }; } },
            from: () => { const q = {select:()=>q,eq:()=>q,single:async()=>({data:{wird_geloescht:!!options.deleted}})}; return q; } },
            admin: {rpc:async(name,args)=>{ calls.push(['quota',name,args]); return options.quotaError ? {error:{message:'offline'}} : {data:!options.limited}; },
                from:()=>{ const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:options.diagnosticRow||null,error:options.diagnosticError?{message:'unavailable'}:null})}; return q; }} }),
        antwort: (data,status=200) => ({data,status}),
        fetcher: async (_url, init) => {
            calls.push(['provider', JSON.parse(init.body)]);
            if (options.networkError) throw new Error('secret upstream failure');
            if (options.providerError) return new Response('sensitive provider details', {status:429});
            return Response.json({ status: options.incomplete ? 'incomplete' : 'completed', output: [{type:'message',content: options.refusal ? [{type:'refusal'}] : [{ type:'output_text', text: options.invalid ? '{}' : JSON.stringify(result) }]}] });
        }
    });
    return { calls, request: (body={einwilligung:true,bilder:[jpeg]}, method='POST') => handler(new Request('https://edge.invalid', {method, ...(method==='POST' ? {body:JSON.stringify(body)} : {})})) };
}
for (const options of [{anon:true},{authError:true}]) { const h=harness(options); assert.equal((await h.request()).status,401); assert.equal(h.calls.length,1); }
const today = new Date().toISOString().slice(0,10);
for (const [options,expected,code] of [[{deleted:true},403],[{noKey:true},503],[{limited:true},429,'IMPORT_LIMIT_REASON_UNKNOWN'],[{limited:true,diagnosticRow:{tag:today,anzahl:4,zuletzt:new Date(Date.now()-12000).toISOString()}},429,'IMPORT_COOLDOWN'],[{limited:true,diagnosticRow:{tag:today,anzahl:10,zuletzt:new Date(Date.now()-90000).toISOString()}},429,'IMPORT_DAILY_LIMIT'],[{limited:true,diagnosticError:true},429,'IMPORT_LIMIT_REASON_UNKNOWN'],[{quotaError:true},503],[{networkError:true},504],[{providerError:true},502],[{incomplete:true},502],[{invalid:true},502],[{refusal:true},422]]) {
    const h = harness(options), response = await h.request(); assert.equal(response.status,expected,JSON.stringify(options));
    if (code) assert.equal(response.data.code, code);
    if (code === 'IMPORT_COOLDOWN') assert.ok(response.data.retryAfterSeconds > 0 && response.data.retryAfterSeconds <= 60);
    if (code === 'IMPORT_DAILY_LIMIT') assert.ok(response.data.resetAt);
    assert.ok(!JSON.stringify(response).includes('secret')); assert.ok(!JSON.stringify(response).includes('sensitive'));
    if (expected === 429 || options.quotaError) assert.ok(!h.calls.some(c => c[0] === 'provider'));
}
let h = harness(); assert.equal((await h.request({}, 'OPTIONS')).status,200); assert.equal(h.calls.length,0);
assert.equal((await h.request({}, 'GET')).status,405);
assert.equal((await h.request({einwilligung:true,bilder:[]})).status,400); assert.ok(!h.calls.some(c=>c[0]==='quota'));
h=harness(); const response=await h.request(); assert.equal(response.status,200); assert.equal(response.data.rezepte.length,2);
const payload = h.calls.find(c=>c[0]==='provider')[1];
assert.equal(payload.store,false); assert.equal(payload.text.format.strict,true);
assert.equal(payload.input[0].content[1].type,'input_image'); assert.match(payload.instructions,/Niemals Mengen/);
assert.equal(h.calls[1][1], 'rezept_import_limit'); assert.deepEqual(h.calls[1][2],{p_person:'person'});
console.log('Importtests erfolgreich: mehrere Rezepte/Foto, Original/Handschrift, Unsicherheiten, Zusammenführen, Quellen, Bild-/JSON-Limits, Auth, Kontosperre, Quota, Providerfehler, Ablehnung und sichere Ausgabe.');
