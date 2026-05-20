/**
 * ISO-3166 alpha-2 → { name, lat, lon } for the GeoHotspotMap.
 *
 * Centroids are approximate population-weighted points (so e.g. US is
 * inside the continental US rather than mid-Pacific Hawaii average).
 * Anything not in this table falls back to {0,0} and lands off the
 * African coast — acceptable since the hover label still shows the raw
 * code, and the rollup row beneath the map covers it textually.
 *
 * "ZZ" is the sentinel used by the studio analytics aggregator for rows
 * where Cloudflare didn't resolve a country (header stripped, local
 * dev, Tor exit). Surfaced as "Unknown" with no dot on the map.
 */

export interface CountryCentroid {
  name: string;
  /** Decimal degrees, -90..90. */
  lat: number;
  /** Decimal degrees, -180..180. */
  lon: number;
}

export const COUNTRY_CENTROIDS: Record<string, CountryCentroid> = {
  // North America
  US: { name: "United States", lat: 39.5, lon: -98.35 },
  CA: { name: "Canada", lat: 56.13, lon: -106.35 },
  MX: { name: "Mexico", lat: 23.63, lon: -102.55 },
  GT: { name: "Guatemala", lat: 15.78, lon: -90.23 },
  CR: { name: "Costa Rica", lat: 9.75, lon: -83.75 },
  PA: { name: "Panama", lat: 8.54, lon: -80.78 },
  CU: { name: "Cuba", lat: 21.52, lon: -77.78 },
  DO: { name: "Dominican Republic", lat: 18.74, lon: -70.16 },
  PR: { name: "Puerto Rico", lat: 18.22, lon: -66.59 },
  HT: { name: "Haiti", lat: 18.97, lon: -72.29 },

  // South America
  BR: { name: "Brazil", lat: -14.24, lon: -51.93 },
  AR: { name: "Argentina", lat: -38.42, lon: -63.62 },
  CL: { name: "Chile", lat: -35.68, lon: -71.54 },
  CO: { name: "Colombia", lat: 4.57, lon: -74.3 },
  PE: { name: "Peru", lat: -9.19, lon: -75.02 },
  VE: { name: "Venezuela", lat: 6.42, lon: -66.59 },
  EC: { name: "Ecuador", lat: -1.83, lon: -78.18 },
  BO: { name: "Bolivia", lat: -16.29, lon: -63.59 },
  UY: { name: "Uruguay", lat: -32.52, lon: -55.77 },
  PY: { name: "Paraguay", lat: -23.44, lon: -58.44 },

  // Europe — west
  GB: { name: "United Kingdom", lat: 55.38, lon: -3.44 },
  IE: { name: "Ireland", lat: 53.41, lon: -8.24 },
  FR: { name: "France", lat: 46.23, lon: 2.21 },
  DE: { name: "Germany", lat: 51.17, lon: 10.45 },
  NL: { name: "Netherlands", lat: 52.13, lon: 5.29 },
  BE: { name: "Belgium", lat: 50.5, lon: 4.47 },
  LU: { name: "Luxembourg", lat: 49.82, lon: 6.13 },
  CH: { name: "Switzerland", lat: 46.82, lon: 8.23 },
  AT: { name: "Austria", lat: 47.52, lon: 14.55 },
  IT: { name: "Italy", lat: 41.87, lon: 12.57 },
  ES: { name: "Spain", lat: 40.46, lon: -3.75 },
  PT: { name: "Portugal", lat: 39.4, lon: -8.22 },

  // Europe — north & east
  DK: { name: "Denmark", lat: 56.26, lon: 9.5 },
  SE: { name: "Sweden", lat: 60.13, lon: 18.64 },
  NO: { name: "Norway", lat: 60.47, lon: 8.47 },
  FI: { name: "Finland", lat: 61.92, lon: 25.75 },
  IS: { name: "Iceland", lat: 64.96, lon: -19.02 },
  PL: { name: "Poland", lat: 51.92, lon: 19.15 },
  CZ: { name: "Czechia", lat: 49.82, lon: 15.47 },
  SK: { name: "Slovakia", lat: 48.67, lon: 19.7 },
  HU: { name: "Hungary", lat: 47.16, lon: 19.5 },
  RO: { name: "Romania", lat: 45.94, lon: 24.97 },
  BG: { name: "Bulgaria", lat: 42.73, lon: 25.49 },
  GR: { name: "Greece", lat: 39.07, lon: 21.82 },
  HR: { name: "Croatia", lat: 45.1, lon: 15.2 },
  SI: { name: "Slovenia", lat: 46.15, lon: 14.99 },
  RS: { name: "Serbia", lat: 44.02, lon: 21.01 },
  UA: { name: "Ukraine", lat: 48.38, lon: 31.17 },
  BY: { name: "Belarus", lat: 53.71, lon: 27.95 },
  LT: { name: "Lithuania", lat: 55.17, lon: 23.88 },
  LV: { name: "Latvia", lat: 56.88, lon: 24.6 },
  EE: { name: "Estonia", lat: 58.6, lon: 25.01 },
  RU: { name: "Russia", lat: 61.52, lon: 105.32 },
  TR: { name: "Turkey", lat: 38.96, lon: 35.24 },
  CY: { name: "Cyprus", lat: 35.13, lon: 33.43 },
  MT: { name: "Malta", lat: 35.94, lon: 14.38 },

  // Middle East
  IL: { name: "Israel", lat: 31.05, lon: 34.85 },
  PS: { name: "Palestine", lat: 31.95, lon: 35.23 },
  JO: { name: "Jordan", lat: 30.59, lon: 36.24 },
  LB: { name: "Lebanon", lat: 33.85, lon: 35.86 },
  SY: { name: "Syria", lat: 34.8, lon: 38.99 },
  IQ: { name: "Iraq", lat: 33.22, lon: 43.68 },
  IR: { name: "Iran", lat: 32.43, lon: 53.69 },
  SA: { name: "Saudi Arabia", lat: 23.89, lon: 45.08 },
  AE: { name: "UAE", lat: 23.42, lon: 53.85 },
  QA: { name: "Qatar", lat: 25.35, lon: 51.18 },
  KW: { name: "Kuwait", lat: 29.31, lon: 47.48 },
  BH: { name: "Bahrain", lat: 25.93, lon: 50.64 },
  OM: { name: "Oman", lat: 21.51, lon: 55.92 },
  YE: { name: "Yemen", lat: 15.55, lon: 48.52 },

  // Asia
  CN: { name: "China", lat: 35.86, lon: 104.2 },
  HK: { name: "Hong Kong", lat: 22.4, lon: 114.11 },
  TW: { name: "Taiwan", lat: 23.7, lon: 120.96 },
  JP: { name: "Japan", lat: 36.2, lon: 138.25 },
  KR: { name: "South Korea", lat: 36.0, lon: 127.77 },
  KP: { name: "North Korea", lat: 40.34, lon: 127.51 },
  MN: { name: "Mongolia", lat: 46.86, lon: 103.85 },
  IN: { name: "India", lat: 20.59, lon: 78.96 },
  PK: { name: "Pakistan", lat: 30.38, lon: 69.35 },
  BD: { name: "Bangladesh", lat: 23.68, lon: 90.36 },
  LK: { name: "Sri Lanka", lat: 7.87, lon: 80.77 },
  NP: { name: "Nepal", lat: 28.39, lon: 84.12 },
  AF: { name: "Afghanistan", lat: 33.94, lon: 67.71 },
  KZ: { name: "Kazakhstan", lat: 48.02, lon: 66.92 },
  UZ: { name: "Uzbekistan", lat: 41.38, lon: 64.59 },
  TH: { name: "Thailand", lat: 15.87, lon: 100.99 },
  VN: { name: "Vietnam", lat: 14.06, lon: 108.28 },
  PH: { name: "Philippines", lat: 12.88, lon: 121.77 },
  ID: { name: "Indonesia", lat: -0.79, lon: 113.92 },
  MY: { name: "Malaysia", lat: 4.21, lon: 101.98 },
  SG: { name: "Singapore", lat: 1.35, lon: 103.82 },
  MM: { name: "Myanmar", lat: 21.91, lon: 95.96 },
  KH: { name: "Cambodia", lat: 12.57, lon: 104.99 },
  LA: { name: "Laos", lat: 19.86, lon: 102.5 },

  // Oceania
  AU: { name: "Australia", lat: -25.27, lon: 133.78 },
  NZ: { name: "New Zealand", lat: -40.9, lon: 174.89 },
  PG: { name: "Papua New Guinea", lat: -6.31, lon: 143.96 },
  FJ: { name: "Fiji", lat: -17.71, lon: 178.07 },

  // Africa
  EG: { name: "Egypt", lat: 26.82, lon: 30.8 },
  LY: { name: "Libya", lat: 26.34, lon: 17.23 },
  DZ: { name: "Algeria", lat: 28.03, lon: 1.66 },
  TN: { name: "Tunisia", lat: 33.89, lon: 9.54 },
  MA: { name: "Morocco", lat: 31.79, lon: -7.09 },
  ZA: { name: "South Africa", lat: -30.56, lon: 22.94 },
  NG: { name: "Nigeria", lat: 9.08, lon: 8.68 },
  KE: { name: "Kenya", lat: -0.02, lon: 37.91 },
  ET: { name: "Ethiopia", lat: 9.15, lon: 40.49 },
  GH: { name: "Ghana", lat: 7.95, lon: -1.02 },
  TZ: { name: "Tanzania", lat: -6.37, lon: 34.89 },
  UG: { name: "Uganda", lat: 1.37, lon: 32.29 },
  CM: { name: "Cameroon", lat: 7.37, lon: 12.35 },
  SN: { name: "Senegal", lat: 14.5, lon: -14.45 },
  CI: { name: "Côte d'Ivoire", lat: 7.54, lon: -5.55 },
  AO: { name: "Angola", lat: -11.2, lon: 17.87 },
  MZ: { name: "Mozambique", lat: -18.67, lon: 35.53 },
  ZW: { name: "Zimbabwe", lat: -19.02, lon: 29.15 },
  ZM: { name: "Zambia", lat: -13.13, lon: 27.85 },
  RW: { name: "Rwanda", lat: -1.94, lon: 29.87 },
  MG: { name: "Madagascar", lat: -18.77, lon: 46.87 },
  SD: { name: "Sudan", lat: 12.86, lon: 30.22 },
};

/** Look up a country's display name + centroid. Returns null when the
 *  code isn't in our table (caller can decide whether to fall back to
 *  the raw code or drop the entry). */
export function lookupCountry(code: string): { name: string; lat: number; lon: number } | null {
  if (!code || code === "ZZ") return null;
  const entry = COUNTRY_CENTROIDS[code.toUpperCase()];
  return entry ? entry : null;
}
