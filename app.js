/* InterviewIQ core: setup, sign-in, navigation, AI calls, voice, audio measurement.
   Other files: interview.js (mock interview + scoring), pages.js (everything else). */
'use strict';

// ======================================================================
// Global state
// ======================================================================
let supa = null;
let APPCFG = { voiceEnabled: true };
let currentUser = null;
let myProfile = null;
let appSettings = { coach_default_limit: 3, signup_bonus_inr: 20, allowed_email_domains: [] };
let currentTab = 'home';
const PAGES = {};

const prefs = {
  get voiceOn() { return localStorage.getItem('iq_voice_on') !== '0'; },
  set voiceOn(v) { localStorage.setItem('iq_voice_on', v ? '1' : '0'); },
  get voice() { return localStorage.getItem('iq_voice') || 'match'; },
  set voice(v) { localStorage.setItem('iq_voice', v); },
  get sttLang() { return localStorage.getItem('iq_stt_lang') || 'en-IN'; },
  set sttLang(v) { localStorage.setItem('iq_stt_lang', v); },
  get whisper() { return localStorage.getItem('iq_whisper') || 'tiny'; },
  set whisper(v) { localStorage.setItem('iq_whisper', v); },
};

// ======================================================================
// Errors and small helpers
// ======================================================================
function showFatal(msg) {
  document.getElementById('fatalMsg').textContent = ' ' + msg;
  document.getElementById('fatal').hidden = false;
}
window.addEventListener('error', e => { if (e && e.message && !/ResizeObserver/.test(e.message)) showFatal(e.message); });
window.addEventListener('unhandledrejection', e => showFatal((e.reason && e.reason.message) || String(e.reason)));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Safe light markdown: escapes everything first, then adds bold, italics, lists and paragraphs.
function md(s) {
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  const lines = esc(String(s || '')).split(/\r?\n/);
  let html = '', list = '';
  const close = () => { if (list) { html += '</' + list + '>'; list = ''; } };
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
    close();
    if (!l) continue;
    if ((m = l.match(/^#{1,4}\s+(.*)$/))) { html += '<p class="md-h">' + inline(m[1]) + '</p>'; continue; }
    html += '<p>' + inline(l) + '</p>';
  }
  close();
  return '<div class="md">' + html + '</div>';
}
function clip(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); }
function fmtDate(t) { try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
function inr(n) { return '₹' + Math.max(0, Number(n) || 0).toFixed(2); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function $(id) { return document.getElementById(id); }
function mainEl() { return $('main'); }

let toastTimer = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 3200);
}

// ======================================================================
// Dialogs (bottom sheet on phones, centred box on desktop)
// ======================================================================
let dialogResolve = null;
function openDialog(html) {
  const o = $('overlay');
  o.innerHTML = '<div class="dialog" role="dialog" aria-modal="true">' + html + '</div>';
  o.hidden = false;
  o.onclick = e => { if (e.target === o) closeDialog(null); };
  const first = o.querySelector('input,select,textarea,button');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeDialog(val) {
  $('overlay').hidden = true;
  $('overlay').innerHTML = '';
  if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(val); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('overlay').hidden) closeDialog(null); });

// formDialog({title, text, fields:[{id,label,type,value,placeholder,options}], ok}) -> values or null
function formDialog(o) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    const f = (o.fields || []).map(x => {
      const v = x.value == null ? '' : x.value;
      if (x.type === 'textarea') return `<label class="f" for="dlg-${x.id}">${esc(x.label)}</label><textarea id="dlg-${x.id}" placeholder="${esc(x.placeholder || '')}">${esc(v)}</textarea>`;
      if (x.type === 'select') return `<label class="f" for="dlg-${x.id}">${esc(x.label)}</label><select id="dlg-${x.id}">${x.options.map(op => `<option value="${esc(op[0])}" ${op[0] === v ? 'selected' : ''}>${esc(op[1])}</option>`).join('')}</select>`;
      return `<label class="f" for="dlg-${x.id}">${esc(x.label)}</label><input id="dlg-${x.id}" type="${x.type || 'text'}" value="${esc(v)}" placeholder="${esc(x.placeholder || '')}">`;
    }).join('');
    openDialog(`<h2>${esc(o.title)}</h2>${o.text ? `<p class="hint">${esc(o.text)}</p>` : ''}${f}
      <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn quiet" onclick="closeDialog(null)">Cancel</button><button class="btn" id="dlg-ok">${esc(o.ok || 'Save')}</button></div>`);
    $('dlg-ok').onclick = () => {
      const out = {};
      (o.fields || []).forEach(x => { out[x.id] = $('dlg-' + x.id).value; });
      closeDialog(out);
    };
  });
}

