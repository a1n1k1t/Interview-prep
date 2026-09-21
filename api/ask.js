import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const USD_TO_INR = 250; // per your calibration: $0.01 used = ₹2.5 charged

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session: ' + (userErr?.message || 'no user') });
  const uid = userData.user.id;

  const { input, json, search, saveGrowthAreas } = req.body || {};

  if (saveGrowthAreas) {
    await admin.from('profiles').update({ growth_areas: saveGrowthAreas }).eq('id', uid);
    return res.status(200).json({ ok: true });
  }

  const { data: profile } = await admin.from('profiles').select('credits_inr,is_admin').eq('id', uid).single();
  if (!profile) return res.status(403).json({ error: 'No profile found for this account' });
  if (!profile.is_admin && profile.credits_inr <= 0) {
    return res.status(402).json({ error: "You're out of credits — ask your admin to add more." });
  }

  if (!input) return res.status(400).json({ error: 'Missing input' });

  try {
    const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages };
    if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      return res.status(500).json({ error: msg });
    }

    // deduct real cost from this user's balance (skip for admin)
    const usage = data.usage || {};
    const usd = (usage.input_tokens || 0) / 1e6 * 1 + (usage.output_tokens || 0) / 1e6 * 5 + (search ? 0.01 : 0);
    const inr = usd * USD_TO_INR;
    if (!profile.is_admin) {
      await admin.from('profiles').update({ credits_inr: Math.max(0, profile.credits_inr - inr) }).eq('id', uid);
    }

    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('');
    if (json) {
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : {};
      }
      return res.status(200).json(parsed);
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
