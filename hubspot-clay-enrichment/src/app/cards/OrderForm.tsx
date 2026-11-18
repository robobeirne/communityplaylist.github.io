import React from 'react';
import {
  Accordion,
  Alert,
  AutoGrid,
  Button,
  DateInput,
  Divider,
  ErrorState,
  Flex,
  Heading,
  Input,
  Link,
  List,
  LoadingButton,
  LoadingSpinner,
  NumberInput,
  ProgressBar,
  Select,
  Statistics,
  StatisticsItem,
  StatusTag,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tag,
  Text,
  TextArea,
  Tile,
  hubspot,
} from '@hubspot/ui-extensions';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';
import ORDER_FORM_PROPERTIES from './orderform/properties.json';
import {
  CONTEXT,
  NUMBERED_SITES,
  REUSED,
  SECTIONS,
  computedProperties,
  dealAmount,
  isoDate,
  orderTypeFromPipeline,
  parseDate,
  parseSiteList,
  readiness,
  readSites,
  msaStatus,
  normaliseStatus,
  summarise,
  termMonths,
  type Gap,
  type Section,
  type Site,
  type Summary,
  type Values,
} from './orderform/calc.ts';
import {
  DISCOUNT_APPROVAL_PCT,
  NEW_PREFIX,
  defaultQuantity,
  lineIssues,
  lineUpdate,
  newRawLine,
  quantityRule,
  resetToList,
  termUpdate,
  toLine,
  type Line,
  type LineEdit,
  type LineIssue,
  type Product,
  type RawLine,
} from './orderform/lines.ts';
import { orderComments, orderTerms } from './orderform/terms.ts';
import { isInclusion, missingInclusions } from './orderform/inclusions.ts';
import { PROTEX_ENTITY, STANDARD_MSA_URL, TERMS_APPROVED } from './orderform/legal.ts';

/*
 * Order form: everything the order form and MSA need, captured on the deal. Pricing is the deal's
 * line items, drawn from the product library at list price with a discount per line. Totals, the contract end date, the pricing table and the
 * site schedule are calculated here and saved with the rest. When nothing required is missing,
 * "Create order form" makes the HubSpot quote that the client e-signs. Juro is only for MSA redlines.
 */

hubspot.extend<'crm.record.tab'>(({ actions, context }) => (
  <OrderForm
    actions={actions}
    dealId={String(context.crm.objectId)}
    portalId={String(context.portal?.id ?? '')}
    user={{ email: context.user?.email ?? '', firstName: context.user?.firstName ?? '', lastName: context.user?.lastName ?? '' }}
  />
));

const FN = 'save_order_form';
type Def = { name: string; label: string; options?: { label: string; value: string }[] };
const DEFS = Object.fromEntries((ORDER_FORM_PROPERTIES as Def[]).map((d) => [d.name, d]));
const PROPS = [...(ORDER_FORM_PROPERTIES as Def[]).map((d) => d.name), ...REUSED, ...CONTEXT];
const options = (name: string) => DEFS[name]?.options ?? [];

// Options of the existing deal properties the card reuses.
const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD'].map((c) => ({ label: c, value: c }));
const TERMS = ['3', '6', '9', '12', '15', '18', '24', '36'].map((m) => ({ label: `${m} months`, value: `${m} months` }));
const YES_NO = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
];
const PRO_RATA = [
  { label: 'Yes', value: 'Yes' },
  { label: 'No', value: 'No' },
];
const DISCOUNT_MODES = [
  { label: '% off', value: 'percent' },
  { label: 'Off per unit', value: 'amount' },
];
const STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  draft: 'default',
  ready_to_send: 'info',
  sent: 'warning',
  signed: 'success',
};
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', ready_to_send: 'Ready to send', sent: 'Sent', signed: 'Signed' };
const QUOTE_LABEL: Record<string, string> = {
  draft: 'Quote draft',
  awaiting_approval: 'Awaiting approval',
  sent: 'Sent for signature',
  signed: 'Signed',
  expired: 'Expired',
  rejected: 'Rejected',
};
const QUOTE_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'info',
  awaiting_approval: 'warning',
  sent: 'warning',
  signed: 'success',
  expired: 'danger',
  rejected: 'danger',
};
/** "3. Sites and rollout · still needed: Rollout, Site 3: go-live date", or "· complete". */
function sectionTitle(i: number, title: string, gaps: Gap[]): string {
  if (!gaps.length) return `${i + 1}. ${title} · complete`;
  const names = gaps.slice(0, 2).map((g) => g.label);
  return `${i + 1}. ${title} · still needed: ${names.join(', ')}${gaps.length > 2 ? ` and ${gaps.length - 2} more` : ''}`;
}
/** Fields laid out several to a row, wrapping on narrow screens. */
const Grid = ({ children }: { children: React.ReactNode }) => (
  <AutoGrid columnWidth={200} gap="sm" flexible>
    {children}
  </AutoGrid>
);
const SubHead = ({ children }: { children: string }) => <Text format={{ fontWeight: 'demibold' }}>{children}</Text>;
const MSA_OPTIONS = [
  { label: 'Existing MSA', value: 'existing_msa' },
  { label: 'Standard MSA (accepted by signing this order form)', value: 'standard_msa' },
  { label: 'Negotiating in Juro', value: 'negotiating_in_juro' },
  { label: 'Signed in Juro', value: 'signed_in_juro' },
];

type Signer = { id: string; name: string; email: string; title: string };
type Person = { id: string; name: string; email: string; title: string };
type Setter = (key: string, value: string) => void;
type Pricing = { lines: RawLine[]; products: Product[] };
type Quote = { id: string; title: string; state: string; expires: string; link: string; signedAt?: string };
type Template = { id: string; name: string };
type QuoteInfo = { quotes: Quote[]; current: Quote | null; live: Quote[]; templates: Template[]; templatesError: string };
type User = { email: string; firstName: string; lastName: string };
type Body = {
  ok: boolean;
  /** Saved, but something was skipped (e.g. a deal property that doesn't exist yet). */
  warning?: string;
  quote?: Quote;
  quotes?: Quote[];
  current?: Quote | null;
  live?: Quote[];
  templates?: Template[];
  templatesError?: string;
  message?: string;
  properties?: Values;
  users?: Signer[];
  lines?: RawLine[] | null;
  products?: Product[];
  contacts?: Person[];
  company?: Record<string, string> | null;
};

const label = (name: string, fallback = name) => DEFS[name]?.label ?? fallback;
const optionLabel = (name: string, value: string | null | undefined) => options(name).find((o) => o.value === value)?.label ?? '';

