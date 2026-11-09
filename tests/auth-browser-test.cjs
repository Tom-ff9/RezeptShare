const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
    const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_BINARY});
    try {
        const page = await browser.newPage({ viewport: {width: 1280, height: 900} });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('https://**/*', route => {
            const url = route.request().url();
            if (url.includes('cdn.jsdelivr.net')) return route.fulfill({contentType:'application/javascript',body:`
                window.authCalls = []; window.signupSession = false;
                window.supabase = {createClient:()=>({auth:{
                    getSession:async()=>({data:{session:null}}),
                    signInWithPassword:async args=>{authCalls.push(args);return {error:{message:'Invalid login credentials'}};},
                    signUp:async args=>{authCalls.push(args);return {data:{session:window.signupSession ? {user:{id:'new-user',email:args.email}} : null}};},
                }, from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'new-user',anzeigename:'Test',bild_pfad:null,profilbild_festgelegt:false}})})})})})};`});
            if (url.includes('js.hcaptcha.com/1/api.js')) return route.fulfill({contentType:'application/javascript',body:`
                window.fakeCaptcha = [];
                window.hcaptcha = {
                    render:(element,options)=>{const id=fakeCaptcha.length;fakeCaptcha.push({token:'',options});element.textContent='CAPTCHA-Testwidget';return id;},
                    getResponse:id=>fakeCaptcha[id].token,
                    reset:id=>{fakeCaptcha[id].token='';}
                };
                captchaInitialisieren();`});
            return route.abort();
        });
        await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');
        await page.getByRole('button',{name:'Anmelden',exact:true}).click();
        await page.locator('#anmelde-email').fill('test@example.test');
        await page.locator('#anmelde-passwort').fill('wrong-password');
        await page.evaluate(()=>{fakeCaptcha[0].token='attempt-1';});
        await page.locator('#anmelde-formular button[type=submit]').click();
        await page.getByText('E-Mail-Adresse oder Passwort ist falsch.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>fakeCaptcha[0].token),'');
        await page.locator('#anmelde-formular button[type=submit]').click();
        await page.getByText('Bitte bestätige das CAPTCHA erneut.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>authCalls.length),1);
        await page.evaluate(()=>{fakeCaptcha[0].token='attempt-2';});
        await page.locator('#anmelde-formular button[type=submit]').click();
        await page.getByText('E-Mail-Adresse oder Passwort ist falsch.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>authCalls.length),2);
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Registrieren',exact:true}).click();
        await page.locator('#registrier-name').fill('Test');
        await page.locator('#registrier-email').fill('test@example.test');
        await page.locator('#registrier-passwort').fill('test-password');
        await page.evaluate(()=>{fakeCaptcha[1].token='signup';});
        await page.locator('#registrier-formular button[type=submit]').click();
        await page.getByText(/Die Registrierung konnte nicht abgeschlossen werden/).waitFor();
        assert.equal(await page.locator('#bestaetigungs-email-formular').count(),0);
        await page.setViewportSize({width:375,height:812});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:'/tmp/rezept-auth-registrierung-mobile.png',fullPage:true});
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'Anmelden',exact:true}).click();
        await page.screenshot({path:'/tmp/rezept-auth-anmeldung-mobile.png',fullPage:true});
        await page.mouse.click(3,3);
        assert.equal(await page.locator('#auth-dialog').isVisible(),false);
        await page.getByRole('button',{name:'Registrieren',exact:true}).click();
        await page.locator('#registrier-passwort').fill('test-password');
        await page.evaluate(()=>{window.signupSession=true;fakeCaptcha[1].token='signup-success';});
        await page.locator('#registrier-formular button[type=submit]').click();
        await page.getByRole('heading',{name:'Dein Profilbild',exact:true}).waitFor();
        assert.equal(await page.locator('#auth-dialog').isVisible(),false);
        assert.deepEqual(errors,[]);
        console.log('Browser-Auth erfolgreich: Landingpage, Dialoge, Passwortfehler/erneutes CAPTCHA, Registrierung ohne Sitzung, direktes Profil-Onboarding, Mobile-Layout, Escape und Hintergrundklick (Supabase/CAPTCHA gemockt).');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
