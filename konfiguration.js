// Ausschließlich ein separates Testprojekt konfigurieren. Keine produktiven Vorgaben.
// Lokal kann konfiguration.lokal.js diese Datei über server.js ersetzen.
// Hier gehören ausschließlich öffentliche Werte hinein, niemals OPENAI_API_KEY.
window.REZEPT_SHARE_KONFIGURATION = Object.freeze({
    supabaseUrl: "",
    supabasePublishableKey: "",
    kiUrl: "",
    kiPublishableKey: "",
    kiProgressUrl: ""
});
