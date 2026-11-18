/**
 * Server side of the order form card.
 *
 *   { action: 'save', dealId, properties, lines }   write order form properties to the deal and apply line item changes
 *   { action: 'pricing', dealId }                    the deal's line items and the active product library
 *   { action: 'parties', dealId }                    the deal's contacts (name, email, job title) and its company with address
 *   { action: 'signatories' }                        HubSpot users who can sign for Protex, with email and job title
 *   { action: 'quote', dealId }                      the deal's quotes and their state, keeping the order form status in step; quote templates
 *   { action: 'create_quote', dealId, ... }          create the order form quote from the deal (see createQuote)
 *
 * Only order form properties (of_*) and the existing deal fields the card reuses can be written,
 * including Amount, which the card sets from the line items.
 *
 * Line item rules (rev ops guard rails, enforced here rather than trusted to the card):
 *   - new lines must come from the product library, priced at its list price in the deal's currency;
 *   - an existing line's unit price can only be reset to list, never typed;
 *   - discounts are per line, as a percentage or an amount off each unit;
 *   - only line items on this deal can be changed or removed.
 */
const ROOT = 'https://api.hubapi.com';
const H = () => ({ Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });
const REUSED = new Set([
  'deal_currency_code',
  'contract_start_date',
  'term_year_length',
  'subscription_start_date',
  'client_s_email_for_invoicing_',
  'purchase_order',
  'coterm_site_renewals',
  'pro_rata_renewal',
  'number_of_sites_to_start',
  'amount',
]);
const LINE_PROPERTIES = [
  'name',
  'hs_product_id',
  'hs_sku',
  'quantity',
  'price',
  'discount',
  'hs_discount_percentage',
  'amount',
  'hs_line_item_currency_code',
  'recurringbillingfrequency',
  'hs_recurring_billing_period',
  'hs_recurring_billing_start_date',
];
const LINE_EDITABLE = new Set(['quantity', 'discount', 'hs_discount_percentage', 'hs_recurring_billing_period', 'hs_recurring_billing_start_date']);
const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD'];
const PRODUCT_PROPERTIES = ['name', 'hs_sku', 'description', 'price', 'recurringbillingfrequency', 'hs_status', ...CURRENCIES.map((c) => `hs_price_${c.toLowerCase()}`)];
/** HubSpot-defined line item → deal association. */
const LINE_TO_DEAL = 20;

const fail = (statusCode, message) => ({ statusCode, body: { ok: false, message } });
const isId = (v) => /^\d+$/.test(String(v ?? ''));

