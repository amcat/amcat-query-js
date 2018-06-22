const momentLocales = {
    'nl': 'nl'
};

let momentLocale = null;


if(window.languageCode && momentLocales.hasOwnProperty(window.languageCode) ) {
    momentLocale = `moment-locale/${momentLocales[window.languageCode]}`;
}

define(["moment", momentLocale], function(moment){
    const i18n = {};


    if(typeof django === "undefined" || !django.jsi18n_initialized){
        function noop(x) {
            return x;
        }

        const i18n = {};
        i18n.gettext = noop;
        i18n.ngettext = noop;
        i18n.gettext_noop = noop;
        i18n.pgettext = noop;
        i18n.npgettext = noop;

        i18n.languageCode = "en";
        i18n.highchartsLang = {};

        return i18n;
    }

    const _ = window.gettext;

    i18n.gettext = window.gettext;
    i18n.ngettext = window.ngettext;
    i18n.gettext_noop = window.gettext_noop;
    i18n.pgettext = window.pgettext;
    i18n.npgettext = window.npgettext;

    i18n.languageCode = window.languageCode;

    const localeData = moment.localeData(i18n.languageCode);


    i18n.highchartsLang = { // excludes dates, these are taken from moment.js
        "loading": _("Loading..."),
        "resetZoom": _("Reset zoom"),
        "resetZoomTitle": _("Reset zoom level 1:1"),
        "printChart": _("Print chart"),
        "downloadPNG": _("Download PNG image"),
        "downloadJPEG": _("Download JPEG image"),
        "downloadPDF": _("Download PDF document"),
        "downloadSVG": _("Download SVG vector image"),
        "contextButtonTitle": _("Chart context menu")
    };

    return i18n ;
});

