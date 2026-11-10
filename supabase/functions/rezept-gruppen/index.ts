import { antwort, clients, pruefen } from '../_shared/http.ts';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function rezeptDaten(d: Record<string, unknown>) {
    if (!d || typeof d.name !== 'string' || typeof d.text !== 'string' || !d.name.trim() || d.name.length > 120 || !d.text.trim() || d.text.length > 20000) throw new Error('Ungültige Rezeptdaten.');
    const clean: Record<string, unknown> = { name: d.name.trim(), text: d.text.trim(), bild_pfad: d.bild_pfad ?? null };
    if (clean.bild_pfad !== null && (typeof clean.bild_pfad !== 'string' || clean.bild_pfad.length > 200)) throw new Error('Ungültiges Bild.');
    for (const key of ['kalorien','protein','kohlenhydrate','fett']) {
        const v = d[key] ?? null;
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) throw new Error('Ungültige Nährwerte.');
        clean[key] = v;
    }
    return clean;
}
Deno.serve(async req => {
    if (req.method === 'OPTIONS') return antwort({});
    if (req.method !== 'POST') return antwort({ error: 'Nur POST ist erlaubt.' }, 405);
    const { user, admin } = clients(req);
    let transaktionGestartet = false;
    const staged: {bucket: string; path: string}[] = [];
    // Nur nach sicher abgeschlossener DB-Transaktion bereinigen. Bei unklarem
    // Netzwerkstatus bleiben Dateien für einen idempotenten Wiederholversuch liegen.
    async function bereinigen(files = staged) {
        for (const file of files) {
            try {
                const table = file.bucket === 'rezeptfreigaben' ? 'rezept_freigaben' : 'rezepte';
                const refs = await admin.from(table).select('bild_pfad').eq('bild_pfad', file.path).limit(1);
                if (!refs.error && refs.data?.length === 0) await admin.storage.from(file.bucket).remove([file.path]);
            } catch { /* Verwaiste Dateien können später erneut bereinigt werden. */ }
        }
    }
    try {
        const body = await req.json();
        const { aktion, token } = body;
        async function freigabe() {
            if (!uuid(token)) throw new Error('Dieser Rezeptlink ist ungültig oder nicht mehr verfügbar.');
            const s = pruefen(await admin.from('rezept_freigaben').select('*').eq('token', token).maybeSingle());
            if (!s) throw new Error('Dieser Rezeptlink ist ungültig oder nicht mehr verfügbar.');
            const owner = pruefen(await admin.from('profile').select('wird_geloescht').eq('id', s.erstellt_von).single());
            if (owner.wird_geloescht) throw new Error('Dieser Rezeptlink ist nicht mehr verfügbar.');
            return s;
        }
        if (aktion === 'ansehen') {
            const s = await freigabe();
            const bild = s.bild_pfad ? pruefen(await admin.storage.from('rezeptfreigaben').createSignedUrl(s.bild_pfad, 3600)).signedUrl : null;
            // Keine Familien-, Quell-, Gruppen- oder Profil-IDs öffentlich ausgeben.
            const { name, text, kalorien, protein, kohlenhydrate, fett } = s.daten;
            return antwort({ name, text, kalorien, protein, kohlenhydrate, fett, bild, geteilt_von: s.anzeigename });
        }
        const authentication = await user.auth.getUser();
        const person = authentication.data?.user;
        if (authentication.error || !person) return antwort({ error: 'Bitte melde dich an.' }, 401);
        const profile = pruefen(await user.from('profile').select('wird_geloescht').eq('id', person.id).single());
        if (profile.wird_geloescht) return antwort({ error: 'Das Konto wird gelöscht.' }, 403);
        if (aktion === 'zuordnungen') {
            const s = await freigabe();
            const copies = pruefen(await user.from('rezepte').select('id,gruppen_id,version,erstellt_von').eq('familie_id', s.familie_id));
            return antwort({ kopien: copies });
        }
        async function quelle() {
            if (!Number.isSafeInteger(body.id) || body.id <= 0 || !Number.isSafeInteger(body.version)) throw new Error('Ungültiges Rezept.');
            const r = pruefen(await user.from('rezepte').select('*').eq('id', body.id).single());
            if (r.version !== body.version) throw new Error('Das Rezept wurde inzwischen geändert. Bitte lade es neu.');
            return r;
        }
        async function bildKopieren(bucket: string, path: string, targetBucket: string, target: string) {
            const image = pruefen(await admin.storage.from(bucket).download(path));
            pruefen(await admin.storage.from(targetBucket).upload(target, image, { contentType: image.type, upsert: false }));
            staged.push({bucket: targetBucket, path: target});
            return target;
        }
        if (aktion === 'teilen') {
            const r = await quelle();
            const existing = pruefen(await admin.from('rezept_freigaben').select('token').eq('erstellt_von', person.id).eq('quell_id', r.id).eq('quell_version', r.version).maybeSingle());
            if (existing) return antwort({ token: existing.token });
            const nextToken = crypto.randomUUID();
            const bild = r.bild_pfad ? await bildKopieren('rezeptbilder', r.bild_pfad, 'rezeptfreigaben', person.id + '/' + nextToken) : null;
            transaktionGestartet = true;
            const result = await admin.rpc('rezept_freigabe_erstellen', { p_person: person.id, p_id: r.id, p_version: r.version, p_token: nextToken, p_bild: bild });
            if (result.error) { if (/^[0-9A-Z]{5}$/.test(result.error.code || '')) await bereinigen(); throw new Error(result.error.message); }
            await bereinigen();
            return antwort({ token: result.data });
        }
        if (!['erstellen','zuordnen','uebernehmen'].includes(aktion) || !uuid(body.auftrag)) throw new Error('Ungültiger Auftrag.');
        const targets = body.gruppen;
        const removals = body.entfernen ?? [];
        if (!Array.isArray(targets) || targets.length > 100 || targets.some(g => !Number.isSafeInteger(g) || g <= 0)
            || !Array.isArray(removals) || removals.length > 100 || removals.some(r => !Number.isSafeInteger(r.id) || !Number.isSafeInteger(r.gruppen_id) || !Number.isSafeInteger(r.version))) throw new Error('Ungültige Gruppenauswahl.');
        const done = pruefen(await admin.from('rezept_auftraege').select('ergebnis').eq('id', body.auftrag).eq('person', person.id).maybeSingle());
        if (done) return antwort({kopien: done.ergebnis.kopien});
        let source; let sourceBucket = 'rezeptbilder';
        if (aktion === 'zuordnen') source = await quelle();
        else if (aktion === 'uebernehmen') { const s = await freigabe(); source = { ...s.daten, familie_id: s.familie_id }; sourceBucket = 'rezeptfreigaben'; }
        else source = rezeptDaten(body.daten);
        if (aktion === 'erstellen' && source.bild_pfad) {
            const first = targets[0];
            const member = pruefen(await user.from('gruppen_mitglieder').select('rolle').eq('gruppen_id', first).eq('benutzer_id', person.id).single());
            if (!['admin','mitglied'].includes(member.rolle) || !source.bild_pfad.startsWith(first + '/')) throw new Error('Ungültiges Quellbild.');
            pruefen(await user.storage.from('rezeptbilder').download(source.bild_pfad));
        }
        const copies = source.familie_id ? pruefen(await user.from('rezepte').select('gruppen_id').eq('familie_id', source.familie_id)) : [];
        const images: Record<string,string> = {};
        for (const group of new Set<number>(targets)) {
            if (copies.some(c => Number(c.gruppen_id) === group)) continue;
            // Vor jeglichem Storage-Schreibzugriff die Zielrechte prüfen; SQL prüft sie erneut unter Sperre.
            const member = pruefen(await user.from('gruppen_mitglieder').select('rolle').eq('gruppen_id', group).eq('benutzer_id', person.id).single());
            if (!['admin','mitglied'].includes(member.rolle)) throw new Error('Keine Schreibrechte in einer Zielgruppe.');
            if (source.bild_pfad) {
                if (aktion === 'erstellen' && source.bild_pfad.startsWith(group + '/')) images[group] = source.bild_pfad;
                else images[group] = await bildKopieren(sourceBucket, source.bild_pfad, 'rezeptbilder', group + '/' + crypto.randomUUID());
            }
        }
        transaktionGestartet = true;
        const result = await admin.rpc('rezept_gruppen_anwenden', {
            p_person: person.id, p_auftrag: body.auftrag, p_modus: aktion, p_id: body.id ?? null, p_version: body.version ?? null,
            p_token: aktion === 'uebernehmen' ? token : null, p_gruppen: [...new Set(targets)], p_entfernen: removals,
            p_daten: aktion === 'erstellen' ? source : null, p_bilder: images
        });
        if (result.error) { if (/^[0-9A-Z]{5}$/.test(result.error.code || '')) await bereinigen(); throw new Error(result.error.message); }
        await bereinigen([...staged,...(result.data.entfernte_bilder ?? []).map(path => ({bucket:'rezeptbilder',path}))]);
        // Speicherpfade gelöschter Kopien werden nicht im Client benötigt.
        return antwort({ kopien: result.data.kopien });
    } catch (error) {
        if (!transaktionGestartet) await bereinigen();
        return antwort({ error: error instanceof Error ? error.message : 'Die Aktion ist fehlgeschlagen.' }, 400);
    }
});
