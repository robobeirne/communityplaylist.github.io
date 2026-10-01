/**
 * Maps every data point the cards show to a HubSpot company property.
 *
 * If your Clay table writes to differently named properties, change the
 * internal names here. Nothing else in the cards needs to change.
 * Where a field lists several properties, the first one with a value wins
 * (native HubSpot property first, Clay fallback second).
 */
export const FIELDS = {
  name: ['name', 'clay_company_name'],
  website: ['website', 'domain', 'clay_website'],
  linkedin: ['linkedin_company_page', 'clay_linkedin_url'],
  employeeCount: ['numberofemployees', 'clay_employee_count'],

  whatTheyDo: ['clay_what_they_do'],
  siteFootprint: ['clay_site_footprint'],
  typicalSiteProfile: ['clay_typical_site_profile'],
  ownershipStructure: ['clay_ownership_structure'],
  workforce: ['clay_workforce'],
  safetyMetrics: ['clay_safety_metrics'],
  hazardProfile: ['clay_hazard_profile'],
  technologySignals: ['clay_technology_signals'],
  whyProtex: ['clay_why_protex'],
  landFirstSite: ['clay_land_first_site'],
  buyingCentre: ['clay_buying_centre'],
  disqualifiers: ['clay_disqualifiers'],
  openingAngle: ['clay_opening_angle'],

  // Optional. The cards hide these when they are empty.
  fitScore: ['clay_protex_fit_score'],
  lastEnriched: ['clay_last_enriched'],
} as const;

export type FieldKey = keyof typeof FIELDS;
export type ClayData = Record<FieldKey, string>;

export const ALL_PROPERTIES: string[] = Array.from(
  new Set(Object.values(FIELDS).flat())
);

/** Fields that count towards the "intel coverage" meter. */
export const COVERAGE_FIELDS: FieldKey[] = [
  'name',
  'website',
  'linkedin',
  'employeeCount',
  'whatTheyDo',
  'siteFootprint',
  'typicalSiteProfile',
  'ownershipStructure',
  'workforce',
  'safetyMetrics',
  'hazardProfile',
  'technologySignals',
  'whyProtex',
  'landFirstSite',
  'buyingCentre',
  'disqualifiers',
  'openingAngle',
];

/** Fields that only Clay fills. If all are empty, the record isn't enriched yet. */
export const CLAY_ONLY_FIELDS: FieldKey[] = COVERAGE_FIELDS.slice(4);

/** Enrichment older than this many days is flagged as stale. */
export const STALE_AFTER_DAYS = 90;
