// Shared helpers for the /api functions. Not a route itself.
const { createClient } = require('@supabase/supabase-js');

let _admin = null;
function adminClient() {
  if (_admin) return _admin;
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw httpError(500, 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them in Vercel > Settings > Environment Variables, then redeploy.');
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res, err) {
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  send(res, status, { error: (err && err.message) || 'Server error' });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { throw httpError(400, 'Request body is not valid JSON.'); }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { throw httpError(400, 'Request body is not valid JSON.'); }
}

// Verifies the signed-in user's token and loads their profile row.
async function requireUser(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw httpError(401, 'You are signed out. Sign in again.');
  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) throw httpError(401, 'Your session expired. Sign in again.');
  const { data: profile, error: pErr } = await db.from('profiles')
    .select('id,email,is_admin,credits_inr,coach_used,coach_bonus').eq('id', data.user.id).single();
  if (pErr || !profile) throw httpError(403, 'No profile found for this account. Ask the admin to check the signup trigger in Supabase.');
  return { user: data.user, profile, db };
}

async function getSettings(db) {
  const { data } = await db.from('app_settings').select('key,value');
  const s = { signup_bonus_inr: 20, coach_default_limit: 3, allowed_email_domains: [] };
  (data || []).forEach(r => { s[r.key] = r.value; });
  return s;
}

// ---------- pricing ----------
// USD per million tokens. Override any of these with the PRICES_JSON env var, e.g.
// {"claude-sonnet-5-5":{"in":2,"out":10,"cw":2.5,"cr":0.1}}
const DEFAULT_PRICES = {
  'claude-sonnet-5-5': { in: 2, out: 10, cw: 2.5, cr: 0.1 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cw: 0.125, cr: 0.01 },
  'claude-opus-5-5': { in: 4, out: 20, cw: 5, cr: 0.4 },
};
function priceFor(model) {
  let table = DEFAULT_PRICES;
  if (process.env.PRICES_JSON) {
    try { table = { ...DEFAULT_PRICES, ...JSON.parse(process.env.PRICES_JSON) }; } catch (e) { /* keep defaults */ }
  }
  if (table[model]) return table[model];
  const key = Object.keys(table).find(k => model.startsWith(k));
  return key ? table[key] : { in: 4, out: 20, cw: 5, cr: 0.4 }; // unknown model: price it high, never undercharge
}
const SEARCH_USD = Number(process.env.WEB_SEARCH_USD || 0.01); // per web search
const INR_PER_USD = Number(process.env.INR_PER_USD || 250);   // what you charge users per US dollar of cost

function usageCostUsd(model, u) {
  const p = priceFor(model);
  const searches = (u && u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return ((u.input_tokens || 0) * p.in
    + (u.cache_creation_input_tokens || 0) * p.cw
    + (u.cache_read_input_tokens || 0) * p.cr
    + (u.output_tokens || 0) * p.out) / 1e6
    + searches * SEARCH_USD;
}

function estimateCostUsd(model, inputChars, maxTokens, maxSearches) {
  const p = priceFor(model);
  const inTok = Math.ceil(inputChars / 3.2) + (maxSearches ? 6000 * maxSearches : 0);
  return (inTok * p.in + maxTokens * p.out) / 1e6 + (maxSearches || 0) * SEARCH_USD;
}

module.exports = {
  adminClient, httpError, send, fail, readBody, requireUser, getSettings,
  usageCostUsd, estimateCostUsd, INR_PER_USD,
};
