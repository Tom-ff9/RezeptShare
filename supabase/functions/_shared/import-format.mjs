// Gemeinsamer Vertrag für Edge Function, Vorschau und Tests. Keine HTML-Inhalte.
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = (maxLength = 4000) => ({ type: 'string', maxLength });
const arr = (items, maxItems = 100) => ({ type: 'array', items, maxItems });
const page = { type: 'integer', minimum: 1, maximum: 6 };
const number = { type: ['number', 'null'], minimum: 0, maximum: 100000 };
const nutrition = obj({ kalorien: number, protein: number, kohlenhydrate: number, fett: number, quelle: str(500) });
const version = obj({ name: str(120), zutaten: str(8000), zubereitung: str(8000), naehrwerte: nutrition });
const coordinate = { type: 'number', minimum: 0, maximum: 1 };
export const importSchema = obj({
    hinweise: arr(str(1000), 30),
    rezepte: arr(obj({
        original: version, ueberarbeitet: version,
        quellen: arr(obj({ seite: page, stelle: str(1000) }), 30),
        zuordnungUnsicher: { type: 'boolean' },
        unsicherheiten: arr(str(1000), 50),
        notizen: str(4000),
        aenderungen: arr(obj({ feld: str(100), vorher: str(2000), nachher: str(2000), hinweis: str(1000), unsicher: { type: 'boolean' } }), 50),
        fotos: arr(obj({ seite: page, x: coordinate, y: coordinate, breite: coordinate, hoehe: coordinate, unsicher: { type: 'boolean' } }), 12)
    }), 20)
});

function validate(value, schema) {
    const types = [].concat(schema.type);
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(type) && !(types.includes('integer') && Number.isSafeInteger(value))) throw new Error('Ungültiges Erkennungsformat.');
    if (type === 'object') {
        if (Object.keys(value).some(k => !Object.hasOwn(schema.properties, k)) || schema.required.some(k => !Object.hasOwn(value, k))) throw new Error('Unvollständige Erkennungsdaten.');
        for (const [key, definition] of Object.entries(schema.properties)) validate(value[key], definition);
    }
    if (type === 'array') {
        if (value.length > schema.maxItems) throw new Error('Zu viele Erkennungsdaten.');
        value.forEach(v => validate(v, schema.items));
    }
    if (type === 'string' && value.length > schema.maxLength) throw new Error('Erkannter Text ist zu lang.');
    if (type === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) throw new Error('Ungültige Zahl in Erkennungsdaten.');
}
export function importPruefen(value, seitenzahl) {
    validate(value, importSchema);
    for (const r of value.rezepte) {
        if (!r.quellen.length || r.quellen.some(q => q.seite > seitenzahl)) throw new Error('Rezept ohne gültige Quellseite.');
        for (const f of r.fotos) {
            if (f.seite > seitenzahl || f.breite <= 0 || f.hoehe <= 0 || f.x + f.breite > 1.001 || f.y + f.hoehe > 1.001) throw new Error('Ungültiger Bildausschnitt.');
        }
        for (const v of [r.original, r.ueberarbeitet]) {
            if (Object.entries(v.naehrwerte).some(([k, n]) => k !== 'quelle' && n !== null) && !v.naehrwerte.quelle.trim()) throw new Error('Nährwerte ohne Quellenangabe.');
        }
    }
    return value;
}
export function rezeptText(v) {
    return 'Zutaten\n' + v.zutaten + '\n\nZubereitung\n' + zubereitungNummerieren(v.zubereitung);
}
// Nur Satz-/Listenformatierung, keine Kochschritte oder Inhalte ergänzen.
export function zubereitungNummerieren(value) {
    const lines = String(value ?? '').replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
    const hasMarkers = lines.some(line => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line));
    const steps = [];
    let current = '';
    const finish = () => { if (current.trim()) steps.push(current.trim()); current = ''; };
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { if (hasMarkers) finish(); else if (current) finish(); continue; }
        const marked = line.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*)$/);
        if (marked) { finish(); current = marked[1].trim(); continue; }
        if (hasMarkers) {
            if (current) current += ' ' + line;
            else current = line;
        } else {
            if (current && /[.!?]$/.test(current)) finish();
            current = current ? current + ' ' + line : line;
            if (/[.!?]$/.test(current)) finish();
        }
    }
    finish();
    return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}
