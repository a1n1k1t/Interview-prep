// GET /api/config
// Gives the browser the two PUBLIC Supabase values from your Vercel settings,
// so you never have to paste them into index.html by hand.
// (The anon key is meant to be public. The service role key is never sent.)
module.exports = function handler(req, res) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({
    supabaseUrl: url,
    supabaseAnonKey: anon,
    voiceEnabled: !!process.env.GOOGLE_TTS_API_KEY,
  }));
};
