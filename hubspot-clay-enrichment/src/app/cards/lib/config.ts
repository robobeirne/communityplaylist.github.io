/**
 * Maps every data point the cards show to a HubSpot company property.
 *
 * The clay_* properties match the fields of the Clay account research JSON
 * (see the README for the full Clay field -> HubSpot property table). If you
 * name them differently in HubSpot, change the internal names here. Nothing
 * else in the cards needs to change. Where a field lists several properties,
 * the first one with a value wins (native HubSpot property first, Clay
 * fallback second).
 */
export const FIELDS = {
  name: ['name', 'clay_company_name'],
  website: ['website', 'domain', 'clay_website'],
  linkedin: ['linkedin_company_page', 'clay_linkedin_url'],
  employeeCount: ['numberofemployees', 'clay_employee_count'],

  brief: ['clay_account_brief'], // Clay: result
  whatTheyDo: ['clay_what_they_do'], // Clay: What_They_Do
  siteCount: ['clay_site_count'], // Clay: Site_Count
  siteFootprint: ['clay_site_footprint'], // Clay: Site_Footprint
  typicalSiteProfile: ['clay_typical_site_profile'], // Clay: Typical_Site_Profile
  operatingModel: ['clay_operating_model'], // Clay: Operating_Model
  ownershipStructure: ['clay_ownership_structure'], // Clay: Ownership_And_Structure
  workforce: ['clay_workforce'], // Clay: Workforce
  safetyPosture: ['clay_safety_posture'], // Clay: Safety_Posture
  safetyMetrics: ['clay_safety_metrics'], // Clay: Safety_Metrics
  hazardProfile: ['clay_hazard_profile'], // Clay: Hazard_Profile
  technologySignals: ['clay_technology_signals'], // Clay: Technology_Signals
  whyProtex: ['clay_why_protex'], // Clay: Why_Protex
  landFirstSite: ['clay_land_first'], // Clay: Land_First
  buyingCentre: ['clay_buying_centre'], // Clay: Buying_Centre
  fitScore: ['clay_fit_score'], // Clay: Fit_Score
  disqualifiers: ['clay_disqualifiers'], // Clay: Disqualifiers
  openingAngle: ['clay_opening_angle'], // Clay: Opening_Angle
  sources: ['clay_sources'], // Clay: Sources

  // Optional. Hidden when empty.
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
  'brief',
  'whatTheyDo',
  'siteCount',
  'siteFootprint',
  'typicalSiteProfile',
  'operatingModel',
  'ownershipStructure',
  'workforce',
  'safetyPosture',
  'safetyMetrics',
  'hazardProfile',
  'technologySignals',
  'whyProtex',
  'landFirstSite',
  'buyingCentre',
  'fitScore',
  'disqualifiers',
  'openingAngle',
  'sources',
];

/** Fields that only Clay fills. If all are empty, the record isn't enriched yet. */
export const CLAY_ONLY_FIELDS: FieldKey[] = COVERAGE_FIELDS.slice(4);

/** Enrichment older than this many days is flagged as stale. */
export const STALE_AFTER_DAYS = 90;
