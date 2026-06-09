/**
 * SolarisSwahili — js/i18n.js
 *
 * Shared translation module for about.html, compare.html, and dashboard.html.
 * Exports the global `SubI18N` object used by each page's inline script.
 *
 * Loaded as a plain <script> tag just before each page's own script block.
 * Applies the saved language to all [data-i18n] elements immediately on load.
 *
 * Intentionally minimal — only translates nav links that are shared across
 * all pages. Pages with richer translation needs (compare, dashboard) extend
 * this by reading SubI18N.getLang() and branching in their own code.
 */
/* global SubI18N */
const SubI18N = (function () {
    'use strict';

    var T = {
        ar: {
            navHome:      'الرئيسية',
            navAbout:     'عن المشروع',
            navCompare:   'مقارنة',
            navDashboard: 'إحصائيات'
        },
        en: {
            navHome:      'Home',
            navAbout:     'About',
            navCompare:   'Compare',
            navDashboard: 'Dashboard'
        }
    };

    var lang = localStorage.getItem('ss_lang') || 'ar';

    function apply() {
        var isAr = lang === 'ar';
        document.documentElement.lang = lang;
        document.documentElement.dir  = isAr ? 'rtl' : 'ltr';

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var val = T[lang][el.dataset.i18n];
            if (val !== undefined) el.textContent = val;
        });

        /* Sync the lang-toggle button label */
        var lb = document.getElementById('lang-toggle');
        if (lb) lb.textContent = isAr ? 'EN' : 'عر';
    }

    /* Apply immediately so nav is translated before the page is interactive */
    apply();

    return {
        /**
         * Returns the current language code ('ar' or 'en').
         */
        getLang: function () { return lang; },

        /**
         * Toggles the language, persists it, and re-applies to the DOM.
         * Page scripts should call their own renderCards() / renderAll() etc.
         * after this to re-render any content that is not covered by [data-i18n].
         */
        toggle: function () {
            lang = (lang === 'ar') ? 'en' : 'ar';
            localStorage.setItem('ss_lang', lang);
            apply();
        }
    };
})();
