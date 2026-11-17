import React from 'react';
import {
  Accordion,
  Alert,
  Button,
  CurrencyInput,
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
  ToggleGroup,
  hubspot,
} from '@hubspot/ui-extensions';
import { useAssociations } from '@hubspot/ui-extensions/crm';
import { useRecordProperties, type CrmActions } from './lib/hooks.ts';
import ORDER_FORM_PROPERTIES from './orderform/properties.json';
import {
  CONTEXT,
  MAX_SITES,
  REUSED,
  SECTIONS,
  compute,
  computedProperties,
  isoDate,
  num,
  orderTypeFromPipeline,
  parseDate,
  readiness,
  yes,
  type Gap,
  type Section,
  type Values,
} from './orderform/calc.ts';

/*
 * Order form: everything the order form and MSA need, captured on the deal so Juro can pull it
 * through its HubSpot integration. Totals, the contract end date and the site schedule are calculated
 * here and saved with the rest. "Mark ready for Juro" only unlocks when nothing required is missing.
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
const STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  draft: 'default',
  ready_for_juro: 'info',
  sent_to_juro: 'warning',
  signed: 'success',
};

type Signer = { id: string; name: string; email: string; title: string };
type Person = { id: string; name: string; email: string; title: string };
type Setter = (key: string, value: string) => void;

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

export function OrderForm({ actions, dealId, user }: { actions: CrmActions; dealId: string; user: string }) {
  const { props, error, loading } = useRecordProperties(actions, PROPS);
  const contactsRes = useAssociations({ toObjectType: '0-1', properties: ['firstname', 'lastname', 'email', 'jobtitle'], pageLength: 50 });
  const companiesRes = useAssociations({
    toObjectType: '0-2',
    properties: ['name', 'address', 'address2', 'city', 'state', 'zip', 'country'],
    pageLength: 5,
  });
  const [saved, setSaved] = React.useState<Values>({});
  const [edits, setEdits] = React.useState<Values>({});
  const [saving, setSaving] = React.useState(false);
  const [signers, setSigners] = React.useState<Signer[] | null>(null);
  const [signersError, setSignersError] = React.useState('');
  const [openSections, setOpenSections] = React.useState<Section[] | null>(null);

  const call = React.useCallback(async (parameters: Record<string, unknown>) => {
    const res = await hubspot.serverless(FN, { parameters: parameters as never });
    const body = (res as { body?: unknown })?.body ?? res;
    if (!(body as { ok?: boolean })?.ok) throw new Error((body as { message?: string })?.message ?? 'Request failed');
    return body as { ok: true; properties?: Values; users?: Signer[] };
  }, []);

  React.useEffect(() => {
    call({ action: 'signatories' })
      .then((b) => setSigners(b.users ?? []))
      .catch((e: Error) => setSignersError(e.message));
  }, [call]);

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
  const dirty = Object.keys(edits).length > 0;
  const c = compute(v);
  const r = readiness(v);
  const status = String(v.of_status || 'draft');
  const currency = String(v.deal_currency_code || '');

  const contacts: Person[] = (contactsRes.results ?? []).map((a) => ({
    id: String(a.toObjectId),
    name: [a.properties.firstname, a.properties.lastname].filter(Boolean).join(' '),
    email: a.properties.email ?? '',
    title: a.properties.jobtitle ?? '',
  }));
  const company = companiesRes.results?.[0]?.properties;

  const save = async (extra: Values = {}) => {
    setSaving(true);
    const sent = { ...edits };
    try {
      const payload: Values = { ...sent, ...computedProperties(v), ...extra };
      if (!props.of_order_type) payload.of_order_type = v.of_order_type;
      if (!extra.of_status && dirty && (status === 'ready_for_juro' || status === 'sent_to_juro')) {
        payload.of_status = 'draft';
        actions.addAlert({ type: 'warning', message: 'The order form changed after it was marked ready, so it is back to Draft. Mark it ready again.' });
      }
      const b = await call({ action: 'save', dealId, properties: payload });
      setSaved((s) => ({ ...s, ...(b.properties ?? {}) }));
      // Clear only what was sent: anything typed while the save was in flight stays as an unsaved edit.
      setEdits((cur) => {
        const next = { ...cur };
        for (const [k, val] of Object.entries(sent)) if (next[k] === val) delete next[k];
        return next;
      });
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
  const shared = { v, set, currency, c };

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
            <StatisticsItem label="Annual subscription" number={money(c.annual, currency)} />
            <StatisticsItem label="Total contract value" number={money(c.tcv, currency)} />
            <StatisticsItem label="Term" number={c.months ? `${c.months} months` : '—'} />
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
              {s.key === 'client' && <ClientSection {...shared} contacts={contacts} company={company} />}
              {s.key === 'order' && <OrderSection {...shared} />}
              {s.key === 'pricing' && <PricingSection {...shared} />}
              {s.key === 'sites' && <SitesSection {...shared} />}
              {s.key === 'legal' && <LegalSection {...shared} contacts={contacts} signers={signers} signersError={signersError} />}
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

type Shared = { v: Values; set: Setter; currency: string; c: ReturnType<typeof compute> };

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

function NumberField({ v, set, name, label: l, max }: { v: Values; set: Setter; name: string; label?: string; max?: number }) {
  const val = v[name];
  return (
    <NumberInput
      name={name}
      label={l ?? label(name)}
      min={0}
      max={max}
      value={val === undefined || val === null || val === '' ? undefined : num(val)}
      onChange={(n) => set(name, Number.isFinite(n) ? String(n) : '')}
    />
  );
}

function MoneyField({ v, set, name, label: l, currency }: { v: Values; set: Setter; name: string; label?: string; currency: string }) {
  const val = v[name];
  return (
    <CurrencyInput
      name={name}
      label={l ?? label(name)}
      currency={currency || 'GBP'}
      min={0}
      value={val === undefined || val === null || val === '' ? undefined : num(val)}
      onChange={(n) => set(name, Number.isFinite(n) ? String(n) : '')}
    />
  );
}

/** Fill name/email/title fields from one of the deal's contacts. */
function ContactPicker({ contacts, label: l, onPick }: { contacts: Person[]; label: string; onPick: (p: Person) => void }) {
  if (!contacts.length) return <Text variant="microcopy">No contacts on this deal yet. Associate one to fill these details from it.</Text>;
  return (
    <Select
      name={`pick-${l}`}
      label={l}
      placeholder="Choose a contact on this deal"
      options={contacts.map((p) => ({ label: [p.name, p.title].filter(Boolean).join(' — ') || p.email, value: p.id }))}
      onChange={(id) => {
        const p = contacts.find((x) => x.id === String(id));
        if (p) onPick(p);
      }}
    />
  );
}

