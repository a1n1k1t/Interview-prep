// POST /api/ask
// Body: { task, system, messages:[{role,content}], schema?, search? }
// The server decides the model, output length and price for each task, checks the
// user's credit in the database before calling Claude, and charges the real cost after.
const {
  send, fail, readBody, requireUser, getSettings, httpError,
  usageCostUsd, estimateCostUsd, INR_PER_USD,
} = require('../lib/shared');

const MAIN_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const FAST_MODEL = process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-5-5';
const SEARCH_TOOL = process.env.WEB_SEARCH_TOOL || 'web_search_20250305';

// Every task the app is allowed to run. Anything else is rejected.
const TASKS = {
  question:    { model: 'main', maxTokens: 450,  cache: true },
  score:       { model: 'main', maxTokens: 4500, json: true },
  audio_score: { model: 'main', maxTokens: 1800, json: true },
  growth:      { model: 'fast', maxTokens: 900,  json: true },
  recommend:   { model: 'main', maxTokens: 1200, search: 3 },
  coach:       { model: 'main', maxTokens: 1100, cache: true, coachQuota: true },
  topics:      { model: 'fast', maxTokens: 700,  json: true },
  condense:    { model: 'fast', maxTokens: 500 },
  company:     { model: 'main', maxTokens: 1400, search: 4 },
};

const MAX_INPUT_CHARS = 140000;
const MIN_BALANCE_INR = 0.25;

function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) throw httpError(400, 'No messages sent.');
  if (raw.length > 90) throw httpError(400, 'Conversation is too long.');
  const out = [];
  for (const m of raw) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n\n' + content; // merge back-to-back turns
    else out.push({ role, content });
  }
  if (!out.length) throw httpError(400, 'Messages are empty.');
  if (out[0].role !== 'user') out.unshift({ role: 'user', content: '(The conversation starts here.)' });
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '(Continue.)' });
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  let reserved = 0, ctx = null, coachTaken = false;
  try {
    ctx = await requireUser(req);
    const { profile, db, user } = ctx;
    const body = await readBody(req);
    const task = TASKS[body.task];
    if (!task) throw httpError(400, 'Unknown task.');

    const model = task.model === 'fast' ? FAST_MODEL : MAIN_MODEL;
    const system = String(body.system || '').slice(0, 60000);
    const messages = cleanMessages(body.messages);
    const inputChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
    if (inputChars > MAX_INPUT_CHARS) throw httpError(413, 'This request is too large. Try a shorter interview or fewer sessions.');
    const useSearch = !!(task.search && body.search);

    let schema = null;
    if (task.json) {
      schema = body.schema;
      if (!schema || typeof schema !== 'object' || JSON.stringify(schema).length > 20000) throw httpError(400, 'Missing or invalid output format.');
    }

    // Coach prompt limit (counted in the database, so it cannot be reset from the browser)
    if (task.coachQuota && !profile.is_admin) {
      const settings = await getSettings(db);
      const limit = Number(settings.coach_default_limit || 0) + Number(profile.coach_bonus || 0);
      const { data: ok, error } = await db.rpc('use_coach_prompt', { p_user: user.id, p_limit: limit });
      if (error) throw httpError(500, 'Could not check your coach limit: ' + error.message);
      if (!ok) throw httpError(403, 'You have used all your coach prompts. Ask the admin for more.');
      coachTaken = true;
    }

    // Reserve credit up front (admins are unlimited but still get their cost recorded)
    const estUsd = estimateCostUsd(model, inputChars, task.maxTokens, useSearch ? task.search : 0);
    const estInr = Math.max(0.3, estUsd * INR_PER_USD * 1.15);
    // Bigger calls need part of their likely cost in the balance, so nobody can run far below zero.
    const minNeeded = Math.max(MIN_BALANCE_INR, Math.min(estInr * 0.4, 4));
    if (!profile.is_admin) {
      const { data: r, error } = await db.rpc('reserve_credits', { p_user: user.id, p_max: estInr, p_min: minNeeded });
      if (error) throw httpError(500, 'Could not check your balance: ' + error.message);
      if (r === null || r === undefined) throw httpError(402, 'You are out of credit. Ask the admin to top you up.');
      reserved = Number(r);
    }

    // Build the Claude request
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw httpError(500, 'Server is missing ANTHROPIC_API_KEY.');
    const payload = { model, max_tokens: task.maxTokens, messages: messages.map(m => ({ role: m.role, content: m.content })) };
    if (system) {
      payload.system = task.cache
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system;
    }
    if (task.cache) {
      const last = payload.messages[payload.messages.length - 1];
      last.content = [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }];
    }
    if (schema) {
      payload.tools = [{ name: 'submit', description: 'Submit the final structured result.', input_schema: schema }];
      payload.tool_choice = { type: 'tool', name: 'submit' };
    } else if (useSearch) {
      payload.tools = [{ type: SEARCH_TOOL, name: 'web_search', max_uses: task.search }];
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (out && out.error && out.error.message) || ('Claude API error ' + r.status);
      throw httpError(502, 'The AI service returned an error: ' + msg);
    }

    const costUsd = usageCostUsd(model, out.usage || {});
    const costInr = Math.round(costUsd * INR_PER_USD * 10000) / 10000;
    const charged = profile.is_admin ? 0 : costInr;
    const { data: bal } = await db.rpc('settle_credits', {
      p_user: user.id, p_reserved: reserved, p_actual: charged,
      p_task: body.task, p_cost_usd: costUsd, p_note: model,
    });
    reserved = 0; // settled

    const blocks = Array.isArray(out.content) ? out.content : [];
    const result = { costInr: charged, balance: profile.is_admin ? null : Number(bal) };
    if (schema) {
      const tool = blocks.find(b => b.type === 'tool_use' && b.name === 'submit');
      if (!tool) throw httpError(502, 'The AI did not return a result in the expected format. Try again.');
      result.data = tool.input;
    } else {
      result.text = blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (!result.text) throw httpError(502, 'The AI returned an empty answer. Try again.');
    }
    return send(res, 200, result);
  } catch (err) {
    // Give back anything reserved and the coach prompt if the call did not complete
    if (ctx && reserved > 0) {
      try { await ctx.db.rpc('settle_credits', { p_user: ctx.user.id, p_reserved: reserved, p_actual: 0, p_task: 'refund', p_cost_usd: 0, p_note: 'failed call' }); } catch (e) { console.error(e); }
    }
    if (ctx && coachTaken && !(err && err.status === 200)) {
      try { await ctx.db.rpc('refund_coach_prompt', { p_user: ctx.user.id }); } catch (e) { console.error(e); }
    }
    return fail(res, err);
  }
};

module.exports.config = { maxDuration: 60 };
