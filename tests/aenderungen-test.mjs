import assert from 'node:assert/strict';
import { textDifferenz, markierungenBerechnen } from '../supabase/functions/_shared/aenderungen.mjs';
const now = Date.parse('2026-11-06T12:00:00Z');
const base = { name: 'Suppe', text: 'Salz und Pfeffer dazugeben.', erstellt_von: 'owner', bild_pfad: null, kalorien: null, protein: null, kohlenhydrate: null, fett: null };
const apply = (a, b) => {
    const { edits } = textDifferenz(a,b);
    let value = a;
    for (const e of [...edits].reverse()) value = value.slice(0,e.oldStart) + b.slice(e.start,e.end) + value.slice(e.oldEnd);
    assert.equal(value,b, 'Diff muss den neuen Text exakt rekonstruieren');
    for (const e of edits) assert.equal(e.removed, a.slice(e.oldStart,e.oldEnd));
    return edits;
};
for (const [a,b] of [['','neu'], ['alt',''], ['Salz und Pfeffer','Zucker und Chili'], ['Öl 🥕 rösten.','Öl 🥕 kurz rösten!'], ['a a a b','a b a'], ['ein\n  Text','ein neuer\nText']]) apply(a,b);
let seed = 42;
const rand = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
for (let i=0;i<300;i++) {
    const words = ['Salz',' Öl','\n',' ', '🧄', '.', 'Pfeffer'];
    const a = Array.from({length:rand(30)},()=>words[rand(words.length)]).join('');
    const b = Array.from({length:rand(30)},()=>words[rand(words.length)]).join(''); apply(a,b);
}
const changed = { ...base, text: 'Salz und Chili dazugeben.' };
let marks = markierungenBerechnen(base, changed, [], 'editor', now);
assert.equal(marks.length,1); assert.equal(marks[0].alter_text,'Pfeffer');
assert.equal(changed.text.slice(marks[0].start_pos,marks[0].ende_pos),'Chili');
marks = marks.map(m=>({...m, erstellt_am:'2026-11-06T12:00:00Z', ablauf_am:'2026-12-06T12:00:00Z'}));
const shifted = markierungenBerechnen(changed, {...changed,text:'Viel Salz und Chili dazugeben.'}, marks, 'owner', now);
assert.equal(shifted.length,1); assert.equal(shifted[0].id,marks[0].id); assert.equal(shifted[0].start_pos,14);
assert.equal(markierungenBerechnen(changed,base,marks,'owner',now).length,0);
assert.equal(markierungenBerechnen(changed,changed,marks,'editor',Date.parse('2026-12-06T12:00:00Z')).length,0);
assert.equal(markierungenBerechnen(base,{...base,kalorien:100},[],'editor',now)[0].feld,'kalorien');
assert.equal(markierungenBerechnen(base,{...base,kalorien:100},[],'owner',now).length,0);
const deletion = markierungenBerechnen(base,{...base,text:'Salz dazugeben.'},[],'editor',now);
assert.ok(deletion.some(m=>m.start_pos===m.ende_pos && m.alter_text.includes('Pfeffer')));
const longMark = [{id:'retained',feld:'text',start_pos:0,ende_pos:11,bereiche:[{start:0,end:11}],alter_text:'',autor_id:'editor',ablauf_am:'2026-12-06T12:00:00Z'}];
const partial = markierungenBerechnen({...base,text:'eins zwei 3'}, {...base,text:'eins vier 3'},longMark,'owner',now);
assert.equal(partial[0].id,'retained'); assert.equal(partial[0].bereiche.length,2);
assert.deepEqual(partial[0].bereiche,[{start:0,end:5},{start:9,end:11}]);
console.log('Änderungstests erfolgreich: Wort-Diff, Unicode, Überschneidungen, Ersteller, Ablauf und 300 Zufallsfälle.');
