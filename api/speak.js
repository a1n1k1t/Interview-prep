import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) return res.status(401).json({ error: 'Not signed in' });

  const { text, voice } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });

  try {
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text: text.slice(0, 600) },
        voice: { languageCode: 'en-US', name: voice || 'en-US-Wavenet-D' },
        audioConfig: { audioEncoding: 'MP3' }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    const buf = Buffer.from(data.audioContent, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