// ======================================================================
// Boot and config
// ======================================================================
async function loadConfig() {
  let cfg = {};
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) cfg = await r.json();
  } catch (e) { /* fall back below */ }
  const fb = window.IQ_FALLBACK_CONFIG || {};
  const url = String(cfg.supabaseUrl || fb.supabaseUrl || '').trim().replace(/\/+$/, '');
  const key = String(cfg.supabaseAnonKey || fb.supabaseAnonKey || '').trim();
  if (!url || !key) throw new Error('The app cannot find your Supabase details. In Vercel > Settings > Environment Variables, add SUPABASE_URL and SUPABASE_ANON_KEY (the anon public key), then redeploy.');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('SUPABASE_URL looks wrong: "' + url + '". It should look exactly like https://xxxxxxxx.supabase.co with nothing after it.');
  APPCFG = { ...cfg, supabaseUrl: url, supabaseAnonKey: key, voiceEnabled: cfg.voiceEnabled !== false };
  return APPCFG;
}

async function boot() {
  try {
    const cfg = await loadConfig();
    if (!window.supabase || !window.supabase.createClient) throw new Error('The Supabase library did not load. Check your internet connection and reload.');
    supa = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    supa.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') renderAuth('reset'); });
    const recovery = /type=recovery/.test(location.hash + location.search);
    const expired = /error_code=otp_expired/.test(location.hash + location.search);
    if (recovery) { $('boot').hidden = true; renderAuth('reset'); return; }
    const { data: { session } } = await supa.auth.getSession();
    $('boot').hidden = true;
    if (!session) { renderAuth('signin', expired ? 'That reset link has expired. Enter your email and tap "Forgot password?" for a new one.' : ''); return; }
    currentUser = session.user;
    await refreshProfile();
    if (!myProfile) return;
    await enterApp();
  } catch (e) {
    $('boot').hidden = true;
    showFatal(e.message || String(e));
  }
}
document.addEventListener('DOMContentLoaded', boot);

async function refreshProfile() {
  let { data } = await supa.from('profiles').select('id,email,credits_inr,is_admin,coach_used,coach_bonus').eq('id', currentUser.id).maybeSingle();
  if (!data) {
    await new Promise(r => setTimeout(r, 1000)); // the signup trigger can take a moment
    ({ data } = await supa.from('profiles').select('id,email,credits_inr,is_admin,coach_used,coach_bonus').eq('id', currentUser.id).maybeSingle());
  }
  if (!data) {
    showFatal('Your account exists but has no profile yet. Wait a few seconds and reload. If it keeps happening, re-run supabase-setup.sql (it creates the signup trigger).');
    return;
  }
  myProfile = data;
  const { data: s } = await supa.from('app_settings').select('key,value');
  (s || []).forEach(r => { appSettings[r.key] = r.value; });
  paintCredit();
}
function paintCredit() {
  if (!myProfile) return;
  const txt = myProfile.is_admin ? 'Unlimited' : inr(myProfile.credits_inr);
  if ($('creditSide')) $('creditSide').textContent = txt;
  if ($('creditTop')) $('creditTop').textContent = txt;
  if ($('avatar')) $('avatar').textContent = (myProfile.email || '?')[0].toUpperCase();
  if ($('whoEmail')) $('whoEmail').textContent = myProfile.email || '';
}
function coachLimit() { return Number(appSettings.coach_default_limit || 0) + Number(myProfile.coach_bonus || 0); }
function coachLeft() { return myProfile.is_admin ? Infinity : Math.max(0, coachLimit() - Number(myProfile.coach_used || 0)); }

async function enterApp() {
  $('auth').hidden = true;
  $('app').hidden = false;
  buildNav();
  const start = (location.hash || '').replace('#', '');
  await renderTab(NAV.some(n => n.id === start && (!n.admin || myProfile.is_admin)) ? start : 'home');
}

