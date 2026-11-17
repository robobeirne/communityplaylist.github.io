/**
 * Server side of the order form card.
 *
 *   { action: 'save', dealId, properties }   write order form properties to the deal
 *   { action: 'signatories' }                list HubSpot users who can sign for Protex, with email and job title
 *
 * Only order form properties (of_*) and the existing deal fields the card reuses can be written.
 */
const BASE = 'https://api.hubapi.com/crm/v3';
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
const fail = (statusCode, message) => ({ statusCode, body: { ok: false, message } });

async function save({ dealId, properties }) {
  if (!/^\d+$/.test(String(dealId || ''))) return fail(400, 'No deal id');
  const out = {};
  for (const [k, v] of Object.entries(properties || {})) {
    if ((/^of_[a-z0-9_]+$/.test(k) || REUSED.has(k)) && (typeof v === 'string' || v === null)) out[k] = v ?? '';
  }
  if (!Object.keys(out).length) return fail(400, 'Nothing to save');
  const res = await fetch(`${BASE}/objects/deals/${dealId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ properties: out }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return fail(res.status, err.message || `HubSpot returned ${res.status}`);
  }
  return { statusCode: 200, body: { ok: true, properties: out } };
}

/** Every HubSpot user, with the job title from their profile or, failing that, the one last used on an order form. */
async function signatories() {
  const users = [];
  let after;
  do {
    const url = `${BASE}/objects/users?limit=100&properties=hs_given_name,hs_family_name,hs_email,hs_job_title${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, { headers: H() });
    if (!res.ok) return fail(res.status, `Could not list users (${res.status})`);
    const page = await res.json();
    users.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after && users.length < 1000);

  const lastTitle = {};
  const search = await fetch(`${BASE}/objects/deals/search`, {
    method: 'POST',
    headers: H(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'of_protex_signer_title', operator: 'HAS_PROPERTY' }] }],
      properties: ['of_protex_signer_user_id', 'of_protex_signer_title'],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
    }),
  });
  if (search.ok) {
    for (const d of (await search.json()).results || []) {
      const id = d.properties?.of_protex_signer_user_id;
      if (id && !lastTitle[id]) lastTitle[id] = d.properties.of_protex_signer_title;
    }
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
    if (params.action === 'signatories') return await signatories();
    return fail(400, 'Unknown action');
  } catch (e) {
    return fail(500, e.message || 'Something went wrong');
  }
};