async function call(method, path, body) {
  const res = await fetch(`${ROOT}${path}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || `HubSpot returned ${res.status}`), { status: res.status });
  return json;
}

async function associatedIds(dealId, toType) {
  const ids = [];
  let after;
  do {
    const page = await call('GET', `/crm/v4/objects/deals/${dealId}/associations/${toType}?limit=500${after ? `&after=${after}` : ''}`);
    ids.push(...(page.results || []).map((r) => String(r.toObjectId)));
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}
const lineIds = (dealId) => associatedIds(dealId, 'line_items');

async function batchRead(type, ids, properties) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const page = await call('POST', `/crm/v3/objects/${type}/batch/read`, { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    out.push(...(page.results || []));
  }
  return out;
}

/** The deal's contacts and company, for the card's "Fill from…" pickers. */
async function parties({ dealId }) {
  if (!isId(dealId)) return fail(400, 'No deal id');
  const [contactIds, companyIds] = await Promise.all([associatedIds(dealId, 'contacts'), associatedIds(dealId, 'companies')]);
  const [contactRows, companyRows] = await Promise.all([
    contactIds.length ? batchRead('contacts', contactIds.slice(0, 200), ['firstname', 'lastname', 'email', 'jobtitle']) : [],
    companyIds.length ? batchRead('companies', companyIds.slice(0, 5), ['name', 'address', 'address2', 'city', 'state', 'zip', 'country']) : [],
  ]);
  const contacts = contactRows
    .map((r) => {
      const p = r.properties || {};
      return { id: String(r.id), name: [p.firstname, p.lastname].filter(Boolean).join(' '), email: p.email || '', title: p.jobtitle || '' };
    })
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const c = companyRows[0];
  const company = c ? { id: String(c.id), ...Object.fromEntries(Object.entries(c.properties || {}).map(([k, v]) => [k, v ?? ''])) } : null;
  return { statusCode: 200, body: { ok: true, contacts, company } };
}

async function readLines(dealId) {
  const ids = await lineIds(dealId);
  if (!ids.length) return [];
  const out = (await batchRead('line_items', ids, LINE_PROPERTIES)).map((r) => ({ id: String(r.id), properties: r.properties || {} }));
  // Keep HubSpot's order (creation order) so the card's rows don't jump around.
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

function toProduct(r) {
  const p = r.properties || {};
  const prices = {};
  for (const c of CURRENCIES) {
    const v = parseFloat(p[`hs_price_${c.toLowerCase()}`]);
    if (Number.isFinite(v)) prices[c] = v;
  }
  // Free products (every listed price is 0, or none listed and "Free" in the name, like
  // "Licence - Intelligence (Free)") are offered at 0 in every currency.
  const listed = Object.values(prices);
  const free = listed.length ? listed.every((x) => x === 0) : /\bfree\b/i.test(p.name || '') && !(parseFloat(p.price) > 0);
  if (free) for (const c of CURRENCIES) prices[c] = 0;
  return {
    id: String(r.id),
    name: p.name || '',
    sku: p.hs_sku || '',
    description: p.description || '',
    prices,
    frequency: p.recurringbillingfrequency || '',
    active: p.hs_status !== 'inactive',
  };
}

async function readProducts() {
  const out = [];
  let after;
  do {
    const page = await call('GET', `/crm/v3/objects/products?limit=100&properties=${PRODUCT_PROPERTIES.join(',')}${after ? `&after=${after}` : ''}`);
    out.push(...(page.results || []).map(toProduct));
    after = page.paging?.next?.after;
  } while (after && out.length < 1000);
  return out;
}

async function pricing({ dealId }) {
  if (!isId(dealId)) return fail(400, 'No deal id');
  const [lines, products] = await Promise.all([readLines(dealId), readProducts()]);
  return {
    statusCode: 200,
    body: { ok: true, lines, products: products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)) },
  };
}

const discountProps = (mode, value) => {
  const v = Math.max(0, Number(value) || 0);
  if (mode === 'amount') return { discount: v ? String(v) : '', hs_discount_percentage: '' };
  return { hs_discount_percentage: v ? String(Math.min(v, 100)) : '', discount: '' };
};

/** Apply the card's line item changes. Returns the problems, if any. */
async function applyLines(dealId, changes, currency) {
  const problems = [];
  const create = Array.isArray(changes.create) ? changes.create : [];
  const update = Array.isArray(changes.update) ? changes.update : [];
  const remove = Array.isArray(changes.remove) ? changes.remove.map(String) : [];
  if (!create.length && !update.length && !remove.length) return problems;

  const owned = new Set(await lineIds(dealId));
  const needProducts = create.length || update.some((u) => u.resetPrice);
  const products = needProducts ? await readProducts() : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const c of create) {
    const product = byId.get(String(c.productId));
    if (!product || !product.active) {
      problems.push(`Product ${c.productId} isn't in the product library`);
      continue;
    }
    const price = product.prices[currency];
    if (price === undefined) {
      problems.push(`${product.name} has no ${currency || 'deal currency'} price in the product library`);
      continue;
    }
    const properties = {
      hs_product_id: product.id,
      name: product.name,
      hs_sku: product.sku,
      quantity: String(Math.max(1, Math.round(Number(c.quantity) || 1))),
      price: String(price),
      hs_line_item_currency_code: currency,
      ...discountProps(c.discountMode, c.discountValue),
    };
    if (product.frequency) {
      properties.recurringbillingfrequency = product.frequency;
      if (/^\d+$/.test(String(c.months ?? ''))) properties.hs_recurring_billing_period = `P${c.months}M`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(c.start ?? ''))) properties.hs_recurring_billing_start_date = c.start;
    }
    for (const k of Object.keys(properties)) if (properties[k] === '') delete properties[k];
    try {
      await call('POST', '/crm/v3/objects/line_items', {
        properties,
        associations: [{ to: { id: String(dealId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: LINE_TO_DEAL }] }],
      });
    } catch (e) {
      problems.push(`Couldn't add ${product.name}: ${e.message}`);
    }
  }

  for (const u of update) {
    const id = String(u.id ?? '');
    if (!owned.has(id)) {
      problems.push(`Line item ${id} isn't on this deal`);
      continue;
    }
    const properties = {};
    for (const [k, v] of Object.entries(u.properties || {})) if (LINE_EDITABLE.has(k) && (typeof v === 'string' || v === null)) properties[k] = v ?? '';
    if (u.resetPrice) {
      const product = byId.get(String(u.productId ?? ''));
      const price = product?.prices[currency];
      if (price === undefined) problems.push(`No ${currency} list price to reset line item ${id} to`);
      else Object.assign(properties, { price: String(price), hs_line_item_currency_code: currency });
    }
    if (!Object.keys(properties).length) continue;
    try {
      await call('PATCH', `/crm/v3/objects/line_items/${id}`, { properties });
    } catch (e) {
      problems.push(`Couldn't update line item ${id}: ${e.message}`);
    }
  }

  for (const id of remove) {
    if (!owned.has(id)) {
      problems.push(`Line item ${id} isn't on this deal`);
      continue;
    }
    try {
      await call('DELETE', `/crm/v3/objects/line_items/${id}`);
    } catch (e) {
      problems.push(`Couldn't remove line item ${id}: ${e.message}`);
    }
  }
  return problems;
}

