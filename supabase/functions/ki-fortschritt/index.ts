// Status-Endpunkt der Mac-Studio-Rezept-API.
// Keine Rezepte, Tokens oder Nutzerdaten werden im Status gespeichert.
import { clients } from '../_shared/http.ts';

const PROGRESS_UPSTREAM = Deno.env.get('KI_PROGRESS_UPSTREAM') || '';
const ACCESS_CLIENT_ID = Deno.env.get('RECIPE_ASSISTANT_ACCESS_CLIENT_ID') || '';
const ACCESS_CLIENT_SECRET = Deno.env.get('RECIPE_ASSISTANT_ACCESS_CLIENT_SECRET') || '';
const allowedOrigins = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3188",
  "http://127.0.0.1:3188",
  "https://nordlicht78.github.io"
]);

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "";
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function json(value: unknown, code: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = cors(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, headers);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, headers);

  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Not authenticated" }, 401, headers);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "Invalid request id" }, 400, headers);
  }

  try {
    const { user } = clients(request);
    const { data, error } = await user.auth.getUser();
    if (error || !data?.user) return json({ error: "Invalid session" }, 401, headers);
    const profile = await user.from('profile').select('wird_geloescht').eq('id', data.user.id).single();
    if (profile.error || !profile.data || profile.data.wird_geloescht) return json({ error: 'Account unavailable' }, 403, headers);
    let upstream: URL;
    try { upstream = new URL(PROGRESS_UPSTREAM); }
    catch { return json({ error: 'Progress upstream not configured' }, 503, headers); }
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.hostname === 'localhost'
      || upstream.hostname === '127.0.0.1' || upstream.hostname.endsWith('.local')) {
      return json({ error: 'Test progress upstream is not secure' }, 503, headers);
    }
    if (!ACCESS_CLIENT_ID || !ACCESS_CLIENT_SECRET) return json({ error: 'Progress access is not securely configured' }, 503, headers);

    if (upstream.search || upstream.hash) return json({ error: 'Progress upstream URL is invalid' }, 503, headers);
    upstream.pathname = `${upstream.pathname.replace(/\/?$/, '/')}${encodeURIComponent(id)}`;
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        ...(ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': ACCESS_CLIENT_ID } : {}),
        ...(ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Secret': ACCESS_CLIENT_SECRET } : {})
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return json({ error: "Mac Studio progress unavailable" }, 503, headers);
    const progress = await response.json();
    // Keine Datenbankinhalte an den Browser uebermitteln.
    const phase = typeof progress?.phase === "string" ? progress.phase : "waiting";
    const recipeCount = Number(progress?.recipe_count);
    return json({
      phase,
      ...(Number.isInteger(recipeCount) && recipeCount >= 0 && recipeCount <= 100
        ? { recipe_count: recipeCount } : {}),
    }, 200, headers);
  } catch (_error) {
    return json({ error: "Progress service unavailable" }, 503, headers);
  }
});
