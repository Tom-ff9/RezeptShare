// Nur lokale Paketvorbereitung. Kein Supabase-CLI-Aufruf, kein Netzwerk, kein Secret.
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.supabase-test');
async function main() {
    // Exklusiv anlegen: Vorhandene Konfiguration und Testdaten niemals ersetzen.
    await fs.mkdir(target);
    await fs.mkdir(path.join(target,'supabase','migrations'),{recursive:true});
    await fs.copyFile(path.join(root,'supabase','schema.sql'),path.join(target,'supabase','migrations','202611150001_test_bootstrap.sql'));
    await fs.cp(path.join(root,'supabase','functions'),path.join(target,'supabase','functions'),{recursive:true});
    const config=await fs.readFile(path.join(root,'supabase','config.toml'),'utf8');
    await fs.writeFile(path.join(target,'supabase','config.toml'),'project_id = "rezeptshare-isolated-test"\n\n'+config);
    await fs.writeFile(path.join(target,'README.txt'),'NUR für ein NEUES, LEERES Testprojekt. Vollschema in einer Bootstrap-Migration; alte Upgrade-Migrationen nicht zusätzlich ausführen. Vor jeder Remote-Aktion Zielprojekt prüfen und ausdrückliche Freigabe einholen. Keine Verknüpfung, Migration, Secrets oder Deployments wurden ausgeführt.\n');
    console.log('Lokales Supabase-Testpaket vorbereitet: '+target);
}
main().catch(error=>{console.error(error.code==='EEXIST'?'Testpaket existiert bereits; nichts überschrieben.':error.message);process.exitCode=1;});