async function save({ dealId, properties, lines }) {
  if (!isId(dealId)) return fail(400, 'No deal id');
  const out = {};
  for (const [k, v] of Object.entries(properties || {})) {
    if ((/^of_[a-z0-9_]+$/.test(k) || REUSED.has(k)) && (typeof v === 'string' || v === null)) out[k] = v ?? '';
  }
  const changes = lines && typeof lines === 'object' ? lines : {};
  const hasLines = ['create', 'update', 'remove'].some((k) => Array.isArray(changes[k]) && changes[k].length);
  if (!Object.keys(out).length && !hasLines) return fail(400, 'Nothing to save');

  try {
    if (Object.keys(out).length) await call('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: out });
  } catch (e) {
    return fail(e.status || 500, e.message);
  }
  if (!hasLines) return { statusCode: 200, body: { ok: true, properties: out } };

  // New lines are priced in the deal's currency, so read it after any change the save just made.
  const currency =
    out.deal_currency_code ?? (await call('GET', `/crm/v3/objects/deals/${dealId}?properties=deal_currency_code`)).properties?.deal_currency_code ?? '';
  const problems = await applyLines(dealId, changes, currency);
  const fresh = await readLines(dealId).catch(() => null);
  return {
    statusCode: 200,
    body: {
      ok: problems.length === 0,
      message: problems.length ? `Saved, but: ${problems.join('; ')}` : undefined,
      properties: out,
      lines: fresh,
    },
  };
}

/** Every HubSpot user, with the job title from their profile or, failing that, the one last used on an order form. */
async function signatories() {
  const users = [];
  let after;
  do {
    const page = await call('GET', `/crm/v3/objects/users?limit=100&properties=hs_given_name,hs_family_name,hs_email,hs_job_title${after ? `&after=${after}` : ''}`);
    users.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after && users.length < 1000);

  const lastTitle = {};
  const search = await call('POST', '/crm/v3/objects/deals/search', {
    filterGroups: [{ filters: [{ propertyName: 'of_protex_signer_title', operator: 'HAS_PROPERTY' }] }],
    properties: ['of_protex_signer_user_id', 'of_protex_signer_title'],
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    limit: 100,
  }).catch(() => ({ results: [] }));
  for (const d of search.results || []) {
    const id = d.properties?.of_protex_signer_user_id;
    if (id && !lastTitle[id]) lastTitle[id] = d.properties.of_protex_signer_title;
  }

  const list = users
    .map((u) => {
      const p = u.properties || {};
      const name = [p.hs_given_name, p.hs_family_name].filter(Boolean).join(' ') || p.hs_email || '';
      return { id: String(u.id), name, email: p.hs_email || '', title: p.hs_job_title || lastTitle[String(u.id)] || '' };
    })
    .filter((u) => u.name && u.email)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { statusCode: 200, body: { ok: true, users: list } };
}

/* ---------------- order form quote ---------------- */

const QUOTE_PROPERTIES = [
  'hs_title',
  'hs_status',
  'hs_expiration_date',
  'hs_quote_esign_status',
  'hs_esign_date',
  'hs_manually_signed',
  'hs_quote_link',
  'hs_createdate',
];
/** HubSpot-defined association types from a quote. */
const QUOTE_TO = { deal: 64, line_item: 67, contact: 69, company: 71, quote_template: 286 };
const LINE_TO_QUOTE = 68;
const assoc = (id, typeId) => ({ to: { id: String(id) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: typeId }] });

