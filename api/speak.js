// POST /api/speak  Body: { text, voice }
// Turns the interviewer's question into speech with Google Cloud Text-to-Speech.
// Signed-in users only, so nobody else can use your Google key.
const { send, fail, readBody, requireUser, httpError } = require('../lib/shared');

const VOICES = new Set([
  'en-IN-Wavenet-B', 'en-IN-Wavenet-C', 'en-IN-Wavenet-F', // Indian English, male
  'en-IN-Wavenet-A', 'en-IN-Wavenet-D', 'en-IN-Wavenet-E', // Indian English, female
  'en-US-Wavenet-D', 'en-US-Wavenet-F',                    // US English, male / female
  'en-GB-Wavenet-B', 'en-GB-Wavenet-F',                    // UK English, male / female
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  try {
    await requireUser(req);
    const key = process.env.GOOGLE_TTS_API_KEY;
    if (!key) throw httpError(503, 'Voice is not set up on the server (GOOGLE_TTS_API_KEY is missing).');
    const body = await readBody(req);
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 700);
    if (!text) throw httpError(400, 'Nothing to read aloud.');
    const voice = VOICES.has(body.voice) ? body.voice : 'en-IN-Wavenet-B';
    const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: voice.slice(0, 5), name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.audioContent) {
      throw httpError(502, 'Voice service error: ' + ((out.error && out.error.message) || r.status));
    }
    const buf = Buffer.from(out.audioContent, 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (err) {
    fail(res, err);
  }
};
