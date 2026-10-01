// Pure helpers that turn free-text Clay output into structured bits the UI can
// render. Clay columns are usually AI-written text, so everything here is
// forgiving: bad input falls back to plain text, it never throws.

import { FIELDS, type ClayData, type FieldKey } from './config.ts';

const EMPTY_VALUES = new Set(['', '-', '—', 'n/a', 'na', 'null', 'undefined', 'unknown']);
const NONE_VALUES = /^(none|no|nil|none (identified|found|known)|no (disqualifiers|red flags)( (identified|found))?)\.?$/i;
const BULLET = /^\s*(?:[-*•▪◦·–]|\d+[.)]|\[\d+\])\s+/;

export function clean(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return EMPTY_VALUES.has(v.toLowerCase()) ? '' : v;
}

/** Picks the first non-empty property for each field. */
export function resolveFields(properties: Record<string, string | null | undefined>): ClayData {
  const out = {} as ClayData;
  for (const key of Object.keys(FIELDS) as FieldKey[]) {
    out[key] = '';
    for (const prop of FIELDS[key]) {
      const v = clean(properties[prop]);
      if (v) {
        out[key] = v;
        break;
      }
    }
  }
  return out;
}

/** True for values like "None identified" that mean "nothing to worry about". */
export function isNone(value: string): boolean {
  return NONE_VALUES.test(clean(value));
}

/**
 * Splits a value into list items when it is clearly a list: one item per line,
 * bullets, semicolons or pipes. A long comma-separated sentence stays as one item.
 */
export function splitItems(value: string): string[] {
  const v = clean(value);
  if (!v) return [];

  let parts: string[];
  if (isInlineNumbered(v)) {
    parts = v.split(INLINE_NUMBER_SPLIT);
  } else if (/\r?\n/.test(v)) {
    parts = v.split(/\r?\n/);
  } else if (v.includes('•')) {
    parts = v.split('•');
  } else if (/[;|]/.test(v)) {
    parts = v.split(/[;|]/);
  } else {
    const commas = v.split(',');
    const shortList = commas.length >= 3 && commas.every((c) => c.trim().length > 0 && c.trim().length <= 40);
    parts = shortList ? commas : [v];
  }

  return parts.map((p) => p.replace(BULLET, '').trim()).filter(Boolean);
}

// "1. Foo 2. Bar" or "[1] foo [2] bar" written on a single line.
const INLINE_NUMBER_SPLIT = /\s+(?=(?:\d{1,2}[.)]|\[\d{1,2}\])\s)/;

function isInlineNumbered(v: string): boolean {
  if (/\r?\n/.test(v)) return false;
  return /^(?:1[.)]|\[1\])\s/.test(v) && v.split(INLINE_NUMBER_SPLIT).length >= 2;
}

/** True when the text is a numbered list, so it should render as an ordered list. */
export function isNumbered(value: string): boolean {
  const v = clean(value);
  if (isInlineNumbered(v)) return true;
  const lines = v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length >= 2 && lines.every((l) => /^(?:\d{1,2}[.)]|\[\d{1,2}\])\s/.test(l));
}

/** Short items read better as tags than as a bulleted list. */
export function isTaggable(items: string[]): boolean {
  return items.length > 0 && items.every((i) => i.length <= 40);
}

/** Parses "Label: value" lines, for example a buying centre. Returns null if not every item matches. */
export function parseKeyValues(value: string): { label: string; value: string }[] | null {
  const items = splitItems(value);
  if (items.length < 2) return null;
  const pairs = items.map((item) => {
    const m = item.match(/^([^:]{2,40}):\s*(.+)$/);
    return m ? { label: m[1].trim(), value: m[2].trim() } : null;
  });
  return pairs.every(Boolean) ? (pairs as { label: string; value: string }[]) : null;
}

