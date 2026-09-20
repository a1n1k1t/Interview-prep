import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not signed in' });
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).single();
  if (!me?.is_admin) return res.status(403).json({ error: 'Admins only' });

  if (req.method === 'GET') {
    const { data, error } = await admin.from('profiles').select('id,email,credits_inr,is_admin,created_at').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ users: data });
  }
  if (req.method === 'POST') {
    const { userId, addCredits, setCredits } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    let update = {};
    if (typeof setCredits === 'number') {
      update.credits_inr = setCredits;
    } else if (typeof addCredits === 'number') {
      const { data: u } = await admin.from('profiles').select('credits_inr').eq('id', userId).single();
      update.credits_inr = Math.max(0, (u?.credits_inr || 0) + addCredits);
    } else {
      return res.status(400).json({ error: 'Provide addCredits or setCredits' });
    }
    const { error } = await admin.from('profiles').update(update).eq('id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'GET or POST only' });
}
