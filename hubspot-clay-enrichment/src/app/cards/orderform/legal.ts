// Settings legal owns. Change them here; the card, the readiness check and the order form terms
// all read from this file.

/** False until legal approves the wording in terms.ts. The card warns and the quote's terms carry a DRAFT notice. */
export const TERMS_APPROVED = false;
/** Protex's contracting entity, as it should appear on the order form. Legal to confirm. */
export const PROTEX_ENTITY = 'Protex AI';
/** Public link to the standard MSA that "Standard MSA" order forms accept. Legal to supply; until then, Standard MSA can't be sent. */
export const STANDARD_MSA_URL = '';