// ======================================================================
// Sign in / sign up / reset
// ======================================================================
function renderAuth(mode, note) {
  $('app').hidden = true;
  const a = $('auth');
  a.hidden = false;
  const art = `<div class="auth-art">
      <div class="brand"><div class="mark"><span class="ms">record_voice_over</span></div><b>InterviewIQ</b></div>
      <div>
        <h1>Walk into placement week having already faced the panel.</h1>
        <p>Mock interviews with an AI panel that changes every round, scored the way recruiters actually score: by competency, with evidence.</p>
      </div>
      <div class="mini-sheet" aria-hidden="true">
        <div class="ln"><span>Clarity of thought</span><span class="circ">4</span></div>
        <div class="ln"><span>Evidence and impact</span><span class="circ">2</span></div>
        <div class="ln"><span>Composure under pressure</span><span class="circ">3</span></div>
      </div>
    </div>`;
  let form;
  if (mode === 'reset') {
    form = `<h2>Set a new password</h2>
      <label class="f" for="rp1">New password</label><input id="rp1" type="password" autocomplete="new-password">
      <label class="f" for="rp2">Type it again</label><input id="rp2" type="password" autocomplete="new-password">
      <div class="row" style="margin-top:16px"><button class="btn" onclick="doResetPassword()">Save password</button></div>`;
  } else {
    const up = mode === 'signup';
    form = `<h2>${up ? 'Create your account' : 'Sign in'}</h2>
      <p class="hint" style="margin-top:4px">${up ? 'Use the email you check, so you can reset your password later.' : 'Welcome back.'}</p>
      <label class="f" for="au-email">Email</label><input id="au-email" type="email" autocomplete="email">
      <label class="f" for="au-pass">Password</label><input id="au-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}">
      <div class="row" style="margin-top:16px">
        <button class="btn" onclick="${up ? 'doSignUp()' : 'doSignIn()'}">${up ? 'Create account' : 'Sign in'}</button>
        ${up ? '' : '<button class="btn ghost" onclick="doForgot()">Forgot password?</button>'}
      </div>
      <p class="hint" style="margin-top:22px">${up ? 'Already have an account? <a href="#" onclick="renderAuth(\'signin\');return false">Sign in</a>' : 'New here? <a href="#" onclick="renderAuth(\'signup\');return false">Create an account</a>'}</p>`;
  }
  a.innerHTML = `<div class="auth-wrap">${art}<div class="auth-form"><div class="box">${form}<p id="au-msg" class="err-inline" role="alert">${esc(note || '')}</p></div></div></div>`;
  const pw = $('au-pass');
  if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') (mode === 'signup' ? doSignUp : doSignIn)(); });
}
function authMsg(t, good) { const m = $('au-msg') || $('rp-msg'); if (m) { m.textContent = t; m.style.color = good ? 'var(--ok)' : 'var(--stamp)'; } }
async function doSignIn() {
  const email = $('au-email').value.trim(), pass = $('au-pass').value;
  if (!email || !pass) return authMsg('Enter your email and password.');
  const { error } = await supa.auth.signInWithPassword({ email, password: pass });
  if (error) return authMsg(error.message);
  const { data: { session } } = await supa.auth.getSession();
  currentUser = session.user;
  await refreshProfile();
  if (myProfile) await enterApp();
}
async function doSignUp() {
  const email = $('au-email').value.trim(), pass = $('au-pass').value;
  if (!email || !pass) return authMsg('Enter an email and a password.');
  if (pass.length < 8) return authMsg('Use a password of at least 8 characters.');
  const { data, error } = await supa.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) return authMsg(error.message);
  if (data && data.session) {
    currentUser = data.session.user;
    await refreshProfile();
    if (myProfile) await enterApp();
    return;
  }
  authMsg('Account created. Check your inbox for a confirmation link, then sign in.', true);
}
async function doForgot() {
  const email = $('au-email').value.trim();
  if (!email) return authMsg('Type your email above first, then tap "Forgot password?".');
  const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) return authMsg(error.message);
  authMsg('If that email has an account, a reset link is on its way. Open it on this device.', true);
}
async function doResetPassword() {
  const p1 = $('rp1').value, p2 = $('rp2').value;
  if (p1.length < 8) return authMsg('Use at least 8 characters.');
  if (p1 !== p2) return authMsg('The two passwords do not match.');
  const { error } = await supa.auth.updateUser({ password: p1 });
  if (error) return authMsg(error.message);
  history.replaceState(null, '', location.pathname);
  location.reload();
}
async function doSignOut() {
  if (typeof interviewInProgress === 'function' && interviewInProgress() && !confirm('Your interview is saved on this device and you can resume it later. Sign out anyway?')) return;
  await supa.auth.signOut();
  location.hash = '';
  location.reload();
}

// ======================================================================
// Navigation
// ======================================================================
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'interview', label: 'Mock interview', short: 'Interview', icon: 'record_voice_over' },
  { id: 'practice', label: 'Speaking practice', short: 'Practice', icon: 'graphic_eq' },
  { id: 'coach', label: 'Coach', icon: 'forum' },
  { sep: true },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'personas', label: 'Personas', icon: 'badge' },
  { id: 'about', label: 'About me', icon: 'person' },
  { id: 'reads', label: 'Reads', icon: 'menu_book' },
  { id: 'admin', label: 'Admin', icon: 'admin_panel_settings', admin: true },
];
const TABBAR = ['home', 'interview', 'practice', 'coach', 'more'];

