import { antwort, clients, pruefen } from '../_shared/http.ts';
import { markierungenBerechnen } from '../_shared/aenderungen.mjs';
Deno.serve(async req => {
    if (req.method === 'OPTIONS') return antwort({});
    if (req.method !== 'POST') return antwort({ error: 'Nur POST ist erlaubt.' }, 405);
    try {
        const { user, admin } = clients(req);
        const { user: person } = pruefen(await user.auth.getUser());
        if (!person) return antwort({ error: 'Bitte melde dich an.' }, 401);
        const { id, version, daten } = await req.json();
        if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || !daten || typeof daten.name !== 'string' || typeof daten.text !== 'string'
            || !daten.name.trim() || daten.name.length > 120 || !daten.text.trim() || daten.text.length > 20000) throw new Error('Ungültige Rezeptdaten.');
        const clean: Record<string, unknown> = { name: daten.name.trim(), text: daten.text.trim(), bild_pfad: daten.bild_pfad ?? null };
        if (clean.bild_pfad !== null && (typeof clean.bild_pfad !== 'string' || clean.bild_pfad.length > 200)) throw new Error('Ungültiges Bild.');
        for (const field of ['kalorien','protein','kohlenhydrate','fett']) {
            const value = daten[field] ?? null;
            if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Ungültige Nährwerte.');
            clean[field] = value;
        }
        // Lesen mit Benutzer-JWT: Gruppenfremde Daten gelangen nie zur Diff-Berechnung.
        const old = pruefen(await user.from('rezepte').select('*').eq('id', id).single());
        const membership = pruefen(await user.from('gruppen_mitglieder').select('rolle').eq('gruppen_id', old.gruppen_id).eq('benutzer_id', person.id).single());
        if (!['admin','mitglied'].includes(membership.rolle)) return antwort({ error: 'Keine Bearbeitungsrechte.' }, 403);
        if (old.version !== version) return antwort({ error: 'Das Rezept wurde inzwischen geändert. Bitte lade es neu; deine Eingaben bleiben im Formular erhalten.' }, 409);
        const marks: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 500) {
            const batch = pruefen(await user.from('rezept_aenderungen').select('*').eq('rezept_id', id).order('id').range(offset, offset + 499));
            marks.push(...batch);
            if (batch.length < 500) break;
        }
        const calculated = markierungenBerechnen(old, clean, marks, person.id);
        const next = pruefen(await admin.rpc('rezept_speichern_intern', { p_person: person.id, p_id: id, p_version: version, p_daten: clean, p_markierungen: calculated }));
        // Bereinigung nach erfolgreicher Transaktion. Aktuelle Bildreferenzen bleiben geschützt.
        if (old.bild_pfad && old.bild_pfad !== clean.bild_pfad) await user.storage.from('rezeptbilder').remove([old.bild_pfad]);
        return antwort({ version: next });
    } catch (error) { return antwort({ error: error instanceof Error ? error.message : 'Speichern fehlgeschlagen.' }, 400); }
});
