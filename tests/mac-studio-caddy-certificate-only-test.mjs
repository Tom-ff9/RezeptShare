import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = fs.readFileSync('mac-studio/Caddyfile.certificate-only.example', 'utf8');
assert.match(config, /kronshagen\.hopto\.org:8443\s*\{/);
assert.match(config, /issuer acme https:\/\/acme-v02\.api\.letsencrypt\.org\/directory/);
assert.match(config, /issuer acme https:\/\/acme-v02\.api\.letsencrypt\.org\/directory\s*\{[\s\S]*disable_tlsalpn_challenge[\s\S]*\}/);
assert.match(config, /handle\s*\{\s*respond "RezeptShare-KI-Endpunkt ist noch gesperrt\." 503\s*\}/);
assert.doesNotMatch(config, /reverse_proxy|forward_auth|respond .*\b(?:200|204)\b/i);
assert.doesNotMatch(config, /(?:11434|6333|6334|3000|57001|127\.0\.0\.1:8000)/);
console.log('Caddy-Zertifikatsvorbereitung geprüft: ACME HTTP-01, TLS-ALPN deaktiviert, alle HTTPS-Routen 503, kein Upstream.');