function buildNav() {
  const items = NAV.filter(n => !n.admin || myProfile.is_admin);
  $('sideNav').innerHTML = items.map(n => n.sep ? '<div class="nav-sep"></div>' :
    `<button class="nav-item" ${currentTab === n.id ? 'aria-current="page"' : ''} onclick="go('${n.id}')"><span class="ms">${n.icon}</span>${esc(n.label)}</button>`).join('');
  const inMore = !TABBAR.includes(currentTab);
  $('tabBar').innerHTML = TABBAR.map(id => {
    if (id === 'more') return `<button ${inMore ? 'aria-current="page"' : ''} onclick="openMore()"><span class="ms">menu</span>More</button>`;
    const n = NAV.find(x => x.id === id);
    return `<button ${currentTab === id ? 'aria-current="page"' : ''} onclick="go('${id}')"><span class="ms">${n.icon}</span>${esc(n.short || n.label)}</button>`;
  }).join('');
}
function openMore() {
  const items = NAV.filter(n => !n.sep && !TABBAR.includes(n.id) && (!n.admin || myProfile.is_admin));
  openDialog(`<div class="row between"><h2>More</h2><span class="hint">${esc(myProfile.email || '')}</span></div>
    <div class="sheet-nav">${items.map(n => `<button onclick="closeDialog();go('${n.id}')"><span class="ms">${n.icon}</span>${esc(n.label)}</button>`).join('')}
    <button onclick="closeDialog();openSettings()"><span class="ms">tune</span>Settings</button>
    <button onclick="closeDialog();doSignOut()"><span class="ms">logout</span>Sign out</button></div>`);
}

async function go(id) {
  if (id === currentTab && id !== 'interview') return renderTab(id);
  if (typeof rec !== 'undefined' && rec.active) {
    if (!confirm('You are recording. Stop and leave? This answer will not be saved.')) return;
    await stopCapture(true);
  }
  stopSpeaking();
  if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  await renderTab(id);
}
window.addEventListener('popstate', () => {
  const id = (location.hash || '#home').slice(1);
  if (NAV.some(n => n.id === id)) { stopSpeaking(); renderTab(id); }
});
async function renderTab(id) {
  currentTab = id;
  buildNav();
  window.scrollTo(0, 0);
  const el = mainEl();
  el.innerHTML = '<div class="page"><p class="hint">Loading</p></div>';
  try {
    if (!PAGES[id]) throw new Error('Unknown page.');
    await PAGES[id]();
  } catch (e) {
    el.innerHTML = `<div class="page"><div class="panel"><h2>This page could not load</h2><p class="err-inline">${esc(e.message || e)}</p><button class="btn quiet" onclick="renderTab('${id}')">Try again</button></div></div>`;
  }
}

// ======================================================================
// AI calls (all go through the credit-checked server)
// ======================================================================
async function authToken() {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) throw new Error('You are signed out. Reload and sign in again.');
  return session.access_token;
}
async function ask(task, o) {
  o = o || {};
  const messages = o.messages || [{ role: 'user', content: o.prompt || '' }];
  const token = await authToken();
  let r;
  try {
    r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ task, system: o.system || '', messages, schema: o.schema, search: !!o.search }),
    });
  } catch (e) { throw new Error('Could not reach the server. Check your internet connection.'); }
  let data = {};
  try { data = await r.json(); } catch (e) { throw new Error('The server gave an unexpected reply (status ' + r.status + '). If this keeps happening, check the Vercel deployment logs.'); }
  if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
  if (data.balance !== null && data.balance !== undefined && myProfile) { myProfile.credits_inr = data.balance; paintCredit(); }
  return data;
}

