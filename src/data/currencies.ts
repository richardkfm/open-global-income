export interface CurrencyInfo {
  code: string;      // ISO 4217 code (e.g., 'EUR')
  symbol: string;    // Currency symbol (e.g., '€')
  name: string;      // English name (e.g., 'Euro')
  decimals: number;  // Standard decimal places (usually 2)
}

/**
 * Map of ISO 4217 currency codes to currency info.
 * Covers all currencies used by countries in countries.json.
 */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$',    name: 'US Dollar',               decimals: 2 },
  EUR: { code: 'EUR', symbol: '€',    name: 'Euro',                    decimals: 2 },
  GBP: { code: 'GBP', symbol: '£',    name: 'British Pound',           decimals: 2 },
  JPY: { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',            decimals: 0 },
  CAD: { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar',         decimals: 2 },
  AUD: { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar',       decimals: 2 },
  KRW: { code: 'KRW', symbol: '₩',    name: 'South Korean Won',        decimals: 0 },
  CHF: { code: 'CHF', symbol: 'CHF',  name: 'Swiss Franc',             decimals: 2 },
  SEK: { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona',           decimals: 2 },
  NOK: { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone',         decimals: 2 },
  SGD: { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar',        decimals: 2 },
  ILS: { code: 'ILS', symbol: '₪',    name: 'Israeli New Shekel',      decimals: 2 },
  CNY: { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',            decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',          decimals: 2 },
  MXN: { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',            decimals: 2 },
  TRY: { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',            decimals: 2 },
  THB: { code: 'THB', symbol: '฿',    name: 'Thai Baht',               decimals: 2 },
  MYR: { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit',       decimals: 2 },
  ZAR: { code: 'ZAR', symbol: 'R',    name: 'South African Rand',      decimals: 2 },
  COP: { code: 'COP', symbol: 'COP$', name: 'Colombian Peso',          decimals: 2 },
  ARS: { code: 'ARS', symbol: '$',    name: 'Argentine Peso',          decimals: 2 },
  PEN: { code: 'PEN', symbol: 'S/',   name: 'Peruvian Sol',            decimals: 2 },
  INR: { code: 'INR', symbol: '₹',    name: 'Indian Rupee',            decimals: 2 },
  IDR: { code: 'IDR', symbol: 'Rp',   name: 'Indonesian Rupiah',       decimals: 2 },
  PHP: { code: 'PHP', symbol: '₱',    name: 'Philippine Peso',         decimals: 2 },
  VND: { code: 'VND', symbol: '₫',    name: 'Vietnamese Dong',         decimals: 0 },
  EGP: { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound',          decimals: 2 },
  BDT: { code: 'BDT', symbol: '৳',    name: 'Bangladeshi Taka',        decimals: 2 },
  PKR: { code: 'PKR', symbol: '₨',    name: 'Pakistani Rupee',         decimals: 2 },
  KES: { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling',         decimals: 2 },
  GHS: { code: 'GHS', symbol: 'GH₵',  name: 'Ghanaian Cedi',          decimals: 2 },
  UAH: { code: 'UAH', symbol: '₴',    name: 'Ukrainian Hryvnia',       decimals: 2 },
  MAD: { code: 'MAD', symbol: 'MAD',  name: 'Moroccan Dirham',         decimals: 2 },
  MMK: { code: 'MMK', symbol: 'K',    name: 'Myanmar Kyat',            decimals: 2 },
  NGN: { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira',          decimals: 2 },
  ETB: { code: 'ETB', symbol: 'Br',   name: 'Ethiopian Birr',          decimals: 2 },
  CDF: { code: 'CDF', symbol: 'FC',   name: 'Congolese Franc',         decimals: 2 },
  MZN: { code: 'MZN', symbol: 'MT',   name: 'Mozambican Metical',      decimals: 2 },
  UGX: { code: 'UGX', symbol: 'USh',  name: 'Ugandan Shilling',        decimals: 0 },
  AFN: { code: 'AFN', symbol: '؋',    name: 'Afghan Afghani',          decimals: 2 },
  MWK: { code: 'MWK', symbol: 'MK',   name: 'Malawian Kwacha',         decimals: 2 },
  XOF: { code: 'XOF', symbol: 'CFA',  name: 'West African CFA Franc',  decimals: 0 },
  XAF: { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', decimals: 0 },
  BIF: { code: 'BIF', symbol: 'Fr',   name: 'Burundian Franc',         decimals: 0 },
  SLE: { code: 'SLE', symbol: 'Le',   name: 'Sierra Leonean Leone',    decimals: 2 },
};

/**
 * Maps ISO 3166-1 alpha-2 country codes to ISO 4217 currency codes.
 * Covers all 49 countries in countries.json.
 */
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // High income — developed markets
  US: 'USD', // United States
  DE: 'EUR', // Germany
  GB: 'GBP', // United Kingdom
  FR: 'EUR', // France
  JP: 'JPY', // Japan
  CA: 'CAD', // Canada
  AU: 'AUD', // Australia
  KR: 'KRW', // South Korea
  IT: 'EUR', // Italy
  ES: 'EUR', // Spain
  NL: 'EUR', // Netherlands
  CH: 'CHF', // Switzerland
  SE: 'SEK', // Sweden
  NO: 'NOK', // Norway
  SG: 'SGD', // Singapore
  IL: 'ILS', // Israel

  // Upper-middle income
  CN: 'CNY', // China
  BR: 'BRL', // Brazil
  MX: 'MXN', // Mexico
  TR: 'TRY', // Turkey
  TH: 'THB', // Thailand
  MY: 'MYR', // Malaysia
  ZA: 'ZAR', // South Africa
  CO: 'COP', // Colombia
  AR: 'ARS', // Argentina
  PE: 'PEN', // Peru

  // Lower-middle income
  IN: 'INR', // India
  ID: 'IDR', // Indonesia
  PH: 'PHP', // Philippines
  VN: 'VND', // Vietnam
  EG: 'EGP', // Egypt
  BD: 'BDT', // Bangladesh
  PK: 'PKR', // Pakistan
  KE: 'KES', // Kenya
  GH: 'GHS', // Ghana
  UA: 'UAH', // Ukraine
  MA: 'MAD', // Morocco
  MM: 'MMK', // Myanmar
  NG: 'NGN', // Nigeria

  // Low income
  ET: 'ETB', // Ethiopia
  CD: 'CDF', // DR Congo
  MZ: 'MZN', // Mozambique
  UG: 'UGX', // Uganda
  AF: 'AFN', // Afghanistan
  MW: 'MWK', // Malawi
  NE: 'XOF', // Niger (WAEMU member — uses XOF)
  TD: 'XAF', // Chad (CEMAC member — uses XAF)
  BI: 'BIF', // Burundi
  SL: 'SLE', // Sierra Leone
};

/**
 * Get currency info for a given ISO 3166-1 alpha-2 country code.
 * Returns undefined if the country is not in the map.
 */
export function getCurrencyForCountry(countryCode: string): CurrencyInfo | undefined {
  const currencyCode = COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()];
  if (!currencyCode) return undefined;
  return CURRENCIES[currencyCode];
}

/**
 * Get currency info by ISO 4217 currency code.
 * Returns undefined if the code is not in the CURRENCIES map.
 */
export function getCurrencyByCode(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code.toUpperCase()];
}

/**
 * Format an amount in a given currency using Intl.NumberFormat.
 * Falls back to showing the raw number with the currency code appended
 * if the currency code is not recognised by the runtime.
 *
 * @param amount       Numeric amount to format
 * @param currencyCode ISO 4217 currency code (e.g. 'KES')
 * @param locale       BCP 47 locale tag (default 'en-US')
 */
export function formatLocalCurrency(
  amount: number,
  currencyCode: string,
  locale = 'en-US',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: CURRENCIES[currencyCode]?.decimals ?? 2,
      maximumFractionDigits: CURRENCIES[currencyCode]?.decimals ?? 2,
    }).format(amount);
  } catch {
    // Graceful fallback for environments with limited Intl support
    return `${amount.toFixed(CURRENCIES[currencyCode]?.decimals ?? 2)} ${currencyCode}`;
  }
}
