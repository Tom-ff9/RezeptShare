const assert = require('node:assert/strict');
const { runHealthChecks, loopbackUrl } = require('../scripts/mac-studio-healthcheck.cjs');

async function main() {
assert.equal(loopbackUrl('http://localhost:8001/health').hostname, 'localhost');
for (const url of ['https://127.0.0.1/x', 'http://example.com/health', 'http://user:pass@127.0.0.1/x']) {
    assert.throws(() => loopbackUrl(url), /Loopback/);
}
const endpoints = { fastapi:'http://127.0.0.1:8001/health', ollama:'http://127.0.0.1:11434/api/tags', qdrant:'http://127.0.0.1:6333/collections' };
const healthy = async url => {
    if (String(url).includes(':8001/')) return Response.json({status:'ok'});
    if (String(url).includes(':11434/')) return Response.json({models:[{name:'qwen3:14b'},{name:'bge-m3:latest'}]});
    return Response.json({result:{collections:[{name:'recipes'}]}});
};
assert.deepEqual((await runHealthChecks({fetcher:healthy,endpoints})).map(x=>x.ok), [true,true,true]);
const missing = await runHealthChecks({fetcher:async url=>{
    if (String(url).includes(':8001/')) throw new Error('offline');
    if (String(url).includes(':11434/')) return Response.json({models:[{name:'qwen3:14b'}]});
    return Response.json({result:{collections:[]}});
},endpoints});
assert.deepEqual(missing.map(x=>x.ok), [false,false,false]);
assert.match(missing[0].detail,/LaunchAgent/);
assert.match(missing[2].detail,/erstellt oder verändert keine Collection/);
const remoteRejected = await runHealthChecks({fetcher:healthy,endpoints:{...endpoints,fastapi:'http://example.com/health'}});
assert.equal(remoteRejected[0].ok,false);
assert.match(remoteRejected[0].detail,/Loopback/);
console.log('Mac-Studio-Healthcheck geprüft: Nur Loopback, FastAPI/Ollama/Qdrant-Verfügbarkeit, fehlende Modelle/Collection und verständliche Fehlermeldungen.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
