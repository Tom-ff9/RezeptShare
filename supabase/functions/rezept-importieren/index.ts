import { antwort, clients } from '../_shared/http.ts';
import { importHandler } from '../_shared/import-handler.mjs';

Deno.serve(importHandler({ clients, antwort,
    apiKey: Deno.env.get('OPENAI_API_KEY'),
    model: Deno.env.get('OPENAI_IMPORT_MODEL') || 'gpt-4.1-mini'
}));
