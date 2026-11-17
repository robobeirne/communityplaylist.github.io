/**
 * Server side of the order form card.
 *
 *   { action: 'save', dealId, properties, lines }   write order form properties to the deal and apply line item changes
 *   { action: 'pricing', dealId }                    the deal's line items and the active product library
 *   { action: 'signatories' }                        HubSpot users who can sign for Protex, with email and job title
 *
 * Only order form properties (of_*) and the existing deal fields the card reuses can be written.
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

async function lineIds(dealId) {
  const ids = [];
  let after;
  do {
    const page = await call('GET', `/crm/v4/objects/deals/${dealId}/associations/line_items?limit=500${after ? `&after=${after}` : ''}`);
    ids.push(...(page.results || []).map((r) => String(r.toObjectId)));
    after = page.paging?.next?.after;
  } while (after);
  return ids;
}

async function readLines(dealId) {
  const ids = await lineIds(dealId);
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const page = await call('POST', '/crm/v3/objects/line_items/batch/read', { properties: LINE_PROPERTIES, inputs: ids.slice(i, i + 100).map((id) => ({ id })) });
    out.push(...(page.results || []).map((r) => ({ id: String(r.id), properties: r.properties || {} })));
  }
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

exports.main = async (context) => {
  const params = context.parameters || {};
  try {
    if (params.action === 'save') return await save(params);
    if (params.action === 'pricing') return await pricing(params);
    if (params.action === 'signatories') return await signatories();
    return fail(400, 'Unknown action');
  } catch (e) {
    return fail(e.status || 500, e.message || 'Something went wrong');
  }
};