// ======================================================================
// Settings
// ======================================================================
const VOICE_OPTIONS = [
  ['match', 'Match the interviewer (Indian English)'],
  ['en-IN-Wavenet-B', 'Indian English, male'],
  ['en-IN-Wavenet-D', 'Indian English, female'],
  ['en-GB-Wavenet-B', 'British English, male'],
  ['en-GB-Wavenet-F', 'British English, female'],
  ['en-US-Wavenet-D', 'American English, male'],
  ['en-US-Wavenet-F', 'American English, female'],
];
function openSettings() {
  openDialog(`<h2>Settings</h2>
    <label class="check"><input type="checkbox" id="st-voice" ${prefs.voiceOn ? 'checked' : ''}> Read questions aloud</label>
    ${APPCFG.voiceEnabled ? '' : '<p class="hint">Voice is not set up on the server yet (GOOGLE_TTS_API_KEY is missing).</p>'}
    <label class="f" for="st-v">Interviewer voice</label>
    <select id="st-v">${VOICE_OPTIONS.map(o => `<option value="${o[0]}" ${prefs.voice === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>
    <label class="f" for="st-lang">Your accent, for speech recognition</label>
    <select id="st-lang">${[['en-IN', 'Indian English'], ['en-GB', 'British English'], ['en-US', 'American English']].map(o => `<option value="${o[0]}" ${prefs.sttLang === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    <label class="f" for="st-w">Transcription on phones and Safari</label>
    <select id="st-w">
      <option value="tiny" ${prefs.whisper === 'tiny' ? 'selected' : ''}>Fast (about 40 MB download, once)</option>
      <option value="base" ${prefs.whisper === 'base' ? 'selected' : ''}>More accurate (about 80 MB download, once)</option>
    </select>
    <p class="hint" style="margin-top:6px">Chrome and Edge on a computer transcribe live and do not need this download.</p>
    <div class="row" style="margin-top:18px;justify-content:space-between">
      <button class="btn ghost" onclick="testVoice()"><span class="ms">volume_up</span>Test voice</button>
      <div class="row"><button class="btn quiet" onclick="closeDialog()">Cancel</button><button class="btn" onclick="saveSettings()">Save</button></div>
    </div>`);
}
function saveSettings() {
  prefs.voiceOn = $('st-voice').checked;
  prefs.voice = $('st-v').value;
  prefs.sttLang = $('st-lang').value;
  prefs.whisper = $('st-w').value;
  closeDialog();
  toast('Settings saved.');
}
async function testVoice() {
  unlockAudio();
  const v = $('st-v').value;
  try { await speak('Good morning. Thanks for coming in today. Shall we begin?', v === 'match' ? 'en-IN-Wavenet-B' : v, true); }
  catch (e) { toast(e.message, true); }
}

// ======================================================================
// Voice output (Google TTS via /api/speak). One audio element, unlocked on a tap,
// so iPhones allow it to play later.
// ======================================================================
const tts = { audio: null, unlocked: false, speaking: false, url: null, done: null };
function silentWavUrl() {
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function unlockAudio() {
  if (!tts.audio) tts.audio = new Audio();
  if (tts.unlocked) return;
  try {
    tts.audio.src = silentWavUrl();
    const p = tts.audio.play();
    if (p && p.then) p.then(() => { tts.unlocked = true; }).catch(() => {});
  } catch (e) { /* ignore */ }
}
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

function stopSpeaking() {
  if (tts.audio) { try { tts.audio.pause(); } catch (e) {} }
  tts.speaking = false;
  if (tts.done) { const d = tts.done; tts.done = null; d(); }
}
// Resolves when playback ends (or immediately if voice is off or fails).
async function speak(text, voiceName, force) {
  if ((!prefs.voiceOn && !force) || !APPCFG.voiceEnabled || !text) return;
  if (!tts.audio) tts.audio = new Audio();
  stopSpeaking();
  const token = await authToken();
  const r = await fetch('/api/speak', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ text: String(text).slice(0, 700), voice: voiceName }),
  });
  if (!r.ok) {
    let m = 'Voice failed.';
    try { m = (await r.json()).error || m; } catch (e) {}
    throw new Error(m);
  }
  const blob = await r.blob();
  if (tts.url) URL.revokeObjectURL(tts.url);
  tts.url = URL.createObjectURL(blob);
  tts.audio.src = tts.url;
  tts.speaking = true;
  await new Promise(resolve => {
    tts.done = resolve;
    tts.audio.onended = () => stopSpeaking();
    tts.audio.onerror = () => stopSpeaking();
    const p = tts.audio.play();
    if (p && p.catch) p.catch(() => stopSpeaking()); // blocked autoplay: just carry on silently
  });
}

// ======================================================================
// Audio capture and measurement
// ======================================================================
const rec = { active: false, ctx: null, stream: null, analyser: null, recog: null, mr: null, chunks: [], final: '', interim: '', vol: [], pitch: [], loop: null, start: 0, mode: '' };
function speechRecognitionAvailable() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return !!SR && !mobile;
}

