/**
 * Contact profile fields from Clay, mapped to HubSpot contact properties.
 * Change the internal names here if Clay writes to different properties.
 */
export const CONTACT_FIELDS = {
  firstName: ['firstname'],
  lastName: ['lastname'],
  jobTitle: ['jobtitle'],
  company: ['company'],
  linkedin: ['hs_linkedin_url', 'linkedin_url'],

  brief: ['clay_contact_brief'], // Clay: result (250-350 words)
  currentRole: ['clay_contact_current_role'],
  careerHistory: ['clay_contact_career_history'],
  credentials: ['clay_contact_background_credentials'],
  profileCurrency: ['clay_contact_profile_currency'],
  scopeRemit: ['clay_contact_scope_remit'],
  reportingLine: ['clay_contact_reporting_line'],
  publicVoice: ['clay_contact_public_voice'],
  statedPriorities: ['clay_contact_stated_priorities'],
  technologyPosture: ['clay_contact_technology_posture'],
  dealRole: ['clay_contact_likely_deal_role'],
  buyingAuthority: ['clay_contact_buying_authority'],
  hooks: ['clay_contact_personalisation_hooks'],
  approachNotes: ['clay_contact_approach_notes'],
  pathsIn: ['clay_contact_paths_in'],
  footprint: ['clay_contact_footprint_assessment'],

  // Optional. Hidden when empty.
  lastEnriched: ['clay_contact_last_enriched'],
} as const;

export type ContactKey = keyof typeof CONTACT_FIELDS;
export type ContactData = Record<ContactKey, string>;

export const CONTACT_PROPERTIES: string[] = Array.from(new Set(Object.values(CONTACT_FIELDS).flat()));

/** The 16 Clay data points, in the order of the Clay output. */
export const CONTACT_CLAY_FIELDS: ContactKey[] = [
  'currentRole',
  'careerHistory',
  'credentials',
  'profileCurrency',
  'scopeRemit',
  'reportingLine',
  'publicVoice',
  'statedPriorities',
  'technologyPosture',
  'dealRole',
  'buyingAuthority',
  'hooks',
  'approachNotes',
  'pathsIn',
  'footprint',
  'brief',
];
