/* InterviewIQ pages: home, speaking practice, history, personas, about me, reads, coach, admin, growth areas. */
'use strict';

// ======================================================================
// Shared data loaders
// ======================================================================
let personas = [];
let personasLoaded = false;
function normPersona(r) {
  const label = r.label || ((r.role || 'Role') + (r.company ? ' at ' + r.company : ''));
  return { id: r.id, ownerId: r.user_id, company: r.company || '', role: r.role || '', jdText: r.jd_text || '', label, toughness: r.toughness || 'realistic', isPublic: !!r.is_public, mine: r.user_id === currentUser.id, brief: r.company_brief || '', briefAt: r.company_brief_at || null };
}
async function ensurePersonas(force) {
  if (personasLoaded && !force) return personas;
  const { data, error } = await supa.from('personas').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('Could not load personas: ' + error.message);
  personas = (data || []).map(normPersona);
  personasLoaded = true;
  return personas;
}

let aboutMe = null, aboutLoaded = false, aboutErr = null;
const ABOUT_LIMITS = { cv_text: 3000, strengths: 700, weaknesses: 700, other: 500 };
async function ensureAbout(force) {
  if (aboutLoaded && !force) return aboutMe;
  const { data, error } = await supa.from('about_me').select('*').eq('user_id', currentUser.id).maybeSingle();
  aboutErr = error ? error.message : null;
  aboutMe = data || null;
  aboutLoaded = true;
  return aboutMe;
}
function aboutHasContent(a) { return !!(a && (a.cv_text || a.strengths || a.weaknesses || a.other)); }
function aboutForPrompt() {
  const a = aboutMe;
  if (!aboutHasContent(a)) return '';
  if (a.brief) return a.brief;
  const parts = [];
  if (a.cv_text) parts.push('Background and CV: ' + clip(a.cv_text, 1500));
  if (a.strengths) parts.push('Strengths: ' + clip(a.strengths, 400));
  if (a.weaknesses) parts.push('Weaknesses: ' + clip(a.weaknesses, 400));
  if (a.other) parts.push('Other: ' + clip(a.other, 300));
  return parts.join('\n');
}

async function loadSessions(limit) {
  const { data, error } = await supa.from('sessions').select('id,kind,data,created_at')
    .eq('user_id', currentUser.id).neq('kind', 'coach_chat')
    .order('created_at', { ascending: false }).limit(limit || 60);
  if (error) throw new Error('Could not load your sessions: ' + error.message);
  return (data || []).map(r => ({ ...(r.data || {}), kind: r.kind, createdAt: (r.data && r.data.createdAt) || r.created_at, _rowId: r.id }));
}

