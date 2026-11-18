// Settings legal owns. Change them here; the card, the readiness check and the order form terms
// all read from this file. The entity and MSA link are taken from Protex's current order form.

/** False until legal confirms the wording in terms.ts. The card warns and the quote's terms carry a DRAFT notice. */
export const TERMS_APPROVED = false;
/** Protex's contracting entity, as it appears in the order form's Terms and Conditions. */
export const PROTEX_ENTITY = 'Protex AI Limited';
/** The standard MSA that applies when no MSA has been executed separately. */
export const STANDARD_MSA_URL = 'www.protex.ai/legal';