function money(n: number | null, currency: string): string {
  if (n === null) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
const shortDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
const toBase = (v: unknown) => {
  const d = parseDate(v);
  return d ? { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() } : undefined;
};
const fromBase = (b: { year: number; month: number; date: number } | null | undefined) =>
  b && b.year ? isoDate(new Date(Date.UTC(b.year, b.month, b.date))) : '';
const isoOf = (v: unknown) => {
  const d = parseDate(v);
  return d ? isoDate(d) : '';
};

export function OrderForm({ actions, dealId, portalId, user }: { actions: CrmActions; dealId: string; portalId: string; user: User }) {
  const { props, error, loading } = useRecordProperties(actions, PROPS);
  const [saved, setSaved] = React.useState<Values>({});
  const [edits, setEdits] = React.useState<Values>({});
  const [saving, setSaving] = React.useState(false);
  const [signers, setSigners] = React.useState<Signer[] | null>(null);
  const [signersError, setSignersError] = React.useState('');
  /** Open sections: all closed to start, and only the rep (or a still-needed link) opens or closes them. */
  const [openSections, setOpenSections] = React.useState<Section[]>([]);
  const [pricing, setPricing] = React.useState<Pricing | null>(null);
  const [pricingError, setPricingError] = React.useState('');
  const [contacts, setContacts] = React.useState<Person[] | null>(null);
  const [company, setCompany] = React.useState<Record<string, string> | null>(null);
  const [partiesError, setPartiesError] = React.useState('');
  const [lineEdits, setLineEdits] = React.useState<Record<string, LineEdit>>({});
  /** Products added in the card and not saved yet, in the order they were added. */
  const [added, setAdded] = React.useState<{ id: string; productId: string }[]>([]);
  const nextId = React.useRef(1);
  const [quoteInfo, setQuoteInfo] = React.useState<QuoteInfo | null>(null);
  const [quoteError, setQuoteError] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const call = React.useCallback(async (parameters: Record<string, unknown>) => {
    const res = await hubspot.serverless(FN, { parameters: parameters as never });
    const body = ((res as { body?: unknown })?.body ?? res) as Body;
    if (!body?.ok && !body?.lines) throw new Error(body?.message ?? 'Request failed');
    return body;
  }, []);

  const loadQuote = React.useCallback(() => {
    call({ action: 'quote', dealId })
      .then((b) => {
        setQuoteInfo({ quotes: b.quotes ?? [], current: b.current ?? null, live: b.live ?? [], templates: b.templates ?? [], templatesError: b.templatesError ?? '' });
        setQuoteError('');
        // The server keeps the order form status in step with the quote; show what it wrote.
        if (b.properties && Object.keys(b.properties).length) setSaved((s) => ({ ...s, ...b.properties }));
      })
      .catch((e: Error) => setQuoteError(e.message));
  }, [call, dealId]);

  React.useEffect(() => {
    call({ action: 'signatories' })
      .then((b) => setSigners(b.users ?? []))
      .catch((e: Error) => setSignersError(e.message));
    call({ action: 'pricing', dealId })
      .then((b) => setPricing({ lines: b.lines ?? [], products: b.products ?? [] }))
      .catch((e: Error) => setPricingError(e.message));
    loadQuote();
    call({ action: 'parties', dealId })
      .then((b) => {
        setContacts(b.contacts ?? []);
        setCompany(b.company ?? null);
      })
      .catch((e: Error) => {
        setContacts([]);
        setPartiesError(e.message);
      });
  }, [call, dealId, loadQuote]);

  // New business: add the free standard rows (Intelligence, Deployment Services, Standard Support)
  // once, and record it so a row a rep removes stays removed.
  const inclusionsChecked = React.useRef(false);
  const markInclusions = React.useRef(false);
  React.useEffect(() => {
    if (inclusionsChecked.current || !props || !pricing) return;
    const cur = { ...props, ...saved, ...edits };
    const type = cur.of_order_type || orderTypeFromPipeline(cur.pipeline);
    if (type !== 'new_business' || cur.of_standard_inclusions_added === 'true' || !cur.deal_currency_code) return;
    inclusionsChecked.current = true;
    const missing = missingInclusions(
      pricing.products,
      pricing.lines.map((l) => String(l.properties.hs_product_id ?? '')),
      readSites(cur).length,
    );
    if (!missing.length) {
      markInclusions.current = true; // already there: just record it with the next save
      return;
    }
    const rows = missing.map((m) => ({ id: `${NEW_PREFIX}${nextId.current++}`, productId: m.product.id, quantity: m.quantity }));
    setAdded((a) => [...a, ...rows.map(({ id, productId }) => ({ id, productId }))]);
    setLineEdits((e) => ({ ...e, ...Object.fromEntries(rows.map((row) => [row.id, { quantity: row.quantity }])) }));
    setEdits((e) => ({ ...e, of_standard_inclusions_added: 'true' }));
  }, [props, pricing, saved, edits]);

  if (loading) return <LoadingSpinner label="Loading the order form" layout="centered" />;
  if (error || !props) {
    return (
      <ErrorState title="Couldn't load the order form">
        <Text>{error ?? 'Unknown error'}</Text>
      </ErrorState>
    );
  }

  const v: Values = { ...props, ...saved, ...edits };
  if (!v.of_order_type) v.of_order_type = orderTypeFromPipeline(v.pipeline);
  const set: Setter = (key, value) => setEdits((e) => ({ ...e, [key]: value }));
  const currency = String(v.deal_currency_code || '');
  const products = pricing?.products ?? [];

  const raws: RawLine[] = [
    ...(pricing?.lines ?? []),
    ...added.flatMap((a) => {
      const p = products.find((x) => x.id === a.productId);
      return p ? [newRawLine(a.id, p, currency)] : [];
    }),
  ];
  const lines: Line[] = raws.map((raw) => toLine(raw, lineEdits[raw.id], products, currency));
  const sum = summarise(v, lines);
  const r = readiness(v, lines);
  if (!pricing) {
    r.required++;
    r.missing.push({ section: 'pricing', label: pricingError ? "Line items (couldn't load them)" : 'Line items (loading)' });
  }
  const status = normaliseStatus(v.of_status);
  const current = quoteInfo?.current ?? null;
  const liveQuote = current && ['draft', 'awaiting_approval', 'sent', 'signed'].includes(current.state) ? current : null;

  // Recurring lines bill for the contract term from the billing start, so HubSpot's own ARR and TCV
  // on the line items agree with the order form. Saving brings them into line.
  const months = termMonths(v.term_year_length);
  const billingStart = isoOf(v.subscription_start_date) || isoOf(v.contract_start_date);
  // The deal's Amount follows the line items (annual subscription after discounts).
  const newAmount = pricing ? dealAmount(lines) : null;
  const currentAmount = parseFloat(String(v.amount ?? ''));
  const amountStale = newAmount !== null && !(Math.abs((Number.isFinite(currentAmount) ? currentAmount : NaN) - newAmount) < 0.005);
  const termFixes = (pricing?.lines ?? [])
    .filter((raw) => !lineEdits[raw.id]?.remove)
    .map((raw) => ({ raw, fix: termUpdate(raw, months, billingStart) }))
    .filter((x) => x.fix);
  const dirty = Object.keys(edits).length > 0 || added.length > 0 || Object.keys(lineEdits).length > 0;

  const people = { contacts: contacts ?? [], loading: contacts === null, error: partiesError };

  const editLine = (id: string, change: LineEdit) => {
    if (id.startsWith(NEW_PREFIX) && change.remove) {
      setAdded((a) => a.filter((x) => x.id !== id));
      setLineEdits(({ [id]: _, ...rest }) => rest);
      return;
    }
    setLineEdits((e) => ({ ...e, [id]: { ...e[id], ...change } }));
  };
  const undoLine = (id: string) => setLineEdits(({ [id]: _, ...rest }) => rest);
  const addProduct = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const id = `${NEW_PREFIX}${nextId.current++}`;
    setAdded((a) => [...a, { id, productId }]);
    setLineEdits((e) => ({ ...e, [id]: { quantity: defaultQuantity(p, sum.siteCount, sum.siteCameras) } }));
  };

  const lineChanges = () => {
    const create = lines
      .filter((l) => l.id.startsWith(NEW_PREFIX))
      .map((l) => ({ productId: l.productId, quantity: l.quantity, discountMode: l.discountMode, discountValue: l.discountValue, months, start: billingStart }));
    const update: { id: string; productId: string; properties: Record<string, string>; resetPrice?: boolean }[] = [];
    const remove: string[] = [];
    for (const raw of pricing?.lines ?? []) {
      const e = lineEdits[raw.id];
      if (e?.remove) {
        remove.push(raw.id);
        continue;
      }
      const l = lines.find((x) => x.id === raw.id)!;
      const properties = { ...(e ? lineUpdate(l) : {}), ...(termUpdate(raw, months, billingStart) ?? {}) };
      if (Object.keys(properties).length || e?.resetPrice) update.push({ id: raw.id, productId: l.productId, properties, ...(e?.resetPrice ? { resetPrice: true } : {}) });
    }
    return { create, update, remove };
  };

  const save = async (extra: Values = {}) => {
    setSaving(true);
    const sent = { ...edits };
    const sentLines = { ...lineEdits };
    const sentAdded = added.map((a) => a.id);
    try {
      const payload: Values = { ...sent, ...computedProperties(v, lines), ...extra };
      if (markInclusions.current) payload.of_standard_inclusions_added = 'true';
      if (!props.of_order_type) payload.of_order_type = v.of_order_type;
      // The quote is a copy taken when it was created, so flag changes made after it.
      if (dirty && liveQuote && v.of_changed_after_quote !== 'true') payload.of_changed_after_quote = 'true';
      const changes = pricing ? lineChanges() : { create: [], update: [], remove: [] };
      const b = await call({ action: 'save', dealId, properties: payload, lines: changes });
      setSaved((s) => ({ ...s, ...(b.properties ?? {}) }));
      // Clear only what was sent: anything typed while the save was in flight stays as an unsaved edit.
      setEdits((cur) => {
        const next = { ...cur };
        for (const [k, val] of Object.entries(sent)) if (next[k] === val) delete next[k];
        return next;
      });
      if (b.lines) {
        setPricing((p) => ({ products: p?.products ?? [], lines: b.lines! }));
        setLineEdits((cur) => {
          const next = { ...cur };
          for (const [k, val] of Object.entries(sentLines)) if (next[k] === val) delete next[k];
          return next;
        });
        setAdded((cur) => cur.filter((a) => !sentAdded.includes(a.id)));
      }
      if (b.warning) actions.addAlert({ type: 'warning', message: b.warning });
      if (!b.ok) {
        actions.addAlert({ type: 'warning', message: b.message ?? 'Some line item changes were not saved.' });
        return false;
      }
      actions.refreshObjectProperties();
      return true;
    } catch (e) {
      actions.addAlert({ type: 'danger', message: `Couldn't save: ${(e as Error).message}` });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const templates = quoteInfo?.templates ?? [];
  const chosenTemplate = templateId || (templates.find((x) => /order form/i.test(x.name)) ?? templates[0])?.id || '';
  const createQuote = async (replaceQuoteId?: string) => {
    setCreating(true);
    try {
      const b = await call({
        action: 'create_quote',
        dealId,
        templateId: chosenTemplate,
        title: `${v.dealname || 'Order form'} | Order form`,
        expirationDate: isoOf(v.of_offer_expiry_date),
        currency,
        terms: orderTerms(v),
        comments: orderComments(v),
        signerContactId: v.of_counterparty_signer_contact_id,
        companyId: company?.id,
        sender: { firstName: user.firstName, lastName: user.lastName, email: user.email, company: PROTEX_ENTITY },
        replaceQuoteId,
      });
      setSaved((s) => ({ ...s, ...(b.properties ?? {}) }));
      actions.addAlert({ type: 'success', message: 'Order form quote created. Open it to check it, add the Protex countersigner and send it for signature.' });
      if (b.warning) actions.addAlert({ type: 'warning', message: b.warning });
      actions.refreshObjectProperties();
      loadQuote();
    } catch (e) {
      actions.addAlert({ type: 'danger', message: `Couldn't create the order form: ${(e as Error).message}` });
      loadQuote();
    } finally {
      setCreating(false);
    }
  };

  const missingIn = (s: Section) => r.missing.filter((g) => g.section === s);
  const toggle = (k: Section) => setOpenSections((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const reveal = (k: Section) => setOpenSections((o) => (o.includes(k) ? o : [...o, k]));
  const done = r.required - r.missing.length;
  const shared = { v, set, currency, sum };
  const t = sum.totals;

  return (
    <Flex direction="column" gap="md">
      <Tile>
        <Flex direction="column" gap="sm">
          <Flex direction="row" justify="between" align="center" wrap="wrap" gap="sm">
            <Flex direction="row" gap="sm" align="center" wrap="wrap">
              <Heading>Order form</Heading>
              <Tag variant="info">{optionLabel('of_order_type', v.of_order_type)}</Tag>
              <StatusTag variant={STATUS_VARIANT[status] ?? 'default'}>{STATUS_LABEL[status]}</StatusTag>
            </Flex>
            {v.of_ready_at && (
              <Text variant="microcopy">{`Order form created ${shortDate(parseDate(v.of_ready_at))}${v.of_ready_by ? ` by ${v.of_ready_by}` : ''}`}</Text>
            )}
          </Flex>
          <Statistics>
            <StatisticsItem label="Annual subscription" number={money(t.annual, currency)} />
            <StatisticsItem label="Total contract value" number={money(t.tcv, currency)} />
            <StatisticsItem label="Discount" number={t.discountPct ? `${t.discountPct}%` : 'None'} />
            <StatisticsItem label="Sites" number={String(sum.siteCount)} />
          </Statistics>
          <ProgressBar
            title="Ready to send"
            value={done}
            maxValue={r.required}
            valueDescription={`${done} of ${r.required} required details`}
            variant={r.missing.length ? 'warning' : 'success'}
          />
        </Flex>
      </Tile>

      {r.missing.length > 0 ? (
        <Alert title={`Still needed before sending (${r.missing.length})`} variant="warning">
          <Flex direction="column" gap="xs">
            {SECTIONS.filter((s) => missingIn(s.key).length).map((s) => (
              <Text key={s.key}>
                <Link href="#" preventDefault onClick={() => reveal(s.key)}>
                  {s.title}
                </Link>
                {`: ${missingIn(s.key).map((g) => g.label).join('; ')}`}
              </Text>
            ))}
          </Flex>
        </Alert>
      ) : (
        <Alert title="Everything the order form needs is here" variant="success">
          <Text>{liveQuote ? 'The order form quote is below.' : 'Check the totals and the terms preview, then create the order form.'}</Text>
        </Alert>
      )}
      {r.warnings.length > 0 && (
        <Alert title="Check these" variant="danger">
          <List variant="unordered">
            {r.warnings.map((w, i) => (
              <Text key={i}>{w.label}</Text>
            ))}
          </List>
        </Alert>
      )}

      <Actions dirty={dirty} saving={saving} onSave={() => save()} />

      <QuotePanel
        v={v}
        portalId={portalId}
        info={quoteInfo}
        error={quoteError}
        current={current}
        missing={r.missing.length}
        dirty={dirty}
        busy={creating || saving}
        templateId={chosenTemplate}
        onTemplate={setTemplateId}
        onCreate={createQuote}
        onRefresh={loadQuote}
      />

      {SECTIONS.map((s, i) => {
        const gaps = missingIn(s.key);
        return (
          <Accordion key={s.key} title={sectionTitle(i, s.title, gaps)} open={openSections.includes(s.key)} onClick={() => toggle(s.key)} size="sm">
              <Flex direction="column" gap="sm">
              {s.key === 'client' && <ClientSection {...shared} people={people} company={company} />}
              {s.key === 'order' && <OrderSection {...shared} />}
              {s.key === 'pricing' && (
                <ProductsSection
                  {...shared}
                  lines={lines}
                  products={products}
                  loaded={!!pricing}
                  loadError={pricingError}
                  edits={lineEdits}
                  onEdit={editLine}
                  onUndo={undoLine}
                  onAdd={addProduct}
                  termFixes={termFixes.length}
                  amount={{ next: newAmount, current: Number.isFinite(currentAmount) ? currentAmount : null, stale: amountStale }}
                  canSync={!dirty && !saving}
                  onSync={() => save()}
                />
              )}
              {s.key === 'sites' && <SitesSection {...shared} />}
              {s.key === 'legal' && <LegalSection {...shared} people={people} signers={signers} signersError={signersError} />}
              <Missing gaps={missingIn(s.key)} />
            </Flex>
          </Accordion>
        );
      })}

      {dirty && (
        <Actions dirty={dirty} saving={saving} onSave={() => save()} />
      )}
    </Flex>
  );
}

function Actions(p: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <Flex direction="row" gap="sm" align="center" wrap="wrap">
      <LoadingButton variant="primary" loading={p.saving} disabled={!p.dirty} onClick={p.onSave}>
        {p.dirty ? 'Save changes' : 'Saved'}
      </LoadingButton>
      {p.dirty && <Text variant="microcopy">Unsaved changes</Text>}
    </Flex>
  );
}

/** Quote HTML as plain text, for the preview. */
const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(td|th)>(?=\s*<t[dh])/g, '   ')
    .replace(/<\/(tr|li|h3)>\s*/g, '\n')
    .replace(/<li>/g, '• ')
    .replace(/<\/(p|table|ul)>\s*/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** The order form quote: create it, or show where it's at and what to do next. */
function QuotePanel(p: {
  v: Values;
  portalId: string;
  info: QuoteInfo | null;
  error: string;
  current: Quote | null;
  missing: number;
  dirty: boolean;
  busy: boolean;
  templateId: string;
  onTemplate: (id: string) => void;
  onCreate: (replaceQuoteId?: string) => void;
  onRefresh: () => void;
}) {
  const { v, info, current } = p;
  const [preview, setPreview] = React.useState(false);
  const quoteUrl = (id: string) => `https://app.hubspot.com/quotes/${p.portalId}/details/${id}`;
  const live = info?.live ?? [];
  const ours = current && live.some((q) => q.id === current.id) ? current : null;
  const others = live.filter((q) => q.id !== ours?.id);
  const changed = v.of_changed_after_quote === 'true';
  const canCreate = !p.missing && !p.dirty && !!p.templateId && !p.busy;
  const createLabel = p.missing ? `Create order form · ${p.missing} to fill` : p.dirty ? 'Save, then create the order form' : 'Create order form';
  const signer = String(v.of_protex_signer_name || 'the Protex signatory');

  let body: React.ReactNode;
  if (p.error) {
    body = (
      <Text variant="microcopy">
        {`Couldn't check the deal's quotes (${p.error}). If the card was just updated, reinstall the app so it can read and create quotes.`}
      </Text>
    );
  } else if (!info) {
    body = <LoadingSpinner label="Checking the deal's quotes" size="sm" />;
  } else if (ours) {
    body = (
      <Flex direction="column" gap="xs">
        <Flex direction="row" gap="sm" align="center" wrap="wrap">
          <Text format={{ fontWeight: 'demibold' }}>{ours.title}</Text>
          <StatusTag variant={QUOTE_VARIANT[ours.state] ?? 'default'}>{QUOTE_LABEL[ours.state] ?? ours.state}</StatusTag>
          {ours.expires && ours.state !== 'signed' && <Text variant="microcopy">{`Expires ${shortDate(parseDate(ours.expires))}`}</Text>}
        </Flex>
        <Text>
          {ours.state === 'draft'
            ? `Next: open the quote, check it, add ${signer} as the countersigner, then publish it and send it for e-signature.`
            : ours.state === 'awaiting_approval'
              ? 'Waiting for approval in HubSpot.'
              : ours.state === 'sent'
                ? 'Sent to the client for e-signature.'
                : `Signed${ours.signedAt ? ` ${shortDate(new Date(ours.signedAt))}` : ''}.`}
        </Text>
        <Flex direction="row" gap="md" wrap="wrap">
          <Link href={quoteUrl(ours.id)}>Open the quote in HubSpot</Link>
          {ours.link && <Link href={ours.link}>The client's view</Link>}
          <Link href="#" preventDefault onClick={p.onRefresh}>
            Refresh status
          </Link>
        </Flex>
        {changed && ours.state === 'draft' && (
          <Alert title="The order form changed after this quote was created" variant="warning">
            <Flex direction="column" gap="xs">
              <Text>The quote still has the old details. Replace the draft to pick up the changes.</Text>
              <Flex direction="row">
                <LoadingButton size="sm" variant="secondary" loading={p.busy} disabled={!canCreate} onClick={() => p.onCreate(ours.id)}>
                  {p.missing || p.dirty ? createLabel.replace('Create order form', 'Replace the draft quote') : 'Replace the draft quote'}
                </LoadingButton>
              </Flex>
            </Flex>
          </Alert>
        )}
        {changed && ours.state !== 'draft' && ours.state !== 'signed' && (
          <Alert title="The order form changed after this quote was sent" variant="warning">
            <Text>The quote the client has doesn't include the changes. To send a new version, delete or expire this quote in HubSpot, then create the order form again here.</Text>
          </Alert>
        )}
      </Flex>
    );
  } else if (others.length) {
    body = (
      <Flex direction="column" gap="xs">
        <Text>{`This deal already has a live quote, so the order form can't be created: ${others.map((q) => `${q.title} (${QUOTE_LABEL[q.state] ?? q.state})`).join(', ')}.`}</Text>
        <Flex direction="row" gap="md" wrap="wrap">
          {others.map((q) => (
            <Link key={q.id} href={quoteUrl(q.id)}>{`Open ${q.title}`}</Link>
          ))}
          <Link href="#" preventDefault onClick={p.onRefresh}>
            Refresh
          </Link>
        </Flex>
        <Text variant="microcopy">Delete it or let it expire in HubSpot, then come back and create the order form.</Text>
      </Flex>
    );
  } else {
    body = (
      <Flex direction="column" gap="sm">
        {current && (current.state === 'expired' || current.state === 'rejected') && (
          <Text variant="microcopy">{`The last order form quote (${current.title}) is ${current.state}. Create a new one when the details are right.`}</Text>
        )}
        {info.templates.length ? (
          <Select
            name="quote-template"
            label="Quote template"
            value={p.templateId}
            options={info.templates.map((x) => ({ label: x.name, value: x.id }))}
            onChange={(x) => p.onTemplate(String(x ?? ''))}
          />
        ) : (
          <Text variant="microcopy">
            {`No quote templates found${info.templatesError ? ` (${info.templatesError})` : ''}. Set one up in Settings > Objects > Quotes > Templates.`}
          </Text>
        )}
        <Flex direction="row" gap="sm" align="center" wrap="wrap">
          <LoadingButton variant="primary" loading={p.busy} disabled={!canCreate} onClick={() => p.onCreate()}>
            {createLabel}
          </LoadingButton>
          <Text variant="microcopy">Creates a draft HubSpot quote with these line items, e-signature on, for you to check and send.</Text>
        </Flex>
      </Flex>
    );
  }

  return (
    <Tile>
      <Flex direction="column" gap="sm">
        <Text format={{ fontWeight: 'demibold' }}>Order form quote</Text>
        {!TERMS_APPROVED && (
          <Text variant="microcopy">The order form terms are placeholder wording until legal approves them. Quotes created now carry a DRAFT notice in their terms.</Text>
        )}
        {body}
        <Accordion title="Preview the order form text" size="sm" open={preview} onClick={() => setPreview(!preview)}>
          <Flex direction="column" gap="sm">
            <Text format={{ fontWeight: 'demibold' }}>Comments to buyer</Text>
            {plain(orderComments(v))
              .split('\n')
              .map((line, i) => (
                <Text key={`c${i}`}>{line || ' '}</Text>
              ))}
            <Divider />
            <Text format={{ fontWeight: 'demibold' }}>Terms</Text>
            {plain(orderTerms(v))
              .split('\n')
              .map((line, i) => (
                <Text key={`t${i}`}>{line || ' '}</Text>
              ))}
          </Flex>
        </Accordion>
      </Flex>
    </Tile>
  );
}

function Missing({ gaps }: { gaps: Gap[] }) {
  if (!gaps.length) return null;
  return <Text variant="microcopy">{`Still needed: ${gaps.map((g) => g.label).join('; ')}`}</Text>;
}

type Shared = { v: Values; set: Setter; currency: string; sum: Summary };

/* ---------------- field helpers ---------------- */

function TextField({ v, set, name, label: l, area, required }: { v: Values; set: Setter; name: string; label?: string; area?: boolean; required?: boolean }) {
  const common = { name, label: l ?? label(name), value: String(v[name] ?? ''), required, onChange: (x: string) => set(name, x) };
  return area ? <TextArea {...common} rows={2} /> : <Input {...common} />;
}

function SelectField({ v, set, name, label: l, opts, required, value }: { v: Values; set: Setter; name: string; label?: string; opts?: { label: string; value: string }[]; required?: boolean; value?: string }) {
  return (
    <Select
      name={name}
      label={l ?? label(name)}
      required={required}
      value={value ?? String(v[name] ?? '')}
      options={opts ?? options(name)}
      onChange={(x) => set(name, String(x ?? ''))}
    />
  );
}

function DateField({ v, set, name, label: l, required }: { v: Values; set: Setter; name: string; label?: string; required?: boolean }) {
  return (
    <DateInput
      name={name}
      label={l ?? label(name)}
      required={required}
      format="ll"
      value={toBase(v[name])}
      onChange={(d) => set(name, fromBase(d))}
    />
  );
}

type People = { contacts: Person[]; loading: boolean; error: string };

/** Fill name/email/title fields from one of the deal's contacts. */
function ContactPicker({ people, label: l, onPick }: { people: People; label: string; onPick: (p: Person) => void }) {
  if (people.loading) return <LoadingSpinner label="Loading the deal's contacts" size="sm" />;
  if (people.error) return <Text variant="microcopy">{`Couldn't load the deal's contacts (${people.error}). Type the details below.`}</Text>;
  if (!people.contacts.length) return <Text variant="microcopy">No contacts on this deal yet. Associate one to fill these details from it.</Text>;
  return (
    <Select
      name={`pick-${l}`}
      label={l}
      placeholder="Choose a contact on this deal"
      options={people.contacts.map((p) => ({
        label: [p.name || p.email || 'Unnamed contact', p.title, p.name && p.email ? p.email : ''].filter(Boolean).join(' — '),
        value: p.id,
      }))}
      onChange={(id) => {
        const p = people.contacts.find((x) => x.id === String(id));
        if (p) onPick(p);
      }}
    />
  );
}

/* ---------------- sections ---------------- */

function ClientSection({ v, set, people, company }: Shared & { people: People; company: Record<string, string> | null }) {
  const companyAddress = company
    ? [company.address, company.address2, company.city, company.state, company.zip, company.country].filter(Boolean).join(', ')
    : '';
  return (
    <Flex direction="column" gap="sm">
      {company?.name && (
        <Flex direction="row" gap="sm" align="center" wrap="wrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!v.of_client_legal_name) set('of_client_legal_name', String(company.name));
              if (!v.of_client_legal_address && companyAddress) set('of_client_legal_address', companyAddress);
            }}
          >
            Fill from the company
          </Button>
          <Text variant="microcopy">{`Uses ${company.name}${companyAddress ? ` and its address` : ''}. Check it matches the legal entity.`}</Text>
        </Flex>
      )}
      <Grid>
        <TextField v={v} set={set} name="of_client_legal_name" required />
        <TextField v={v} set={set} name="of_client_company_number" />
        <TextField v={v} set={set} name="of_client_tax_id" />
      </Grid>
      <TextField v={v} set={set} name="of_client_legal_address" area required />
      <SubHead>Client contact</SubHead>
      <Grid>
        <ContactPicker
          people={people}
          label="Fill from a deal contact"
          onPick={(p) => {
            set('of_client_contact_name', p.name);
            set('of_client_contact_email', p.email);
            set('of_client_contact_title', p.title);
          }}
        />
        <TextField v={v} set={set} name="of_client_contact_name" label="Name" required />
        <TextField v={v} set={set} name="of_client_contact_email" label="Email" required />
        <TextField v={v} set={set} name="of_client_contact_title" label="Job title" />
      </Grid>
      <SubHead>Billing</SubHead>
      <Grid>
        <ContactPicker
          people={people}
          label="Fill billing from a deal contact"
          onPick={(p) => {
            set('of_billing_contact_name', p.name);
            set('client_s_email_for_invoicing_', p.email);
          }}
        />
        <TextField v={v} set={set} name="of_billing_contact_name" label="Billing contact" />
        <TextField v={v} set={set} name="client_s_email_for_invoicing_" label="Billing email (TBD if blank)" />
        <SelectField v={v} set={set} name="of_po_required" label="PO needed before invoicing?" opts={YES_NO} />
        <TextField v={v} set={set} name="purchase_order" label="PO number" />
      </Grid>
      <TextField v={v} set={set} name="of_billing_address" label="Billing address (blank = as legal entity address)" area />
    </Flex>
  );
}

function OrderSection({ v, set, sum }: Shared) {
  const renewal = v.of_order_type === 'renewal';
  return (
    <Flex direction="column" gap="sm">
      <Grid>
        <SelectField v={v} set={set} name="of_order_type" required />
        <SelectField v={v} set={set} name="deal_currency_code" label="Currency" opts={CURRENCIES} required />
        <DateField v={v} set={set} name="of_quote_date" required />
        <DateField v={v} set={set} name="of_offer_expiry_date" required />
        <DateField v={v} set={set} name="of_target_signature_date" required />
      </Grid>
      <SubHead>Term and billing</SubHead>
      <Grid>
        <SelectField v={v} set={set} name="term_year_length" label="Subscription term" opts={TERMS} required />
        {renewal ? (
          <DateField v={v} set={set} name="contract_start_date" label="Contract start date" required />
        ) : (
          <DateField v={v} set={set} name="contract_start_date" label="Expected first Deployment Date" />
        )}
        <DateField v={v} set={set} name="subscription_start_date" label="Billing starts (if not on signature)" />
        <SelectField v={v} set={set} name="of_billing_frequency" required />
        <SelectField v={v} set={set} name="of_payment_terms" required />
        <SelectField v={v} set={set} name="of_auto_renew" label="Auto-renews" opts={YES_NO} value={v.of_auto_renew || 'true'} />
      </Grid>
      <Text variant="microcopy">
        {renewal
          ? `Runs ${shortDate(parseDate(v.contract_start_date))} to ${shortDate(sum.end)}.`
          : `The order form states the term as ${termMonths(v.term_year_length) ?? 'N'} months from each Site's Deployment Date (the day the site's first camera is connected and captures its first snapshot). The expected date is only for forecasting.`}
      </Text>
      {renewal && (
        <>
          <SubHead>Renewal</SubHead>
          <Grid>
            <SelectField v={v} set={set} name="pro_rata_renewal" label="Pro-rata renewal?" opts={PRO_RATA} required />
            <SelectField v={v} set={set} name="coterm_site_renewals" label="Co-term site renewals?" opts={YES_NO} />
          </Grid>
          {v.renewable_date && <Text variant="microcopy">{`Current renewal date: ${shortDate(parseDate(v.renewable_date))}`}</Text>}
        </>
      )}
    </Flex>
  );
}

/* ---------------- products and pricing ---------------- */

const FREQUENCY: Record<string, string> = {
  annually: 'Per year',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  per_six_months: 'Every 6 months',
  per_two_years: 'Every 2 years',
  per_three_years: 'Every 3 years',
};

function ProductsSection(p: Shared & {
  lines: Line[];
  products: Product[];
  loaded: boolean;
  loadError: string;
  edits: Record<string, LineEdit>;
  onEdit: (id: string, change: LineEdit) => void;
  onUndo: (id: string) => void;
  onAdd: (productId: string) => void;
  termFixes: number;
  amount: { next: number | null; current: number | null; stale: boolean };
  canSync: boolean;
  onSync: () => void;
}) {
  const { v, set, currency, sum, lines, products } = p;
  const t = sum.totals;
  if (p.loadError) {
    return (
      <Alert title="Couldn't load the line items" variant="danger">
        <Text>{`${p.loadError}. If this is the first time the card has run since an update, reinstall the app so it has the e-commerce scope.`}</Text>
      </Alert>
    );
  }
  if (!p.loaded) return <LoadingSpinner label="Loading line items and products" size="sm" />;

  const issues = lineIssues(lines, currency, sum.siteCount, sum.siteCameras);
  const priced = products.filter((x) => x.prices[currency as 'GBP'] !== undefined);
  const unpriced = products.filter((x) => x.prices[currency as 'GBP'] === undefined);
  const months = sum.months;

  return (
    <Flex direction="column" gap="sm">
      {!currency && <Text variant="microcopy">Set the currency in Order and term first: products are priced from the product library in the deal's currency.</Text>}
      {lines.length === 0 && <Text variant="microcopy">No products on this deal yet. Add the platform licence first; its quantity defaults to the number of sites.</Text>}
      {lines.map((l) => (
        <LineRow
          key={l.id}
          inclusion={isInclusion(l.productId, products)}
          l={l}
          currency={currency}
          sum={sum}
          edited={!!p.edits[l.id] && !l.id.startsWith(NEW_PREFIX)}
          issues={issues.filter((i) => i.lineId === l.id)}
          onEdit={p.onEdit}
          onUndo={p.onUndo}
        />
      ))}
      {currency && (
        <Select
          name="add-product"
          label="Add a product"
          placeholder="Choose from the product library"
          value=""
          options={priced.map((x) => ({
            label: `${x.name}${x.sku ? ` (${x.sku})` : ''} — ${money(x.prices[currency as 'GBP']!, currency)}${x.frequency ? ` ${(FREQUENCY[x.frequency] ?? x.frequency).toLowerCase()}` : ' one-off'}`,
            value: x.id,
          }))}
          onChange={(id) => id && p.onAdd(String(id))}
        />
      )}
      {currency && unpriced.length > 0 && (
        <Text variant="microcopy">{`Not listed because they have no ${currency} price in the product library: ${unpriced.map((x) => x.name).join(', ')}.`}</Text>
      )}

      <Table bordered={false} flush>
        <TableBody>
          <TotalRow label="Annual subscription at list" value={money(t.annualList, currency)} />
          {t.annualDiscount > 0 && <TotalRow label="Discounts per year" value={`− ${money(t.annualDiscount, currency)}`} />}
          <TotalRow label="Total annual subscription fee" value={money(t.annual, currency)} strong />
          <TotalRow label={`One-off fees${t.oneOffDiscount > 0 ? ` (after ${money(t.oneOffDiscount, currency)} discount)` : ''}`} value={money(t.oneOff, currency)} />
          <TotalRow label={`Total contract value${months ? ` (${months} months)` : ''}`} value={money(t.tcv, currency)} strong />
          {t.discounted && <TotalRow label="Overall discount" value={`${t.discountPct}% off list`} />}
        </TableBody>
      </Table>
      {months === null && <Text variant="microcopy">Set the contract term to see the total contract value.</Text>}
      {t.discounted && <TextField v={v} set={set} name="of_discount_reason" area required />}
      {p.amount.next !== null && (
        <Text variant="microcopy">
          {p.amount.stale
            ? `The deal's Amount is ${p.amount.current === null ? 'empty' : money(p.amount.current, currency)}. Saving sets it to ${money(p.amount.next, currency)}, the annual subscription after discounts.`
            : `The deal's Amount is ${money(p.amount.next, currency)}, the annual subscription after discounts. It updates whenever the line items change.`}
        </Text>
      )}
      {p.termFixes > 0 && (
        <Text variant="microcopy">
          {`${p.termFixes} line item${p.termFixes === 1 ? " doesn't" : "s don't"} bill for the ${months}-month term from the billing start yet. Saving updates ${p.termFixes === 1 ? 'it' : 'them'} so HubSpot's ARR and TCV match the order form.`}
        </Text>
      )}
      {(p.termFixes > 0 || p.amount.stale) && p.canSync && (
        <Flex direction="row">
          <Button size="sm" variant="secondary" onClick={p.onSync}>
            Update the deal now
          </Button>
        </Flex>
      )}
      <Text variant="microcopy">
        {`Unit prices come from the product library. Discount on the line, as a % or an amount off each unit, rather than changing the price, so every discount is visible. A line discounted ${DISCOUNT_APPROVAL_PCT}% or more is flagged for approval.`}
      </Text>
    </Flex>
  );
}

function LineRow({ l, currency, sum, edited, issues, onEdit, onUndo, inclusion }: {
  inclusion?: boolean;
  l: Line;
  currency: string;
  sum: Summary;
  edited: boolean;
  issues: LineIssue[];
  onEdit: (id: string, change: LineEdit) => void;
  onUndo: (id: string) => void;
}) {
  const isNew = l.id.startsWith(NEW_PREFIX);
  if (l.removed) {
    return (
      <Flex direction="row" gap="sm" align="center" wrap="wrap">
        <Text format={{ lineDecoration: 'strikethrough' }}>{l.name}</Text>
        <Tag variant="error">Removed when you save</Tag>
        <Link href="#" preventDefault onClick={() => onUndo(l.id)}>
          Undo
        </Link>
      </Flex>
    );
  }
  const rule = quantityRule(l);
  const target = rule === 'sites' || rule === 'deployment' ? sum.siteCount : rule === 'cameras' ? sum.siteCameras : 0;
  const unitNet = l.discountMode === 'percent' ? l.price * (1 - Math.min(l.discountValue, 100) / 100) : l.price - Math.min(l.discountValue, l.price);
  const offList = l.listPrice !== null && Math.abs(l.price - l.listPrice) > 0.005;
  const wrongCurrency = !!currency && !!l.currency && l.currency !== currency;
  const needsApproval = l.discountPct >= DISCOUNT_APPROVAL_PCT;
  return (
    <Tile compact>
      <Flex direction="column" gap="xs">
        <Flex direction="row" justify="between" align="center" wrap="wrap" gap="sm">
          <Flex direction="row" gap="xs" align="center" wrap="wrap">
            <Text format={{ fontWeight: 'demibold' }}>{l.name}</Text>
            {l.sku && <Tag variant="default">{`SKU ${l.sku}`}</Tag>}
            <Tag variant={l.recurring ? 'info' : 'default'}>{l.recurring ? FREQUENCY[l.frequency] ?? l.frequency : 'One-off'}</Tag>
            {inclusion && <Tag variant="default">Standard inclusion</Tag>}
            {isNew && <Tag variant="success">New</Tag>}
            {needsApproval && <Tag variant="warning">Needs approval</Tag>}
          </Flex>
          <Text format={{ fontWeight: 'demibold' }}>{l.recurring ? `${money(l.annualNet, currency)} / year` : money(l.net, currency)}</Text>
        </Flex>
        <Flex direction="row" gap="sm" wrap="wrap" align="end">
          <NumberInput
            name={`qty-${l.id}`}
            label="Quantity"
            min={0}
            value={l.quantity}
            onChange={(n) => onEdit(l.id, { quantity: Number.isFinite(n) ? n : 0 })}
          />
          <Flex direction="column" gap="flush">
            <Text variant="microcopy">Unit price</Text>
            <Text>{money(l.price, l.currency || currency)}</Text>
          </Flex>
          <Select
            name={`dmode-${l.id}`}
            label="Discount"
            value={l.discountMode}
            options={DISCOUNT_MODES}
            onChange={(x) => onEdit(l.id, { discountMode: x === 'amount' ? 'amount' : 'percent', discountValue: 0 })}
          />
          <NumberInput
            name={`dval-${l.id}`}
            label={l.discountMode === 'percent' ? 'Percent off' : `Off each unit (${currency || l.currency})`}
            min={0}
            max={l.discountMode === 'percent' ? 100 : l.price}
            value={l.discountValue || undefined}
            onChange={(n) => onEdit(l.id, { discountMode: l.discountMode, discountValue: Number.isFinite(n) ? n : 0 })}
          />
          <Flex direction="column" gap="flush">
            <Text variant="microcopy">Net per unit</Text>
            <Text>{money(Math.round(unitNet * 100) / 100, l.currency || currency)}</Text>
          </Flex>
          <Button size="sm" variant="transparent" onClick={() => onEdit(l.id, { remove: true })}>
            Remove
          </Button>
        </Flex>
        {(issues.length > 0 || edited) && (
          <Flex direction="row" gap="sm" wrap="wrap" align="center">
            {rule && target > 0 && l.quantity !== target && (
              <Link href="#" preventDefault onClick={() => onEdit(l.id, { quantity: target })}>
                {`Match the ${rule === 'cameras' ? 'cameras' : 'sites'} (${target})`}
              </Link>
            )}
            {offList && !wrongCurrency && (
              <Link href="#" preventDefault onClick={() => onEdit(l.id, resetToList(l))}>
                {`Reset to list (${money(l.listPrice!, currency)})${l.discount === 0 && l.price < l.listPrice! ? ' and show the difference as a discount' : ''}`}
              </Link>
            )}
            {wrongCurrency && l.listPrice !== null && (
              <Link href="#" preventDefault onClick={() => onEdit(l.id, { resetPrice: true })}>
                {`Reprice at the ${currency} list price`}
              </Link>
            )}
            {edited && (
              <Link href="#" preventDefault onClick={() => onUndo(l.id)}>
                Undo changes
              </Link>
            )}
          </Flex>
        )}
      </Flex>
    </Tile>
  );
}

/* ---------------- sites ---------------- */

function SitesSection({ v, set, sum }: Shared) {
  const [paste, setPaste] = React.useState<string | null>(null);
  const staged = v.of_rollout === 'staged_rollout';
  const sites = sum.sites;
  const write = (list: Site[]) => set('of_sites', JSON.stringify(list));
  const change = (i: number, patch: Partial<Site>) => write(sites.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const parsed = paste ? parseSiteList(paste) : [];
  return (
    <Flex direction="column" gap="sm">
      <SelectField v={v} set={set} name="of_rollout" required />
      {sites.length === 0 && <Text variant="microcopy">No sites yet. Add them one at a time, or paste a list.</Text>}
      {sites.map((s, i) => (
        <Flex key={i} direction="row" gap="sm" wrap="wrap" align="end">
          <Input name={`site-${i}-name`} label={`Site ${i + 1} name`} required value={s.name} onChange={(x) => change(i, { name: x })} />
          <Input name={`site-${i}-address`} label="Delivery address" value={s.address} onChange={(x) => change(i, { address: x })} />
          <NumberInput name={`site-${i}-cameras`} label="Cameras" min={0} value={s.cameras} onChange={(n) => change(i, { cameras: Number.isFinite(n) ? n : 0 })} />
          {staged && (
            <DateInput name={`site-${i}-go-live`} label="Go-live date" required format="ll" value={toBase(s.goLive)} onChange={(d) => change(i, { goLive: fromBase(d) })} />
          )}
          <Button size="sm" variant="transparent" onClick={() => write(sites.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </Flex>
      ))}
      <Flex direction="row" gap="sm" wrap="wrap">
        <Button size="sm" variant="secondary" onClick={() => write([...sites, { name: '', address: '', cameras: 0, goLive: '' }])}>
          Add a site
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setPaste(paste === null ? '' : null)}>
          {paste === null ? 'Paste a list of sites' : 'Close the paste box'}
        </Button>
      </Flex>
      {paste !== null && (
        <Flex direction="column" gap="xs">
          <TextArea
            name="site-paste"
            label="Paste sites, one per line"
            description="Name, cameras, go-live date (YYYY-MM-DD); cameras and the date are optional. To include delivery addresses, copy columns from a spreadsheet: Name, Address, Cameras, Go-live."
            rows={6}
            value={paste}
            onChange={(x) => setPaste(x)}
          />
          <Flex direction="row" gap="sm" wrap="wrap">
            <Button
              size="sm"
              variant="primary"
              disabled={!parsed.length}
              onClick={() => {
                write([...sites, ...parsed]);
                setPaste(null);
              }}
            >
              {`Add ${parsed.length} site${parsed.length === 1 ? '' : 's'}`}
            </Button>
            {sites.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!parsed.length}
                onClick={() => {
                  write(parsed);
                  setPaste(null);
                }}
              >
                Replace the list
              </Button>
            )}
          </Flex>
        </Flex>
      )}
      {sum.siteCount > 0 && (
        <Text variant="microcopy">
          {`${sum.siteCount} site${sum.siteCount === 1 ? '' : 's'} and ${sum.siteCameras} camera integrations. Licence and camera quantities on the line items are checked against these.${staged ? '' : ' All sites go live on the contract start date.'}${sum.siteCount > NUMBERED_SITES ? ` Every site is on the order form in the site schedule; Sites 1–${NUMBERED_SITES} also fill the numbered site fields.` : ''}`}
        </Text>
      )}
    </Flex>
  );
}

function TotalRow({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <TableRow>
      <TableCell>
        <Text format={strong ? { fontWeight: 'demibold' } : undefined}>{l}</Text>
      </TableCell>
      <TableCell width={160}>
        <Text format={strong ? { fontWeight: 'demibold' } : undefined}>{value}</Text>
      </TableCell>
    </TableRow>
  );
}

function LegalSection({ v, set, people, signers, signersError }: Shared & { people: People; signers: Signer[] | null; signersError: string }) {
  const msa = msaStatus(v);
  return (
    <Flex direction="column" gap="sm">
      <Grid>
        <Select name="of_msa_status" label="MSA status" required value={msa} options={MSA_OPTIONS} onChange={(x) => set('of_msa_status', String(x ?? ''))} />
        {(msa === 'existing_msa' || msa === 'signed_in_juro') && <DateField v={v} set={set} name="of_msa_date" />}
        {(msa === 'existing_msa' || msa === 'signed_in_juro') && <TextField v={v} set={set} name="of_msa_details" />}
      </Grid>
      {msa === 'negotiating_in_juro' && (
        <Text variant="microcopy">Redline the MSA in Juro. When it's signed, set this to Signed in Juro and add its date. The order form can't be created until then.</Text>
      )}
      {msa === 'standard_msa' && (
        <Text variant="microcopy">
          {STANDARD_MSA_URL ? `The order form refers to the standard MSA at ${STANDARD_MSA_URL}; signing the order form accepts it.` : 'Legal needs to add the standard MSA link.'}
        </Text>
      )}
      <TextField v={v} set={set} name="of_legal_notes" label="Notes for legal (internal)" area />
      <SubHead>{`Signs for ${v.of_client_legal_name || 'the client'} (e-signs the quote)`}</SubHead>
      <Grid>
        <ContactPicker
          people={people}
          label="Fill from a deal contact"
          onPick={(p) => {
            set('of_counterparty_signer_name', p.name);
            set('of_counterparty_signer_email', p.email);
            set('of_counterparty_signer_title', p.title);
            set('of_counterparty_signer_contact_id', p.id);
          }}
        />
        <TextField v={v} set={set} name="of_counterparty_signer_name" label="Name" required />
        <TextField v={v} set={set} name="of_counterparty_signer_email" label="Email" required />
        <TextField v={v} set={set} name="of_counterparty_signer_title" label="Job title" required />
      </Grid>
      <SubHead>Countersigns for Protex</SubHead>
      <Grid>
        {signersError ? (
          <Text variant="microcopy">{`Couldn't load HubSpot users (${signersError}). Type the details.`}</Text>
        ) : signers === null ? (
          <LoadingSpinner label="Loading HubSpot users" size="sm" />
        ) : (
          <Select
            name="of_protex_signer_user_id"
            label="Protex signatory"
            placeholder="Choose who signs for Protex"
            value={String(v.of_protex_signer_user_id ?? '')}
            options={signers.map((s) => ({ label: s.name, value: s.id }))}
            onChange={(id) => {
              const s = signers.find((x) => x.id === String(id));
              if (!s) return;
              set('of_protex_signer_user_id', s.id);
              set('of_protex_signer_name', s.name);
              set('of_protex_signer_email', s.email);
              if (s.title || !v.of_protex_signer_title) set('of_protex_signer_title', s.title);
            }}
          />
        )}
        <TextField v={v} set={set} name="of_protex_signer_name" label="Name" required />
        <TextField v={v} set={set} name="of_protex_signer_email" label="Email" required />
        <TextField v={v} set={set} name="of_protex_signer_title" label="Job title" required />
      </Grid>
      <Text variant="microcopy">Job titles fill from the HubSpot user profile, or from the last order form they signed.</Text>
    </Flex>
  );
}
