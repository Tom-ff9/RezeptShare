// Supabase-Projekt B: Nur der getrennte Status-Endpunkt der Mac-Studio-API.
// Keine Rezepte, Tokens oder Nutzerdaten werden im Status gespeichert.
// deploy: supabase functions deploy ki-fortschritt --project-ref pwrrqwojvjoyclfmebnl --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINAL_SUPABASE_URL = "https://gcncxupedhwieybpiupi.supabase.co";
const ORIGINAL_SUPABASE_PUBLIC_KEY = "sb_publishable_ctCstHgTk6xNKjeXoly1CA_Vhzr99KJ";
const PROGRESS_UPSTREAM = "https://kronshagen.hopto.org:57001/recipe-progress/";
const allowedOrigins = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
  "https://nordlicht78.github.io",
  "https://tom-ff9.github.io"
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
    const supabase = createClient(ORIGINAL_SUPABASE_URL, ORIGINAL_SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user) return json({ error: "Invalid session" }, 401, headers);

    const response = await fetch(PROGRESS_UPSTREAM + encodeURIComponent(id), {
      headers: { Accept: "application/json" },
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