/** Splits text into paragraphs on blank lines. */
export function paragraphs(value: string): string[] {
  return clean(value)
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** First number in a string, so "42 sites across the UK" gives 42 and "1.2k" gives 1200. */
export function firstNumber(value: string): number | null {
  const m = clean(value).match(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return Math.round(n * mult);
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** One-word ownership label for the header, pulled from the ownership text. */
export function ownershipType(value: string): string | null {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  if (/private[- ]equity|pe[- ]backed|portfolio company|buyout/.test(v)) return 'PE-backed';
  if (/publicly|public company|listed|nyse|nasdaq|lse|ftse|euronext|ticker/.test(v)) return 'Public';
  if (/family/.test(v)) return 'Family-owned';
  if (/subsidiary|division of|owned by|part of/.test(v)) return 'Subsidiary';
  if (/government|state[- ]owned|public sector|municipal/.test(v)) return 'Public sector';
  if (/co-?op|cooperative|employee[- ]owned/.test(v)) return 'Employee-owned';
  if (/private/.test(v)) return 'Private';
  return null;
}

/** First sentence, for one-line summaries. */
export function firstSentence(value: string, max = 160): string {
  const v = clean(value).replace(/\s+/g, ' ');
  const m = v.match(/^(.+?[.!?])(\s|$)/);
  const s = m ? m[1] : v;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Days since a HubSpot date value (epoch millis or an ISO date). */
export function daysSince(value: string, now: number = Date.now()): number | null {
  const v = clean(value);
  if (!v) return null;
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / 86_400_000));
}

export function freshnessLabel(days: number): string {
  if (days === 0) return 'Enriched today';
  if (days === 1) return 'Enriched yesterday';
  if (days < 60) return `Enriched ${days} days ago`;
  return `Enriched ${Math.round(days / 30)} months ago`;
}

export function toUrl(value: string): string {
  const v = clean(value);
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function hostname(value: string): string {
  const url = toUrl(value);
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
}

export function logoUrl(website: string): string {
  const host = hostname(website);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : '';
}

/** "Not found" style answers, which Clay uses when a company publishes nothing. */
export function isNotFound(value: string): boolean {
  return /^(not found|none found|not (published|disclosed|available))\b/i.test(clean(value));
}

/** Splits "<lead> — <rest>" (em dash, en dash, hyphen or colon) into its two halves. */
function splitLead(value: string): { lead: string; rest: string } {
  const v = clean(value);
  const m = v.match(/^(.{1,40}?)\s+[—–-]\s+([\s\S]+)$/) || v.match(/^([^:]{1,40}):\s+([\s\S]+)$/);
  return m ? { lead: m[1].trim(), rest: m[2].trim() } : { lead: v, rest: '' };
}

/** Clay Fit_Score: "8 — 47 sites, published TRIR, ..." gives { score: 8, reason: "47 sites, ..." }. */
export function parseFitScore(value: string): { score: number; reason: string } | null {
  const v = clean(value);
  const m = v.match(/^\s*(\d{1,2}(?:\.\d)?)\s*(?:\/\s*10)?/);
  if (!m) return null;
  const score = Math.min(10, Math.max(0, parseFloat(m[1])));
  const reason = v.slice(m[0].length).replace(/^\s*[—–:\-.,]\s*/, '').trim();
  return { score, reason };
}

/** Clay Site_Count: "47 — 41 DCs and 6 plants per the 10-K. High." */
export function parseSiteCount(value: string): {
  count: number | null;
  label: string;
  detail: string;
  confidence: 'High' | 'Medium' | 'Low' | null;
} {
  const v = clean(value);
  const { lead, rest } = splitLead(v);
  const conf = v.match(/\b(high|medium|low)(?:\s+confidence)?\.?\s*$/i) ?? v.match(/confidence[:\s]+(high|medium|low)\b/i);
  const confidence = conf ? ((conf[1][0].toUpperCase() + conf[1].slice(1).toLowerCase()) as 'High' | 'Medium' | 'Low') : null;
  const count = firstNumber(lead);
  const range = lead.match(/^\s*(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/);
  return { count, label: range ? `${range[1]}–${range[2]}` : count !== null ? formatCompact(count) : '', detail: rest || (count === null ? v : ''), confidence };
}

/** Clay Sources: "[1] example.com/page — what it gave, 2025" items, with the URL pulled out. */
export function parseSources(value: string): { label: string; url: string; note: string }[] {
  return splitItems(value).map((item) => {
    const urlMatch = item.match(/(https?:\/\/[^\s,;)]+|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;)]*)?)/i);
    if (!urlMatch) return { label: item, url: '', note: '' };
    const raw = urlMatch[1].replace(/[.,]+$/, '');
    const note = item.slice((urlMatch.index ?? 0) + urlMatch[1].length).replace(/^[\s.,]*[—–:-]?\s*/, '').trim();
    return { label: raw.replace(/^https?:\/\//i, '').replace(/^www\./i, ''), url: toUrl(raw), note };
  });
}
