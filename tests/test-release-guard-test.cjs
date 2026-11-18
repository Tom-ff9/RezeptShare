const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const guard=require('../scripts/supabase-test-guard.cjs');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rezeptshare-release-test-'));
const ref='a'.repeat(20),target={projectRef:ref,projectName:'RezeptShare-Test',environment:'test',confirmedByUser:true};
try {
    fs.mkdirSync(path.join(temp,'supabase/functions/rezept-importieren'),{recursive:true});
    fs.writeFileSync(path.join(temp,'supabase/functions/rezept-importieren/index.ts'),'// synthetic');
    fs.writeFileSync(path.join(temp,'supabase/schema.sql'),'-- synthetic');
    fs.writeFileSync(path.join(temp,'supabase/config.toml'),'[functions.rezept-importieren]\nverify_jwt=false\n');
    fs.mkdirSync(path.join(temp,'.supabase-test/supabase/migrations'),{recursive:true});
    fs.cpSync(path.join(temp,'supabase/functions'),path.join(temp,'.supabase-test/supabase/functions'),{recursive:true});
    fs.copyFileSync(path.join(temp,'supabase/schema.sql'),path.join(temp,'.supabase-test/supabase/migrations/202611150001_test_bootstrap.sql'));
    fs.writeFileSync(path.join(temp,'.supabase-test/supabase/config.toml'),'project_id = "rezeptshare-isolated-test"\n\n'+fs.readFileSync(path.join(temp,'supabase/config.toml')));
    fs.writeFileSync(path.join(temp,'.supabase-test/target.json'),JSON.stringify(target));
    fs.mkdirSync(path.join(temp,'scripts'));fs.writeFileSync(path.join(temp,'scripts/supabase-test-audit.sql'),'select 1;');
    const plan=guard.makePlan(temp,target,ref);
    const source=fs.readFileSync(path.join(root,'scripts/supabase-test-release.cjs'),'utf8');
    function run(action,approved,changeAfterFirst=false) {
        const calls=[],logs=[],process={argv:['node','release.cjs',action,'--confirm-ref',ref,...(approved?['--approved-plan',approved]:[])],env:{OPENAI_API_KEY:'synthetic-not-a-secret',SUPABASE_YES:'1',DATABASE_URL:'synthetic-unrelated-url'}};
        vm.runInNewContext(source,{__dirname:path.join(temp,'scripts'),process,console:{log:m=>logs.push(m),error:m=>logs.push(m)},require(name){
            if(name==='./supabase-test-guard.cjs')return guard;
            if(name==='node:child_process')return{spawnSync:(...args)=>{
                calls.push(args);
                if(changeAfterFirst && calls.length===1) fs.appendFileSync(path.join(temp,'.supabase-test/supabase/functions/rezept-importieren/index.ts'),'\n// changed');
                return{status:0};
            }};
            return require(name);
        }});
        return{calls,logs,code:process.exitCode||0};
    }
    for(const action of ['migrate','deployImport','deploy','secret']) {const r=run(action);assert.equal(r.code,1);assert.equal(r.calls.length,0);}
    for(const action of ['audit','dryRun','migrate','deployImport','deploy','secret']) {
        const r=run(action,plan.planHash);assert.equal(r.code,0);assert.equal(r.calls.length,action==='deploy'?5:1);
        for(const [name,args,options] of r.calls) {
            assert.equal(name,'supabase');assert.ok(args.includes('--remote='+ref));
            for(const variable of ['OPENAI_API_KEY','SUPABASE_YES','DATABASE_URL']) assert.equal(options.env[variable],undefined);
            assert.ok(!args.some(a=>a.includes('synthetic-not-a-secret')));
        }
        if(action==='deployImport') assert.deepEqual(r.calls[0][1].slice(2,4),['functions','deploy']);
        if(action==='deployImport') assert.ok(r.calls[0][1].includes('rezept-importieren'));
        if(action==='secret') {assert.match(r.calls[0][2].input,/OPENAI_API_KEY=synthetic-not-a-secret/);assert.ok(!r.logs.join('\n').includes('synthetic-not-a-secret'));}
    }
    fs.appendFileSync(path.join(temp,'scripts/supabase-test-audit.sql'),'\nselect current_database();');
    const stale=run('migrate',plan.planHash);assert.equal(stale.code,1);assert.equal(stale.calls.length,0);
    const newPlan=guard.makePlan(temp,target,ref);
    const changed=run('deploy',newPlan.planHash,true);assert.equal(changed.code,1);assert.equal(changed.calls.length,1,'Zwischen Deployments geändertes Paket stoppt die Folgeaktion');
    fs.copyFileSync(path.join(temp,'supabase/functions/rezept-importieren/index.ts'),path.join(temp,'.supabase-test/supabase/functions/rezept-importieren/index.ts'));
    fs.writeFileSync(path.join(temp,'konfiguration.lokal.js'),`window.REZEPT_SHARE_KONFIGURATION={supabaseUrl:'https://${ref}.supabase.co',supabasePublishableKey:'sb_publishable_synthetic',kiUrl:'',kiPublishableKey:'',kiProgressUrl:''};`);
    const starts=[];
    const fakeProcess={argv:['node','start-test-live.cjs','--confirm-ref',ref],execPath:process.execPath,env:{OPENAI_API_KEY:'synthetic',SUPABASE_ACCESS_TOKEN:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},on(){}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/start-test-live.cjs'),'utf8'),{__dirname:path.join(temp,'scripts'),process:fakeProcess,console:{error(){},log(){}},require(name){
        if(name==='./supabase-test-guard.cjs')return guard;
        if(name==='node:child_process')return{spawn:(...args)=>{starts.push(args);return{on(){},kill(){}};}};
        return require(name);
    }});
    assert.equal(starts.length,1);assert.equal(starts[0][2].env.REZEPTSHARE_TEST_PROJECT_REF,ref);
    for(const key of ['OPENAI_API_KEY','SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY'])assert.equal(starts[0][2].env[key],undefined);
    console.log('Release-Schutz erfolgreich: Freigabe, Audit-Hash, Paketwechsel, festes Ziel, keine Umgebungs-Zielüberschreibung und Secret nur über stdin (CLI vollständig gemockt).');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
