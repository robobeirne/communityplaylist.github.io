import { daysSince, leadTag, resolveWith } from '../lib/parse.ts';
import { CONTACT_CLAY_FIELDS, CONTACT_FIELDS, type ContactData } from './config.ts';

export function resolveContact(props: Record<string, string | null | undefined>): ContactData {
  return resolveWith(CONTACT_FIELDS, props) as ContactData;
}

export function isContactEnriched(d: ContactData): boolean {
  return CONTACT_CLAY_FIELDS.some((k) => !!d[k]);
}

export function contactCoverage(d: ContactData): { filled: number; total: number } {
  return { filled: CONTACT_CLAY_FIELDS.filter((k) => !!d[k]).length, total: CONTACT_CLAY_FIELDS.length };
}

export function fullName(d: ContactData): string {
  return [d.firstName, d.lastName].filter(Boolean).join(' ');
}

type TagVariant = 'default' | 'warning' | 'success' | 'error' | 'info';

/** Profile Currency: warn when Clay says the public profile may be out of date. */
export function currencyVariant(value: string): TagVariant {
  const v = leadTag(value, 80).toLowerCase();
  if (/(stale|outdated|out of date|old|unverified|unclear|may have (moved|left)|not current|uncertain|low)/.test(v)) return 'warning';
  if (/(current|up to date|recent|verified|confirmed|high)/.test(v)) return 'success';
  return 'default';
}

/** Buying Authority: green for budget holders and signers, amber for influence only. */
export function authorityVariant(value: string): TagVariant {
  // Judge the lead only ("Influencer — … does not sign" must not read as a signer).
  const v = leadTag(value, 80).toLowerCase();
  if (/(none|no authority|no budget|unlikely|low|not )/.test(v)) return 'default';
  if (/(sign|budget holder|budget owner|final|high|economic buyer|approv)/.test(v)) return 'success';
  if (/(influenc|recommend|medium|partial|shared)/.test(v)) return 'warning';
  return 'info';
}

export { daysSince, leadTag };
