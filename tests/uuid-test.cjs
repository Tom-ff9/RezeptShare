const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(crypto) {
    const context = vm.createContext({ globalThis: { crypto }, Uint8Array, Array, Error });
    vm.runInContext(fs.readFileSync('uuid.js', 'utf8'), context);
    return context.globalThis.rezeptUuid.v4();
}
let fills = 0;
const insecureHttp = load({ getRandomValues(bytes) { fills++; bytes.fill(0x11); return bytes; } });
assert.match(insecureHttp, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(fills, 1);
assert.match(load({ randomUUID: () => 'native-uuid' }), /^native-uuid$/);
assert.match(load({ randomUUID() { throw new Error('unavailable'); }, getRandomValues(bytes) { bytes.fill(0); return bytes; } }), /-4[0-9a-f]{3}-8[0-9a-f]{3}-/);
assert.throws(() => load({}), /nicht verfügbar/);
for (const file of ['gruppen.js','rezeptgruppen.js','script.js','funktionen.js','ki-assistent.js']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /crypto\.randomUUID\s*\(/, `${file} muss den zentralen sicheren Helfer verwenden`);
}
assert.doesNotMatch(fs.readFileSync('uuid.js','utf8'), /Math\.random/);
console.log('UUID-Regression erfolgreich: lokales HTTP ohne randomUUID, UUIDv4-Bits, sicherer Fallback und Abbruch ohne CSPRNG.');