export function initialesGerichtsfoto(rezept) {
    if (!rezept || rezept.zuordnungUnsicher) return 'kein';
    const kandidaten = (Array.isArray(rezept.fotos) ? rezept.fotos : []).flatMap((foto, index) => {
        const ganzeSeite = foto.x <= 0.01 && foto.y <= 0.01 && foto.breite >= 0.98 && foto.hoehe >= 0.98;
        return foto.unsicher || ganzeSeite ? [] : [index];
    });
    return kandidaten.length === 1 ? 'foto:' + kandidaten[0] : 'kein';
}
export function importFehlerMeldung(fehler) {
    if (fehler?.code === 'IMPORT_COOLDOWN') {
        const sekunden = Number.isFinite(fehler.retryAfterSeconds) ? fehler.retryAfterSeconds : null;
        return sekunden === null ? 'Bitte warte kurz, bevor du erneut importierst.' : `Bitte warte noch ${sekunden} ${sekunden === 1 ? 'Sekunde' : 'Sekunden'}, bevor du erneut importierst.`;
    }
    if (fehler?.code === 'IMPORT_DAILY_LIMIT') return 'Das Tageslimit von 10 Importaufträgen ist erreicht. Versuche es nach 00:00 UTC erneut.';
    return typeof fehler?.message === 'string' && fehler.message ? fehler.message : 'Der Import ist fehlgeschlagen. Bitte später erneut versuchen.';
}
export function formularDaten(r, fassung) {
    const v = r[fassung];
    if (!['original', 'ueberarbeitet'].includes(fassung) || !v) throw new Error('Bitte wähle eine Fassung.');
    for (const variant of [r.original, r.ueberarbeitet]) {
        if (variant.name.length > 120) throw new Error('Rezeptname ist zu lang.');
        for (const key of ['kalorien','protein','kohlenhydrate','fett']) {
            const n = variant.naehrwerte[key];
            if (n !== null && (!Number.isFinite(n) || n < 0 || !variant.naehrwerte.quelle.trim())) throw new Error('Nährwerte benötigen gültige Zahlen und eine Quelle pro Portion.');
        }
    }
    const notes = String(r.notizen || '').trim();
    const text = rezeptText(v) + (notes ? '\n\nNotizen\n' + notes : '');
    if (!v.name.trim() || !(v.zutaten + v.zubereitung).trim() || text.length > 20000) throw new Error('Name oder Rezepttext fehlen oder überschreiten 20.000 Zeichen. Bitte Fassungen kürzen oder aufteilen.');
    return { name: v.name, text, ...Object.fromEntries(['kalorien','protein','kohlenhydrate','fett'].map(k => [k, v.naehrwerte[k]])) };
}
export function zusammenfuehren(a, b) {
    const result = structuredClone(a);
    for (const key of ['original', 'ueberarbeitet']) {
        for (const field of ['zutaten', 'zubereitung']) result[key][field] += '\n\n' + b[key][field];
        // Unterschiedliche Bezugsgrößen niemals still vermischen.
        for (const field of ['kalorien','protein','kohlenhydrate','fett']) {
            if (a[key].naehrwerte[field] !== b[key].naehrwerte[field]) result[key].naehrwerte[field] = null;
        }
        result[key].naehrwerte.quelle += '; ' + b[key].naehrwerte.quelle;
    }
    for (const key of ['quellen','aenderungen','unsicherheiten','fotos']) result[key].push(...structuredClone(b[key]));
    result.notizen += '\n' + b.notizen;
    result.zuordnungUnsicher = true;
    result.unsicherheiten.push('Manuell zusammengeführt: Namen, Reihenfolge und Nährwertbezug prüfen.');
    return result;
}