/** draft | awaiting_approval | sent | signed | expired | rejected */
function quoteState(p, now = Date.now()) {
  const esignDate = Number(p.hs_esign_date || 0) || Date.parse(p.hs_esign_date || '') || 0;
  if (esignDate > 0 || p.hs_manually_signed === 'true' || /COMPLETE|^SIGNED$/i.test(p.hs_quote_esign_status || '')) return 'signed';
  if (p.hs_status === 'REJECTED') return 'rejected';
  const expires = Number(p.hs_expiration_date) || Date.parse(p.hs_expiration_date || '');
  if (expires && expires < now) return 'expired';
  if (p.hs_status === 'PENDING_APPROVAL') return 'awaiting_approval';
  if (p.hs_status === 'APPROVAL_NOT_NEEDED' || p.hs_status === 'APPROVED') return 'sent';
  return 'draft';
}
const LIVE = new Set(['draft', 'awaiting_approval', 'sent', 'signed']);
const DEAL_STATUS = { draft: 'ready_to_send', awaiting_approval: 'ready_to_send', sent: 'sent', signed: 'signed', expired: 'draft', rejected: 'draft' };

async function dealQuotes(dealId) {
  const ids = await associatedIds(dealId, 'quotes');
  if (!ids.length) return [];
  const rows = await batchRead('quotes', ids, QUOTE_PROPERTIES);
  return rows
    .map((r) => {
      const p = r.properties || {};
      const esign = Number(p.hs_esign_date || 0) || Date.parse(p.hs_esign_date || '') || 0;
      return {
        id: String(r.id),
        title: p.hs_title || 'Quote',
        state: quoteState(p),
        expires: p.hs_expiration_date || '',
        link: p.hs_quote_link || '',
        signedAt: esign > 0 ? new Date(esign).toISOString() : '',
        created: p.hs_createdate || '',
      };
    })
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

async function quoteTemplates() {
  try {
    const page = await call('GET', '/crm/v3/objects/quote_template?limit=100&properties=hs_name,hs_active,hs_template_type');
    return {
      templates: (page.results || [])
        .map((t) => ({ id: String(t.id), name: t.properties?.hs_name || `Template ${t.id}`, active: t.properties?.hs_active !== 'false', type: t.properties?.hs_template_type || '' }))
        .filter((t) => t.active),
      templatesError: '',
    };
  } catch (e) {
    return { templates: [], templatesError: e.message };
  }
}

/**
 * The deal's quotes. The order form quote (of_quote_id) drives the card's status, so a quote that
 * was published or signed in HubSpot shows as Sent or Signed the next time anyone opens the card.
 */
async function quote({ dealId }) {
  if (!isId(dealId)) return fail(400, 'No deal id');
  const [deal, quotes, t] = await Promise.all([
    call('GET', `/crm/v3/objects/deals/${dealId}?properties=of_quote_id,of_status,of_quote_status,of_signed_at`),
    dealQuotes(dealId),
    quoteTemplates(),
  ]);
  const d = deal.properties || {};
  const current = quotes.find((q) => q.id === d.of_quote_id) || null;
  let properties = {};
  if (current) {
    const want = { of_quote_status: current.state, of_status: DEAL_STATUS[current.state] };
    if (current.signedAt) want.of_signed_at = current.signedAt;
    for (const [k, val] of Object.entries(want)) if ((d[k] || '') !== val && !(k === 'of_signed_at' && Date.parse(d[k] || '') === Date.parse(val))) properties[k] = val;
    if (Object.keys(properties).length) await call('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties });
  }
  return { statusCode: 200, body: { ok: true, quotes, current, live: quotes.filter((q) => LIVE.has(q.state)), properties, ...t } };
}

/**
 * Create the order form quote from the deal:
 *   { dealId, templateId, title, expirationDate (YYYY-MM-DD), currency, terms, comments,
 *     signerContactId, companyId, sender: { firstName, lastName, email, company }, replaceQuoteId? }
 *
 * The line items are copied from the deal on the server (not taken from the card), e-signature is
 * switched on, and the quote is left as a draft for the rep to check, add the countersigner and
 * publish. Refuses if the deal already has a live quote, unless it's a draft being replaced.
 */
async function createQuote(params) {
  const { dealId, templateId, title, expirationDate, currency, terms, comments, signerContactId, companyId, sender = {}, replaceQuoteId } = params;
  if (!isId(dealId)) return fail(400, 'No deal id');
  if (!isId(templateId)) return fail(400, 'Choose a quote template');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expirationDate || ''))) return fail(400, 'The offer expiry date is needed for the quote');
  if (!isId(signerContactId)) return fail(400, 'Pick the counterparty signer from a deal contact so they can e-sign');

  const [quotes, contactIds, companyIds] = await Promise.all([dealQuotes(dealId), associatedIds(dealId, 'contacts'), associatedIds(dealId, 'companies')]);
  if (!contactIds.includes(String(signerContactId))) return fail(400, "The counterparty signer isn't a contact on this deal");
  const live = quotes.filter((q) => LIVE.has(q.state));
  const replacing = replaceQuoteId ? live.find((q) => q.id === String(replaceQuoteId)) : null;
  if (replaceQuoteId && (!replacing || replacing.state !== 'draft')) return fail(409, 'Only a draft quote on this deal can be replaced');
  const blocking = live.filter((q) => q.id !== replacing?.id);
  if (blocking.length) return { statusCode: 409, body: { ok: false, message: `This deal already has a live quote (${blocking[0].title}, ${blocking[0].state.replace('_', ' ')})`, live: blocking } };

  const lines = await readLines(dealId);
  if (!lines.length) return fail(400, 'The deal has no line items');

  if (replacing) {
    const old = await associatedIdsFrom('quotes', replacing.id, 'line_items');
    await call('DELETE', `/crm/v3/objects/quotes/${replacing.id}`);
    for (const id of old) await call('DELETE', `/crm/v3/objects/line_items/${id}`).catch(() => {});
  }

  const associations = [assoc(dealId, QUOTE_TO.deal), assoc(templateId, QUOTE_TO.quote_template), assoc(signerContactId, QUOTE_TO.contact)];
  if (isId(companyId) && companyIds.includes(String(companyId))) associations.push(assoc(companyId, QUOTE_TO.company));
  const properties = {
    hs_title: String(title || 'Order form').slice(0, 250),
    hs_expiration_date: `${expirationDate}T23:59:59.000Z`,
    hs_status: 'DRAFT',
    hs_currency: String(currency || ''),
    hs_language: 'en',
    hs_locale: 'en-gb',
    hs_esign_enabled: 'true',
    hs_terms: String(terms || ''),
    hs_comments: String(comments || ''),
    hs_sender_firstname: String(sender.firstName || ''),
    hs_sender_lastname: String(sender.lastName || ''),
    hs_sender_email: String(sender.email || ''),
    hs_sender_company_name: String(sender.company || ''),
  };
  for (const k of Object.keys(properties)) if (properties[k] === '') delete properties[k];
  const created = await call('POST', '/crm/v3/objects/quotes', { properties, associations });
  const quoteId = String(created.id);

  // Copies of the deal's line items, so the quote shows exactly the pricing the card approved.
  const COPY = LINE_PROPERTIES.filter((k) => k !== 'amount');
  try {
    await call('POST', '/crm/v3/objects/line_items/batch/create', {
      inputs: lines.map((l) => ({
        properties: Object.fromEntries(COPY.map((k) => [k, l.properties[k]]).filter(([, val]) => val !== null && val !== undefined && val !== '')),
        associations: [assoc(quoteId, LINE_TO_QUOTE)],
      })),
    });
  } catch (e) {
    await call('DELETE', `/crm/v3/objects/quotes/${quoteId}`).catch(() => {});
    return fail(e.status || 500, `Couldn't copy the line items to the quote: ${e.message}`);
  }

  const dealProps = {
    of_quote_id: quoteId,
    of_quote_status: 'draft',
    of_status: 'ready_to_send',
    of_changed_after_quote: 'false',
    of_ready_at: new Date().toISOString(),
    of_ready_by: String(sender.email || ''),
  };
  await call('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: dealProps });
  return { statusCode: 200, body: { ok: true, quote: { id: quoteId, title: properties.hs_title, state: 'draft', link: '', expires: properties.hs_expiration_date }, properties: dealProps } };
}

async function associatedIdsFrom(fromType, id, toType) {
  const page = await call('GET', `/crm/v4/objects/${fromType}/${id}/associations/${toType}?limit=500`);
  return (page.results || []).map((r) => String(r.toObjectId));
}

exports.main = async (context) => {
  const params = context.parameters || {};
  try {
    if (params.action === 'save') return await save(params);
    if (params.action === 'pricing') return await pricing(params);
    if (params.action === 'parties') return await parties(params);
    if (params.action === 'signatories') return await signatories();
    if (params.action === 'quote') return await quote(params);
    if (params.action === 'create_quote') return await createQuote(params);
    return fail(400, 'Unknown action');
  } catch (e) {
    return fail(e.status || 500, e.message || 'Something went wrong');
  }
};
