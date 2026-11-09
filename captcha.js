// Tokens sind einmalig: vor jeder Auth-Anfrage entnehmen, danach das Widget zurücksetzen.
(() => {
    const widgets = new Map();
    let bereit = false;
    const verbrauchteTokens = new Set();
    function aktivieren(formular) {
        if (!formular || !bereit || !window.hcaptcha) return;
        const box = formular.querySelector('.h-captcha');
        if (!box || widgets.has(formular.id)) return;
        const widget = window.hcaptcha.render(box, {
            sitekey: box.dataset.sitekey,
            size: 'compact',
            'expired-callback': () => zuruecksetzen(formular),
            'error-callback': () => {
                const meldung = document.querySelector('#auth-meldung');
                meldung.classList.remove('erfolgsmeldung');
                meldung.textContent = 'CAPTCHA konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es erneut.';
            }
        });
        widgets.set(formular.id, widget);
    }
    function entnehmen(formular) {
        aktivieren(formular);
        const widget = widgets.get(formular.id);
        if (widget === undefined || !window.hcaptcha) throw new Error('CAPTCHA wird noch geladen. Bitte versuche es gleich erneut.');
        const token = window.hcaptcha.getResponse(widget);
        if (!token || verbrauchteTokens.has(token)) throw new Error('Bitte bestätige das CAPTCHA erneut.');
        verbrauchteTokens.add(token);
        return token;
    }
    function zuruecksetzen(formular) {
        const widget = widgets.get(formular.id);
        if (widget !== undefined && window.hcaptcha) {
            try { window.hcaptcha.reset(widget); } catch { /* Ein Ladefehler darf die Fehlerbehandlung nicht unterbrechen. */ }
        }
    }
    window.rezeptCaptcha = { aktivieren, entnehmen, zuruecksetzen };
    window.captchaInitialisieren = () => {
        bereit = true;
        const dialog = document.querySelector('#auth-dialog');
        if (dialog?.open) dialog.querySelectorAll('form:not([hidden])').forEach(aktivieren);
    };
})();
