import assert from 'node:assert/strict';
import { importPruefen, formularDaten, zusammenfuehren } from '../supabase/functions/_shared/import-format.mjs';
import { importHandler, bilderPruefen, begrenztLesen } from '../supabase/functions/_shared/import-handler.mjs';
import { rezept, jpeg } from './import-fixtures.mjs';
const result = { hinweise: [], rezepte: [rezept(), rezept('Suppe')] };
assert.equal(importPruefen(result, 1).rezepte.length, 2); // zwei eigenständige Rezepte auf einem Foto
const a = result.rezepte[0];
assert.equal(a.original.zutaten.includes('100 g'), true);
assert.equal(a.ueberarbeitet.zutaten.includes('80 g'), true);
const data = formularDaten(a, 'ueberarbeitet');
const imperialOriginal = rezept(); imperialOriginal.original.zutaten='1 cup Mehl';
assert.match(formularDaten(imperialOriginal,'original').text,/1 cup Mehl/); // Keine KI-Chat-Umrechnung auf Buchtexte anwenden.
assert.match(data.text, /100 durchgestrichen/); assert.match(data.text, /unleserlich/);
assert.equal(data.kalorien, null); assert.match(data.text, /Original: Kuchen/);
assert.match(formularDaten(a, 'original').text.split('--- Importprotokoll')[0], /100 g Zucker/);
const b = rezept('Fortsetzung', 2); b.zuordnungUnsicher = true;
assert.throws(() => importPruefen({hinweise:[],rezepte:[b]}, 1), /Quellseite/);
const merged = zusammenfuehren(a, b);
assert.equal(merged.quellen.length, 2); assert.equal(merged.zuordnungUnsicher, true);
assert.equal(a.quellen.length, 1); assert.equal(merged.aenderungen.length, 2);
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
            admin: {rpc:async(name,args)=>{ calls.push(['quota',name,args]); return options.quotaError ? {error:{message:'offline'}} : {data:!options.limited}; }} }),
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
for (const [options,expected] of [[{deleted:true},403],[{noKey:true},503],[{limited:true},429],[{quotaError:true},503],[{networkError:true},504],[{providerError:true},502],[{incomplete:true},502],[{invalid:true},502],[{refusal:true},422]]) {
    const h = harness(options), response = await h.request(); assert.equal(response.status,expected,JSON.stringify(options));
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
