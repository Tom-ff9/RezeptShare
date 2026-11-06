import { antwort, clients, pruefen } from '../_shared/http.ts';
Deno.serve(async req => {
    if (req.method === 'OPTIONS') return antwort({});
    if (req.method !== 'POST') return antwort({ error: 'Nur POST ist erlaubt.' }, 405);
    try {
        const { user, admin, passwordClient } = clients(req);
        const { user: person } = pruefen(await user.auth.getUser());
        if (!person?.email) return antwort({ error: 'Bitte melde dich erneut an.' }, 401);
        const { passwort, bestaetigt } = await req.json();
        if (bestaetigt !== true || typeof passwort !== 'string') throw new Error('Bitte bestätige die Löschung mit deinem Passwort.');
        const reauth = passwordClient();
        const verified = pruefen(await reauth.auth.signInWithPassword({ email: person.email, password: passwort }));
        if (verified.user?.id !== person.id) throw new Error('Passwortprüfung fehlgeschlagen.');
        await reauth.auth.signOut({ scope: 'local' });
        pruefen(await admin.rpc('konto_loeschung_vorbereiten', { p_person: person.id }));
        const files = pruefen(await admin.rpc('konto_dateien_vorbereiten', { p_person: person.id })) as { bucket_id: string; name: string }[];
        for (const bucket of new Set(files.map(f => f.bucket_id))) {
            const paths = files.filter(f => f.bucket_id === bucket).map(f => f.name);
            for (let i = 0; i < paths.length; i += 100) pruefen(await admin.storage.from(bucket).remove(paths.slice(i, i + 100)));
        }
        pruefen(await admin.rpc('konto_daten_entfernen', { p_person: person.id }));
        pruefen(await admin.auth.admin.deleteUser(person.id));
        return antwort({ geloescht: true });
    } catch (error) { return antwort({ error: error instanceof Error ? error.message : 'Löschen fehlgeschlagen. Du kannst den Vorgang erneut versuchen.' }, 400); }
});
