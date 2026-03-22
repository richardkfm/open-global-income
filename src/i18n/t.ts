type TranslationDict = Record<string, string | Record<string, string | Record<string, string>>>;

let currentLocale = 'en';
let translations: Record<string, TranslationDict> = {};

/** Load translations for a locale */
export function loadTranslations(locale: string, dict: TranslationDict): void {
  translations[locale] = dict;
}

/** Set the active locale */
export function setLocale(locale: string): void {
  currentLocale = locale;
}

/** Get the active locale */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Translate a key with optional interpolation params.
 * Keys use dot notation: 'nav.dashboard', 'login.title'
 * Params replace {{param}} placeholders: t('greeting', { name: 'Alice' })
 * Falls back to the key itself if not found.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // Resolve nested key via dot notation
  const dict = translations[currentLocale] ?? translations['en'] ?? {};
  const parts = key.split('.');
  let value: unknown = dict;
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      value = undefined;
      break;
    }
  }

  let result = typeof value === 'string' ? value : key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }

  return result;
}
