export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { input, json } = req.body || {};
  if (!input) return res.status(400).json({ error: 'Missing input' });
  try {
    const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages })
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data });
    const text = (data.content || []).map(c => c.text || '').join('');
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
