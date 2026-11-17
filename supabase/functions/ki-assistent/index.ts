import { clients } from '../_shared/http.ts';

// Adapter für den vorhandenen Mac-Studio-Rezeptdienst. Der upstream wird nur
// serverseitig als Secret konfiguriert; niemals Ollama/Qdrant direkt im Browser.
const UPSTREAM = Deno.env.get('RECIPE_ASSISTANT_UPSTREAM') || '';
const API_KEY = Deno.env.get('RECIPE_ASSISTANT_API_KEY') || '';
const MAX_BODY_BYTES = 50_000;
const ORIGINS = new Set([
  'https://nordlicht78.github.io',
  'http://localhost:3001', 'http://127.0.0.1:3001',
  'http://rezeptshare.test.example.com:3001'
]);

function json(data: unknown, status: number, origin: string | null) {
  const allowed = origin && ORIGINS.has(origin) ? origin : '';
  return new Response(JSON.stringify(data), { status, headers: {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8'
  }});
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'
    }});
  }
  if (origin && !ORIGINS.has(origin)) return json({ error: 'Origin nicht erlaubt.' }, 403, origin);
  if (request.method !== 'POST') return json({ error: 'Nur POST ist erlaubt.' }, 405, origin);
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Bitte bei RezeptShare anmelden.' }, 401, origin);
  let user;
  try {
    const auth = await clients(request).user.auth.getUser();
    user = auth.data?.user;
    if (auth.error || !user) return json({ error: 'Anmeldung ungültig oder abgelaufen.' }, 401, origin);
    const profile = await clients(request).user.from('profile').select('wird_geloescht').eq('id', user.id).maybeSingle();
    if (profile.error || profile.data?.wird_geloescht) return json({ error: 'Account nicht verfügbar.' }, 403, origin);
  } catch { return json({ error: 'Anmeldedienst nicht erreichbar.' }, 503, origin); }

  let body: any;
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ error: 'Anfrage zu groß.' }, 413, origin);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return json({ error: 'Anfrage zu groß.' }, 413, origin);
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder().decode(bytes);
    body = JSON.parse(raw);
  } catch { return json({ error: 'Ungültiges JSON.' }, 400, origin); }
  const messages = body?.messages;
  const valid = Array.isArray(messages) && messages.length >= 1 && messages.length <= 12
    && messages.every((message: any) => message && typeof message === 'object'
      && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'
      && !!message.content.trim() && message.content.length <= 4000)
    && messages.at(-1)?.role === 'user' && JSON.stringify(messages).length <= 50_000;
  if (!valid) return json({ error: 'Ungültiger Chatverlauf.' }, 400, origin);

  let upstream: URL;
  try { upstream = new URL(UPSTREAM); }
  catch { return json({ error: 'Mac-Studio-KI-Dienst nicht konfiguriert.' }, 503, origin); }
  if (!API_KEY) return json({ error: 'Mac-Studio-KI-Dienst nicht sicher konfiguriert.' }, 503, origin);
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.hostname === 'localhost'
    || upstream.hostname === '127.0.0.1' || upstream.hostname.endsWith('.local')) {
    return json({ error: 'Mac-Studio-KI-Dienst ist nicht sicher erreichbar.' }, 503, origin);
  }
  try {
    const response = await fetch(new URL('/v1/chat/completions', upstream), {
      method: 'POST', headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {})
      }, body: JSON.stringify({ model: 'recipe-assistant', messages, stream: false }),
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) return json({ error: 'Der Mac-Studio-KI-Dienst konnte nicht antworten.' }, 502, origin);
    const result = await response.json();
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) return json({ error: 'Keine gültige KI-Antwort erhalten.' }, 502, origin);
    return json({ answer: answer.slice(0, 20_000) }, 200, origin);
  } catch { return json({ error: 'Mac-Studio-KI-Dienst momentan nicht erreichbar.' }, 502, origin); }
});
