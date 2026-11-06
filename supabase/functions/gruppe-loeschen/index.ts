import { antwort, clients, pruefen } from '../_shared/http.ts';
Deno.serve(async req => {
    if (req.method === 'OPTIONS') return antwort({});
    if (req.method !== 'POST') return antwort({ error: 'Nur POST ist erlaubt.' }, 405);
    try {
        const { user, admin } = clients(req);
        const { user: person } = pruefen(await user.auth.getUser());
        if (!person) return antwort({ error: 'Bitte melde dich an.' }, 401);
        const { gruppen_id, bestaetigt } = await req.json();
        if (!Number.isSafeInteger(gruppen_id) || gruppen_id <= 0 || bestaetigt !== true) throw new Error('Bitte bestätige die Gruppenlöschung.');
        const args = { p_person: person.id, p_gruppe: gruppen_id };
        const exists = pruefen(await admin.rpc('gruppe_loeschung_vorbereiten', args));
        if (!exists) return antwort({ geloescht: true });
        // Kleine Pakete umgehen API-Zeilenlimits. Bei Ausfall bleibt die Gruppe
        // gesperrt, aber für einen erneuten Löschversuch sichtbar.
        for (let batch = 0; batch < 100; batch++) {
            const files = pruefen(await admin.rpc('gruppe_loeschdateien', args)) as { name: string }[];
            if (files.length === 0) {
                pruefen(await admin.rpc('gruppe_loeschung_abschliessen', args));
                return antwort({ geloescht: true });
            }
            pruefen(await admin.storage.from('rezeptbilder').remove(files.map(f => f.name)));
        }
        return antwort({ error: 'Weitere Bilder müssen entfernt werden. Bitte starte die Löschung erneut.' }, 409);
    } catch (e) { return antwort({ error: e instanceof Error ? e.message : 'Die Gruppe konnte nicht gelöscht werden.' }, 400); }
});