// Autocorrelation pitch detector, limited to the human speaking range (70 to 400 Hz).
function detectPitch(buf, sr) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return { pitch: -1, rms };
  const minLag = Math.floor(sr / 400), maxLag = Math.min(Math.floor(sr / 70), buf.length >> 1);
  const n = buf.length - maxLag;
  let e0 = 0;
  for (let j = 0; j < n; j++) e0 += buf[j] * buf[j];
  const corr = new Float32Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0;
    for (let j = 0; j < n; j++) { const b = buf[j + lag]; c += buf[j] * b; e1 += b * b; }
    const r = c / Math.sqrt(e0 * e1 + 1e-12);
    corr[lag] = r;
    if (r > best) best = r;
  }
  if (best < 0.6) return { pitch: -1, rms };
  // first strong peak, to avoid jumping an octave down
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= best * 0.9 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) return { pitch: sr / lag, rms };
  }
  return { pitch: -1, rms };
}

async function startCapture(onText, onLevel) {
  if (rec.active) await stopCapture(true);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot use the microphone. Try Chrome, or type your answer instead.');
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new Error('Microphone access was blocked. Allow the microphone for this site in your browser settings, or type your answer instead.');
  }
  rec.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = rec.ctx.createMediaStreamSource(rec.stream);
  rec.analyser = rec.ctx.createAnalyser();
  rec.analyser.fftSize = 2048;
  src.connect(rec.analyser);
  rec.vol = []; rec.pitch = []; rec.final = ''; rec.interim = ''; rec.chunks = []; rec.start = Date.now(); rec.active = true;
  const buf = new Float32Array(rec.analyser.fftSize);
  rec.loop = setInterval(() => {
    rec.analyser.getFloatTimeDomainData(buf);
    const { pitch, rms } = detectPitch(buf, rec.ctx.sampleRate);
    rec.vol.push(rms);
    if (pitch > 0) rec.pitch.push(pitch);
    if (onLevel) onLevel(rms, (Date.now() - rec.start) / 1000);
  }, 100);

  if (speechRecognitionAvailable()) {
    rec.mode = 'live';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec.recog = new SR();
    rec.recog.continuous = true;
    rec.recog.interimResults = true;
    rec.recog.lang = prefs.sttLang;
    rec.recog.onresult = e => {
      let inter = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) rec.final += e.results[i][0].transcript + ' ';
        else inter += e.results[i][0].transcript;
      }
      rec.interim = inter;
      if (onText) onText(rec.final + rec.interim);
    };
    rec.recog.onerror = e => { if (e && e.error === 'not-allowed') toast('Speech recognition was blocked by the browser.', true); };
    rec.recog.onend = () => { if (rec.active) { try { rec.recog.start(); } catch (e) {} } }; // Chrome stops long sessions; restart quietly
    rec.recog.start();
  } else {
    rec.mode = 'device';
    rec.recog = null;
    const mt = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    rec.mr = new MediaRecorder(rec.stream, mt ? { mimeType: mt } : undefined);
    rec.mr.ondataavailable = e => { if (e.data.size > 0) rec.chunks.push(e.data); };
    rec.mr.start();
    if (onText) onText('Recording. Your words will appear after you stop (transcribed on this device).');
  }
}

async function whisperTranscribe(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await tmp.decodeAudioData(arrayBuffer);
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const s = off.createBufferSource(); s.buffer = audio; s.connect(off.destination); s.start();
  const rendered = await off.startRendering();
  tmp.close();
  if (!window.__getTranscriber) throw new Error('The on-device transcriber did not load.');
  const model = prefs.whisper === 'base' ? 'Xenova/whisper-base.en' : 'Xenova/whisper-tiny.en';
  const t = await window.__getTranscriber(model);
  const out = await t(rendered.getChannelData(0), { chunk_length_s: 30, stride_length_s: 5 });
  return (out && out.text) || '';
}

// discard=true throws the recording away. Otherwise returns measured metrics + transcript.
async function stopCapture(discard) {
  if (!rec.active && !rec.stream) return null;
  rec.active = false;
  if (rec.loop) clearInterval(rec.loop);
  rec.loop = null;
  const totalSec = Math.max(0.5, (Date.now() - rec.start) / 1000);
  let transcript = '';
  if (rec.recog) {
    try { rec.recog.stop(); } catch (e) {}
    await new Promise(r => setTimeout(r, 350)); // let the last words arrive
    transcript = (rec.final + ' ' + rec.interim).replace(/\s+/g, ' ').trim();
    rec.recog = null;
  } else if (rec.mr) {
    if (rec.mr.state !== 'inactive') await new Promise(resolve => { rec.mr.onstop = resolve; rec.mr.stop(); });
    if (!discard) {
      const blob = new Blob(rec.chunks, { type: rec.mr.mimeType || 'audio/webm' });
      try { transcript = (await whisperTranscribe(blob)).trim(); } catch (e) { transcript = ''; toast('On-device transcription failed: ' + (e.message || e), true); }
    }
    rec.mr = null;
  }
  if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
  rec.stream = null;
  if (rec.ctx) { try { rec.ctx.close(); } catch (e) {} }
  rec.ctx = null;
  if (discard) return null;
  return computeMetrics(transcript, rec.vol.slice(), rec.pitch.slice(), totalSec);
}

