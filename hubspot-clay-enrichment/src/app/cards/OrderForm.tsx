import React from 'react';
import {
  Accordion,
  Alert,
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

/*
 * Order form: everything the order form and MSA need, captured on the deal so Juro can pull it
 * through its HubSpot integration. Pricing is the deal's line items, drawn from the product library
 * at list price with a discount per line. Totals, the contract end date, the pricing table and the
 * site schedule are calculated here and saved with the rest. "Mark ready for Juro" only unlocks
 * when nothing required is missing.
 */

hubspot.extend<'crm.record.tab'>(({ actions, context }) => (
  <OrderForm actions={actions} dealId={String(context.crm.objectId)} user={context.user?.email ?? 'rep'} />
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
  ready_for_juro: 'info',
  sent_to_juro: 'warning',
  signed: 'success',
};

type Signer = { id: string; name: string; email: string; title: string };
type Person = { id: string; name: string; email: string; title: string };
type Setter = (key: string, value: string) => void;
type Pricing = { lines: RawLine[]; products: Product[] };
type Body = {
  ok: boolean;
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

export function OrderForm({ actions, dealId, user }: { actions: CrmActions; dealId: string; user: string }) {
  const { props, error, loading } = useRecordProperties(actions, PROPS);
  const [saved, setSaved] = React.useState<Values>({});
  const [edits, setEdits] = React.useState<Values>({});
  const [saving, setSaving] = React.useState(false);
  const [signers, setSigners] = React.useState<Signer[] | null>(null);
  const [signersError, setSignersError] = React.useState('');
  const [openSections, setOpenSections] = React.useState<Section[] | null>(null);
  const [pricing, setPricing] = React.useState<Pricing | null>(null);
  const [pricingError, setPricingError] = React.useState('');
  const [contacts, setContacts] = React.useState<Person[] | null>(null);
  const [company, setCompany] = React.useState<Record<string, string> | null>(null);
  const [partiesError, setPartiesError] = React.useState('');
  const [lineEdits, setLineEdits] = React.useState<Record<string, LineEdit>>({});
  /** Products added in the card and not saved yet, in the order they were added. */
  const [added, setAdded] = React.useState<{ id: string; productId: string }[]>([]);
  const nextId = React.useRef(1);

  const call = React.useCallback(async (parameters: Record<string, unknown>) => {
    const res = await hubspot.serverless(FN, { parameters: parameters as never });
    const body = ((res as { body?: unknown })?.body ?? res) as Body;
    if (!body?.ok && !body?.lines) throw new Error(body?.message ?? 'Request failed');
    return body;
  }, []);

  React.useEffect(() => {
    call({ action: 'signatories' })
      .then((b) => setSigners(b.users ?? []))
      .catch((e: Error) => setSignersError(e.message));
    call({ action: 'pricing', dealId })
      .then((b) => setPricing({ lines: b.lines ?? [], products: b.products ?? [] }))
      .catch((e: Error) => setPricingError(e.message));
    call({ action: 'parties', dealId })
      .then((b) => {
        setContacts(b.contacts ?? []);
        setCompany(b.company ?? null);
      })
      .catch((e: Error) => {
        setContacts([]);
        setPartiesError(e.message);
      });
  }, [call, dealId]);

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
  const status = String(v.of_status || 'draft');

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
      if (!props.of_order_type) payload.of_order_type = v.of_order_type;
      if (!extra.of_status && dirty && (status === 'ready_for_juro' || status === 'sent_to_juro')) {
        payload.of_status = 'draft';
        actions.addAlert({ type: 'warning', message: 'The order form changed after it was marked ready, so it is back to Draft. Mark it ready again.' });
      }
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

  const missingIn = (s: Section) => r.missing.filter((g) => g.section === s);
  // Sections with something to fill start open; complete ones start closed.
  const open = openSections ?? SECTIONS.filter((s) => missingIn(s.key).length).map((s) => s.key);
  const toggle = (k: Section) => setOpenSections(open.includes(k) ? open.filter((x) => x !== k) : [...open, k]);
  const reveal = (k: Section) => setOpenSections(open.includes(k) ? open : [...open, k]);
  const done = r.required - r.missing.length;
  const canMarkReady = !r.missing.length && !dirty;
  const isReady = status === 'ready_for_juro' || status === 'sent_to_juro' || status === 'signed';
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
              <StatusTag variant={STATUS_VARIANT[status] ?? 'default'}>{optionLabel('of_status', status) || 'Draft'}</StatusTag>
            </Flex>
            {v.of_ready_at && (
              <Text variant="microcopy">{`Marked ready ${shortDate(parseDate(v.of_ready_at))}${v.of_ready_by ? ` by ${v.of_ready_by}` : ''}`}</Text>
            )}
          </Flex>
          <Statistics>
            <StatisticsItem label="Annual subscription" number={money(t.annual, currency)} />
            <StatisticsItem label="Total contract value" number={money(t.tcv, currency)} />
            <StatisticsItem label="Discount" number={t.discountPct ? `${t.discountPct}%` : 'None'} />
            <StatisticsItem label="Sites" number={String(sum.siteCount)} />
          </Statistics>
          <ProgressBar
            title="Ready for Juro"
            value={done}
            maxValue={r.required}
            valueDescription={`${done} of ${r.required} required details`}
            variant={r.missing.length ? 'warning' : 'success'}
          />
        </Flex>
      </Tile>

      {r.missing.length > 0 ? (
        <Alert title={`Still needed before Juro (${r.missing.length})`} variant="warning">
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
        <Alert title="Everything Juro needs is here" variant="success">
          <Text>{isReady ? 'This order form is ready for Juro.' : 'Check the totals, then mark it ready for Juro.'}</Text>
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

      <Actions
        dirty={dirty}
        saving={saving}
        isReady={isReady}
        canMarkReady={canMarkReady}
        missing={r.missing.length}
        onSave={() => save()}
        onReady={() => save({ of_status: 'ready_for_juro', of_ready_at: new Date().toISOString(), of_ready_by: user })}
      />

      {SECTIONS.map((s, i) => {
        const left = missingIn(s.key).length;
        return (
          <Accordion
            key={s.key}
            title={`${i + 1}. ${s.title} · ${left ? `${left} to fill` : 'complete'}`}
            open={open.includes(s.key)}
            onClick={() => toggle(s.key)}
            size="sm"
          >
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
        <Actions dirty={dirty} saving={saving} isReady={isReady} canMarkReady={false} missing={r.missing.length} onSave={() => save()} />
      )}
    </Flex>
  );
}

function Actions(p: {
  dirty: boolean;
  saving: boolean;
  isReady: boolean;
  canMarkReady: boolean;
  missing: number;
  onSave: () => void;
  onReady?: () => void;
}) {
  const readyLabel = p.missing ? `Mark ready for Juro · ${p.missing} to fill` : p.dirty ? 'Save, then mark ready for Juro' : 'Mark ready for Juro';
  return (
    <Flex direction="row" gap="sm" align="center" wrap="wrap">
      <LoadingButton variant="primary" loading={p.saving} disabled={!p.dirty} onClick={p.onSave}>
        {p.dirty ? 'Save changes' : 'Saved'}
      </LoadingButton>
      {p.onReady && !p.isReady && (
        <LoadingButton variant="secondary" loading={p.saving} disabled={!p.canMarkReady} onClick={p.onReady}>
          {readyLabel}
        </LoadingButton>
      )}
      {p.dirty && <Text variant="microcopy">Unsaved changes</Text>}
    </Flex>
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
  return area ? <TextArea {...common} rows={3} /> : <Input {...common} />;
}

function SelectField({ v, set, name, label: l, opts, required }: { v: Values; set: Setter; name: string; label?: string; opts?: { label: string; value: string }[]; required?: boolean }) {
  return (
    <Select
      name={name}
      label={l ?? label(name)}
      required={required}
      value={String(v[name] ?? '')}
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
      <TextField v={v} set={set} name="of_client_legal_name" required />
      <TextField v={v} set={set} name="of_client_legal_address" area required />
      <Flex direction="row" gap="sm" wrap="wrap">
        <TextField v={v} set={set} name="of_client_company_number" />
        <TextField v={v} set={set} name="of_client_tax_id" />
      </Flex>
      <Divider />
      <Text format={{ fontWeight: 'demibold' }}>Client contact</Text>
      <ContactPicker
        people={people}
        label="Fill from a deal contact"
        onPick={(p) => {
          set('of_client_contact_name', p.name);
          set('of_client_contact_email', p.email);
          set('of_client_contact_title', p.title);
        }}
      />
      <Flex direction="row" gap="sm" wrap="wrap">
        <TextField v={v} set={set} name="of_client_contact_name" required />
        <TextField v={v} set={set} name="of_client_contact_email" required />
        <TextField v={v} set={set} name="of_client_contact_title" />
      </Flex>
      <Divider />
      <Text format={{ fontWeight: 'demibold' }}>Billing</Text>
      <ContactPicker
        people={people}
        label="Fill billing from a deal contact"
        onPick={(p) => {
          set('of_billing_contact_name', p.name);
          set('client_s_email_for_invoicing_', p.email);
        }}
      />
      <Flex direction="row" gap="sm" wrap="wrap">
        <TextField v={v} set={set} name="of_billing_contact_name" />
        <TextField v={v} set={set} name="client_s_email_for_invoicing_" label="Billing email" required />
      </Flex>
      <TextField v={v} set={set} name="of_billing_address" area />
      <Flex direction="row" gap="sm" wrap="wrap" align="end">
        <SelectField v={v} set={set} name="of_po_required" opts={YES_NO} />
        <TextField v={v} set={set} name="purchase_order" label="PO number" />
      </Flex>
    </Flex>
  );
}

function OrderSection({ v, set, sum }: Shared) {
  const renewal = v.of_order_type === 'renewal';
  return (
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="sm" wrap="wrap">
        <SelectField v={v} set={set} name="of_order_type" required />
        <SelectField v={v} set={set} name="deal_currency_code" label="Currency" opts={CURRENCIES} required />
      </Flex>
      <Flex direction="row" gap="sm" wrap="wrap">
        <DateField v={v} set={set} name="of_quote_date" required />
        <DateField v={v} set={set} name="of_offer_expiry_date" required />
        <DateField v={v} set={set} name="of_target_signature_date" required />
      </Flex>
      <Divider />
      <Flex direction="row" gap="sm" wrap="wrap" align="end">
        <DateField v={v} set={set} name="contract_start_date" label="Contract start (live) date" required />
        <SelectField v={v} set={set} name="term_year_length" label="Contract term" opts={TERMS} required />
        <Flex direction="column" gap="flush">
          <Text variant="microcopy">Contract end date</Text>
          <Text format={{ fontWeight: 'demibold' }}>{shortDate(sum.end)}</Text>
        </Flex>
      </Flex>
      <DateField v={v} set={set} name="subscription_start_date" label="Billing starts on (if different from the contract start)" />
      <Flex direction="row" gap="sm" wrap="wrap">
        <SelectField v={v} set={set} name="of_billing_frequency" required />
        <SelectField v={v} set={set} name="of_payment_terms" required />
        <SelectField v={v} set={set} name="of_auto_renew" opts={YES_NO} />
      </Flex>
      {renewal && (
        <>
          <Divider />
          <Text format={{ fontWeight: 'demibold' }}>Renewal</Text>
          {v.renewable_date && <Text variant="microcopy">{`Current renewal date: ${shortDate(parseDate(v.renewable_date))}`}</Text>}
          <Flex direction="row" gap="sm" wrap="wrap">
            <SelectField v={v} set={set} name="pro_rata_renewal" label="Pro-rata renewal?" opts={PRO_RATA} required />
            <SelectField v={v} set={set} name="coterm_site_renewals" label="Co-term site renewals?" opts={YES_NO} />
          </Flex>
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

function LineRow({ l, currency, sum, edited, issues, onEdit, onUndo }: {
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
  const target = rule === 'sites' ? sum.siteCount : rule === 'cameras' ? sum.siteCameras : 0;
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
                {`Match the ${rule === 'sites' ? 'sites' : 'cameras'} (${target})`}
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
          <Input name={`site-${i}-name`} label={`Site ${i + 1}`} required value={s.name} onChange={(x) => change(i, { name: x })} />
          <NumberInput
            name={`site-${i}-cameras`}
            label="Camera integrations"
            min={0}
            value={s.cameras}
            onChange={(n) => change(i, { cameras: Number.isFinite(n) ? n : 0 })}
          />
          {staged && (
            <DateInput
              name={`site-${i}-go-live`}
              label="Go-live date"
              required
              format="ll"
              value={toBase(s.goLive)}
              onChange={(d) => change(i, { goLive: fromBase(d) })}
            />
          )}
          <Button size="sm" variant="transparent" onClick={() => write(sites.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </Flex>
      ))}
      <Flex direction="row" gap="sm" wrap="wrap">
        <Button size="sm" variant="secondary" onClick={() => write([...sites, { name: '', cameras: 0, goLive: '' }])}>
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
            description="Name, cameras, go-live date (YYYY-MM-DD). Cameras and the date are optional. Columns copied from a spreadsheet work too."
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
          {`${sum.siteCount} site${sum.siteCount === 1 ? '' : 's'} and ${sum.siteCameras} camera integrations. Licence and camera quantities on the line items are checked against these.${staged ? '' : ' All sites go live on the contract start date.'}${sum.siteCount > NUMBERED_SITES ? ` Every site goes to Juro in the site schedule; Sites 1–${NUMBERED_SITES} also fill the numbered site fields.` : ''}`}
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
  return (
    <Flex direction="column" gap="sm">
      <SelectField v={v} set={set} name="of_existing_msa" required />
      {v.of_existing_msa === 'yes' && (
        <>
          <TextField v={v} set={set} name="of_msa_details" area required />
          <DateField v={v} set={set} name="of_msa_date" />
        </>
      )}
      {v.of_existing_msa === 'not_sure' && <Text variant="microcopy">Check with legal before marking this ready. If there's no MSA, one goes out with this order form.</Text>}
      <TextField v={v} set={set} name="of_legal_notes" area />
      <Divider />
      <Text format={{ fontWeight: 'demibold' }}>{`Counterparty signer${v.of_client_legal_name ? ` for ${v.of_client_legal_name}` : ''}`}</Text>
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
      <Flex direction="row" gap="sm" wrap="wrap">
        <TextField v={v} set={set} name="of_counterparty_signer_name" label="Name" required />
        <TextField v={v} set={set} name="of_counterparty_signer_email" label="Email" required />
        <TextField v={v} set={set} name="of_counterparty_signer_title" label="Job title" required />
      </Flex>
      <Divider />
      <Text format={{ fontWeight: 'demibold' }}>Signing for Protex</Text>
      {signersError ? (
        <Text variant="microcopy">{`Couldn't load HubSpot users (${signersError}). Type the signatory's details below.`}</Text>
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
      <Flex direction="row" gap="sm" wrap="wrap">
        <TextField v={v} set={set} name="of_protex_signer_name" label="Name" required />
        <TextField v={v} set={set} name="of_protex_signer_email" label="Email" required />
        <TextField v={v} set={set} name="of_protex_signer_title" label="Job title" required />
      </Flex>
      <Text variant="microcopy">
        The job title fills from the user's HubSpot profile, or from the last order form they signed. Type it once and it's remembered.
      </Text>
    </Flex>
  );
}
