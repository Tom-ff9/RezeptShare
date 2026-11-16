// Nach Freigabe eines separaten Testprojekts als konfiguration.lokal.js kopieren.
// Ausschließlich öffentliche Testprojektwerte. OPENAI_API_KEY nur als Supabase-Secret!
window.REZEPT_SHARE_KONFIGURATION = Object.freeze({
    supabaseUrl: 'https://DEINE_TESTPROJEKT_REFERENZ.supabase.co',
    supabasePublishableKey: 'DEIN_OEFFENTLICHER_TESTPROJEKT_KEY',
    // Im geschützten Buchimport-Testmodus zwingend leer lassen; kein weiterer KI-Dienst.
    kiUrl: '',
    kiPublishableKey: '',
    kiProgressUrl: ''
});
