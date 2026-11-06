import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export function antwort(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export function clients(req: Request) {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_ANON_KEY')!;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    return {
        user: createClient(url, key, { ...options, global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }),
        admin: createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options),
        passwordClient: () => createClient(url, key, options)
    };
}
export function pruefen<T>(result: { data: T; error: { message: string } | null }): T {
    if (result.error) throw new Error(result.error.message);
    return result.data;
}
