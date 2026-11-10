import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { markierungenBerechnen } from '../supabase/functions/_shared/aenderungen.mjs';
function harness(source, fixture) {
    let handler;
    const cleaned = source.replace(/^import .*;\n/gm,'');
    const calls=[];
    const context = {
        Deno: { serve: fn => { handler=fn; } },
        antwort: (data,status=200) => ({data,status}),
        pruefen: r => { if(r.error) throw new Error(r.error.message); return r.data; },
        clients: () => fixture(calls),markierungenBerechnen, console,Date,Number,Error,Set,
    };
    vm.runInNewContext(stripTypeScriptTypes(cleaned),context);
    return {calls,request:(body,method='POST')=>handler({method,json:async()=>body})};
}
const deleteSource=await fs.readFile(new URL('../supabase/functions/konto-loeschen/index.ts',import.meta.url),'utf8');
const person={id:'p1',email:'one@test.invalid'};
function deletionFixture({passwordFail=false,storageFail=false}={}) {
    return calls=>({
        user:{auth:{getUser:async()=>({data:{user:person}})}},
        passwordClient:()=>({auth:{signInWithPassword:async()=>passwordFail?{error:{message:'Falsches Passwort'}}:{data:{user:person}},signOut:async()=>({})}}),
        admin:{rpc:async(name)=>{calls.push(name);return {data:name==='konto_dateien_vorbereiten'?[{bucket_id:'profilbilder',name:'p1/photo.png'}]:null};},
            storage:{from:()=>({remove:async()=>{calls.push('storage-remove');return storageFail?{error:{message:'Storage offline'}}:{data:{}};}})},
            auth:{admin:{deleteUser:async()=>{calls.push('auth-delete');return {data:{}};}}}}
    });
}
let h=harness(deleteSource,deletionFixture({passwordFail:true}));
assert.equal((await h.request({passwort:'bad',bestaetigt:true})).status,400);assert.deepEqual(h.calls,[]);
h=harness(deleteSource,deletionFixture());
assert.equal((await h.request({passwort:'ok',bestaetigt:false})).status,400);assert.deepEqual(h.calls,[]);
h=harness(deleteSource,deletionFixture({storageFail:true}));
assert.equal((await h.request({passwort:'ok',bestaetigt:true})).status,400);assert.ok(!h.calls.includes('auth-delete'));assert.ok(!h.calls.includes('konto_daten_entfernen'));
h=harness(deleteSource,deletionFixture());
assert.equal((await h.request({passwort:'ok',bestaetigt:true})).status,200);
assert.deepEqual(h.calls,['konto_loeschung_vorbereiten','konto_dateien_vorbereiten','storage-remove','konto_daten_entfernen','auth-delete']);
const recipeSource=await fs.readFile(new URL('../supabase/functions/rezept-speichern/index.ts',import.meta.url),'utf8');
function recipeFixture(role,version=1) {
    return calls=>({user:{auth:{getUser:async()=>({data:{user:person}})},from:table=>{
        const data=table==='rezepte'?{id:9,gruppen_id:7,erstellt_von:'other',version,name:'Suppe',text:'Salz',bild_pfad:null}:table==='gruppen_mitglieder'?{rolle:role}:[];
        const q={select:()=>q,eq:()=>q,single:()=>q,order:()=>q,range:()=>q,then:resolve=>Promise.resolve(resolve({data}))};return q;
    }},admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:2};}}});
}
const body={id:9,version:1,daten:{name:'Suppe',text:'Chili'}};
h=harness(recipeSource,recipeFixture('beobachter'));assert.equal((await h.request(body)).status,403);assert.deepEqual(h.calls,[]);
h=harness(recipeSource,recipeFixture('mitglied',2));assert.equal((await h.request(body)).status,409);assert.deepEqual(h.calls,[]);
h=harness(recipeSource,recipeFixture('mitglied'));assert.equal((await h.request(body)).status,200);
assert.equal(h.calls[0].args.p_person,'p1');assert.equal(h.calls[0].args.p_markierungen[0].alter_text,'Salz');
assert.equal((await h.request({},'GET')).status,405);
console.log('Edge-Tests erfolgreich: serverseitige Rechte, Versionskonflikt, Passwortprüfung und sichere Löschreihenfolge (Clients gemockt).');

