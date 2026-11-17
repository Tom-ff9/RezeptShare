const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runHealthChecks, loopbackUrl, readApiToken } = require('../scripts/mac-studio-healthcheck.cjs');

async function main() {
assert.equal(loopbackUrl('http://localhost:8000/health').hostname, 'localhost');
for (const url of ['https://127.0.0.1/x', 'http://example.com/health', 'http://user:pass@127.0.0.1/x']) {
    assert.throws(() => loopbackUrl(url), /Loopback/);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-api-health-'));
try {
const tokenFile = path.join(temp, 'token');
fs.writeFileSync(tokenFile, 'synthetic-health-test-token-0123456789\n', { mode:0o600 });
const endpoints = { fastapi:'http://127.0.0.1:8000/health', ollama:'http://127.0.0.1:11434/api/tags', qdrant:'http://127.0.0.1:6333/collections', tokenFile };
const healthy = async (url, init) => {
    if (String(url).includes(':8000/')) { assert.equal(init.headers.Authorization, 'Bearer synthetic-health-test-token-0123456789'); return Response.json({status:'ok'}); }
    if (String(url).includes(':11434/')) return Response.json({models:[{name:'qwen3:14b'},{name:'bge-m3:latest'}]});
    return Response.json({result:{collections:[{name:'recipes'}]}});
};
assert.deepEqual((await runHealthChecks({fetcher:healthy,endpoints})).map(x=>x.ok), [true,true,true]);
const missing = await runHealthChecks({fetcher:async url=>{
    if (String(url).includes(':8000/')) throw new Error('offline');
    if (String(url).includes(':11434/')) return Response.json({models:[{name:'qwen3:14b'}]});
    return Response.json({result:{collections:[]}});
},endpoints});
assert.deepEqual(missing.map(x=>x.ok), [false,false,false]);
assert.match(missing[0].detail,/LaunchAgent/);
assert.match(missing[2].detail,/erstellt oder verändert keine Collection/);
const remoteRejected = await runHealthChecks({fetcher:healthy,endpoints:{...endpoints,fastapi:'http://example.com/health'}});
assert.equal(remoteRejected[0].ok,false);
assert.match(remoteRejected[0].detail,/Loopback/);
fs.chmodSync(tokenFile, 0o644);
assert.throws(() => readApiToken(tokenFile), /Rechte/);
console.log('Mac-Studio-Healthcheck geprüft: authentifiziertes Loopback, sichere Token-Dateirechte, Modell-/Collectionstatus und verständliche Fehlermeldungen.');
} finally { fs.rmSync(temp, { recursive:true, force:true }); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
