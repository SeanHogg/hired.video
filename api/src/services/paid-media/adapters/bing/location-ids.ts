/**
 * Microsoft Advertising country LocationIds, keyed by ISO 3166-1 alpha-2.
 *
 * Source: the Geographical Locations file Microsoft publishes
 * (https://learn.microsoft.com/en-us/advertising/guides/geographical-location-codes,
 * downloadable via GetGeoLocationsFileUrl). Add a market by adding a row
 * copied from that file — never by guessing or by branching in code.
 * Countries absent here are reported in the plan's `skipped` list.
 */
export const BING_COUNTRY_LOCATION_IDS: Readonly<Record<string, number>> = {
  US: 190, // United States
  CA: 32, // Canada
  GB: 188, // United Kingdom
};
