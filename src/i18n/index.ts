import { loadTranslations, t, setLocale, getLocale } from './t.js';
import en from './locales/en.js';

// Auto-load English translations
loadTranslations('en', en);

export { t, setLocale, getLocale, loadTranslations };
