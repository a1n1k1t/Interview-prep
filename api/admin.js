// /api/admin  (admin accounts only; checked against the database on every call)
// GET                      -> users, settings, 30-day spend
// GET ?sessionsFor=<id>    -> that user's session summaries (no transcripts)
// GET ?ledger=1            -> recent credit history for everyone
// POST {action:'credit', userId, amount, note}
// POST {action:'coachBonus', userId, delta}
// POST {action:'settings', settings:{signup_bonus_inr, coach_default_limit, allowed_email_domains}}
// POST {action:'persona', personaId, op:'unpublish'|'delete'}   (moderate shared personas)
const { send, fail, readBody, requireUser, getSettings, httpError } = require('../lib/shared');

function num(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

module.exports = async function handler(req, res) {
  try {
    const { profile, db, user } = await requireUser(req);
    if (!profile.is_admin) throw httpError(403, 'Admins only.');

    if (req.method === 'GET') {
      const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

      if (q.sessionsFor) {
        const { data, error } = await db.from('sessions').select('kind,data,created_at')
          .eq('user_id', q.sessionsFor).neq('kind', 'coach_chat')
          .order('created_at', { ascending: false }).limit(40);
        if (error) throw httpError(500, error.message);
        const sessions = (data || []).map(r => {
          const d = r.data || {};
          return {
            kind: r.kind, createdAt: d.createdAt || r.created_at,
            label: r.kind === 'interview' ? d.personaLabel : d.topic,
            roundType: d.roundLabel || null, overallScore: d.overallScore, summary: d.summary || '',
          };
        });
        return send(res, 200, { sessions });
      }

      if (q.ledger) {
        const { data, error } = await db.from('credit_ledger')
          .select('user_id,delta_inr,balance_after,kind,task,cost_usd,note,created_at')
          .order('created_at', { ascending: false }).limit(150);
        if (error) throw httpError(500, error.message);
        return send(res, 200, { ledger: data || [] });
      }

      const [{ data: users, error: uErr }, settings] = await Promise.all([
        db.from('profiles').select('id,email,credits_inr,is_admin,coach_used,coach_bonus,created_at').order('created_at', { ascending: true }),
        getSettings(db),
      ]);
      if (uErr) throw httpError(500, uErr.message);
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: spendRows } = await db.from('credit_ledger').select('user_id,cost_usd,delta_inr').eq('kind', 'usage').gte('created_at', since).limit(20000);
      let spendUsd = 0, chargedInr = 0;
      const perUser = {};
      (spendRows || []).forEach(r => {
        spendUsd += Number(r.cost_usd || 0);
        chargedInr += -Number(r.delta_inr || 0);
        perUser[r.user_id] = (perUser[r.user_id] || 0) + Number(r.cost_usd || 0);
      });
      return send(res, 200, {
        users: (users || []).map(u => ({ ...u, spend30dUsd: perUser[u.id] || 0 })),
        settings, spend30dUsd: spendUsd, charged30dInr: chargedInr,
      });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (body.action === 'credit') {
        const amount = num(body.amount, -100000, 100000);
        if (!body.userId || !amount) throw httpError(400, 'Give a user and a non-zero amount.');
        const { data, error } = await db.rpc('admin_adjust_credits', {
          p_user: body.userId, p_delta: amount, p_actor: user.id, p_note: String(body.note || '').slice(0, 200) || null,
        });
        if (error) throw httpError(500, error.message);
        return send(res, 200, { balance: Number(data) });
      }

      if (body.action === 'coachBonus') {
        const delta = num(body.delta, -1000, 1000);
        if (!body.userId || !delta) throw httpError(400, 'Give a user and a change.');
        const { data: p, error: e1 } = await db.from('profiles').select('coach_bonus').eq('id', body.userId).single();
        if (e1 || !p) throw httpError(404, 'User not found.');
        const next = Number(p.coach_bonus || 0) + delta;
        const { error } = await db.from('profiles').update({ coach_bonus: next }).eq('id', body.userId);
        if (error) throw httpError(500, error.message);
        return send(res, 200, { coach_bonus: next });
      }

      if (body.action === 'persona') {
        if (!body.personaId || !['unpublish', 'delete'].includes(body.op)) throw httpError(400, 'Give a persona and unpublish or delete.');
        const q = body.op === 'delete'
          ? db.from('personas').delete().eq('id', body.personaId).select('id')
          : db.from('personas').update({ is_public: false }).eq('id', body.personaId).select('id');
        const { data, error } = await q;
        if (error) throw httpError(500, error.message);
        if (!data || !data.length) throw httpError(404, 'Persona not found.');
        return send(res, 200, { ok: true });
      }

      if (body.action === 'settings') {
        const s = body.settings || {};
        const rows = [];
        if (s.signup_bonus_inr !== undefined) {
          const v = num(s.signup_bonus_inr, 0, 10000);
          if (v === null) throw httpError(400, 'Signup bonus must be a number.');
          rows.push({ key: 'signup_bonus_inr', value: v });
        }
        if (s.coach_default_limit !== undefined) {
          const v = num(s.coach_default_limit, 0, 1000);
          if (v === null) throw httpError(400, 'Coach limit must be a number.');
          rows.push({ key: 'coach_default_limit', value: Math.round(v) });
        }
        if (s.allowed_email_domains !== undefined) {
          const list = (Array.isArray(s.allowed_email_domains) ? s.allowed_email_domains : String(s.allowed_email_domains).split(','))
            .map(d => String(d).trim().toLowerCase().replace(/^@/, '')).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 50);
          rows.push({ key: 'allowed_email_domains', value: list });
        }
        if (!rows.length) throw httpError(400, 'Nothing to save.');
        const { error } = await db.from('app_settings').upsert(rows.map(r => ({ ...r, updated_at: new Date().toISOString() })));
        if (error) throw httpError(500, error.message);
        return send(res, 200, { settings: await getSettings(db) });
      }

      throw httpError(400, 'Unknown action.');
    }

    send(res, 405, { error: 'Use GET or POST.' });
  } catch (err) {
    fail(res, err);
  }
};
