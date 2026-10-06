export type IndustryCode = 'L' | 'M' | 'R';

export interface Question {
  n: number;
  topic: string;
  question: string;
  why: string;
  whoToAsk: string[];
  /** 'All', or the one industry this money question is for. */
  industry: string;
  key: boolean;
  theirWords: boolean;
  /** Importance in the discovery health score (2 or 3). */
  weight: number;
  /** Level needed at stages 1-5: 0 not yet, 1 Touched on, 2 Answered, 3 Confirmed. */
  needed: number[];
  statusProperty: string | null;
  detailsProperty: string | null;
  /** Every deal property recorded against this question, in card order. */
  properties: string[];
  details: { label: string; value: string }[];
  ways: Record<'open' | 'label' | 'noOriented' | 'mirror' | 'accusationAudit' | 'summary', string[]>;
  listenFor: string;
  redFlag: string;
  whyClose: string;
}

export interface Persona {
  who: string;
  leads: string[];
  also: string[];
  titles: Record<IndustryCode, string>;
  dontAsk: string;
}

export interface CloseEvidence {
  signal: string;
  from: string;
  points: number;
  evidence: string;
}
