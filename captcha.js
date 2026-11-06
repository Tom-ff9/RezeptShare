
window.captchaInitialisieren = function () {
    window.anmeldeCaptchaId = hcaptcha.render(
        document.querySelector("#anmelde-formular .h-captcha")
    );

    window.registrierCaptchaId = hcaptcha.render(
        document.querySelector("#registrier-formular .h-captcha")
    );
};
