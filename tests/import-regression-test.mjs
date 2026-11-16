import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { importHandler } from '../supabase/functions/_shared/import-handler.mjs';
import { formularDaten, zusammenfuehren } from '../supabase/functions/_shared/import-format.mjs';
import { normalisiereText, schritteAusText, mengenAusText, pruefeErgebnis } from './import-vergleich.mjs';
const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url),'utf8'));
const expectation = read('./fixtures/live-kochbuch/erwartung.json');
const baseline = read('./fixtures/live-kochbuch/mock-antwort.json');
const image = fs.readFileSync(new URL('./fixtures/live-kochbuch/kartoffelsuppe-testseite.jpg', import.meta.url));
assert.equal(createHash('sha256').update(image).digest('hex'), expectation.bild_sha256, 'Bild und Erwartung gehören zu einem festgehaltenen Teststand');
assert.equal(expectation.synthetisch, true);
assert.equal(expectation.schritte.length, expectation.zubereitungsschritte);
assert.equal(baseline.rezepte.length, expectation.rezepte);
assert.equal(baseline.rezepte[0].fotos.length, expectation.gerichtsfotos);
assert.ok(normalisiereText(baseline.rezepte[0].original.zubereitung).includes(`${expectation.garzeit_minuten} minuten`));
assert.equal(image[0], 255); assert.equal(image[1], 216);
const imageUrl = 'data:image/jpeg;base64,' + image.toString('base64');
assert.equal(normalisiereText('  MÖHRE\r\nmit\u00a0Öl\u2028„stückig“ – servieren. '), 'möhre mit öl "stückig" - servieren.');
assert.equal(normalisiereText('½ EL Öl'), normalisiereText('1⁄2 EL O\u0308l'));
assert.equal(normalisiereText('Gemü\u00adse\u200b'), 'gemüse');
assert.deepEqual(schritteAusText('1) Gemüse schälen\r\nund schneiden.\r\n2. Garen.'), ['gemüse schälen und schneiden.','garen.']);
assert.deepEqual(mengenAusText('150 g Mehl, 2 Eier und 1/2 EL Öl'), ['150','2','1/2']);
const cases = [{id:'synthetische-druckseite',seiten:expectation.seiten,antwort:baseline,erwartet:[{
    ...expectation, fotos:[], aenderungen:[], unsicherheiten:[],
    notizenEnthalten:[expectation.notiz, `Für ${expectation.portionen} Portionen`]
}]}, ...read('./fixtures/import-regression/faelle.json')];
const realFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Netzwerk ist in technischen Importtests verboten.'); };
try {
    for (const fixture of cases) {
        const calls = [];
        const person = {id:'synthetic-user'};
        const q = {select:()=>q,eq:()=>q,single:async()=>({data:{wird_geloescht:false}})};
        const handler = importHandler({
            apiKey:'synthetic-not-a-secret',
            clients:()=>({user:{auth:{getUser:async()=>({data:{user:person}})},from:()=>q},admin:{rpc:async(name,args)=>{
                assert.equal(name,'rezept_import_limit'); assert.deepEqual(args,{p_person:person.id}); return {data:true};
            }}}),
            antwort:(data,status=200)=>({data,status}),
            fetcher:async(url,init)=>{
                assert.equal(url,'https://api.openai.com/v1/responses');
                const body=JSON.parse(init.body); calls.push(body);
                assert.equal(body.store,false); assert.equal(body.text.format.strict,true);
                assert.deepEqual(body.input[0].content.filter(c=>c.type==='input_image').map(c=>c.image_url),Array(fixture.seiten).fill(imageUrl));
                return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture.antwort)}]}]});
            }
        });
        const response=await handler(new Request('https://edge.invalid/rezept-importieren',{method:'POST',body:JSON.stringify({einwilligung:true,bilder:Array(fixture.seiten).fill(imageUrl)})}));
        assert.equal(response.status,200,fixture.id); assert.equal(calls.length,1);
        pruefeErgebnis(response.data,fixture.erwartet);
        for (const r of response.data.rezepte) {
            for (const version of ['original','ueberarbeitet']) {
                const data=formularDaten(r,version);
                assert.equal(data.name,r[version].name); assert.equal(data.kalorien,null);
                assert.ok(!data.text.includes('--- Importprotokoll ---'));
                assert.ok(data.text.includes(r[version].zutaten));
                assert.equal((data.text.match(/\bZutaten\b/g)||[]).length,1);
                assert.equal((data.text.match(/\bZubereitung\b/g)||[]).length,1);
                assert.doesNotMatch(data.text,/OCR-Protokoll|Bildkoordinaten|Unsicherheiten|Originalfassung|Überarbeitete Fassung/);
                for (const note of r.unsicherheiten) assert.ok(!data.text.includes(note));
                if(r.notizen.trim()) assert.ok(data.text.includes('Notizen\n'+r.notizen));
                assert.ok(!Object.hasOwn(data,'bild_pfad'),'Kein automatischer Bild-Upload');
            }
        }
        console.log('Import-Regression erfolgreich: '+fixture.id);
    }
} finally { globalThis.fetch=realFetch; }

// Darstellung darf variieren; geänderte Mengen, fehlende Schritte oder zusammengezogene Rezepte nicht.
const styled = structuredClone(baseline);
for (const v of [styled.rezepte[0].original,styled.rezepte[0].ueberarbeitet]) {
    v.name='  KARTOFFELSUPPE\r\n';
    v.zutaten=v.zutaten.split('\n').map(line=>'• '+line.replaceAll(' ','\u202f')).join('\r\n\r\n');
    v.zubereitung=v.zubereitung.replaceAll('\n','\r\n').replace('Gemüse schälen und in kleine Würfel schneiden.','Gemüse schälen und in\r\nkleine Würfel schneiden.');
}
pruefeErgebnis(styled,cases[0].erwartet);
for (const mutate of [
    x=>{x.rezepte[0].original.zutaten=x.rezepte[0].original.zutaten.replace('400 g','40 g');},
    x=>{x.rezepte[0].original.name='Andere Suppe';},
    x=>{x.rezepte[0].original.zubereitung=x.rezepte[0].original.zubereitung.replace('20 Minuten','25 Minuten');},
    x=>{x.rezepte[0].original.zubereitung=x.rezepte[0].original.zubereitung.split('\n').slice(0,-1).join('\n');},
    x=>{x.rezepte.push(structuredClone(x.rezepte[0]));},
    x=>{x.rezepte[0].original.naehrwerte.kalorien=100;}
]) {const broken=structuredClone(baseline);mutate(broken);assert.throws(()=>pruefeErgebnis(broken,cases[0].erwartet));}
const ambiguous=cases.find(c=>c.id==='unsichere-fortsetzung').antwort.rezepte;
const merged=zusammenfuehren(...ambiguous);
assert.equal(merged.zuordnungUnsicher,true);assert.deepEqual(merged.quellen.map(q=>q.seite),[1,2]);
assert.ok(merged.original.zubereitung.includes('10 Minuten'));assert.equal(ambiguous.length,2);
console.log('8 technische Importfälle, Normalisierung und 6 Negativproben erfolgreich. Keine OCR-/KI-Qualitätsaussage, keine API-Aufrufe.');
