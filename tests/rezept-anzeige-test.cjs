const assert = require('node:assert/strict');
const { rezeptTextAufteilen } = require('../rezept-anzeige.js');

const gulash = [
    'Zutaten:',
    '500 g Rindfleisch, 30 g Öl oder Pflanzenfett, 500 g Zwiebeln, Salz, Frisch gemahlener Pfeffer, Paprika, edelsüß, 2 schwach gehäufte EL Tomatenmark, 375 ml heißes Wasser, 1–2 Spritzer Tabasco',
    '',
    'Zubereitung:',
    '1. Das Rindfleisch unter fließendem kaltem Wasser abspülen, trocken tupfen und in Würfel schneiden.',
    '2) Das Öl oder Pflanzenfett erhitzen und das Fleisch portionsweise von allen Seiten gut anbraten.',
    '3. Die Zwiebeln abziehen, halbieren und in Scheiben schneiden.',
    '4. Die Zwiebeln mitbräunen lassen und anschließend das Fleisch dazugeben.',
    '5. Das Gericht mit Salz, frisch gemahlenem Pfeffer und edelsüßem Paprika würzen.',
    '6. Das Tomatenmark hinzufügen.'
].join('\r\n');

const parsed = rezeptTextAufteilen(gulash);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.sections.map(section => section.type), ['ingredients', 'steps']);
assert.deepEqual(parsed.sections[0].items.map(item => item.text), [
    '500 g Rindfleisch', '30 g Öl oder Pflanzenfett', '500 g Zwiebeln', 'Salz',
    'Frisch gemahlener Pfeffer', 'Paprika, edelsüß', '2 schwach gehäufte EL Tomatenmark',
    '375 ml heißes Wasser', '1–2 Spritzer Tabasco'
]);
assert.equal(parsed.sections[1].items.length, 6);
assert.equal(parsed.sections[1].items[0].text, 'Das Rindfleisch unter fließendem kaltem Wasser abspülen, trocken tupfen und in Würfel schneiden.');
assert.equal(parsed.sections[1].items[1].text, 'Das Öl oder Pflanzenfett erhitzen und das Fleisch portionsweise von allen Seiten gut anbraten.');
assert.ok(parsed.sections[1].items.every(item => !/^\d+[.)]/.test(item.text)), 'Nummernprefixe dürfen im Listentext nicht doppelt erscheinen.');
assert.equal(gulash.slice(parsed.sections[0].items[0].start, parsed.sections[0].items[0].start + parsed.sections[0].items[0].text.length), '500 g Rindfleisch');

const handwritten = rezeptTextAufteilen('## Zutaten\n2 Eier\n\n### Zubereitungsschritte\nEier verquirlen.\nIn die Pfanne geben.');
assert.equal(handwritten.ok, true);
assert.deepEqual(handwritten.sections[1].items.map(item => item.text), ['Eier verquirlen.', 'In die Pfanne geben.']);

const amended = rezeptTextAufteilen('Zutaten:\n400 g Mehl\n\nZubereitung:\n1. Teig kneten.\n\nNotizen:\nHandschriftlich: 20 Minuten länger gehen lassen.');
assert.equal(amended.ok, true);
assert.equal(amended.sections.at(-1).type, 'notes');
assert.match(amended.sections.at(-1).items[0].text, /20 Minuten länger/);

for (const legacy of [
    'Gemüse mit Chili würzen.\nZehn Minuten köcheln lassen.',
    'Zutaten und Zubereitung\nKartoffeln, Salz\nKochen.',
    'Zutaten:\nSalz\n\nZubereitung und Zutaten:\nKochen.'
]) {
    assert.deepEqual(rezeptTextAufteilen(legacy), { ok: false, original: legacy });
}

const xss = rezeptTextAufteilen('Zutaten:\n<img src=x onerror=alert(1)>\n\nZubereitung:\n1. Sicher bleiben.');
assert.equal(xss.ok, true);
assert.equal(xss.sections[0].items[0].text, '<img src=x onerror=alert(1)>');
console.log('rezept-anzeige-test: Parser-, Altformat-, Zuordnungs- und Injection-Fälle erfolgreich.');
