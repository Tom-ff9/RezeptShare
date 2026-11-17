import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = fs.readFileSync('mac-studio/Caddyfile.rezeptshare.example', 'utf8');
assert.match(config, /kronshagen\.hopto\.org\s*\{/);
assert.match(config, /method POST\s+path \/v1\/chat\/completions/s);
assert.match(config, /method GET\s+path_regexp progress \^\/v1\/recipe-progress\/.*\{12\}\$/s);
assert.equal((config.match(/reverse_proxy 127\.0\.0\.1:8000/g) || []).length, 2);
assert.doesNotMatch(config, /(?:11434|6333|6334|3000|57001)/);
assert.match(config, /max_size 50KB/);
assert.match(config, /response_header_timeout 80s/);
assert.match(config, /response_header_timeout 4s/);
assert.match(config, /handle\s*\{\s*respond "Not found" 404/s);
assert.doesNotMatch(config, /\b(?:log|header_up)\s+Authorization/i);
console.log('Caddy-Entwurf: nur Chat/UUID-Fortschritt an Loopback, Größenlimit und Default-404 geprüft.');
