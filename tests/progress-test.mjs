import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/ki-fortschritt/index.ts','utf8').replace(/^import .*;\n/gm,''));
function harness(options={}) {
 let handler; const calls=[];
 const profile={data:{wird_geloescht:!!options.deleted}};
 const q={select:()=>q,eq:()=>q,single:async()=>profile};
 vm.runInNewContext(source,{Deno:{env:{get:name=>({KI_PROGRESS_UPSTREAM:options.noUpstream?'':(options.upstream||'https://test-backend.invalid/progress/'),RECIPE_ASSISTANT_ACCESS_CLIENT_ID:options.noAccess?'':(options.accessId||'test-access-id'),RECIPE_ASSISTANT_ACCESS_CLIENT_SECRET:options.noAccess?'':(options.accessSecret??(options.accessId?'':'test-access-secret'))})[name]||''},serve:fn=>{handler=fn;}},
  clients:()=>({user:{auth:{getUser:async()=>({data:{user:options.anon?null:{id:'test-user'}}})},from:()=>q}}),
  fetch:async(url,init)=>{calls.push({url,headers:init.headers});return Response.json({phase:'generating',recipe_count:3,question:'private',recipe:'private'});},
  Response,URL,Set,Number,AbortSignal});
 return {calls,request:(id='11111111-1111-4111-8111-111111111111',origin='http://127.0.0.1:3190',token='Bearer fake')=>handler(new Request('https://edge.invalid?id='+id,{headers:{Origin:origin,Authorization:token}}))};
}
// Standard-CORS enthält die dokumentierten lokalen Ports; 3190 absichtlich nicht.
let h=harness();assert.equal((await h.request()).status,403);assert.equal(h.calls.length,0);
for(const [opts,status] of [[{anon:true},401],[{deleted:true},403],[{noUpstream:true},503],[{upstream:'http://unsafe.invalid/progress/'},503],[{accessId:'id-only'},503],[{noAccess:true},503],[{upstream:'https://example.invalid/progress/?token=x'},503]]) {
 h=harness(opts);assert.equal((await h.request(undefined,'http://127.0.0.1:3188')).status,status);assert.equal(h.calls.length,0);
}
h=harness();assert.equal((await h.request('invalid','http://127.0.0.1:3188')).status,400);
assert.equal((await h.request(undefined,'http://127.0.0.1:3188','')).status,401);
const response=await h.request(undefined,'http://127.0.0.1:3188');assert.equal(response.status,200);
assert.deepEqual(await response.json(),{phase:'generating',recipe_count:3});assert.equal(h.calls.length,1);
assert.equal((await h.request(undefined,'https://tom-ff9.github.io')).status,200);
h=harness({accessId:'test-access-id',accessSecret:'test-access-secret'});assert.equal((await h.request(undefined,'http://127.0.0.1:3188')).status,200);
assert.equal(h.calls[0].headers['CF-Access-Client-Id'],'test-access-id');assert.equal(h.calls[0].headers['CF-Access-Client-Secret'],'test-access-secret');
console.log('Fortschritt geprüft: eigenes Testprojekt, Auth, Kontosperre, HTTPS-Upstream, Service-Auth, CORS und minimale Antwort.');
