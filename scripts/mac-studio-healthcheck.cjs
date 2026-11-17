#!/usr/bin/env node
// Read-only local readiness probe; all origins must remain on loopback.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULTS = Object.freeze({
    fastapi: process.env.REZEPTSHARE_FASTAPI_HEALTH_URL || 'http://127.0.0.1:8001/health',
    ollama: process.env.REZEPTSHARE_OLLAMA_URL || 'http://127.0.0.1:11434/api/tags',
    qdrant: process.env.REZEPTSHARE_QDRANT_URL || 'http://127.0.0.1:6333/collections'
});

function loopbackUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Health-URL ist ungültig.'); }
    if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password) {
        throw new Error('Health-Probes dürfen ausschließlich unverschlüsselte Loopback-URLs verwenden.');
    }
    return url;
}

async function json(fetcher, value) {
    const url = loopbackUrl(value);
    const response = await fetcher(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function runHealthChecks({ fetcher = fetch, endpoints = DEFAULTS } = {}) {
    const results = [];
    try { await json(fetcher, endpoints.fastapi); results.push({ name: 'FastAPI', ok: true, detail: 'Health-Endpunkt antwortet.' }); }
    catch (error) { results.push({ name: 'FastAPI', ok: false, detail: `Nicht erreichbar oder fehlerhaft (${error.message}). Prüfe den Rezept-API-LaunchAgent und dessen Logdatei.` }); }
    try {
        const data = await json(fetcher, endpoints.ollama);
        const names = (data.models || []).map(model => String(model.name || '').replace(/:latest$/, ''));
        const missing = ['qwen3:14b', 'bge-m3'].filter(model => !names.includes(model));
        results.push(missing.length
            ? { name: 'Ollama', ok: false, detail: `Modelle fehlen: ${missing.join(', ')}.` }
            : { name: 'Ollama', ok: true, detail: 'qwen3:14b und bge-m3 vorhanden.' });
    } catch (error) { results.push({ name: 'Ollama', ok: false, detail: `Nicht erreichbar oder fehlerhaft (${error.message}). Prüfe den lokalen Ollama-Dienst.` }); }
    try {
        const data = await json(fetcher, endpoints.qdrant);
        const names = (data.result?.collections || []).map(collection => collection.name);
        results.push(names.includes('recipes')
            ? { name: 'Qdrant', ok: true, detail: 'Collection recipes vorhanden.' }
            : { name: 'Qdrant', ok: false, detail: 'Collection recipes fehlt; dieses Prüfskript erstellt oder verändert keine Collection.' });
    } catch (error) { results.push({ name: 'Qdrant', ok: false, detail: `Nicht erreichbar oder fehlerhaft (${error.message}). Prüfe Docker Desktop und den vorhandenen Qdrant-Container.` }); }
    return results;
}

if (require.main === module) {
    runHealthChecks().then(results => {
        for (const result of results) console.log(`${result.ok ? 'OK' : 'FEHLER'} ${result.name}: ${result.detail}`);
        if (results.some(result => !result.ok)) process.exitCode = 1;
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { DEFAULTS, loopbackUrl, runHealthChecks };