// Average rating (1 to 5) per competency over a set of interviews
function dimProfile(sessions, n) {
  const v2 = sessions.filter(s => s.dims).slice(0, n || 5);
  const out = {};
  DIMS.forEach(d => {
    const vals = v2.map(s => s.dims[d.id] && s.dims[d.id].score).filter(Boolean);
    out[d.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  return { profile: out, count: v2.length };
}
function profileBarsHtml(profile) {
  const rated = DIMS.filter(d => profile[d.id] != null);
  if (!rated.length) return '';
  const lowest = rated.slice().sort((a, b) => profile[a.id] - profile[b.id]).slice(0, 2).map(d => d.id);
  return `<div class="profile-bars">${DIMS.map(d => {
    const v = profile[d.id];
    if (v == null) return `<div class="pbar"><span>${esc(d.label)}</span><div class="track"></div><b class="hint">n/a</b></div>`;
    return `<div class="pbar ${lowest.includes(d.id) ? 'low' : ''}"><span>${esc(d.label)}</span><div class="track"><div class="fillbar" style="width:${v / 5 * 100}%"></div></div><b>${v.toFixed(1)}</b></div>`;
  }).join('')}</div>`;
}
function calcStreak(dates) {
  const days = new Set(dates.map(d => new Date(d).toDateString()));
  const cur = new Date();
  if (!days.has(cur.toDateString())) { cur.setDate(cur.getDate() - 1); if (!days.has(cur.toDateString())) return 0; }
  let n = 0;
  while (days.has(cur.toDateString())) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}

// ======================================================================
// Home
// ======================================================================
const DRILLS = {
  clarity: { title: 'Answer in three parts', text: 'Lead with your conclusion, give two reasons, close with one example. Under 90 seconds.', topic: 'Should a premium brand ever cut its price? Start with a clear yes or no.' },
  communication: { title: 'Answer the exact question', text: 'Repeat the question to yourself, answer it in your first sentence, then support it.', topic: 'In one minute: one thing you would change about your college, and why.' },
  evidence: { title: 'Three numbers in one story', text: 'Tell one achievement with at least three numbers, and say where each number came from.', topic: 'Your biggest achievement in the last two years, with three numbers.' },
  knowledge: { title: 'Explain a business in a minute', text: 'Explain how money flows through a business you know, as if to a shop owner.', topic: 'How does a quick-commerce company make or lose money on a single order?' },
  problem: { title: 'Structure before you solve', text: 'Say your approach in one line before doing any maths. State assumptions out loud.', topic: 'Estimate how many cups of tea are sold in your city each day. Think aloud.' },
  selfaware: { title: 'A real weakness, a real fix', text: 'Name a real weakness, the incident that showed it, and what you changed afterwards.', topic: 'A real weakness of yours, the moment it showed, and what you have changed since.' },
  motivation: { title: 'Why this role, with proof', text: 'Back every reason for wanting the role with something you have actually done.', topic: 'Why do you want a career in this function? Prove each reason with your past.' },
  leadership: { title: 'What was yours alone', text: 'Tell a team story and separate clearly what you did from what the team did.', topic: 'A time you led without formal authority. What did you do that others did not?' },
  composure: { title: 'Hold your ground', text: 'Acknowledge the challenge, then defend your view calmly with one piece of evidence.', topic: 'Someone tells you an MBA is a waste of two years. Respond calmly and convincingly.' },
};

PAGES.home = async function renderHome() {
  const [sessions] = await Promise.all([loadSessions(60), ensurePersonas(), loadGrowth()]);
  const interviews = sessions.filter(s => s.kind === 'interview');
  const name = (myProfile.email || '').split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0];
  const h = new Date().getHours();
  const greet = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
  const { profile, count } = dimProfile(sessions, 5);
  const rated = DIMS.filter(d => profile[d.id] != null);
  const weakest = rated.length ? rated.slice().sort((a, b) => profile[a.id] - profile[b.id])[0] : null;
  const drill = weakest ? DRILLS[weakest.id] : DRILLS.evidence;
  const last = interviews[0];
  mainEl().innerHTML = `<div class="page">
    <div class="slip">
      <h1>${esc(greet)}${name ? ', ' + esc(name.charAt(0).toUpperCase() + name.slice(1)) : ''}. Ready for your next round?</h1>
      <p>Every interview brings a new interviewer, a new opening and a new mix of questions, so it never feels like the same test twice.</p>
      ${setupFieldsHtml('hm', true)}
      <div class="row"><button class="btn lg" onclick="startFromSetup('hm')"><span class="ms">play_arrow</span>Start interview</button>
        <button class="btn quiet" onclick="go('practice')">Quick speaking drill</button></div>
      <div class="meta">
        <span><b>${myProfile.is_admin ? 'Unlimited' : esc(inr(myProfile.credits_inr))}</b>balance</span>
        <span><b>${interviews.length}</b>interviews</span>
        <span><b>${calcStreak(sessions.map(s => s.createdAt))}</b>day streak</span>
        ${last ? `<span><b>${esc(last.overallScore)}</b>last score</span>` : ''}
      </div>
    </div>
    <div class="grid2">
      <div class="panel"><h2>Where you stand</h2>${count ? `<p class="hint">Average rating out of 5 across your last ${count} scored interview${count === 1 ? '' : 's'}. Red marks your two weakest areas.</p>${profileBarsHtml(profile)}` : `<div class="empty"><b>No scores yet</b>Finish one interview and your competency profile appears here.</div>`}</div>
      <div class="panel"><h2>Today's drill</h2>
        <div class="drill"><span class="ms">fitness_center</span><div><b>${esc(drill.title)}</b><p class="hint" style="color:var(--ink-2);margin-top:4px">${esc(drill.text)}</p>
        ${weakest ? `<p class="hint">Picked because ${esc(weakest.label.toLowerCase())} is your lowest rated area.</p>` : ''}
        <button class="btn quiet sm" onclick="practiceTopic(DRILLS['${weakest ? weakest.id : 'evidence'}'].topic)">Practise this now</button></div></div>
      </div>
    </div>
    ${growthPanelHtml()}
  </div>`;
};

// ======================================================================
// Growth areas panel
// ======================================================================
let openClusters = new Set(), showIgnored = false;
function growthClusters(areas) {
  const map = new Map();
  areas.forEach((a, i) => {
    if (a.ignored || a.status === 'resolved') return;
    const th = themeOf(a);
    const key = th ? th.id : 'other';
    if (!map.has(key)) map.set(key, { key, label: th ? th.label : 'Other patterns', items: [] });
    map.get(key).items.push(i);
  });
  const list = [...map.values()];
  list.forEach(c => { c.items.sort((i, j) => (areas[j].timesNoted || 1) - (areas[i].timesNoted || 1)); c.total = c.items.reduce((n, i) => n + (areas[i].timesNoted || 1), 0); });
  return list.sort((a, b) => b.total - a.total);
}
function growthPanelHtml() { return `<div id="growth-panel">${growthInner()}</div>`; }
function growthInner() {
  const areas = growthAreas || [];
  const cl = growthClusters(areas);
  const ignored = areas.map((a, i) => ({ a, i })).filter(x => x.a.ignored);
  const resolved = areas.filter(a => a.status === 'resolved' && !a.ignored);
  if (!cl.length && !ignored.length && !resolved.length) return '';
  return `<div class="panel"><h2>Recurring weak spots</h2>
    <p class="hint">Issues that keep coming up across interviews, grouped by pattern. Open a group to ignore or delete items.</p>
    ${cl.slice(0, 8).map(c => {
      const open = openClusters.has(c.key);
      return `<div class="gc"><button class="gc-head" aria-expanded="${open}" onclick="toggleCluster('${c.key}')"><span><span class="ms">${open ? 'expand_more' : 'chevron_right'}</span> ${esc(c.label)} <span class="hint">${c.items.length} issue${c.items.length > 1 ? 's' : ''}</span></span><span class="tag ${c.total >= 5 ? 'bad' : 'warn'}">noted ${c.total} times</span></button>
      ${open ? `<div class="gc-body">${c.items.map(i => `<div class="gc-item"><div>${esc(areas[i].area)}<div class="hint">noted ${areas[i].timesNoted || 1} times, last on ${esc(fmtDate(areas[i].lastNoted))}</div></div><div class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn ghost sm" onclick="growthSet(${i},'ignore')">Ignore</button><button class="btn ghost sm" onclick="growthSet(${i},'delete')">Delete</button></div></div>`).join('')}</div>` : ''}</div>`;
    }).join('')}
    ${resolved.length ? `<p class="hint" style="margin-top:12px"><span class="ms" style="color:var(--ok)">check_circle</span> Fixed recently: ${resolved.slice(-5).map(a => esc(a.area)).join('; ')}</p>` : ''}
    ${ignored.length ? `<button class="btn ghost sm" onclick="showIgnored=!showIgnored;rerenderGrowth()">${showIgnored ? 'Hide' : 'Show'} ignored (${ignored.length})</button>${showIgnored ? ignored.map(x => `<div class="gc-item"><span class="hint">${esc(x.a.area)}</span><div class="row" style="flex-wrap:nowrap;gap:4px"><button class="btn ghost sm" onclick="growthSet(${x.i},'restore')">Restore</button><button class="btn ghost sm" onclick="growthSet(${x.i},'delete')">Delete</button></div></div>`).join('') : ''}` : ''}
  </div>`;
}
function rerenderGrowth() { const el = $('growth-panel'); if (el) el.innerHTML = growthInner(); }
function toggleCluster(k) { if (openClusters.has(k)) openClusters.delete(k); else openClusters.add(k); rerenderGrowth(); }
async function growthSet(i, action) {
  let a = (growthAreas || []).slice();
  if (action === 'delete') { if (!confirm('Delete this weak spot from your list?')) return; a = a.filter((_, j) => j !== i); }
  else a[i] = { ...a[i], ignored: action === 'ignore' };
  await saveGrowth(a);
  rerenderGrowth();
}

// ======================================================================
// Speaking practice (record yourself on any topic)
// ======================================================================
let pr = { topic: '', sugg: [], result: null, phase: 'idle' };
function practiceTopic(t) { pr = { topic: t, sugg: pr.sugg || [], result: null, phase: 'idle' }; go('practice'); }

const PRACTICE_SCHEMA = {
  type: 'object',
  properties: {
    evidenceNotes: { type: 'array', items: { type: 'string' }, description: 'Write first: 3 to 6 short notes of what you observed.' },
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    dims: { type: 'object', properties: Object.fromEntries(['clarity', 'communication', 'evidence'].map(id => [id, { type: 'object', properties: { score: { type: 'integer', minimum: 0, maximum: 5 }, evidence: { type: 'string' } }, required: ['score', 'evidence'] }])), required: ['clarity', 'communication', 'evidence'] },
    summary: { type: 'string', description: 'Two or three honest sentences about the content.' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, theme: { type: 'string', enum: THEME_IDS } }, required: ['text', 'theme'] } },
    betterVersion: { type: 'string', description: 'A stronger version of their answer, first person, under 150 words, only their facts, [placeholders] for missing facts.' },
    deliveryNote: { type: 'string', description: 'One or two sentences based only on the measured numbers.' },
    nextTopics: { type: 'array', items: { type: 'string' }, description: '4 short, specific topics to practise next that target the weaknesses seen.' },
  },
  required: ['evidenceNotes', 'overallScore', 'dims', 'summary', 'strengths', 'improvements', 'betterVersion', 'deliveryNote', 'nextTopics'],
};

PAGES.practice = async function renderPractice() {
  const el = mainEl();
  if (pr.result) {
    const s = pr.result, idx = registerSession(s);
    el.innerHTML = `<div class="page"><div class="page-head row between"><div><h1>Speaking practice</h1><p>${esc(s.topic)}</p></div><button class="btn" onclick="pr={topic:'',sugg:pr.sugg,result:null,phase:'idle'};renderTab('practice')"><span class="ms">mic</span>New recording</button></div>
      ${renderPracticeSheet(s)}
      ${s.nextTopics && s.nextTopics.length ? `<div class="panel"><h3>Practise next</h3><div class="chips">${s.nextTopics.map((t, i) => `<button class="chip" onclick="practiceTopic(pr.result.nextTopics[${i}])">${esc(t)}</button>`).join('')}</div></div>` : ''}
      ${assessmentExtras(s, idx)}</div>`;
    return;
  }
  const recording = pr.phase === 'recording';
  el.innerHTML = `<div class="page">
    <div class="page-head"><h1>Speaking practice</h1><p>Speak on any question for one to two minutes. You get a content score, a stronger version of your answer, and your measured pace, fillers, hedging and pauses.</p></div>
    <div class="room">
      <label class="f" for="pr-topic" style="color:var(--room-mute);margin-top:0">Your question or topic</label>
      <input id="pr-topic" type="text" value="${esc(pr.topic)}" placeholder="For example: Why should we hire you over your batchmates?" style="background:var(--room-2);border-color:var(--room-3);color:#fff" ${recording ? 'disabled' : ''}>
      <div class="chips" style="margin-top:10px">${(pr.sugg || []).map((t, i) => `<button class="chip" style="background:var(--room-2);border-color:var(--room-3);color:var(--room-text)" onclick="pr.topic=pr.sugg[${i}];$('pr-topic').value=pr.topic">${esc(t)}</button>`).join('')}
        ${recording ? '' : `<button class="chip" style="background:transparent;border-color:var(--room-3);color:var(--room-mute)" id="pr-sugg" onclick="practiceSuggest()"><span class="ms" style="font-size:16px">lightbulb</span> Suggest topics for me</button>`}</div>
      <div class="controls">
        <button class="mic ${recording ? 'rec' : ''}" onclick="practiceToggle()" aria-label="${recording ? 'Stop and analyse' : 'Start recording'}" ${pr.phase === 'processing' ? 'disabled' : ''}><span class="ms">${recording ? 'stop' : 'mic'}</span></button>
        <div class="mic-label"><b>${recording ? 'Recording' : pr.phase === 'processing' ? 'Analysing' : 'Tap to start'}</b>${recording ? 'Tap to stop and get feedback' : pr.phase === 'processing' ? 'This takes a few seconds' : 'Speak as if the panel just asked you'}</div>
      </div>
      ${recording ? `<div class="live"><div class="lvl"><i id="lvl"></i></div><span class="timer" id="rec-timer">0:00</span><span id="live-text">${rec.mode === 'device' ? 'Recording. Your words will appear after you stop.' : 'Listening'}</span></div>` : ''}
    </div>
  </div>`;
};

async function practiceSuggest() {
  const b = $('pr-sugg'); if (b) { b.disabled = true; b.textContent = 'Thinking'; }
  try {
    const sessions = await loadSessions(8);
    const past = sessions.map(x => (x.kind === 'interview' ? x.personaLabel : x.topic) + ': ' + clip(x.summary, 140)).join('\n');
    const { profile } = dimProfile(sessions, 5);
    const weak = DIMS.filter(d => profile[d.id] != null).sort((a, b) => profile[a.id] - profile[b.id]).slice(0, 2).map(d => d.label).join(', ');
    const r = await ask('topics', {
      prompt: `Suggest 6 varied, specific questions an MBA placement candidate can practise answering aloud for 1 to 2 minutes. Mix types: behavioural, opinion, business awareness, estimation, motivation. ${weak ? 'Target these weak areas: ' + weak + '.' : ''} Avoid repeating past topics.\nPast sessions:\n${past || '(none yet)'}`,
      schema: { type: 'object', properties: { topics: { type: 'array', items: { type: 'string' } } }, required: ['topics'] },
    });
    pr.sugg = ((r.data && r.data.topics) || []).slice(0, 6);
  } catch (e) { toast(e.message, true); }
  pr.topic = $('pr-topic') ? $('pr-topic').value : pr.topic;
  renderTab('practice');
}

async function practiceToggle() {
  unlockAudio();
  if (pr.phase !== 'recording') {
    pr.topic = ($('pr-topic').value || '').trim() || 'Introduce yourself to a recruiter';
    try {
      await startCapture(
        t => { const e = $('live-text'); if (e) e.textContent = t; },
        (rms, sec) => { const l = $('lvl'); if (l) l.style.width = Math.min(100, rms * 900) + '%'; const tm = $('rec-timer'); if (tm) tm.textContent = fmtSec(sec); }
      );
      pr.phase = 'recording'; renderTab('practice');
    } catch (e) { toast(e.message, true); }
    return;
  }
  pr.phase = 'processing'; renderTab('practice');
  const m = await stopCapture(false);
  if (!m || !m.transcript) { pr.phase = 'idle'; renderTab('practice'); toast('No words were picked up. Check your microphone and try again.', true); return; }
  try {
    const r = await ask('audio_score', {
      system: 'You are a strict, honest communication coach for MBA placement candidates. Judge content only from the transcript (it came through speech-to-text, so ignore likely transcription errors). Never reward length or polish over substance. Ratings 1 to 5: 1 not shown, 2 below bar, 3 meets the campus bar, 4 strong, 5 exceptional. Use 0 if not assessable. Overall 0 to 100: below 40 weak, 60 to 74 competitive, 75 plus strong.',
      schema: PRACTICE_SCHEMA,
      prompt: `Question: ${pr.topic}\n\nTranscript:\n${clip(m.transcript, 6000)}\n\nMeasured delivery: pace ${m.wpm} wpm over ${m.speakSec} seconds of speech; fillers ${m.fillerRate} per 100 words; hedging ${m.hedgeRate} per 100 words; long pauses ${m.pausesPerMin} per minute; vocal variety ${m.pitchSt || 'n/a'} semitones; time to start ${m.startDelay} seconds.`,
    });
    const d = r.data || {};
    const dims = {};
    ['clarity', 'communication', 'evidence'].forEach(id => { const v = d.dims && d.dims[id]; dims[id] = { score: v && v.score >= 1 && v.score <= 5 ? v.score : null, evidence: clip(v && v.evidence, 300) }; });
    const delivery = aggregateMetrics([m]);
    const s = {
      kind: 'audio_analysis', v: 2, topic: pr.topic, createdAt: new Date().toISOString(), transcript: m.transcript,
      delivery, wpm: m.wpm, fillers: m.fillers, fillerRate: m.fillerRate, pauseCount: m.pauseCount, pauseSec: m.pauseSec, pVar: m.pVar, wordCount: m.wordCount, durationSec: m.durationSec,
      overallScore: Math.max(0, Math.min(100, Math.round(Number(d.overallScore) || 0))), practiceDims: dims, summary: clip(d.summary, 600),
      strengths: (d.strengths || []).slice(0, 3), improvements: (d.improvements || []).slice(0, 3).map(i => i.text), improvementThemes: (d.improvements || []).slice(0, 3),
      betterVersion: clip(d.betterVersion, 1400), deliveryNote: clip(d.deliveryNote, 400), nextTopics: (d.nextTopics || []).slice(0, 4),
    };
    const { data, error } = await supa.from('sessions').insert({ user_id: currentUser.id, kind: 'audio_analysis', data: s }).select('id').single();
    if (error) toast('Feedback is ready but could not be saved to History: ' + error.message, true); else s._rowId = data.id;
    pr.result = s;
  } catch (e) { toast(e.message, true); }
  pr.phase = 'idle';
  if (currentTab === 'practice') renderTab('practice');
}

function renderPracticeSheet(s) {
  const dims = s.practiceDims || {};
  const rows = ['clarity', 'communication', 'evidence'].map(id => {
    const v = dims[id] || {};
    return `<tr><td class="dl"><b>${esc(dimLabel(id))}</b>${v.score ? `<span>${esc(v.evidence)}</span>` : ''}</td>${v.score ? [1, 2, 3, 4, 5].map(n => `<td class="c">${v.score === n ? `<span class="circ">${n}</span>` : n}</td>`).join('') : '<td colspan="5" class="c"><span class="na">Not assessed</span></td>'}</tr>`;
  }).join('');
  return `<div class="sheet-paper">
    <div class="sheet-head"><div><h2>Speaking feedback</h2><div class="hint">${esc(fmtDate(s.createdAt))}</div></div></div>
    <div class="overall"><div><div class="num">${esc(s.overallScore)}</div><div class="of">out of 100</div></div><div class="sum"><p style="margin:0">${esc(s.summary || '')}</p></div></div>
    ${s.practiceDims ? `<table class="dimtable"><thead><tr><th>Area</th>${[1, 2, 3, 4, 5].map(n => `<th class="c">${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>` : ''}
    ${s.betterVersion ? `<div style="margin-top:16px"><b>A stronger version of your answer</b><div class="better"><div class="mod">${esc(s.betterVersion)}</div></div></div>` : ''}
  </div>`;
}

// ======================================================================
// History
// ======================================================================
let histFilter = 'all', histSessions = [], histOpen = new Set();
function sparkline(vals) {
  if (vals.length < 2) return '<p class="hint">Do at least two to see a trend.</p>';
  const w = 600, h = 70, max = 100, min = 0;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 6 - ((v - min) / (max - min)) * (h - 12)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:70px" role="img" aria-label="Score trend from ${vals[0]} to ${vals[vals.length - 1]}"><line x1="0" x2="${w}" y1="${h - 6 - 0.6 * (h - 12)}" y2="${h - 6 - 0.6 * (h - 12)}" stroke="#DDE2EB" stroke-dasharray="4 4"/><polyline points="${pts}" fill="none" stroke="#2347B5" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg><div class="row between hint"><span>${esc(vals[0])}</span><span>dashed line = 60, the competitive range</span><span>${esc(vals[vals.length - 1])}</span></div>`;
}
PAGES.history = async function renderHistory() {
  histSessions = await loadSessions(60);
  await loadGrowth();
  const el = mainEl();
  if (!histSessions.length) {
    el.innerHTML = `<div class="page"><div class="page-head"><h1>History</h1></div><div class="panel"><div class="empty"><b>Nothing here yet</b>Finish a mock interview or a speaking drill and it will appear here with its full assessment.</div><div class="row" style="margin-top:12px"><button class="btn" onclick="go('interview')">Start an interview</button></div></div></div>`;
    return;
  }
  const ints = histSessions.filter(s => s.kind === 'interview'), prs = histSessions.filter(s => s.kind !== 'interview');
  const avg = (arr, k) => arr.length ? Math.round(arr.reduce((a, x) => a + (Number(x[k]) || 0), 0) / arr.length) : null;
  const { profile, count } = dimProfile(histSessions, 10);
  const shown = histSessions.filter(s => histFilter === 'all' || (histFilter === 'interview' ? s.kind === 'interview' : s.kind !== 'interview'));
  el.innerHTML = `<div class="page">
    <div class="page-head"><h1>History</h1><p>Every session with its full assessment. Interviews and speaking drills are averaged separately because they measure different things.</p></div>
    <div class="grid2">
      <div class="panel"><h3>Interviews</h3><p style="margin:6px 0 2px"><b style="font-size:26px">${ints.length ? avg(ints, 'overallScore') : 'n/a'}</b> <span class="hint">average of ${ints.length}</span></p>${sparkline(ints.slice().reverse().map(x => x.overallScore || 0))}</div>
      <div class="panel"><h3>Speaking drills</h3><p style="margin:6px 0 2px"><b style="font-size:26px">${prs.length ? avg(prs, 'overallScore') : 'n/a'}</b> <span class="hint">average of ${prs.length}</span></p>${sparkline(prs.slice().reverse().map(x => x.overallScore || 0))}</div>
    </div>
    ${count ? `<div class="panel"><h2>Competency profile</h2><p class="hint">Average out of 5 across your last ${count} scored interviews.</p>${profileBarsHtml(profile)}</div>` : ''}
    ${growthPanelHtml()}
    <div class="panel"><div class="row between"><h2>Sessions</h2>
      <div class="seg" role="group" aria-label="Filter">${[['all', 'All'], ['interview', 'Interviews'], ['practice', 'Drills']].map(f => `<button aria-pressed="${histFilter === f[0]}" onclick="histFilter='${f[0]}';renderTab('history')">${f[1]}</button>`).join('')}</div></div>
      ${shown.map(s => { const i = histSessions.indexOf(s); return `<div id="hs-${i}">${histRowHtml(s, i)}</div>`; }).join('')}
    </div>
  </div>`;
  histOpen.forEach(i => { if (histSessions[i]) openHist(i, true); });
};
function histRowHtml(s, i) {
  const label = s.kind === 'interview' ? s.personaLabel : s.topic;
  const sub = s.kind === 'interview' ? [s.roundLabel, s.difficulty ? DIFFS[s.difficulty] : null, s.hireSignal].filter(Boolean).join(', ') : 'Speaking drill';
  const sc = Number(s.overallScore) || 0;
  return `<div class="list-row" style="cursor:pointer" onclick="openHist(${i})"><div class="t">${esc(label || 'Session')}<small>${esc(fmtDate(s.createdAt))}${sub ? ', ' + esc(sub) : ''}</small></div><span class="tag ${sc >= 75 ? 'ok' : sc >= 60 ? 'pen' : sc >= 40 ? 'warn' : 'bad'}">${esc(sc)}</span></div>`;
}
function openHist(i, keep) {
  const s = histSessions[i], box = $('hs-' + i);
  if (!s || !box) return;
  if (box.dataset.open === '1' && !keep) { box.dataset.open = '0'; histOpen.delete(i); box.innerHTML = histRowHtml(s, i); return; }
  const idx = registerSession(s);
  box.dataset.open = '1'; histOpen.add(i);
  box.innerHTML = histRowHtml(s, i) + `<div style="padding:12px 0 18px">${s.kind === 'interview' ? renderAssessment(s) : renderPracticeSheet(s)}${assessmentExtras(s, idx)}
    <button class="btn danger sm" onclick="deleteSession(${i})"><span class="ms">delete</span>Delete this session</button></div>`;
}
async function deleteSession(i) {
  const s = histSessions[i];
  if (!s || !s._rowId) return;
  if (!confirm('Delete this session for good? Your averages update. Weak spots already recorded from it stay until you remove them.')) return;
  const { data, error } = await supa.from('sessions').delete().eq('id', s._rowId).select('id');
  if (error) { toast('Could not delete: ' + error.message, true); return; }
  if (!data || !data.length) { toast('Delete was blocked. Re-run supabase-setup.sql to add the delete permission.', true); return; }
  histOpen = new Set();
  toast('Session deleted.');
  renderTab('history');
}

// ======================================================================
// Personas
// ======================================================================
let editingPersonaId = null;
PAGES.personas = async function renderPersonas() {
  await ensurePersonas(true);
  const ed = personas.find(p => p.id === editingPersonaId && p.mine) || null;
  const mine = personas.filter(p => p.mine), pub = personas.filter(p => !p.mine);
  mainEl().innerHTML = `<div class="page">
    <div class="page-head"><h1>Personas</h1><p>A persona is the job you are interviewing for: the company, the role and the job description. The interviewer, round and questions change every time you use it.</p></div>
    <div class="panel"><h2>${ed ? 'Edit persona' : 'New persona'}</h2>
      <div class="grid2" style="gap:0 16px">
        <div><label class="f" for="p-company">Company (optional)</label><input id="p-company" type="text" value="${esc(ed ? ed.company : '')}" placeholder="For example: Hindustan Unilever"></div>
        <div><label class="f" for="p-role">Role</label><input id="p-role" type="text" value="${esc(ed ? ed.role : '')}" placeholder="For example: Assistant Brand Manager"></div>
      </div>
      <label class="f" for="p-tough">Default difficulty</label>
      <select id="p-tough">${Object.entries(DIFFS).map(([k, v]) => `<option value="${k}" ${(ed ? ed.toughness : 'realistic') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="f" for="p-jd">Job description or round notes (optional)</label>
      <textarea id="p-jd" placeholder="Paste the JD or anything you know about the round">${esc(ed ? ed.jdText : '')}</textarea>
      <label class="f" for="p-brief">Company notes (optional)</label>
      <textarea id="p-brief" placeholder="Recent news, products, competitors. Use 'Research company' to fill this in automatically.">${esc(ed ? ed.brief : '')}</textarea>
      <label class="check"><input type="checkbox" id="p-public" ${ed && ed.isPublic ? 'checked' : ''}> Share with everyone using this app</label>
      <div class="row" style="margin-top:16px"><button class="btn" onclick="savePersona()">${ed ? 'Save changes' : 'Save persona'}</button>
        <button class="btn quiet" id="p-research" onclick="researchCompany()"><span class="ms">travel_explore</span>Research company</button>
        ${ed ? '<button class="btn ghost" onclick="editingPersonaId=null;renderTab(\'personas\')">Cancel</button>' : ''}</div>
      <p class="hint" style="margin-top:8px">Research company searches the web for recent news so the interviewer can ask about it. It costs about as much as two interview questions.</p>
    </div>
    <div class="panel"><h2>Your personas</h2>${mine.length ? mine.map(p => `<div class="list-row"><div class="t">${esc(p.label)}<small>${esc(DIFFS[p.toughness] || '')}${p.isPublic ? ', shared' : ''}${p.brief ? ', has company notes' : ''}</small></div>
      <div class="row" style="gap:4px"><button class="btn ghost sm" onclick="editingPersonaId='${p.id}';renderTab('personas')">Edit</button><button class="btn ghost sm" onclick="deletePersona('${p.id}')">Delete</button></div></div>`).join('') : '<div class="empty"><b>No personas yet</b>Create one above, or start with the general MBA persona on the Mock interview tab.</div>'}</div>
    <div class="panel"><h2>Shared by others</h2>${pub.length ? pub.map(p => `<div class="list-row"><div class="t">${esc(p.label)}<small>${esc(DIFFS[p.toughness] || '')}</small></div>
      ${myProfile.is_admin ? `<div class="row" style="gap:4px"><button class="btn ghost sm" onclick="moderatePersona('${p.id}','unpublish')">Unpublish</button><button class="btn ghost sm" onclick="moderatePersona('${p.id}','delete')">Delete</button></div>` : ''}</div>`).join('') : '<p class="hint">Nobody has shared a persona yet.</p>'}</div>
  </div>`;
};
async function savePersona() {
  const company = $('p-company').value.trim(), role = $('p-role').value.trim();
  if (!role) { toast('Add a role first.', true); return; }
  const row = {
    company, role, jd_text: $('p-jd').value.trim().slice(0, 8000), label: role + (company ? ' at ' + company : ''),
    toughness: $('p-tough').value, is_public: $('p-public').checked, company_brief: $('p-brief').value.trim().slice(0, 4000) || null,
  };
  const q = editingPersonaId ? supa.from('personas').update(row).eq('id', editingPersonaId) : supa.from('personas').insert({ ...row, user_id: currentUser.id });
  const { error } = await q;
  if (error) { toast('Could not save: ' + error.message, true); return; }
  editingPersonaId = null;
  toast('Persona saved.');
  renderTab('personas');
}
async function deletePersona(id) {
  if (!confirm('Delete this persona? Past interviews that used it stay in your History.')) return;
  const { error } = await supa.from('personas').delete().eq('id', id);
  if (error) { toast('Could not delete: ' + error.message, true); return; }
  renderTab('personas');
}
async function moderatePersona(id, action) {
  if (!confirm(action === 'delete' ? 'Delete this shared persona for everyone?' : 'Make this persona private to its owner?')) return;
  try { await adminApi('POST', '', { action: 'persona', personaId: id, op: action }); }
  catch (e) { toast('That did not work: ' + e.message, true); return; }
  toast(action === 'delete' ? 'Persona deleted.' : 'Persona unpublished.');
  renderTab(currentTab);
}
async function researchCompany() {
  const company = $('p-company').value.trim(), role = $('p-role').value.trim();
  if (!company) { toast('Type the company name first.', true); return; }
  const b = $('p-research'); b.disabled = true; b.textContent = 'Researching';
  try {
    const r = await ask('company', {
      search: true,
      prompt: `Research ${company} for an MBA student about to interview for ${role || 'a management role'}. Use web search. Write compact interviewer notes under 200 words: what the company does and its main brands or products; its position in India (and the Gulf, if relevant); two or three developments from the last 12 months, each with the month and year; main competitors; two challenges this role would care about. Short plain lines, no markdown headings. If you cannot find reliable information, say so plainly.`,
    });
    $('p-brief').value = r.text.replace(/\*\*/g, '').trim();
    toast('Company notes added. Review them, then save the persona.');
  } catch (e) { toast(e.message, true); }
  b.disabled = false; b.innerHTML = '<span class="ms">travel_explore</span>Research company';
}

// ======================================================================
// About me
// ======================================================================
PAGES.about = async function renderAbout() {
  await ensureAbout(true);
  const el = mainEl();
  if (aboutErr) { el.innerHTML = `<div class="page"><div class="page-head"><h1>About me</h1></div><div class="panel"><p class="err-inline">This page needs its database table. Re-run supabase-setup.sql in Supabase. Details: ${esc(aboutErr)}</p></div></div>`; return; }
  const a = aboutMe || {};
  const f = (id, label, ph, tall) => `<label class="f" for="ab-${id}">${label} <span class="hint" id="cnt-${id}"></span></label><textarea id="ab-${id}" maxlength="${ABOUT_LIMITS[id]}" placeholder="${esc(ph)}" oninput="aboutCount('${id}')" style="min-height:${tall ? 170 : 90}px">${esc(a[id] || '')}</textarea>`;
  el.innerHTML = `<div class="page">
    <div class="page-head"><h1>About me</h1><p>Interviewers use this to ask about your real experience instead of generic questions. Only you can see it.</p></div>
    <div class="panel">
      ${f('cv_text', 'CV and background', 'Education, internships, projects, positions of responsibility, achievements with numbers', true)}
      ${f('strengths', 'What you are good at', 'Be specific, the interviewer will test these')}
      ${f('weaknesses', 'What you struggle with', 'Be honest, real interviews probe this')}
      ${f('other', 'Anything else', 'Target roles, companies, topics you want to be pushed on')}
      <div class="row" style="margin-top:16px"><button class="btn" onclick="saveAbout()">Save</button><button class="btn quiet" onclick="condenseAbout()">Make a short version for interviews</button></div>
      <p id="ab-msg" class="hint" style="margin-top:8px"></p>
      <p class="hint">Paste text rather than a PDF: open your CV, select all, copy and paste. The short version is created once and makes every interview cheaper.</p>
      ${a.brief ? `<div class="callout"><b>Short version used in interviews</b><p style="margin:6px 0 0;white-space:pre-wrap">${esc(a.brief)}</p></div>` : ''}
    </div></div>`;
  Object.keys(ABOUT_LIMITS).forEach(aboutCount);
};
function aboutCount(id) { const t = $('ab-' + id), c = $('cnt-' + id); if (t && c) c.textContent = t.value.length + ' of ' + ABOUT_LIMITS[id]; }
async function saveAbout(quiet) {
  const row = { user_id: currentUser.id, updated_at: new Date().toISOString(), brief: null };
  Object.keys(ABOUT_LIMITS).forEach(k => { row[k] = $('ab-' + k).value.trim().slice(0, ABOUT_LIMITS[k]); });
  const { error } = await supa.from('about_me').upsert(row, { onConflict: 'user_id' });
  if (error) { $('ab-msg').textContent = 'Could not save: ' + error.message; return false; }
  aboutMe = row;
  if (!quiet) { $('ab-msg').textContent = 'Saved.'; toast('Saved.'); }
  return true;
}
async function condenseAbout() {
  if (!(await saveAbout(true))) return;
  if (!aboutHasContent(aboutMe)) { toast('Write something first.', true); return; }
  $('ab-msg').textContent = 'Making the short version';
  try {
    const raw = ['CV and background: ' + aboutMe.cv_text, 'Strengths: ' + aboutMe.strengths, 'Weaknesses: ' + aboutMe.weaknesses, 'Other: ' + aboutMe.other].join('\n');
    const r = await ask('condense', { prompt: 'Condense this candidate profile into at most 150 words for an interviewer. Keep concrete facts (education, employers, roles, projects, numbers, certifications), strengths, weaknesses and goals. Third person, no opinions, no filler. Output only the text.\n\n' + raw });
    const brief = clip(r.text, 1200);
    const { error } = await supa.from('about_me').update({ brief }).eq('user_id', currentUser.id);
    if (error) throw new Error(error.message);
    aboutMe.brief = brief;
    renderTab('about');
  } catch (e) { $('ab-msg').textContent = 'Could not make the short version: ' + e.message; }
}

// ======================================================================
// Reads (admin uploads, everyone reads)
// ======================================================================
const READ_KINDS = { report: 'Report summaries', newspaper: 'Newspaper', two_min_read: '2 minute reads', link: 'Useful links' };
const readsCache = { report: [], newspaper: [], two_min_read: [], link: [] };
let likesById = {};
function readUrl(path) { return path ? supa.storage.from('reads').getPublicUrl(path).data.publicUrl : ''; }
PAGES.reads = async function renderReads() {
  const { data, error } = await supa.from('reads').select('id,kind,title,storage_path,thumb_path,body_text,created_at').in('kind', Object.keys(READ_KINDS)).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('Could not load reads: ' + error.message);
  Object.keys(readsCache).forEach(k => { readsCache[k] = (data || []).filter(r => r.kind === k).slice(0, 40); });
  const ids = (data || []).map(r => r.id);
  likesById = {};
  if (ids.length) {
    const { data: likes } = await supa.from('read_likes').select('read_id,user_id').in('read_id', ids);
    (likes || []).forEach(l => { const x = likesById[l.read_id] || (likesById[l.read_id] = { n: 0, mine: false }); x.n++; if (l.user_id === currentUser.id) x.mine = true; });
  }
  const admin = myProfile.is_admin;
  const missingThumbs = [...readsCache.report, ...readsCache.newspaper].filter(r => r.storage_path && !r.thumb_path).length;
  mainEl().innerHTML = `<div class="page">
    <div class="page-head"><h1>Reads</h1><p>Short material for interview prep. Tap a cover to open the full PDF.</p></div>
    ${admin && missingThumbs ? `<div class="callout"><b>${missingThumbs} PDF${missingThumbs > 1 ? 's have' : ' has'} no cover image yet.</b> <button class="btn quiet sm" style="margin-left:8px" id="mk-thumbs" onclick="makeMissingThumbs()">Make covers</button></div>` : ''}
    ${['report', 'newspaper'].map(k => pdfSectionHtml(k, admin)).join('')}
    ${twoMinHtml(admin)}
    ${linksHtml(admin)}
  </div>`;
};
function likeBtn(id) { const l = likesById[id] || { n: 0, mine: false }; return `<button class="btn ghost sm" id="like-${id}" aria-pressed="${l.mine}" onclick="toggleLike('${id}')"><span class="ms ${l.mine ? 'fill' : ''}" style="color:${l.mine ? 'var(--stamp)' : 'inherit'}">favorite</span>${l.n}</button>`; }
function pdfSectionHtml(kind, admin) {
  const items = readsCache[kind];
  return `<div class="panel"><h2>${READ_KINDS[kind]}</h2>
    ${admin ? `<div class="row" style="margin-bottom:14px"><input type="text" id="t-${kind}" placeholder="Title" style="flex:2;min-width:160px"><input type="file" id="f-${kind}" accept="application/pdf" style="flex:2;min-width:180px"><button class="btn" id="u-${kind}" onclick="uploadRead('${kind}')">Upload PDF</button></div>` : ''}
    ${items.length ? `<div class="reads-grid">${items.map((r, i) => `<div class="read">
      <button class="thumb" onclick="window.open('${esc(readUrl(r.storage_path))}','_blank','noopener')" aria-label="Open ${esc(r.title)}">${r.thumb_path ? `<img src="${esc(readUrl(r.thumb_path))}" alt="" loading="lazy">` : '<span class="ms">picture_as_pdf</span>'}</button>
      <div class="meta"><b>${esc(r.title)}</b><span class="hint">${esc(fmtDate(r.created_at))}</span>
      <div class="row" style="gap:2px;margin-top:4px">${kind === 'report' ? likeBtn(r.id) : ''}${admin ? `<button class="btn ghost sm" onclick="editReadTitle('${kind}',${i})">Edit</button><button class="btn ghost sm" onclick="deleteRead('${kind}',${i})">Delete</button>` : ''}</div></div></div>`).join('')}</div>`
      : `<p class="hint">Nothing here yet${admin ? '. Upload one above.' : '. Check back later.'}</p>`}</div>`;
}
function twoMinHtml(admin) {
  const items = readsCache.two_min_read;
  return `<div class="panel"><h2>${READ_KINDS.two_min_read}</h2>
    ${admin ? `<div style="margin-bottom:14px"><input type="text" id="t-two" placeholder="Topic"><textarea id="b-two" placeholder="The text" style="margin-top:8px"></textarea><button class="btn" style="margin-top:8px" onclick="addTwoMin()">Add</button></div>` : ''}
    ${items.length ? `<div class="stack">${items.map((r, i) => `<details class="flash"><summary style="cursor:pointer;font-weight:650">${esc(r.title)}</summary><div class="body">${esc(r.body_text || '')}</div>
      <div class="row" style="gap:2px;margin-top:8px">${likeBtn(r.id)}${admin ? `<button class="btn ghost sm" onclick="editTwoMin(${i})">Edit</button><button class="btn ghost sm" onclick="deleteRead('two_min_read',${i})">Delete</button>` : ''}</div></details>`).join('')}</div>` : '<p class="hint">Nothing here yet.</p>'}</div>`;
}
function parseLink(r) { const p = String(r.body_text || '').split('\n'); return { url: p[0].trim(), note: p.slice(1).join('\n').trim() }; }
function cleanUrl(u) { u = String(u || '').trim(); if (!u) return null; if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; try { const x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null; } catch (e) { return null; } }
function linksHtml(admin) {
  const items = readsCache.link;
  return `<div class="panel"><h2>${READ_KINDS.link}</h2>
    ${admin ? `<div style="margin-bottom:14px"><input type="text" id="l-title" placeholder="Short title"><input type="url" id="l-url" placeholder="https://" style="margin-top:8px"><input type="text" id="l-note" placeholder="Optional note" style="margin-top:8px"><button class="btn" style="margin-top:8px" onclick="addLink()">Add link</button></div>` : ''}
    ${items.length ? items.map((r, i) => { const l = parseLink(r), safe = cleanUrl(l.url); let host = ''; try { host = new URL(safe).hostname.replace(/^www\./, ''); } catch (e) {}
      return `<div class="list-row"><div class="t">${safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>` : esc(r.title)}<small>${esc(host)}${l.note ? ', ' + esc(l.note) : ''}</small></div>${admin ? `<div class="row" style="gap:2px"><button class="btn ghost sm" onclick="editLink(${i})">Edit</button><button class="btn ghost sm" onclick="deleteRead('link',${i})">Delete</button></div>` : ''}</div>`; }).join('') : '<p class="hint">No links yet.</p>'}</div>`;
}

let pdfjsReady = null;
function loadPdfJs() {
  if (pdfjsReady) return pdfjsReady;
  pdfjsReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; rej(new Error('Could not load the PDF tool.')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}
async function pdfCover(source) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument(source instanceof Blob ? { data: new Uint8Array(await source.arrayBuffer()) } : { url: source }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 360 / base.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
}
async function uploadCover(blob) {
  const path = 'thumbs/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const { error } = await supa.storage.from('reads').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}
async function uploadRead(kind) {
  const file = $('f-' + kind).files[0];
  if (!file) { toast('Choose a PDF first.', true); return; }
  const btn = $('u-' + kind); btn.disabled = true; btn.textContent = 'Uploading';
  try {
    const title = $('t-' + kind).value.trim() || file.name.replace(/\.pdf$/i, '');
    const path = kind + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { error: upErr } = await supa.storage.from('reads').upload(path, file, { contentType: 'application/pdf' });
    if (upErr) throw new Error(upErr.message);
    let thumb = null;
    try { thumb = await uploadCover(await pdfCover(file)); } catch (e) { toast('Uploaded, but the cover image failed: ' + e.message, true); }
    const { error } = await supa.from('reads').insert({ kind, title, storage_path: path, thumb_path: thumb, uploaded_by: currentUser.id });
    if (error) throw new Error(error.message);
    toast('Uploaded.');
    renderTab('reads');
  } catch (e) { toast('Upload failed: ' + e.message, true); btn.disabled = false; btn.textContent = 'Upload PDF'; }
}
async function makeMissingThumbs() {
  const b = $('mk-thumbs'); if (b) { b.disabled = true; b.textContent = 'Working'; }
  const list = [...readsCache.report, ...readsCache.newspaper].filter(r => r.storage_path && !r.thumb_path);
  let done = 0;
  for (const r of list) {
    try {
      const path = await uploadCover(await pdfCover(readUrl(r.storage_path)));
      const { error } = await supa.from('reads').update({ thumb_path: path }).eq('id', r.id);
      if (!error) done++;
    } catch (e) { /* skip this one */ }
  }
  toast('Made ' + done + ' of ' + list.length + ' covers.');
  renderTab('reads');
}
async function toggleLike(id) {
  const l = likesById[id] || (likesById[id] = { n: 0, mine: false });
  const q = l.mine ? supa.from('read_likes').delete().eq('read_id', id).eq('user_id', currentUser.id) : supa.from('read_likes').insert({ read_id: id, user_id: currentUser.id });
  const { error } = await q;
  if (error) { toast('Could not update: ' + error.message, true); return; }
  l.mine = !l.mine; l.n += l.mine ? 1 : -1;
  const b = $('like-' + id); if (b) b.outerHTML = likeBtn(id);
}
async function editReadTitle(kind, i) {
  const r = readsCache[kind][i]; if (!r) return;
  const v = await formDialog({ title: 'Edit title', fields: [{ id: 'title', label: 'Title', value: r.title }] });
  if (!v || !v.title.trim()) return;
  const { error } = await supa.from('reads').update({ title: v.title.trim() }).eq('id', r.id);
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}
async function deleteRead(kind, i) {
  const r = readsCache[kind][i]; if (!r) return;
  if (!confirm('Delete "' + r.title + '" for everyone?')) return;
  const paths = [r.storage_path, r.thumb_path].filter(Boolean);
  if (paths.length) await supa.storage.from('reads').remove(paths);
  const { error } = await supa.from('reads').delete().eq('id', r.id);
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}
async function addTwoMin() {
  const title = $('t-two').value.trim(), body = $('b-two').value.trim();
  if (!title || !body) { toast('Add a topic and the text.', true); return; }
  const { error } = await supa.from('reads').insert({ kind: 'two_min_read', title, body_text: body, uploaded_by: currentUser.id });
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}
async function editTwoMin(i) {
  const r = readsCache.two_min_read[i]; if (!r) return;
  const v = await formDialog({ title: 'Edit 2 minute read', fields: [{ id: 'title', label: 'Topic', value: r.title }, { id: 'body', label: 'Text', type: 'textarea', value: r.body_text || '' }] });
  if (!v) return;
  const { error } = await supa.from('reads').update({ title: v.title.trim(), body_text: v.body }).eq('id', r.id);
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}
async function addLink() {
  const title = $('l-title').value.trim(), url = cleanUrl($('l-url').value), note = $('l-note').value.trim();
  if (!title) { toast('Add a short title.', true); return; }
  if (!url) { toast('Enter a valid link starting with http or https.', true); return; }
  const { error } = await supa.from('reads').insert({ kind: 'link', title, body_text: url + (note ? '\n' + note : ''), uploaded_by: currentUser.id });
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}
async function editLink(i) {
  const r = readsCache.link[i]; if (!r) return;
  const l = parseLink(r);
  const v = await formDialog({ title: 'Edit link', fields: [{ id: 'title', label: 'Title', value: r.title }, { id: 'url', label: 'Link', type: 'url', value: l.url }, { id: 'note', label: 'Note (optional)', value: l.note }] });
  if (!v) return;
  const url = cleanUrl(v.url);
  if (!url || !v.title.trim()) { toast('Give it a title and a valid link.', true); return; }
  const { error } = await supa.from('reads').update({ title: v.title.trim(), body_text: url + (v.note.trim() ? '\n' + v.note.trim() : '') }).eq('id', r.id);
  if (error) { toast(error.message, true); return; }
  renderTab('reads');
}

// ======================================================================
// Coach chat (answers from your own session data; limit enforced by the server)
// ======================================================================
let coach = { sessions: null, msgs: [], busy: false, rowId: null, threads: [] };
const COACH_CHIPS = ['Which competency is holding back my hire signal?', 'What keeps repeating, and what drill fixes it?', 'What has improved over my last five interviews?', 'Where do I sound least confident?', 'What do my fact errors have in common?'];
async function coachLoadThreads() {
  const { data } = await supa.from('sessions').select('id,data,created_at').eq('user_id', currentUser.id).eq('kind', 'coach_chat').order('created_at', { ascending: false }).limit(60);
  coach.threads = (data || []).map(r => ({ id: r.id, title: (r.data && r.data.title) || 'Chat', msgs: (r.data && r.data.msgs) || [], ts: (r.data && r.data.updatedAt) || r.created_at }));
}
function avgOf(arr, f) { const v = arr.map(f).filter(n => typeof n === 'number' && isFinite(n)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function trendLine(label, arr, f, digits) {
  const a = avgOf(arr.slice(0, 5), f); if (a === null) return null;
  const b = avgOf(arr.slice(5, 10), f);
  return label + ': last 5 ' + a.toFixed(digits) + (b !== null ? ', previous 5 ' + b.toFixed(digits) + ' (' + (a >= b ? '+' : '') + (a - b).toFixed(digits) + ')' : '');
}
function coachDigest() {
  const s = coach.sessions || [];
  if (!s.length) return 'No sessions recorded yet.';
  const ints = s.filter(x => x.kind === 'interview');
  const dly = x => x.delivery || {};
  const trends = [
    trendLine('Interview overall score', ints, x => x.overallScore, 0),
    ...DIMS.map(d => trendLine(d.label + ' (1-5)', ints.filter(x => x.dims), x => x.dims[d.id] && x.dims[d.id].score ? x.dims[d.id].score : null, 1)),
    trendLine('Pace wpm', s, x => dly(x).wpm || x.wpm, 0),
    trendLine('Fillers per 100 words', s, x => dly(x).fillerRate, 1),
    trendLine('Hedging per 100 words', s, x => dly(x).hedgeRate, 1),
    trendLine('Long pauses per minute', s, x => dly(x).pausesPerMin, 1),
    trendLine('Vocal variety semitones', s, x => dly(x).pitchSt || null, 1),
  ].filter(Boolean);
  const areas = growthAreas || [];
  const themes = growthClusters(areas).slice(0, 8).map(c => '- ' + c.label + ' (' + c.total + 'x): ' + c.items.slice(0, 2).map(i => clip(areas[i].area, 70)).join('; '));
  const lines = s.slice(0, 25).map((x, i) => {
    const head = 'S' + (i + 1) + ' ' + fmtDate(x.createdAt) + ' ' + (x.kind === 'interview' ? 'interview, ' + clip(x.roundLabel || '', 30) + ', ' + clip(x.personaLabel, 40) + (x.difficulty ? ', ' + DIFFS[x.difficulty] : '') : 'drill: ' + clip(x.topic, 50));
    const dims = x.dims ? ' | ' + DIMS.filter(d => x.dims[d.id] && x.dims[d.id].score).map(d => d.id + ' ' + x.dims[d.id].score).join(', ') : '';
    return head + ' | overall ' + (x.overallScore == null ? '-' : x.overallScore) + (x.hireSignal ? ' (' + x.hireSignal + ')' : '') + dims + ' | ' + clip(x.summary, 180) + ' | improve: ' + (x.improvements || []).slice(0, 3).map(t => clip(t, 70)).join('; ') + ((x.factCheck && x.factCheck.length) ? ' | fact errors: ' + x.factCheck.slice(0, 2).map(t => clip(t, 90)).join('; ') : '');
  });
  return 'TRENDS (newest five sessions against the five before)\n' + trends.join('\n') + '\n\nRECURRING WEAK SPOTS\n' + (themes.join('\n') || 'none') + '\n\nSESSIONS (S1 is newest)\n' + lines.join('\n');
}
function coachSnippets(q) {
  const qs = stemSet(q), wantsConf = /confiden|hedg|assertiv|decisive|hesita|unsure/i.test(q);
  const chunks = [];
  (coach.sessions || []).slice(0, 25).forEach((x, si) => {
    if (!x.transcript) return;
    const pairs = [];
    if (x.kind === 'interview') {
      const parts = x.transcript.split('\n\n');
      parts.forEach((p, i) => { if (p.startsWith('You: ')) { const prev = parts[i - 1] || ''; pairs.push({ q: prev.startsWith('Interviewer: ') ? prev.slice(13) : '', a: p.slice(5) }); } });
    } else pairs.push({ q: x.topic || '', a: x.transcript });
    pairs.forEach(pr => {
      const cs = stemSet(pr.q + ' ' + pr.a); let score = 0;
      qs.forEach(t => { if (cs.has(t)) score++; });
      if (wantsConf) score += Math.min(4, countHedges(pr.a));
      if (score >= 2) chunks.push({ score, tag: 'S' + (si + 1), q: pr.q, a: pr.a });
    });
  });
  chunks.sort((a, b) => b.score - a.score);
  return chunks.slice(0, 4).map(c => '[' + c.tag + '] Q: ' + clip(c.q, 200) + '\nA: ' + clip(c.a, 700)).join('\n\n');
}
PAGES.coach = () => renderCoach(false);
async function renderCoach(keep) {
  if (!keep || !coach.sessions) {
    const [sessions] = await Promise.all([loadSessions(40), coachLoadThreads(), loadGrowth()]);
    coach.sessions = sessions;
  }
  const left = coachLeft();
  mainEl().innerHTML = `<div class="page">
    <div class="page-head"><h1>Coach</h1><p>Ask about your own sessions. The coach reads your scores, delivery numbers and recurring weak spots, and pulls in your actual answers when a question needs them.</p></div>
    <div class="panel">
      <div class="row between"><span class="tag pen">${left === Infinity ? 'Unlimited questions' : left + ' of ' + coachLimit() + ' questions left'}</span><button class="btn quiet sm" onclick="coachNew()"><span class="ms">add</span>New chat</button></div>
      <div class="coach" style="margin-top:14px">
        <div class="threads"><b style="font-size:13px">Your chats</b><div style="margin-top:8px">${coach.threads.length ? coach.threads.map((t, i) => `<button class="thread" aria-current="${t.id === coach.rowId}" onclick="coachOpen(${i})">${esc(t.title)}<small>${esc(fmtDate(t.ts))}</small></button>`).join('') : '<p class="hint">Saved chats appear here.</p>'}</div></div>
        <div>
          <div class="chips">${COACH_CHIPS.map((c, i) => `<button class="chip" onclick="coachAsk(${i})">${esc(c)}</button>`).join('')}</div>
          <div class="chat" id="coach-msgs"></div>
          <div class="row" style="flex-wrap:nowrap"><textarea id="coach-in" rows="2" placeholder="Ask about a weak area, a session, or what to practise" style="min-height:48px;flex:1"></textarea><button class="btn" id="coach-send" onclick="coachSubmit()">Send</button></div>
        </div>
      </div>
    </div></div>`;
  $('coach-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); coachSubmit(); } });
  coachPaint();
};
function coachPaint() {
  const box = $('coach-msgs'); if (!box) return;
  box.innerHTML = (coach.msgs.length || coach.busy ? '' : '<div class="hint" style="margin:auto;text-align:center;padding:20px">Ask a question, or tap a suggestion above.</div>') +
    coach.msgs.map(m => m.role === 'user' ? `<div class="bub u">${esc(m.content)}</div>` : `<div class="bub ${m.err ? 'e' : 'a'}">${m.err ? esc(m.content) : md(m.content)}</div>`).join('') +
    (coach.busy ? '<div class="bub a"><span class="dots"><span></span><span></span><span></span></span></div>' : '');
  box.scrollTop = box.scrollHeight;
  const b = $('coach-send'); if (b) b.disabled = coach.busy || coachLeft() <= 0;
}
function coachOpen(i) { const t = coach.threads[i]; if (!t || coach.busy) return; coach.rowId = t.id; coach.msgs = t.msgs.map(m => ({ ...m })); renderCoach(true); }
function coachNew() { if (coach.busy) return; coach.rowId = null; coach.msgs = []; renderCoach(true); }
function coachSubmit() { const i = $('coach-in'); const t = (i.value || '').trim(); if (!t || coach.busy) return; i.value = ''; coachSend(t); }
function coachAsk(n) { if (!coach.busy) coachSend(COACH_CHIPS[n]); }
async function coachSend(text) {
  if (coachLeft() <= 0) { toast('You have used all your coach questions. Ask the admin for more.', true); return; }
  coach.msgs.push({ role: 'user', content: text });
  coach.busy = true; coachPaint();
  try {
    const system = 'You are a direct, practical communication coach for an MBA placement candidate. Use ONLY the data below and cite sessions as S1, S2 (S1 is newest). Give blunt, specific advice and one concrete drill when useful. Keep answers under 180 words unless asked for more. Notes on the data: competency ratings are 1 to 5 from an AI evaluator reading the transcript; pace, fillers, hedging, pauses and vocal variety are measured from the microphone; filler counts are approximate because speech-to-text drops some "um"s. If the data cannot support an answer, say what is missing instead of guessing.\n\nDATA\n' + coachDigest() + (aboutForPrompt() ? '\n\nABOUT THE CANDIDATE (self-written)\n' + clip(aboutForPrompt(), 1500) : '');
    const hist = coach.msgs.slice(0, -1).filter(m => !m.err).slice(-6);
    while (hist.length && hist[0].role !== 'user') hist.shift();
    const sn = coachSnippets(text);
    const messages = [...hist.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: (sn ? 'Relevant answer excerpts:\n' + sn + '\n\n' : '') + 'Question: ' + text }];
    const r = await ask('coach', { system, messages });
    coach.msgs.push({ role: 'assistant', content: r.text });
    if (!myProfile.is_admin) myProfile.coach_used = Number(myProfile.coach_used || 0) + 1;
    await coachSave();
  } catch (e) {
    coach.msgs.push({ role: 'assistant', content: e.message, err: true });
  }
  coach.busy = false;
  if (currentTab === 'coach') renderCoach(true);
}
async function coachSave() {
  const msgs = coach.msgs.filter(m => !m.err).map(m => ({ role: m.role, content: m.content }));
  const first = msgs.find(m => m.role === 'user');
  const data = { kind: 'coach_chat', title: clip(first ? first.content : 'Chat', 45), msgs, updatedAt: new Date().toISOString() };
  if (coach.rowId) await supa.from('sessions').update({ data }).eq('id', coach.rowId);
  else { const { data: row } = await supa.from('sessions').insert({ user_id: currentUser.id, kind: 'coach_chat', data }).select('id').single(); if (row) coach.rowId = row.id; }
  await coachLoadThreads();
}

// ======================================================================
// Admin
// ======================================================================
let adminData = null;
async function adminApi(method, q, body) {
  const token = await authToken();
  const r = await fetch('/api/admin' + (q || ''), { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await r.json(); } catch (e) { throw new Error('Admin request failed (' + r.status + ').'); }
  if (!r.ok) throw new Error(data.error || ('Admin request failed (' + r.status + ').'));
  return data;
}
PAGES.admin = async function renderAdmin() {
  if (!myProfile.is_admin) { mainEl().innerHTML = '<div class="page"><div class="panel">Admins only.</div></div>'; return; }
  adminData = await adminApi('GET');
  await ensurePersonas(true);
  const st = adminData.settings || {};
  const emailOf = id => { const u = adminData.users.find(x => x.id === id); return u ? u.email : 'unknown'; };
  const pub = personas.filter(p => p.isPublic);
  mainEl().innerHTML = `<div class="page">
    <div class="page-head"><h1>Admin</h1><p>Users, credit, settings and moderation. Every credit change is recorded.</p></div>
    <div class="grid2">
      <div class="panel"><h2>Last 30 days</h2>
        <p style="margin:4px 0"><b style="font-size:24px">$${Number(adminData.spend30dUsd || 0).toFixed(2)}</b> <span class="hint">actual AI cost</span></p>
        <p style="margin:4px 0"><b style="font-size:24px">${esc(inr(adminData.charged30dInr || 0))}</b> <span class="hint">charged to users</span></p>
        <p class="hint">Admin usage is recorded but not charged.</p></div>
      <div class="panel"><h2>Settings</h2>
        <label class="f" for="ad-bonus">Free credit for new accounts (₹)</label><input id="ad-bonus" type="number" min="0" value="${esc(st.signup_bonus_inr)}">
        <label class="f" for="ad-coach">Coach questions per user</label><input id="ad-coach" type="number" min="0" value="${esc(st.coach_default_limit)}">
        <label class="f" for="ad-dom">Only give free credit to these email domains (optional)</label><input id="ad-dom" type="text" value="${esc((st.allowed_email_domains || []).join(', '))}" placeholder="For example: imtdubai.ac.ae, gmail.com">
        <p class="hint" style="margin-top:6px">Leave empty to give free credit to everyone. Others can still sign up, but start at ₹0.</p>
        <button class="btn" style="margin-top:12px" onclick="adminSaveSettings()">Save settings</button></div>
    </div>
    <div class="panel"><h2>Users (${adminData.users.length})</h2><div class="scroll-x"><table class="admin"><thead><tr><th>Email</th><th>Balance</th><th>Coach</th><th>AI cost, 30 days</th><th></th></tr></thead><tbody>
      ${adminData.users.map((u, i) => `<tr><td>${esc(u.email)}${u.is_admin ? ' <span class="tag pen">admin</span>' : ''}<div class="hint">joined ${esc(fmtDate(u.created_at))}</div></td>
        <td>${u.is_admin ? 'Unlimited' : esc(inr(u.credits_inr))}</td>
        <td>${esc(u.coach_used || 0)} of ${esc(Number(st.coach_default_limit || 0) + Number(u.coach_bonus || 0))}<div class="row" style="gap:2px;margin-top:2px"><button class="btn ghost sm" aria-label="One fewer coach question" onclick="adminCoach(${i},-1)">-1</button><button class="btn ghost sm" aria-label="One more coach question" onclick="adminCoach(${i},1)">+1</button></div></td>
        <td>$${Number(u.spend30dUsd || 0).toFixed(3)}</td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn quiet sm" onclick="adminCredit(${i},1)">Add credit</button><button class="btn ghost sm" onclick="adminCredit(${i},-1)">Remove</button><button class="btn ghost sm" onclick="adminActivity(${i})">Activity</button></div></td></tr>
        <tr><td colspan="5" style="padding:0;border:0"><div id="act-${i}" hidden style="padding:8px 0 14px"></div></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><h2>Shared personas</h2>${pub.length ? pub.map(p => `<div class="list-row"><div class="t">${esc(p.label)}<small>by ${esc(emailOf(p.ownerId))}</small></div><div class="row" style="gap:4px"><button class="btn ghost sm" onclick="moderatePersona('${p.id}','unpublish')">Unpublish</button><button class="btn ghost sm" onclick="moderatePersona('${p.id}','delete')">Delete</button></div></div>`).join('') : '<p class="hint">No shared personas.</p>'}</div>
    <div class="panel"><div class="row between"><h2>Credit history</h2><button class="btn quiet sm" onclick="adminLedger()">Load recent entries</button></div><div id="ledger"></div></div>
  </div>`;
};
async function adminSaveSettings() {
  try {
    await adminApi('POST', '', { action: 'settings', settings: { signup_bonus_inr: $('ad-bonus').value, coach_default_limit: $('ad-coach').value, allowed_email_domains: $('ad-dom').value } });
    await refreshProfile();
    toast('Settings saved.');
    renderTab('admin');
  } catch (e) { toast(e.message, true); }
}
async function adminCredit(i, sign) {
  const u = adminData.users[i];
  const v = await formDialog({
    title: (sign > 0 ? 'Add credit for ' : 'Remove credit from ') + u.email,
    text: 'Current balance: ' + inr(u.credits_inr),
    fields: [{ id: 'amount', label: 'Amount in ₹', type: 'number', placeholder: '50' }, { id: 'note', label: 'Note', placeholder: sign > 0 ? 'For example: Paid ₹50 by UPI' : 'Reason' }],
    ok: sign > 0 ? 'Add credit' : 'Remove credit',
  });
  if (!v) return;
  const amt = Number(v.amount);
  if (!amt || amt <= 0) { toast('Enter an amount above zero.', true); return; }
  try {
    await adminApi('POST', '', { action: 'credit', userId: u.id, amount: sign * amt, note: v.note });
    toast((sign > 0 ? 'Added ' : 'Removed ') + inr(amt) + '.');
    if (u.id === currentUser.id) await refreshProfile();
    renderTab('admin');
  } catch (e) { toast(e.message, true); }
}
async function adminCoach(i, d) {
  try { await adminApi('POST', '', { action: 'coachBonus', userId: adminData.users[i].id, delta: d }); renderTab('admin'); }
  catch (e) { toast(e.message, true); }
}
async function adminActivity(i) {
  const box = $('act-' + i);
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = '<p class="hint">Loading</p>';
  try {
    const d = await adminApi('GET', '?sessionsFor=' + encodeURIComponent(adminData.users[i].id));
    box.innerHTML = d.sessions.length ? d.sessions.map(s => `<div class="list-row"><div class="t">${esc(s.label || 'Session')}<small>${esc(fmtDate(s.createdAt))}${s.roundType ? ', ' + esc(s.roundType) : ''}. ${esc(clip(s.summary, 160))}</small></div><span class="tag">${esc(s.overallScore)}</span></div>`).join('') : '<p class="hint">No sessions yet.</p>';
  } catch (e) { box.innerHTML = '<p class="err-inline">' + esc(e.message) + '</p>'; }
}
async function adminLedger() {
  const box = $('ledger'); box.innerHTML = '<p class="hint">Loading</p>';
  try {
    const d = await adminApi('GET', '?ledger=1');
    const emailOf = id => { const u = adminData.users.find(x => x.id === id); return u ? u.email : id; };
    box.innerHTML = d.ledger.length ? `<div class="scroll-x"><table class="admin"><thead><tr><th>When</th><th>User</th><th>Change</th><th>What</th><th>AI cost</th></tr></thead><tbody>${d.ledger.map(r => `<tr><td>${esc(new Date(r.created_at).toLocaleString())}</td><td>${esc(emailOf(r.user_id))}</td><td>${Number(r.delta_inr) >= 0 ? '+' : ''}${esc(Number(r.delta_inr).toFixed(2))}</td><td>${esc(r.kind === 'usage' ? (r.task || 'AI call') : (r.note || r.kind))}</td><td>${r.cost_usd ? '$' + esc(Number(r.cost_usd).toFixed(4)) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No entries yet.</p>';
  } catch (e) { box.innerHTML = '<p class="err-inline">' + esc(e.message) + '</p>'; }
}
