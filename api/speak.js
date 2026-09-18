import pkg from "msedge-tts";
const { MsEdgeTTS, OUTPUT_FORMAT } = pkg;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { text, voice } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice || 'en-US-GuyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text.slice(0, 600));
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
