import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(fs.readFileSync('supabase/functions/ki-assistent/index.ts', 'utf8').replace(/^import .*;\n/gm, ''));
function harness(options = {}) {
  let handler;
  const calls = [];
  const profile = { data: { wird_geloescht: !!options.deleted }, error: null };
  const query = { select: () => query, eq: () => query, maybeSingle: async () => profile };
  const client = { user: {
    auth: { getUser: async () => ({ data: { user: options.anon ? null : { id: 'test-user' } }, error: options.anon ? new Error() : null }) },
    from: () => query
  }};
  vm.runInNewContext(source, {
    Deno: { env: { get: name => ({
      RECIPE_ASSISTANT_UPSTREAM: options.upstream ?? 'https://macstudio.example.invalid',
      RECIPE_ASSISTANT_ACCESS_MODE: options.accessMode ?? 'cloudflare',
      RECIPE_ASSISTANT_API_KEY: options.noApiKey ? '' : (options.apiKey ?? ''),
      RECIPE_ASSISTANT_ACCESS_CLIENT_ID: options.noAccess ? '' : (options.accessId ?? ''),
      RECIPE_ASSISTANT_ACCESS_CLIENT_SECRET: options.noAccess ? '' : (options.accessSecret ?? '')
    })[name] || '' }, serve: fn => { handler = fn; } },
    clients: () => client,
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return Response.json(options.empty ? {} : { choices: [{ message: { content: 'Kartoffelrezept aus der Sammlung.' } }] }); },
    Response, Request, URL, Set, AbortSignal, JSON, TextDecoder
  });
  return { calls, request: (body = { messages: [{ role: 'user', content: 'Kartoffeln' }] }, origin = 'http://127.0.0.1:3001', token = 'Bearer test') => handler(new Request('https://edge.invalid', { method: 'POST', headers: { Authorization: token, Origin: origin }, body: JSON.stringify(body) })) };
}

let h = harness();
assert.equal((await h.request(undefined, 'https://untrusted.invalid')).status, 403);
assert.equal(h.calls.length, 0);
for (const [options, status, calls] of [[{ anon: true }, 401, 0], [{ deleted: true }, 403, 0], [{ upstream: 'http://insecure.invalid' }, 503, 0], [{ upstream: 'https://macstudio.example.invalid/?token=bad' }, 503, 0], [{ accessId: 'id-without-secret' }, 503, 0], [{ empty: true, apiKey: 'synthetic-api-key', accessId: 'service-id', accessSecret: 'service-secret' }, 502, 1], [{ noAccess: true }, 503, 0], [{ noApiKey: true, accessId: 'service-id', accessSecret: 'service-secret' }, 503, 0]]) {
  h = harness(options);
  assert.equal((await h.request()).status, status);
  assert.equal(h.calls.length, calls);
}
h = harness({ apiKey: 'synthetic-api-key', accessId: 'service-id', accessSecret: 'service-secret' });
let response = await h.request({ messages: [{ role: 'user', content: 'Kartoffeln' }] });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { answer: 'Kartoffelrezept aus der Sammlung.' });
assert.equal(h.calls[0].url, 'https://macstudio.example.invalid/v1/chat/completions');
assert.equal(h.calls[0].init.headers['CF-Access-Client-Id'], 'service-id');
assert.equal(h.calls[0].init.headers['CF-Access-Client-Secret'], 'service-secret');
assert.equal(h.calls[0].init.headers.Authorization, 'Bearer synthetic-api-key');
assert.equal(JSON.parse(h.calls[0].init.body).model, 'recipe-assistant');
h = harness({ accessMode: 'caddy', apiKey: 'synthetic-api-key', noAccess: true });
response = await h.request();
assert.equal(response.status, 200);
assert.equal(h.calls[0].init.headers.Authorization, 'Bearer synthetic-api-key');
assert.equal(h.calls[0].init.headers['CF-Access-Client-Id'], undefined);
assert.equal(h.calls[0].init.headers['CF-Access-Client-Secret'], undefined);
h = harness({ accessMode: 'caddy', apiKey: 'synthetic-api-key', noAccess: true, anon: true });
assert.equal((await h.request()).status, 401);
assert.equal(h.calls.length, 0);
h = harness({ accessMode: 'caddy', apiKey: 'synthetic-api-key', noAccess: true, deleted: true });
assert.equal((await h.request()).status, 403);
assert.equal(h.calls.length, 0);
h = harness({ accessMode: 'invalid', apiKey: 'synthetic-api-key' });
assert.equal((await h.request()).status, 503);
assert.equal(h.calls.length, 0);
h = harness({ accessMode: 'caddy', noApiKey: true, noAccess: true });
assert.equal((await h.request()).status, 503);
assert.equal(h.calls.length, 0);
h = harness({ apiKey: 'synthetic-api-key', accessId: 'service-id', accessSecret: 'service-secret' });
response = await h.request({ messages: [{ role: 'user', content: 'Kartoffeln' }] }, 'https://tom-ff9.github.io');
assert.equal(response.status, 200);
h = harness();
response = await h.request({ messages: [{ role: 'user', content: 'x'.repeat(4001) }] });
assert.equal(response.status, 400);
assert.equal(h.calls.length, 0);
h = harness();
response = await h.request({ messages: [{ role: 'user', content: 'x'.repeat(50_100) }] });
assert.equal(response.status, 413);
assert.equal(h.calls.length, 0);
console.log('KI-Assistent Edge Function geprüft: Auth, Sperrstatus, CORS, Größenlimits, HTTPS-Upstream, Service-Auth-Header und Antwortvertrag.');
