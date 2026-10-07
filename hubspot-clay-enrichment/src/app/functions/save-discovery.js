/**
 * Writes from the discovery card. Two kinds:
 *   { properties }               set da_ properties directly (e.g. the industry)
 *   { override: {key,level,note} } a rep's correction: sets the status and records it in da_ai_assessment,
 *                                   so the assessor treats it as the floor until a later call beats it.
 * Only da_ properties can be written.
 */
const API = 'https://api.hubapi.com/crm/v3/objects/deals';
const H = () => ({ Authorization: `Bearer ${process.env.PRIVATE_APP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });
const LEVELS = ['not_discussed', 'touched_on', 'answered', 'confirmed'];
const fail = (statusCode, message) => ({ statusCode, body: { ok: false, message } });

exports.main = async (context) => {
  const { dealId, user, properties, override } = context.parameters || {};
  if (!/^\d+$/.test(String(dealId || ''))) return fail(400, 'No deal id');
  const out = {};

  for (const [k, v] of Object.entries(properties || {})) {
    if (/^da_[a-z0-9_]+$/.test(k) && k !== 'da_ai_assessment' && (typeof v === 'string' || v === null)) out[k] = v ?? '';
  }

  if (override) {
    const key = String(override.key || '');
    if (!/^[a-z0-9_]+$/.test(key) || !LEVELS.includes(override.level)) return fail(400, 'Bad correction');
    const got = await fetch(`${API}/${dealId}?properties=da_ai_assessment`, { headers: H() });
    if (!got.ok) return fail(got.status, 'Could not read the deal');
    let state;
    try { state = JSON.parse((await got.json()).properties.da_ai_assessment || ''); } catch { state = null; }
    if (!state || state.v !== 1) state = { v: 1, updated: null, meetings: [], q: {}, overrides: {} };
    const at = new Date().toISOString();
    const qKey = key.replace(/^money_/, 'money-'); // rubric ids use money-m / money-l / money-r
    state.overrides[qKey] = { level: override.level, by: user || 'rep', at, note: String(override.note || '').slice(0, 300) };
    state.q[qKey] = { ...(state.q[qKey] || { evidence: [], details: [], missing: [] }), level: override.level, by: 'rep', at,
                      why: `Corrected by ${user || 'a rep'}: ${String(override.note || '').slice(0, 300)}` };
    state.updated = at;
    out[`da_${key}_status`] = override.level;
    out.da_ai_assessment = JSON.stringify(state);
  }

  if (!Object.keys(out).length) return fail(400, 'Nothing to save');
  const res = await fetch(`${API}/${dealId}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ properties: out }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return fail(res.status, err.message || `HubSpot returned ${res.status}`);
  }
  return { statusCode: 200, body: { ok: true, properties: out } };
};
