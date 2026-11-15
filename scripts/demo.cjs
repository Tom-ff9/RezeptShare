// Vollständig lokale Demo. Keine Supabase-/OpenAI-Verbindung, keine Secrets.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function main() {
    execFileSync(process.execPath, ['scripts/build-pages.cjs'], { cwd: root, stdio:'inherit' });
    const { rezept } = await import('../tests/import-fixtures.mjs');
    const extracts = [['browser-test.cjs','function mockInstall()','\n(async()=>'],['rezeptgruppen-browser-test.cjs','function sharingFixture()','\n(async()=>'],['import-browser-test.cjs','function importFixture(result)','\n(async () =>']];
    let fixture = '';
    for (const [file,start,end] of extracts) {
        const source = await fs.readFile(path.join(root,'tests',file),'utf8');
        const from=source.indexOf(start),to=source.indexOf(end);
        if (from<0 || to<=from) throw new Error('Demo-Fixture fehlt: '+file);
        fixture += source.slice(from,to)+'\n';
    }
    fixture += 'mockInstall();sharingFixture();importFixture('+JSON.stringify({hinweise:['Demo: feste Beispielrezepte, keine echte Erkennung.'],rezepte:[rezept('Demo-Kuchen'),rezept('Demo-Suppe')]})+');';
    const files = new Set((await fs.readdir(path.join(root,'dist'),{recursive:true})).map(f=>'/'+f));
    const port=Number(process.env.PORT||3191);
    const config={supabaseUrl:'https://isoliert.invalid',supabasePublishableKey:'mock-public',kiUrl:'/__demo/chat',kiProgressUrl:'/__demo/progress',kiPublishableKey:'mock-public'};
    const answer='### 1. Demo-Reisgericht\nPortionen: 2\n**Zutaten:**\n- 200 g Reis\n**Zubereitung:**\n1. Reis kochen und servieren.';
    const csp="default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
    const server=http.createServer(async(req,res)=>{
        const url=new URL(req.url,'http://localhost');
        res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        try {
            if (url.pathname.startsWith('/__demo/')) { req.resume();res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(url.pathname==='/__demo/chat'?{answer}:{phase:'waiting'})); }
            if(url.pathname==='/demo-supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(fixture);}
            if(url.pathname==='/konfiguration.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.REZEPT_SHARE_KONFIGURATION='+JSON.stringify(config)+';');}
            const file=url.pathname==='/'?'/index.html':url.pathname;
            if(!files.has(file)){res.statusCode=404;return res.end('Nicht gefunden');}
            let body=await fs.readFile(path.join(root,'dist',file));
            const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
            res.setHeader('Content-Type',type);
            if(file==='/index.html') {
                body=body.toString().replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.js','demo-supabase.js')
                    .replace(/\s*<script src="https:\/\/js\.hcaptcha\.com\/[^>]+><\/script>/,'')
                    .replace(/<meta http-equiv="Content-Security-Policy"\s+content="[\s\S]*?">/,'<meta http-equiv="Content-Security-Policy" content="'+csp+'">')
                    .replace('<main>','<main><aside class="hinweis"><strong>LOKALE DEMO: Alle Konten, KI-Antworten und Speicheraktionen sind simuliert.</strong> Keine externen API-Aufrufe. Änderungen verschwinden beim Neuladen.</aside>')
                    .replace('Die komprimierten Bilder werden zur Erkennung über Supabase an OpenAI übertragen. Die App speichert die Seiten nicht dauerhaft. Beim KI-Dienst können nach dessen Datenschutzregeln zeitlich begrenzte Sicherheitsprotokolle anfallen.','Demo-Modus: Bilder bleiben im Browser. Die Erkennung liefert feste Testdaten unabhängig vom Bildinhalt; es wird nichts an Supabase oder OpenAI übertragen.')
                    .replace('Ich stimme der Bildverarbeitung durch OpenAI zu.','Simulierten Import testen – Bilder werden nicht übertragen.');
            }
            res.end(body);
        } catch {res.statusCode=500;res.end('Lokaler Demofehler');}
    });
    server.listen(port,'127.0.0.1',()=>console.log('Isolierte Demo: http://127.0.0.1:'+port+' (nur simulierte Daten)'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