/* ---------------- sections ---------------- */

function ClientSection({ v, set, contacts, company }: Shared & { contacts: Person[]; company?: Record<string, string | null> }) {
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
        contacts={contacts}
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
        contacts={contacts}
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

function OrderSection({ v, set, c }: Shared) {
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
          <Text format={{ fontWeight: 'demibold' }}>{shortDate(c.end)}</Text>
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

function PriceLine({ v, set, k, title, currency, total, fromSites }: {
  v: Values;
  set: Setter;
  k: string;
  title: string;
  currency: string;
  total: number;
  /** For site licences and camera integrations: units come from Sites and rollout unless typed. */
  fromSites?: { units: number; following: boolean; matchLabel: string };
}) {
  return (
    <Flex direction="column" gap="xs">
      <Text format={{ fontWeight: 'demibold' }}>{title}</Text>
      <Flex direction="row" gap="sm" wrap="wrap" align="end">
        {fromSites ? (
          <NumberInput
            name={`of_${k}_units`}
            label="Units"
            min={0}
            value={fromSites.units}
            onChange={(n) => {
              set(`of_${k}_units`, Number.isFinite(n) ? String(n) : '');
              set(`of_${k}_units_manual`, 'true');
            }}
          />
        ) : (
          <NumberField v={v} set={set} name={`of_${k}_units`} label="Units" />
        )}
        <MoneyField v={v} set={set} name={`of_${k}_unit_fee`} label="Fee per unit" currency={currency} />
        <Flex direction="column" gap="flush">
          <Text variant="microcopy">Total</Text>
          <Text format={{ fontWeight: 'demibold' }}>{money(total, currency)}</Text>
        </Flex>
      </Flex>
      {fromSites &&
        (fromSites.following ? (
          <Text variant="microcopy">From Sites and rollout. Type a number to change it.</Text>
        ) : (
          <Text variant="microcopy">
            {'Typed by hand. '}
            <Link href="#" preventDefault onClick={() => set(`of_${k}_units_manual`, 'false')}>
              {fromSites.matchLabel}
            </Link>
          </Text>
        ))}
    </Flex>
  );
}

function PricingSection({ v, set, currency, c }: Shared) {
  const extras = ['of_ops_included', 'of_intel_included', 'of_hardware_included'];
  return (
    <Flex direction="column" gap="sm">
      {!currency && <Text variant="microcopy">Set the currency in Order and term so the fees show in it.</Text>}
      <PriceLine
        v={v}
        set={set}
        k="safety"
        title="Protex AI Platform Site Licenses (Safety Pack), per year"
        currency={currency}
        total={c.lines.safety}
        fromSites={{ units: c.units.safety, following: c.fromSites.safety, matchLabel: `Match the sites (${c.siteCount})` }}
      />
      <PriceLine
        v={v}
        set={set}
        k="cameras"
        title="Camera integrations, per year"
        currency={currency}
        total={c.lines.cameras}
        fromSites={{ units: c.units.cameras, following: c.fromSites.cameras, matchLabel: `Match the sites (${c.siteCameras})` }}
      />
      <ToggleGroup
        name="extras"
        label="Also on this order"
        toggleType="checkboxList"
        inline
        value={extras.filter((k) => yes(v[k]))}
        options={[
          { label: 'Operations License', value: 'of_ops_included' },
          { label: 'Protex Intelligence', value: 'of_intel_included' },
          { label: 'Hardware / edge devices', value: 'of_hardware_included' },
        ]}
        onChange={(picked) => {
          const on = new Set((picked as string[] | undefined) ?? []);
          for (const k of extras) if (yes(v[k]) !== on.has(k)) set(k, on.has(k) ? 'true' : 'false');
        }}
      />
      {yes(v.of_ops_included) && <PriceLine v={v} set={set} k="ops" title="Operations License, per year" currency={currency} total={c.lines.ops} />}
      {yes(v.of_intel_included) && <PriceLine v={v} set={set} k="intel" title="Protex Intelligence, per year" currency={currency} total={c.lines.intel} />}
      {yes(v.of_hardware_included) && (
        <>
          <PriceLine v={v} set={set} k="hardware" title="Hardware / edge devices" currency={currency} total={c.lines.hardware} />
          <SelectField v={v} set={set} name="of_hardware_billing" label="Hardware is billed" required />
        </>
      )}
      <MoneyField v={v} set={set} name="of_implementation_fee" currency={currency} />
      <Divider />
      <SelectField v={v} set={set} name="of_discount_applied" opts={YES_NO} />
      {yes(v.of_discount_applied) && (
        <>
          <Flex direction="row" gap="sm" wrap="wrap" align="end">
            <SelectField v={v} set={set} name="of_discount_type" required />
            {v.of_discount_type === 'percentage' ? (
              <NumberField v={v} set={set} name="of_discount_value" label="Discount (%)" max={100} />
            ) : (
              <MoneyField v={v} set={set} name="of_discount_value" label="Discount per year" currency={currency} />
            )}
          </Flex>
          <TextField v={v} set={set} name="of_discount_reason" area required />
        </>
      )}
      <Table bordered={false} flush>
        <TableBody>
          <TotalRow label="Annual subscription before discount" value={money(c.annualList, currency)} />
          {c.discount > 0 && <TotalRow label="Discount per year" value={`− ${money(c.discount, currency)}`} />}
          <TotalRow label="Total annual subscription fee" value={money(c.annual, currency)} strong />
          <TotalRow label="One-off fees" value={money(c.oneOff, currency)} />
          <TotalRow label={`Total contract value${c.months ? ` (${c.months} months)` : ''}`} value={money(c.tcv, currency)} strong />
        </TableBody>
      </Table>
      {c.months === null && <Text variant="microcopy">Set the contract term to see the total contract value.</Text>}
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

function SitesSection({ v, set, c }: Shared) {
  const staged = v.of_rollout === 'staged_rollout';
  return (
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="sm" wrap="wrap" align="end">
        <NumberField v={v} set={set} name="number_of_sites_to_start" label={`How many sites (up to ${MAX_SITES})`} max={MAX_SITES} />
        <SelectField v={v} set={set} name="of_rollout" required />
      </Flex>
      {c.sites.map((s) => (
        <Flex key={s.i} direction="row" gap="sm" wrap="wrap" align="end">
          <TextField v={v} set={set} name={`of_site_${s.i}_name`} label={`Site ${s.i} name`} required />
          <NumberField v={v} set={set} name={`of_site_${s.i}_cameras`} label="Camera integrations" />
          {staged && <DateField v={v} set={set} name={`of_site_${s.i}_go_live`} label="Go-live date" required />}
        </Flex>
      ))}
      {c.siteCount > 0 && (
        <Text variant="microcopy">
          {`${c.siteCount} site${c.siteCount === 1 ? '' : 's'} and ${c.siteCameras} camera integrations. Pricing uses these unless you type other units there.${staged ? '' : ' All sites go live on the contract start date.'}`}
        </Text>
      )}
    </Flex>
  );
}

function LegalSection({ v, set, contacts, signers, signersError }: Shared & { contacts: Person[]; signers: Signer[] | null; signersError: string }) {
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
        contacts={contacts}
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