const FILLER_RE = /\b(um+|uh+|uhm+|umm+|erm+|er|ah+|hmm+|you know|basically|i mean|actually|literally)\b/gi;
const HEDGE_RE = /\b(i think|i guess|maybe|probably|perhaps|kind of|sort of|i feel like|i'?m not sure|not sure|might be|somewhat|hopefully)\b/gi;
const LIKE_PREV_OK = new Set('i we you they he she it people customers users would d feel feels felt look looks looked looking seem seems seemed sound sounds something anything nothing everything things thing more much just exactly really also not dont didnt do did really most'.split(' '));
const LIKE_NEXT_OK = new Set('to it this that the a an me him her them us these those when how what our my your their his its'.split(' '));
function countFillers(text) {
  const t = String(text || '').toLowerCase();
  let n = (t.match(FILLER_RE) || []).length;
  const words = t.replace(/[^a-z'\s]/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== 'like') continue;
    const prev = words[i - 1] || '', next = words[i + 1] || '';
    if (LIKE_PREV_OK.has(prev) || LIKE_NEXT_OK.has(next)) continue;
    n++;
  }
  return n;
}
function countHedges(text) { return (String(text || '').toLowerCase().match(HEDGE_RE) || []).length; }

function computeMetrics(transcript, vol, pitch, totalSec) {
  const words = transcript ? transcript.split(/\s+/).filter(Boolean) : [];
  const sorted = vol.slice().sort((a, b) => a - b);
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.15)] : 0;
  const thr = Math.max(0.01, floor * 2.2);
  let first = -1, last = -1;
  vol.forEach((v, i) => { if (v > thr) { if (first < 0) first = i; last = i; } });
  const speakSec = first >= 0 ? Math.max(1, (last - first + 1) * 0.1) : Math.max(1, totalSec);
  const startDelay = first >= 0 ? first * 0.1 : 0;
  let pauseCount = 0, pauseSec = 0, run = 0;
  if (first >= 0) {
    for (let i = first; i <= last; i++) {
      if (vol[i] <= thr) run++;
      else { if (run >= 12) { pauseCount++; pauseSec += run * 0.1; } run = 0; }
    }
  }
  const p = pitch.filter(f => f >= 70 && f <= 400).sort((a, b) => a - b);
  let pMean = 0, pVar = 0, pitchSt = 0;
  if (p.length > 8) {
    const med = p[Math.floor(p.length / 2)];
    const ok = p.filter(f => f > med / 1.8 && f < med * 1.8);
    pMean = ok.reduce((a, b) => a + b, 0) / ok.length;
    pVar = Math.sqrt(ok.reduce((a, b) => a + (b - pMean) ** 2, 0) / ok.length);
    const st = ok.map(f => 12 * Math.log2(f / med));
    const sm = st.reduce((a, b) => a + b, 0) / st.length;
    pitchSt = Math.sqrt(st.reduce((a, b) => a + (b - sm) ** 2, 0) / st.length);
  }
  const fillers = countFillers(transcript), hedges = countHedges(transcript);
  const wpm = words.length ? Math.round(words.length / (speakSec / 60)) : 0;
  return {
    transcript, durationSec: Math.round(totalSec), speakSec: Math.round(speakSec * 10) / 10, startDelay: Math.round(startDelay * 10) / 10,
    wordCount: words.length, wpm: isFinite(wpm) ? wpm : 0, fillers, hedges,
    fillerRate: words.length ? Math.round(fillers / words.length * 1000) / 10 : 0,
    hedgeRate: words.length ? Math.round(hedges / words.length * 1000) / 10 : 0,
    pauseCount, pauseSec: Math.round(pauseSec * 10) / 10,
    pausesPerMin: Math.round(pauseCount / (speakSec / 60) * 10) / 10,
    pMean: Math.round(pMean), pVar: Math.round(pVar), pitchSt: Math.round(pitchSt * 10) / 10,
  };
}