const groupDeleteSource=await fs.readFile(new URL('../supabase/functions/gruppe-loeschen/index.ts',import.meta.url),'utf8');
function groupDeleteFixture({storageFail=false,allowed=true,exists=true}={}) {
    let files=[{name:'7/photo.jpg'}];
    return calls=>({user:{auth:{getUser:async()=>({data:{user:person}})}},admin:{
        rpc:async(name,args)=>{
            calls.push(name); assert.equal(args.p_person,person.id); assert.equal(args.p_gruppe,7);
            if(name==='gruppe_loeschung_vorbereiten') return allowed?{data:exists}:{error:{message:'Nur Admin'}};
            if(name==='gruppe_loeschdateien') return {data:files};
            return {data:null};
        },
        storage:{from:bucket=>({remove:async(paths)=>{
            assert.equal(bucket,'rezeptbilder');assert.equal(paths[0],'7/photo.jpg');calls.push('group-storage-remove');
            if(storageFail) return {error:{message:'Storage offline'}};
            files=[];return {data:{}};
        }})}
    }});
}
h=harness(groupDeleteSource,groupDeleteFixture({allowed:false}));
assert.equal((await h.request({gruppen_id:7,bestaetigt:true})).status,400);
assert.deepEqual(h.calls,['gruppe_loeschung_vorbereiten']);
h=harness(groupDeleteSource,groupDeleteFixture({storageFail:true}));
assert.equal((await h.request({gruppen_id:7,bestaetigt:true})).status,400);
assert.ok(!h.calls.includes('gruppe_loeschung_abschliessen'));
h=harness(groupDeleteSource,groupDeleteFixture());
assert.equal((await h.request({gruppen_id:7,bestaetigt:false})).status,400);assert.deepEqual(h.calls,[]);
assert.equal((await h.request({gruppen_id:7,bestaetigt:true,p_person:'forged'})).status,200);
assert.deepEqual(h.calls,['gruppe_loeschung_vorbereiten','gruppe_loeschdateien','group-storage-remove','gruppe_loeschdateien','gruppe_loeschung_abschliessen']);
h=harness(groupDeleteSource,groupDeleteFixture({exists:false}));
assert.equal((await h.request({gruppen_id:7,bestaetigt:true})).status,200);
assert.deepEqual(h.calls,['gruppe_loeschung_vorbereiten']);
console.log('Gruppenlöschung geprüft: Bestätigung, Adminrechte, Bildbereinigung, Wiederholbarkeit und Abbruch bei Storagefehler.');

// Öffentliche Rezeptlinks liefern ausschließlich den Schnappschuss, nie interne IDs.
const sharingSource=await fs.readFile(new URL('../supabase/functions/rezept-gruppen/index.ts',import.meta.url),'utf8');
function sharingFixture({authenticated=true,missing=false,cached=false,sourceDenied=false}={}) {
 return calls=>{
  const me='11111111-1111-4111-8111-111111111111';
  const snapshot={token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',familie_id:'hidden-family',quell_id:42,erstellt_von:me,anzeigename:'Anna',bild_pfad:'hidden/image',daten:{name:'Suppe',text:'Salz',kalorien:1,protein:null,kohlenhydrate:null,fett:null,gruppen_id:99}};
  function table(name) {
   const q={select:()=>q,eq:()=>q,limit:()=>q,single:()=>q,maybeSingle:()=>q,then:resolve=>{
    let data=name==='profile'?{wird_geloescht:false}:name==='rezept_freigaben'?(missing?null:snapshot):name==='rezept_auftraege'?(cached?{ergebnis:{kopien:[{id:5,gruppen_id:7}],entfernte_bilder:['private/path']}}:null):name==='gruppen_mitglieder'?{rolle:'mitglied'}:[];
    calls.push('read:'+name);
    return Promise.resolve(resolve(name==='rezepte'&&sourceDenied?{error:{message:'Kein Rezeptzugriff'}}:{data}));
   }};return q;
  }
  return {user:{auth:{getUser:async()=>({data:{user:authenticated?{id:me}:null}})},from:table},admin:{from:table,
   storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://image.invalid/signed'}})})},
   rpc:async()=>{throw new Error('Unerwartete Mutation');}}};
 };
}
h=harness(sharingSource,sharingFixture({authenticated:false}));
let shared=await h.request({aktion:'ansehen',token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
assert.equal(shared.status,200);
assert.deepEqual(Object.keys(shared.data).sort(),['bild','fett','geteilt_von','kalorien','kohlenhydrate','name','protein','text']);
assert.equal(shared.data.geteilt_von,'Anna');
assert.ok(!JSON.stringify(shared.data).includes('hidden'));
assert.equal((await h.request({aktion:'ansehen',token:'invalid'})).status,400);
assert.equal((await h.request({aktion:'teilen',id:42,version:1})).status,401);
h=harness(sharingSource,sharingFixture({missing:true}));
assert.match((await h.request({aktion:'ansehen',token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})).data.error,/ungültig/);
h=harness(sharingSource,sharingFixture({cached:true}));
shared=await h.request({aktion:'uebernehmen',auftrag:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gruppen:[7],token:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
assert.equal(shared.status,200);assert.deepEqual(Object.keys(shared.data),['kopien']);
assert.ok(!h.calls.includes('read:rezepte'));
h=harness(sharingSource,sharingFixture({sourceDenied:true}));
assert.equal((await h.request({aktion:'teilen',id:42,version:1})).status,400);
console.log('Rezeptlinks geprüft: öffentlicher Minimalumfang, Tokenfehler, Authentifizierung, Quellrechte und idempotente Übernahme.');