// Combines several spoken answers into one set of delivery numbers.
function aggregateMetrics(list) {
  const L = (list || []).filter(m => m && m.wordCount > 0);
  if (!L.length) return null;
  const sum = k => L.reduce((a, m) => a + (Number(m[k]) || 0), 0);
  const words = sum('wordCount'), speak = Math.max(1, sum('speakSec'));
  const pitched = L.filter(m => m.pitchSt > 0);
  const wAvg = (k, arr) => { const t = arr.reduce((a, m) => a + m.speakSec, 0); return t ? arr.reduce((a, m) => a + m[k] * m.speakSec, 0) / t : 0; };
  return {
    answers: L.length, wordCount: words, speakSec: Math.round(speak), durationSec: Math.round(sum('durationSec')),
    wpm: Math.round(words / (speak / 60)), fillers: sum('fillers'), hedges: sum('hedges'),
    fillerRate: Math.round(sum('fillers') / words * 1000) / 10, hedgeRate: Math.round(sum('hedges') / words * 1000) / 10,
    pauseCount: sum('pauseCount'), pauseSec: Math.round(sum('pauseSec')),
    pausesPerMin: Math.round(sum('pauseCount') / (speak / 60) * 10) / 10,
    pVar: Math.round(wAvg('pVar', pitched)), pitchSt: Math.round(wAvg('pitchSt', pitched) * 10) / 10,
    avgAnswerSec: Math.round(speak / L.length), startDelay: Math.round(sum('startDelay') / L.length * 10) / 10,
  };
}

// Plain-language read-out of measured delivery numbers (not AI judgement).
function deliveryCards(m) {
  if (!m) return [];
  const band = (v, good, watch) => (v >= good[0] && v <= good[1]) ? 'good' : ((v >= watch[0] && v <= watch[1]) ? 'watch' : 'bad');
  const out = [];
  const add = (k, v, cls, s) => out.push({ k, v, cls, s });
  let c = band(m.wpm, [115, 165], [95, 185]);
  add('Pace', m.wpm + ' wpm', c, c === 'good' ? 'Comfortable pace' : (m.wpm < 115 ? 'A bit slow' : 'A bit fast'));
  if (m.fillerRate !== undefined) { c = m.fillerRate < 2 ? 'good' : m.fillerRate <= 5 ? 'watch' : 'bad'; add('Filler words', m.fillerRate + ' per 100 words', c, c === 'good' ? 'Clean' : 'Trim words like "basically", "actually"'); }
  if (m.hedgeRate !== undefined) { c = m.hedgeRate < 1.5 ? 'good' : m.hedgeRate <= 3 ? 'watch' : 'bad'; add('Hedging', m.hedgeRate + ' per 100 words', c, c === 'good' ? 'Decisive wording' : 'Fewer "I think", "maybe"'); }
  if (m.pausesPerMin !== undefined) { c = m.pausesPerMin <= 3 ? 'good' : m.pausesPerMin <= 6 ? 'watch' : 'bad'; add('Long pauses', m.pausesPerMin + ' per min', c, c === 'good' ? 'Natural' : 'Some hesitation'); }
  if (m.pitchSt) { c = m.pitchSt < 1.3 ? 'bad' : m.pitchSt < 2 ? 'watch' : m.pitchSt <= 6 ? 'good' : 'watch'; add('Vocal variety', m.pitchSt + ' semitones', c, m.pitchSt < 1.3 ? 'Sounds flat' : m.pitchSt < 2 ? 'Slightly flat' : m.pitchSt <= 6 ? 'Lively' : 'Very animated'); }
  else if (m.pVar) { add('Vocal variety', m.pVar + ' Hz', 'watch', 'Older measure'); }
  if (m.avgAnswerSec !== undefined) { c = band(m.avgAnswerSec, [40, 120], [25, 150]); add('Answer length', m.avgAnswerSec + ' s average', c, m.avgAnswerSec < 40 ? 'Answers are thin' : m.avgAnswerSec > 120 ? 'Answers run long' : 'Good length'); }
  if (m.startDelay !== undefined) { c = m.startDelay <= 3 ? 'good' : m.startDelay <= 6 ? 'watch' : 'bad'; add('Time to start', m.startDelay + ' s', c, c === 'good' ? 'Quick start' : 'Slow to start'); }
  return out;
}
function deliveryHtml(m) {
  const cards = deliveryCards(m);
  if (!cards.length) return '<p class="hint">No spoken answers to measure (typed answers are not measured).</p>';
  const val = v => { const m = String(v).match(/^([\d.]+)\s*(.*)$/); return m ? esc(m[1]) + (m[2] ? ' <small>' + esc(m[2]) + '</small>' : '') : esc(v); };
  return `<div class="metrics">${cards.map(x => `<div class="metric ${x.cls}"><div class="k">${esc(x.k)}</div><div class="v">${val(x.v)}</div><div class="s">${esc(x.s)}</div></div>`).join('')}</div>`;
}
