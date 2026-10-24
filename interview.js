/* InterviewIQ mock interview: variety engine, interviewer prompt, live flow, scoring, assessment sheet. */
'use strict';

// ======================================================================
// What the scorecard measures. Built from how MBA placement and B-school
// panels evaluate: clarity of thought, communication, subject knowledge,
// composure, genuine fit, plus the problem solving and leadership skills
// recruiters rank highest.
// ======================================================================
const DIMS = [
  { id: 'clarity', label: 'Clarity of thought', desc: 'Structured, logical answers that get to the point' },
  { id: 'communication', label: 'Communication and listening', desc: 'Crisp, easy to follow, answers what was actually asked' },
  { id: 'evidence', label: 'Evidence and impact', desc: 'Specific examples, numbers with a source, their own contribution' },
  { id: 'knowledge', label: 'Business and domain knowledge', desc: 'Concepts, industry, the company and current affairs' },
  { id: 'problem', label: 'Problem solving and judgement', desc: 'Cases, estimates, trade-offs and commercial sense' },
  { id: 'selfaware', label: 'Self-awareness and authenticity', desc: 'Honest about limits and weaknesses, sounds genuine' },
  { id: 'motivation', label: 'Motivation and fit', desc: 'A believable why for this role, company and career path' },
  { id: 'leadership', label: 'Leadership and ownership', desc: 'Takes initiative, influences others, owns outcomes' },
  { id: 'composure', label: 'Composure under pressure', desc: 'Stays calm and clear when challenged' },
];
const DIM_IDS = DIMS.map(d => d.id);
function dimLabel(id) { const d = DIMS.find(x => x.id === id); return d ? d.label : id; }
const DIFFS = { gentle: 'Easy', realistic: 'Mid', tough: 'Tough' };
const SAFETY_MAX_Q = 25;

// Recurring weak-spot themes (used to group growth areas)
const THEMES = [
  { id: 'fact', label: 'Factual accuracy', kw: ['fact*', 'incorrect*', 'inaccura*', 'wrong', 'error*', 'misstat*'] },
  { id: 'quant', label: 'Quantified results and numbers', kw: ['number*', 'metric*', 'quantif*', 'data', 'statistic*', 'percent*', 'figure*', 'kpi*', 'roi'] },
  { id: 'specific', label: 'Specific examples and evidence', kw: ['example*', 'evidence', 'specific*', 'concrete', 'vague', 'generic', 'shallow', 'detail*', 'abstract'] },
  { id: 'ramble', label: 'Conciseness and focus', kw: ['rambl*', 'lengthy', 'verbose', 'concis*', 'wordy', 'repetit*', 'unfocus*'] },
  { id: 'direct', label: 'Answering the question asked', kw: ['deflect*', 'evad*', 'tangent*', 'sidestep*', 'dodg*', 'relevan*'] },
  { id: 'structure', label: 'Structure and frameworks', kw: ['structur*', 'framework*', 'star', 'mece', 'organi*', 'logic*', 'flow', 'signpost*'] },
  { id: 'owner', label: 'Ownership and personal contribution', kw: ['ownership', 'contribution*', 'accountab*', 'credit', 'your role', 'personal role'] },
  { id: 'hedge', label: 'Confident, decisive language', kw: ['confiden*', 'hedg*', 'tentative*', 'unsure', 'hesita*', 'assertive*', 'decisive*', 'defensive*'] },
  { id: 'knowledge', label: 'Company and domain knowledge', kw: ['knowledge', 'research*', 'company', 'domain', 'industry', 'market*', 'awareness', 'prepar*'] },
  { id: 'motivation', label: 'Clear motivation and fit', kw: ['motivat*', 'why this', 'career goal*', 'fit', 'purpose', 'aspiration*'] },
  { id: 'problem', label: 'Problem-solving approach', kw: ['problem', 'case', 'estimat*', 'guesstimat*', 'assumption*', 'trade-off*', 'tradeoff*', 'prioriti*'] },
  { id: 'composure', label: 'Composure under pressure', kw: ['composure', 'pressure', 'flustered', 'nervous', 'calm', 'rattled'] },
  { id: 'filler', label: 'Filler words', kw: ['filler*', 'um', 'uh', 'basically'] },
  { id: 'pace', label: 'Speaking pace', kw: ['pace', 'pacing', 'rushed', 'rushing', 'tempo', 'wpm'] },
  { id: 'pause', label: 'Pauses and silence', kw: ['pause*', 'silence*'] },
  { id: 'pitch', label: 'Vocal variety and tone', kw: ['pitch', 'monoton*', 'tone', 'inflection', 'vocal', 'energy', 'flat'] },
];
const THEME_IDS = THEMES.map(t => t.id);

// ======================================================================
// Variety engine. Every interview gets a different interviewer, round focus,
// opening move, question-format mix, curveballs and scenario seeds, and the
// candidate's recent questions are passed in as a do-not-repeat list.
// ======================================================================
const ROUNDS = {
  mixed: { label: 'Surprise me', desc: 'A different round type each time.' },
  hr: { label: 'HR and fit round', desc: 'Motivation, self-awareness, teamwork and culture fit.', focus: ['motivation', 'selfaware', 'communication', 'leadership'], formats: ['behavioral', 'motivation', 'reflection', 'situational', 'cv', 'ethics', 'ownership'], who: 'hr' },
  functional: { label: 'Functional round', desc: 'Domain knowledge and how you apply it to the business.', focus: ['knowledge', 'problem', 'clarity', 'evidence'], formats: ['concept', 'apply', 'current', 'mini_case', 'opinion', 'cv', 'teach', 'why_us'], who: 'functional' },
  cv: { label: 'CV deep-dive', desc: 'Every line of your CV, tested for depth, numbers and ownership.', focus: ['evidence', 'leadership', 'selfaware', 'clarity'], formats: ['cv', 'ownership', 'numbers', 'behavioral', 'reflection', 'weak_spot'], who: 'functional' },
  case: { label: 'Case and guesstimate', desc: 'Structured problem solving, estimation and business judgement.', focus: ['problem', 'clarity', 'knowledge', 'composure'], formats: ['mini_case', 'guesstimate', 'prioritise', 'apply', 'opinion'], who: 'case' },
  stress: { label: 'Stress round', desc: 'Deliberate pressure: challenges, rapid-fire and skepticism.', focus: ['composure', 'selfaware', 'clarity', 'communication'], formats: ['challenge', 'weak_spot', 'rapid', 'devil', 'opinion', 'silence', 'numbers'], who: 'senior' },
  final: { label: 'Final round with a senior leader', desc: 'Big-picture thinking, judgement and genuine fit.', focus: ['motivation', 'problem', 'leadership', 'knowledge'], formats: ['big_picture', 'opinion', 'situational', 'why_us', 'ethics', 'prioritise', 'behavioral'], who: 'senior' },
  admission: { label: 'B-school admission interview', desc: 'IIM-style personal interview: background, academics, why MBA, current affairs.', focus: ['motivation', 'selfaware', 'knowledge', 'clarity'], formats: ['hometown', 'academics', 'work', 'why_mba', 'current', 'hobby', 'ethics', 'teach'], who: 'admission' },
};
const SURPRISE_POOL = ['hr', 'functional', 'cv', 'case', 'stress', 'final'];

const FORMATS = {
  behavioral: 'a "tell me about a time" question about one specific past situation, then probe their exact actions and the result',
  situational: "a realistic 'what would you do if' situation set in this company's world",
  cv: 'a question anchored on one specific line, project, internship or claim from their background',
  ownership: 'a probe on which part of a past achievement was theirs alone, and what would have happened if they had not acted',
  numbers: 'a request for the numbers behind a claim and where those numbers came from',
  motivation: 'why this role, function or company, tested against what their background actually shows',
  reflection: 'a self-reflection question: a real weakness with a real incident, a failure, or feedback they disagreed with',
  concept: 'a core concept from the function, asked through a real example rather than a definition',
  teach: 'a request to explain an idea from their degree or work to a non-expert (for example a kirana shop owner) in under a minute',
  apply: "a request to apply a concept to this company's actual product, customers or market",
  current: 'a recent business, economic or industry development and what it means for this company',
  mini_case: 'a short business problem they must structure and solve aloud (let them drive; give one data point if they ask)',
  guesstimate: 'a market-sizing or estimation question relevant to the industry, solved aloud step by step',
  prioritise: 'a choice between two or three competing options under a constraint (budget, time or people) that they must make and defend',
  opinion: 'a request for a clear stance on a debatable business question, which you then test with a counter-argument',
  big_picture: 'where this industry is heading in three to five years and what the company should do about it',
  why_us: 'why this company over its closest competitor, with specifics',
  ethics: 'a realistic workplace ethics dilemma with no perfect answer',
  challenge: 'a polite but firm challenge to something they said earlier, as if you are not convinced',
  rapid: 'three short rapid-fire questions in one turn, each answerable in a line',
  devil: 'taking the opposite side of their last answer and asking them to defend their position',
  weak_spot: 'a direct question about a weak spot in their profile (a gap, a low grade, a switch, a short stint, or one they name)',
  silence: "a deliberately brief, skeptical prompt such as 'Is that all?' or 'Convince me.' to see how they handle pressure",
  hometown: 'a question about their hometown or state through a business lens (a local industry, problem or opportunity)',
  academics: 'a question on a concept from their graduation subject they should know well',
  work: 'a question on their work or internship experience: what they owned, and what changed because of them',
  why_mba: 'why an MBA, why now, and why this path rather than the alternatives',
  hobby: 'a question on a stated hobby or interest that tests whether it is genuine and what it taught them',
  sell: 'a request to sell an everyday product to you, after which you raise a realistic objection',
};

const OPENERS = [
  { id: 'cv_line', rounds: ['hr', 'functional', 'cv', 'final', 'stress'], warm: false, text: 'Pick one specific, interesting item from their background (a project, internship, role or achievement) and ask about it directly, with no small talk. If you have no background, ask what they are proudest of from the last two years.' },
  { id: 'journey', rounds: ['hr', 'cv', 'admission', 'final'], warm: true, text: 'Ask them to walk you through their journey in about ninety seconds, skipping anything already written on paper.' },
  { id: 'not_on_cv', rounds: ['hr', 'admission', 'final', 'cv'], warm: true, text: 'Ask them to tell you something about themselves that is not on their CV.' },
  { id: 'hometown', rounds: ['hr', 'admission'], warm: true, text: 'Ask where they are from, then turn it into a business question about that place (a local industry, problem or opportunity).' },
  { id: 'current', rounds: ['functional', 'final', 'case', 'admission'], warm: false, text: "Mention a recent development in this company's industry (stay general if you are unsure of specifics) and ask for their quick take and what it means for the business." },
  { id: 'role_day', rounds: ['hr', 'functional', 'final'], warm: true, text: 'Ask what they think this role actually involves day to day, and which part they would be best and worst at.' },
  { id: 'three_words', rounds: ['hr', 'cv'], warm: true, text: 'Ask how a former manager or teammate would describe them in three words, then say you will hold them to one of those words.' },
  { id: 'recent_learn', rounds: ['hr', 'admission', 'functional'], warm: true, text: 'Ask about the most interesting thing they have read or learned in the last month, and why it stuck.' },
  { id: 'first_week', rounds: ['functional', 'final', 'case'], warm: false, text: 'Set a scenario: it is their first week in this role and something has gone wrong (a stock-out, a missed target, an unhappy client). Ask what they do first.' },
  { id: 'sell', rounds: ['functional', 'hr', 'stress'], domains: ['marketing', 'sales', 'general'], warm: false, text: 'Ask them to sell you an everyday object on the table (a pen, a water bottle, a phone charger) in sixty seconds.' },
  { id: 'quick_guess', rounds: ['case', 'functional'], warm: false, text: 'Open with a quick, light estimation question relevant to the company or industry and ask them to think aloud.' },
  { id: 'hidden_win', rounds: ['hr', 'cv', 'final'], warm: true, text: 'Ask for one achievement they are proud of that most people around them would not know about.' },
  { id: 'product_use', rounds: ['functional', 'hr', 'final'], warm: true, text: "Ask which of the company's products, brands or services they have personally used (or a competitor's), and one thing they would change about it. If the company is unknown, ask about a brand they admire." },
  { id: 'hard_call', rounds: ['hr', 'cv', 'final', 'stress'], warm: false, text: 'Ask about the hardest decision they have made in the last two years and what they gave up for it.' },
  { id: 'two_quick', rounds: ['hr', 'functional', 'stress'], warm: true, text: 'Open with two quick warm-up questions in one turn (one about them, one about the role), and say you want short answers.' },
  { id: 'disagree', rounds: ['hr', 'cv', 'final'], warm: false, text: 'Ask about a time they disagreed with someone senior and what happened.' },
  { id: 'pitch_60', rounds: ['hr', 'final', 'stress'], warm: false, text: 'Tell them they have exactly one minute to make the case for hiring them over everyone else from their batch.' },
  { id: 'campaign', rounds: ['functional', 'hr'], domains: ['marketing', 'sales', 'general'], warm: true, text: 'Ask about a recent advertising campaign or brand move they found smart or poorly judged, and why.' },
  { id: 'cold_gap', rounds: ['stress'], warm: false, text: 'Open coldly: point to something unremarkable or weak in their background (or ask them to name it) and ask them to justify it.' },
  { id: 'why_switch', rounds: ['cv', 'hr', 'admission'], warm: false, text: 'Ask about the biggest change of direction in their path so far (a subject, a job, a city) and why they made it.' },
  { id: 'teach', rounds: ['functional', 'admission', 'cv'], warm: false, text: 'Ask them to explain one core idea from their graduation subject or work to a non-expert, such as a kirana shop owner, in under a minute.' },
  { id: 'tmay', rounds: ['hr', 'admission', 'cv', 'final'], warm: true, text: "Ask the classic 'tell me about yourself', but ask them to keep it under a minute and end on why they are in this room." },
  { id: 'why_mba', rounds: ['admission'], warm: false, text: 'Ask why they want an MBA now rather than in three years, and what they would do if they did not get in.' },
  { id: 'case_open', rounds: ['case'], warm: false, text: 'Go straight into a short business problem for this company or industry (for example, sales fell in one region, or a launch is underperforming) and ask how they would approach it.' },
  { id: 'big_bet', rounds: ['final'], warm: false, text: 'Ask what one bet they would make if they ran this business for a year, and what they would stop doing.' },
];

const DOMAINS = {
  marketing: { kw: ['marketing', 'brand', 'category', 'digital', 'growth', 'consumer', 'advertis', 'communications'], titles: ['Senior Brand Manager', 'Marketing Director', 'Category Head', 'Head of Growth'], concepts: 'positioning, segmentation and targeting, pricing, distribution reach, brand versus performance marketing, consumer insight, campaign measurement', orgs: ['an FMCG major', 'a consumer durables company', 'a D2C beauty brand', 'a quick-commerce startup'] },
  sales: { kw: ['sales', 'business development', 'account', 'channel', 'trade', 'retail', 'territory'], titles: ['Regional Sales Manager', 'National Key Accounts Head', 'Area Sales Manager', 'Head of Business Development'], concepts: 'channel and distributor management, territory planning, trade schemes, key account negotiation, forecasting, pipeline management', orgs: ['an FMCG major', 'a B2B SaaS company', 'a paints company', 'a telecom operator'] },
  finance: { kw: ['finance', 'investment', 'banking', 'equity', 'treasury', 'credit', 'risk', 'wealth', 'audit', 'fp&a'], titles: ['Finance Controller', 'Vice President, Investment Banking', 'Credit Risk Head', 'FP&A Lead'], concepts: 'valuation, working capital, cost of capital, financial statement analysis, M&A logic, the effect of interest rates', orgs: ['a private bank', 'an NBFC', 'a Big Four firm', 'a mid-size investment bank'] },
  consulting: { kw: ['consult', 'strategy', 'advisory', 'transformation'], titles: ['Engagement Manager', 'Principal', 'Strategy Lead'], concepts: 'market entry, profitability drivers, competitive strategy, prioritisation, hypothesis-driven problem solving', orgs: ['a strategy consulting firm', 'a Big Four advisory practice', 'a corporate strategy team'] },
  analytics: { kw: ['analytics', 'data', 'business analyst', 'insight', 'scientist', 'machine learning'], titles: ['Analytics Manager', 'Head of Data', 'Lead Business Analyst'], concepts: 'metric design, A/B testing, cohort analysis, data-driven decisions, forecasting, dashboards that change decisions', orgs: ['a fintech', 'an e-commerce company', 'an analytics consultancy', 'a data engineering firm'] },
  product: { kw: ['product manager', 'product management', 'apm', 'product owner'], titles: ['Group Product Manager', 'Director of Product'], concepts: 'user problems, prioritisation, product metrics, trade-offs, experimentation, launches', orgs: ['a consumer internet company', 'a SaaS startup', 'a fintech'] },
  operations: { kw: ['operations', 'supply chain', 'logistics', 'procurement', 'manufacturing', 'sourcing'], titles: ['Supply Chain Head', 'Operations Director', 'Procurement Lead'], concepts: 'inventory, lead times, capacity, cost to serve, vendor management, process improvement', orgs: ['a manufacturing company', 'an e-commerce logistics firm', 'an FMCG major'] },
  hr: { kw: ['human resource', 'talent', 'recruit', 'people partner'], titles: ['HR Head', 'Talent Acquisition Lead', 'HR Business Partner'], concepts: 'talent acquisition, attrition, performance management, engagement, basic labour law', orgs: ['a conglomerate', 'an IT services company', 'a startup'] },
  general: { kw: [], titles: ['Business Head', 'Hiring Manager', 'General Manager'], concepts: 'business models, unit economics, customers and competitors', orgs: ['a large Indian conglomerate', 'a multinational', 'a fast-growing startup'] },
};
function detectDomain(p) {
  const t = ((p.role || '') + ' ' + (p.jdText || '')).toLowerCase();
  let best = 'general', bestHits = 0;
  Object.entries(DOMAINS).forEach(([k, d]) => {
    const hits = d.kw.reduce((n, w) => n + (t.includes(w) ? (k !== 'general' && (p.role || '').toLowerCase().includes(w) ? 3 : 1) : 0), 0);
    if (hits > bestHits) { best = k; bestHits = hits; }
  });
  return best;
}

const NAMES = [
  ['Ritika Sharma', 'f'], ['Ananya Iyer', 'f'], ['Meera Krishnan', 'f'], ['Sneha Kulkarni', 'f'], ['Priya Menon', 'f'], ['Kavya Reddy', 'f'],
  ['Farah Siddiqui', 'f'], ['Neha Bansal', 'f'], ['Aditi Rao', 'f'], ['Sara Thomas', 'f'], ['Ishita Banerjee', 'f'], ['Leena DSouza', 'f'],
  ['Arjun Mehta', 'm'], ['Rohan Desai', 'm'], ['Vikram Singh', 'm'], ['Karthik Subramanian', 'm'], ['Aman Gupta', 'm'], ['Siddharth Bose', 'm'],
  ['Rahul Verma', 'm'], ['Imran Shaikh', 'm'], ['Nikhil Joshi', 'm'], ['Varun Malhotra', 'm'], ['Faisal Ahmed', 'm'], ['Deepak Chatterjee', 'm'],
];
const TEMPERAMENTS = {
  gentle: ['warm and encouraging, but listens closely for substance', 'friendly and curious, likes to hear the story behind things', 'patient and calm, gives the candidate room to think'],
  realistic: ['professional and neutral, courteous but not warm', 'crisp and efficient, prefers short structured answers', 'curious, follows interesting threads in the answers', 'numbers-first, keeps asking for figures and sources', 'calm and probing, asks why more than once'],
  tough: ['skeptical and hard to impress', 'dry and impatient with vague answers', "a devil's advocate by habit", 'fast-paced, cuts long answers short with sharper questions', 'polite but relentless about evidence'],
};
const SEEDS = [
  'a regional snacks brand trying to go national', 'a premium ice cream brand entering Tier-2 cities', 'a fintech app losing users right after onboarding',
  'a B2B SaaS firm expanding into the UAE and Saudi Arabia', 'a shampoo brand losing share to D2C rivals', 'a quick-commerce player launching in a new city',
  'an electric two-wheeler launch in a price-sensitive market', 'a hospital chain starting home healthcare', 'a cement company in a regional price war',
  'an edtech company after its growth slowed', 'a bank cross-selling insurance to existing customers', 'a paint company facing a well-funded new entrant',
  'a sportswear brand weighing a cricket league sponsorship', 'a cloud kitchen deciding which cities to exit', 'an airline adding a new Gulf route',
  'a two-wheeler maker losing rural demand after a weak monsoon', 'a luxury retailer in Dubai seeing fewer tourists', 'a coffee chain choosing between more stores and delivery',
  'an FMCG company choosing between a price increase and smaller pack sizes', 'a pharma company launching an over-the-counter brand',
];
const IN_VOICES = { m: ['en-IN-Wavenet-B', 'en-IN-Wavenet-C', 'en-IN-Wavenet-F'], f: ['en-IN-Wavenet-A', 'en-IN-Wavenet-D', 'en-IN-Wavenet-E'] };

function titlesFor(who, domain) {
  const D = DOMAINS[domain] || DOMAINS.general;
  if (who === 'hr') return ['Talent Acquisition Lead', 'HR Business Partner', 'Campus Hiring Manager', 'People Partner'];
  if (who === 'case') return domain === 'consulting' ? D.titles : ['Strategy Lead', 'Engagement Manager'].concat(D.titles);
  if (who === 'senior') return ['Business Unit Head', 'Vice President', 'Country Manager', 'Chief Operating Officer', 'Managing Director'];
  if (who === 'admission') return ['Professor of Marketing', 'Professor of Strategy', 'Professor of Economics', 'Professor of Finance', 'Alumni panelist'];
  return D.titles;
}

function makeBlueprint(o) {
  const { persona, mode, difficulty, recent } = o;
  const domain = detectDomain(persona);
  const lastRound = recent[0] && recent[0].bp && recent[0].bp.roundKey;
  let rk = o.roundKey;
  if (rk === 'mixed' || !ROUNDS[rk]) rk = pick(SURPRISE_POOL.filter(r => r !== lastRound));
  const round = ROUNDS[rk];

  const recentNames = recent.slice(0, 4).map(r => r.bp && r.bp.interviewer).filter(Boolean);
  const nm = pick(NAMES.filter(n => !recentNames.includes(n[0])));
  const title = pick(titlesFor(round.who, domain));
  const temperament = pick(TEMPERAMENTS[difficulty] || TEMPERAMENTS.realistic);
  const years = 6 + Math.floor(Math.random() * 16);
  const org = round.who === 'admission' ? 'the faculty of a leading business school' : pick((DOMAINS[domain] || DOMAINS.general).orgs);

  // Competency plan: the round's core areas first (in random order), then a couple of others.
  const planLen = mode === 'full' ? 7 : 6;
  const others = shuffle(DIM_IDS.filter(d => !round.focus.includes(d)));
  const dimsPlan = shuffle(round.focus).concat(others).slice(0, planLen);
  const fmts = shuffle(round.formats);
  const plan = dimsPlan.map((d, i) => ({ dim: d, format: fmts[i % fmts.length] }));

  // Opening move: suits the round, not used in your last five interviews
  const recentOpeners = recent.slice(0, 5).map(r => r.bp && r.bp.opener).filter(Boolean);
  let pool = OPENERS.filter(op => op.rounds.includes(rk) && (!op.domains || op.domains.includes(domain)) && !recentOpeners.includes(op.id));
  if (mode === 'full') { const warm = pool.filter(op => op.warm); if (warm.length && Math.random() < 0.7) pool = warm; }
  if (!pool.length) pool = OPENERS.filter(op => op.rounds.includes(rk));
  const opener = pick(pool);

  // Curveballs at random points (none on Easy)
  const nCurve = (difficulty === 'tough' ? 2 : difficulty === 'realistic' ? 1 : 0) + (rk === 'stress' ? 1 : 0);
  const curveFormats = shuffle(rk === 'stress' ? ['challenge', 'rapid', 'devil', 'silence', 'weak_spot'] : ['challenge', 'devil', 'rapid', 'prioritise']);
  const slots = shuffle([3, 4, 5, 6].filter(n => n <= planLen)).slice(0, nCurve);
  const curveballs = {};
  slots.forEach((s, i) => { curveballs[s] = curveFormats[i % curveFormats.length]; });

  const seeds = shuffle(SEEDS).slice(0, 3);
  const voice = pick(IN_VOICES[nm[1]]);
  return {
    roundKey: rk, roundLabel: round.label, domain, planLen, plan, curveballs, seeds, voice,
    opener: opener.id, openerText: opener.text,
    interviewer: nm[0], gender: nm[1], title, years, org, temperament,
  };
}

async function loadRecentInterviews() {
  const { data } = await supa.from('sessions')
    .select('created_at,questions:data->questions,bp:data->blueprint,tx:data->>transcript')
    .eq('user_id', currentUser.id).eq('kind', 'interview')
    .order('created_at', { ascending: false }).limit(8);
  return (data || []).map(r => {
    let qs = Array.isArray(r.questions) ? r.questions : [];
    if (!qs.length && r.tx) qs = String(r.tx).split('\n\n').filter(l => l.startsWith('Interviewer: ')).map(l => l.slice(13));
    return { questions: qs, bp: r.bp || null };
  });
}
function buildAvoidList(recent) {
  const out = [];
  recent.forEach((r, i) => { (i < 3 ? r.questions : r.questions.slice(0, 3)).forEach(q => out.push(clip(q, 140))); });
  return out.filter(Boolean).slice(0, 36);
}

// ======================================================================
// Interviewer prompt
// ======================================================================
const DIFF_TEXT = {
  gentle: 'Difficulty: Easy. Warm, encouraging and patient. Give the candidate room to recover; when an answer is weak, offer a gentle second chance ("Could you give me a specific example?"). Still expect real substance. Do not make it trivial.',
  realistic: 'Difficulty: Mid. Professional and neutral, like a real hiring manager: courteous, not warm. Push for specifics whenever an answer is vague. Use an occasional mild challenge.',
  tough: 'Difficulty: Tough. A senior panelist under time pressure. Rarely react positively. Cut into vague answers with sharper follow-ups, challenge assumptions and offer counter-arguments. If the candidate states a general fact, number, definition or framework that is clearly wrong (not a likely mishearing, and not a claim about their own life), start your next turn with a one-sentence correction, then continue.',
};

function personaContext(p) {
  const lines = [];
  if (p.jdText) lines.push('Job description or round notes:\n' + clip(p.jdText, 3000));
  if (p.brief) lines.push('Company notes (researched earlier, may be incomplete):\n' + clip(p.brief, 2200));
  return lines.join('\n\n');
}

function buildInterviewerSystem(s) {
  const bp = s.bp, p = s.persona, round = ROUNDS[bp.roundKey];
  const admission = bp.roundKey === 'admission';
  const target = admission ? 'a seat in the MBA programme' : ('the role of ' + (p.role || 'management trainee') + (p.company ? ' at ' + p.company : ''));
  const setting = admission
    ? 'This is an Indian B-school admission personal interview (IIM style).'
    : 'This is a campus placement interview at an Indian business school (MBA final or summer placements). Candidates are MBA students; many are freshers, some have a few years of work experience.';
  const dom = DOMAINS[bp.domain] || DOMAINS.general;
  const planText = bp.plan.map((x, i) => `${i + 1}. ${dimLabel(x.dim)} (${x.dim}): ${FORMATS[x.format]}`).join('\n');
  return `You are ${bp.interviewer}, ${bp.title}, with ${bp.years} years of experience at ${bp.org}. You are interviewing a candidate for ${target}.
${setting}
Round: ${round.label}. ${round.desc}
Your manner: ${bp.temperament}.
${DIFF_TEXT[s.difficulty] || DIFF_TEXT.realistic}${bp.roundKey === 'stress' ? '\nThis is a stress round: apply professional pressure (skepticism, challenges to earlier claims, rapid-fire, one brief skeptical silence prompt). Never be abusive, personal or discriminatory.' : ''}

ABOUT THE ROLE AND COMPANY
${personaContext(p) || 'No job description was given. Infer a sensible scope for this role at this kind of company.'}
Concepts this function cares about: ${dom.concepts}.
${s.about ? '\nCANDIDATE BACKGROUND (written by the candidate; unverified claims)\n' + clip(s.about, 1800) + '\nUse it to personalise: ask about specific items, probe the weaknesses they admit, test their stated strengths. Never read it back to them or invent facts that are not in it.\n' : '\nYou have no CV for this candidate. Draw the background out of them.\n'}
YOUR PRIVATE PLAN
Areas to assess, roughly in this order, with a suggested question format for each:
${planText}
Scenario seeds you may adapt for hypothetical questions when the company itself does not give you one: ${bp.seeds.join('; ')}.

HOW YOU INTERVIEW
1. Ask exactly one question per turn (a rapid-fire turn may hold three very short ones).
2. Before the question you may add one short, natural reaction sentence. Vary it, skip it often, and never use empty praise such as "Great answer".
3. After every answer, judge silently: did they answer what was asked? Is it specific (a real example, numbers, their own part) or generic? Is any general fact wrong? Then either follow up on a weak or interesting point, or move to the next planned area. Never ask more than two follow-ups on the same story.
4. Probing moves to rotate: ask for the number and where it came from; ask which part was theirs alone; ask what would have happened if they had not acted; ask them to explain it to a non-expert; go one level deeper until you reach the edge of what they know; offer a counter-argument; change one constraint.
5. If an answer sounds rehearsed, say so politely and ask for the unscripted version. If they say they do not know, accept it without drama and either move on or ask how they would find out. If an answer is very short, ask them to expand once. If it drifts off-topic, bring them back.
6. Answers reach you through speech-to-text and can contain transcription mistakes (misheard words, acronyms or names, no punctuation). Read them charitably. Never treat a likely mishearing as the candidate's error.
7. Ground questions in this company, this role and this candidate. Avoid generic textbook questions unless the format calls for a concept check.
8. Never repeat or closely paraphrase a question you already asked in this interview.${s.avoid.length ? ' Also avoid these questions the candidate has already faced in earlier practice sessions:\n' + s.avoid.map(q => '- ' + q).join('\n') : ''}
9. Stay in character. Never mention the plan, the briefings, scores, or that you are an AI.

BRIEFINGS
After each answer you will see a bracketed briefing from the interview coordinator. The candidate cannot see it. Follow it.

OUTPUT FORMAT
Plain spoken English, under 70 words, no markdown, no lists, no labels, no quotation marks around the question.
End with a tag on its own final line: <<focus: AREA; type: TYPE>>
AREA is one of: ${DIM_IDS.join(', ')}. TYPE is one of: new, followup, closing, end.`;
}

function coveredCounts(s) {
  const c = {};
  s.turns.forEach(t => { if (t.role === 'interviewer' && DIM_IDS.includes(t.focus) && (t.type === 'new' || t.type === 'followup')) c[t.focus] = (c[t.focus] || 0) + 1; });
  return c;
}
function trailingFollowups(s) {
  const qs = s.turns.filter(t => t.role === 'interviewer' && (t.type === 'new' || t.type === 'followup'));
  if (!qs.length) return { focus: null, n: 0 };
  const last = qs[qs.length - 1];
  let n = 0;
  for (let i = qs.length - 1; i >= 0 && qs[i].focus === last.focus; i--) if (qs[i].type === 'followup') n++;
  return { focus: last.focus, n };
}
function lastInterviewerTurn(s) { for (let i = s.turns.length - 1; i >= 0; i--) if (s.turns[i].role === 'interviewer') return s.turns[i]; return null; }

function buildBriefing(s) {
  const bp = s.bp, nextN = s.qCount + 1, lines = [];
  const last = lastInterviewerTurn(s);
  if (last && last.type === 'closing') {
    lines.push('END NOW: respond to what the candidate just said or asked in two to four sentences, in character (say you would need to check specifics if you do not know). Then thank them and close the interview. Do not ask another question. Use type: end.');
  } else if (s.mode === 'full' && nextN === bp.planLen + 1) {
    lines.push('CLOSING: thank them briefly and ask if they have any questions for you. Use type: closing.');
  } else if (nextN === 1) {
    lines.push('This is your first question. Opening move: ' + bp.openerText);
    if (s.mode === 'full') lines.push('Keep the first one or two questions conversational to build rapport, then move into the role.');
    else lines.push('This session skips small talk. Get to substance from the first question.');
  } else {
    const cov = coveredCounts(s);
    const covTxt = Object.keys(cov).map(k => k + ' x' + cov[k]).join(', ') || 'nothing yet';
    const notYet = bp.plan.map(x => x.dim).filter(d => !cov[d]);
    lines.push('Covered so far: ' + covTxt + '.');
    if (notYet.length) lines.push('Planned areas not yet covered: ' + notYet.join(', ') + '.');
    const tf = trailingFollowups(s);
    if (tf.n >= 2) lines.push('You have asked ' + tf.n + ' follow-ups on the current thread. Move to a new area now.');
    if (s.mode === 'full' && nextN === 2) lines.push('If their first answer revealed something notable, you may ask one follow-up about it; otherwise bridge toward why they want this role.');
    if (nextN <= bp.planLen) {
      const slot = bp.plan[nextN - 1];
      lines.push('Suggested for this turn unless a follow-up is clearly needed: assess ' + slot.dim + ' through ' + FORMATS[slot.format] + '.');
    } else {
      lines.push('All planned areas have been touched. Go deeper on the weakest area so far, or open a fresh angle relevant to the role. Keep varying the question format.');
    }
    const cb = bp.curveballs[nextN];
    if (cb) lines.push('Curveball for this turn: ' + FORMATS[cb] + '. Keep it professional.');
    const recentTypes = s.turns.filter(t => t.role === 'interviewer').slice(-2).map(t => t.focus).filter(Boolean);
    if (recentTypes.length === 2 && recentTypes[0] === recentTypes[1] && tf.n < 2) lines.push('The last two questions were both on ' + recentTypes[1] + '; consider switching.');
  }
  if (s.diffChanged) lines.push('The candidate changed the difficulty to ' + (DIFFS[s.difficulty] || s.difficulty) + '. Apply it from this turn.');
  return '[Briefing for your next turn (question ' + nextN + '). The candidate cannot see this.]\n- ' + lines.join('\n- ');
}

// What the briefing told the interviewer to do this turn (closing and ending are forced by us)
function expectedType(s) {
  const last = lastInterviewerTurn(s);
  if (last && last.type === 'closing') return 'end';
  if (s.mode === 'full' && s.qCount + 1 === s.bp.planLen + 1) return 'closing';
  return null;
}
function parseInterviewer(raw, s) {
  let text = String(raw || '');
  let focus = null, type = null;
  const m = text.match(/<<\s*focus\s*:\s*([a-z_]+)\s*;?\s*type\s*:\s*([a-z_-]+)\s*>>/i);
  if (m) { focus = m[1].toLowerCase(); type = m[2].toLowerCase().replace('-', ''); }
  text = text.replace(/<<[^>]*>>/g, '').split('\n').filter(l => !/^\s*\[.*\]\s*$/.test(l)).join('\n');
  text = text.replace(/^\s*(question|interviewer)\s*\d*\s*[:-]\s*/i, '').trim().replace(/^["“]|["”]$/g, '').trim();
  if (type === 'close') type = 'end';
  if (!['new', 'followup', 'closing', 'end'].includes(type)) type = 'new';
  const forced = expectedType(s);
  if (forced) type = forced;
  else if (type === 'closing' || type === 'end') type = 'new'; // only we decide when the interview closes
  if (!DIM_IDS.includes(focus)) { const slot = s.bp.plan[Math.min(s.qCount, s.bp.plan.length - 1)]; focus = slot ? slot.dim : 'communication'; }
  return { text, focus, type };
}
function splitReaction(text) {
  const parts = String(text).match(/[^.?!]+[.?!]+["')\]]*\s*|[^.?!]+$/g) || [text];
  const qi = parts.findIndex(p => p.includes('?'));
  if (qi > 0) return { react: parts.slice(0, qi).join('').trim(), q: parts.slice(qi).join('').trim() };
  return { react: '', q: String(text).trim() };
}

// ======================================================================
// Interview state, drafts and setup
// ======================================================================
let iv = null;
function interviewInProgress() { return !!(iv && iv.active); }
function draftKey() { return 'iq_draft_v2_' + (currentUser ? currentUser.id : 'x'); }
function saveDraft() {
  if (!iv || !iv.active) return;
  try {
    const d = { ...iv, phase: ['thinking', 'speaking', 'recording', 'processing'].includes(iv.phase) ? 'resume' : iv.phase };
    localStorage.setItem(draftKey(), JSON.stringify(d));
  } catch (e) { /* storage full or blocked: ignore */ }
}
function loadDraft() { try { const d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); return d && d.active && d.v === 2 ? d : null; } catch (e) { return null; } }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
window.addEventListener('beforeunload', e => { if (rec.active) { e.preventDefault(); e.returnValue = ''; } });

const DEFAULT_PERSONA = { id: '__default', company: '', role: 'MBA graduate trainee (general management)', jdText: '', toughness: 'realistic', label: 'General MBA placement interview', brief: '' };
function personaById(id) { return (typeof personas !== 'undefined' && personas.find(p => p.id === id)) || (id === '__default' ? DEFAULT_PERSONA : null); }

PAGES.interview = async function renderInterviewTab() {
  if (iv && iv.active) return renderRoom();
  if (iv && iv.result) return renderResultPage(iv.result);
  await Promise.all([ensurePersonas(), ensureAbout()]);
  const draft = loadDraft();
  if (draft) {
    const answered = draft.turns.filter(t => t.role === 'candidate').length;
    mainEl().innerHTML = `<div class="page"><div class="page-head"><h1>Mock interview</h1></div>
      <div class="panel"><h2>You have an unfinished interview</h2>
      <p>${esc(draft.persona.label)}, ${esc(ROUNDS[draft.bp.roundKey].label.toLowerCase())}, with ${esc(draft.bp.interviewer)}. You answered ${answered} question${answered === 1 ? '' : 's'}.</p>
      <div class="row" style="margin-top:14px"><button class="btn" onclick="resumeDraft()">Resume interview</button>
      ${answered ? '<button class="btn quiet" onclick="resumeDraft(true)">Score it now</button>' : ''}
      <button class="btn ghost" onclick="discardDraft()">Discard</button></div></div></div>`;
    return;
  }
  renderSetup();
};

function setupFieldsHtml(prefix, dark) {
  const list = [DEFAULT_PERSONA].concat(personas);
  const lastP = localStorage.getItem('iq_last_persona') || (personas[0] ? personas[0].id : '__default');
  const lastR = localStorage.getItem('iq_last_round') || 'mixed';
  const lastM = localStorage.getItem('iq_last_mode') || 'full';
  return `<div class="fields">
    <div><label class="f" for="${prefix}-p">Persona</label><select id="${prefix}-p">${list.map(p => `<option value="${esc(p.id)}" ${p.id === lastP ? 'selected' : ''}>${esc(p.label)}${p.mine === false ? ' (shared)' : ''}</option>`).join('')}</select></div>
    <div><label class="f" for="${prefix}-r">Round</label><select id="${prefix}-r">${Object.entries(ROUNDS).map(([k, r]) => `<option value="${k}" ${k === lastR ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
    <div><label class="f" for="${prefix}-m">Length</label><select id="${prefix}-m"><option value="full" ${lastM === 'full' ? 'selected' : ''}>Full interview</option><option value="half" ${lastM === 'half' ? 'selected' : ''}>Straight to questions</option></select></div>
  </div>`;
}
function readSetup(prefix) {
  const personaId = $(prefix + '-p').value, roundKey = $(prefix + '-r').value, mode = $(prefix + '-m').value;
  localStorage.setItem('iq_last_persona', personaId);
  localStorage.setItem('iq_last_round', roundKey);
  localStorage.setItem('iq_last_mode', mode);
  const p = personaById(personaId) || DEFAULT_PERSONA;
  const dEl = document.querySelector('#' + prefix + '-d [aria-pressed=true]');
  return { personaId, roundKey, mode, difficulty: dEl ? dEl.dataset.v : (p.toughness || 'realistic'), useAbout: $(prefix + '-a') ? $(prefix + '-a').checked : true };
}
function segPick(btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')); }

function renderSetup() {
  const hasAbout = typeof aboutHasContent === 'function' && aboutHasContent(aboutMe);
  mainEl().innerHTML = `<div class="page">
    <div class="page-head"><h1>Mock interview</h1><p>A new interviewer, round and question mix every time. Answer out loud, or type if you are somewhere quiet.</p></div>
    <div class="slip">
      <h1>Set up your round</h1>
      <p>Pick who you are interviewing with and what kind of round it is. "Surprise me" picks a different round each time, the way a real placement day goes.</p>
      ${setupFieldsHtml('su', true)}
      <label class="f">Difficulty</label>
      <div class="seg" id="su-d" role="group" aria-label="Difficulty">${Object.entries(DIFFS).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === 'realistic'}" onclick="segPick(this)">${v}</button>`).join('')}</div>
      ${hasAbout ? `<label class="check" style="color:var(--room-mute)"><input type="checkbox" id="su-a" checked> Ask about my background from the About me page</label>` : `<p class="hint" style="margin-top:12px;color:var(--room-mute)">Add your CV on the About me page and the interviewer will ask about your actual experience.</p>`}
      <div class="row" style="margin-top:18px"><button class="btn lg" onclick="startFromSetup('su')"><span class="ms">play_arrow</span>Start interview</button>
      <button class="btn quiet" onclick="go('personas')">Create a persona</button></div>
    </div>
    <div class="panel"><h3>Round types</h3>${Object.entries(ROUNDS).filter(([k]) => k !== 'mixed').map(([k, r]) => `<div class="list-row"><div class="t">${esc(r.label)}<small>${esc(r.desc)}</small></div></div>`).join('')}</div>
  </div>`;
  const pSel = $('su-p');
  const syncDiff = () => { const p = personaById(pSel.value); const want = (p && p.toughness) || 'realistic'; const b = document.querySelector('#su-d [data-v="' + want + '"]'); if (b) segPick(b); };
  pSel.onchange = syncDiff; syncDiff();
}

function startFromSetup(prefix) {
  unlockAudio(); // must happen inside the tap, before any waiting, for iPhones
  const o = readSetup(prefix);
  startInterview(o).catch(e => toast(e.message, true));
}

async function startInterview(o) {
  const p = personaById(o.personaId) || DEFAULT_PERSONA;
  if (!myProfile.is_admin && Number(myProfile.credits_inr) < 8) { toast('You need at least ₹8 to run and score an interview. Ask the admin to top you up.', true); return; }
  const recent = await loadRecentInterviews();
  const bp = makeBlueprint({ persona: p, roundKey: o.roundKey, mode: o.mode, difficulty: o.difficulty, recent });
  iv = {
    active: true, v: 2, persona: { id: p.id, label: p.label, company: p.company || '', role: p.role || '', jdText: p.jdText || '', brief: p.brief || '' },
    mode: o.mode, difficulty: o.difficulty, about: o.useAbout && typeof aboutForPrompt === 'function' ? aboutForPrompt() : '',
    bp, avoid: buildAvoidList(recent), msgs: [], turns: [], qCount: 0, phase: 'thinking', startedAt: new Date().toISOString(), diffChanged: false,
  };
  iv.msgs.push({ role: 'user', content: '[The candidate has walked in and sat down.]\n\n' + buildBriefing(iv) });
  if (currentTab !== 'interview') { history.pushState(null, '', '#interview'); currentTab = 'interview'; buildNav(); }
  saveDraft();
  await askNext();
}

function resumeDraft(scoreNow) {
  unlockAudio();
  iv = loadDraft();
  if (!iv) return renderSetup();
  if (scoreNow) return finishInterview();
  const lastMsg = iv.msgs[iv.msgs.length - 1];
  if (iv.phase === 'ended') { renderRoom(); return; }
  if (lastMsg && lastMsg.role === 'user') { askNext(); return; }
  iv.phase = 'ready';
  renderRoom();
}
function discardDraft() {
  if (!confirm('Discard this unfinished interview? It will not be scored.')) return;
  clearDraft(); iv = null; renderSetup();
}

// ======================================================================
// The interview room
// ======================================================================
function voiceFor(s) { return prefs.voice === 'match' ? s.bp.voice : prefs.voice; }
async function speakIv(text) {
  try { await speak(text, voiceFor(iv)); }
  catch (e) { toast('Voice: ' + e.message, true); }
}
function fmtSec(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function initials(n) { return String(n).split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase(); }

function renderRoom() {
  if (currentTab !== 'interview' || !iv) return;
  const s = iv, bp = s.bp;
  const last = lastInterviewerTurn(s);
  const ph = s.phase;
  const plannedTotal = s.mode === 'full' ? bp.planLen + 1 : null;
  let countTxt = '';
  if (last) {
    if (last.type === 'closing') countTxt = 'Closing';
    else if (last.type === 'end') countTxt = 'Interview finished';
    else countTxt = 'Question ' + s.qCount + (plannedTotal ? ' of about ' + plannedTotal : '') + (last.type === 'followup' ? ', follow-up' : '');
  }
  let stage = '';
  if (ph === 'thinking' || ph === 'resume') stage = `<div class="thinking"><span class="dots"><span></span><span></span><span></span></span>${esc(bp.interviewer.split(' ')[0])} is thinking</div>`;
  else if (ph === 'scoring') stage = `<div class="thinking"><span class="dots"><span></span><span></span><span></span></span>The panel is filling in your assessment sheet. This takes about half a minute.</div>`;
  else if (last) {
    const sp = splitReaction(last.text);
    stage = `<div class="count">${esc(countTxt)}</div>${sp.react ? `<div class="react">${esc(sp.react)}</div>` : ''}<div class="q">${esc(sp.q)}</div>`;
  }

  let controls = '';
  const endBtn = `<button class="btn ghost end" onclick="ivEnd()"><span class="ms">logout</span>End interview</button>`;
  const replay = (prefs.voiceOn && APPCFG.voiceEnabled) ? `<button class="btn quiet" onclick="ivReplay()"><span class="ms">replay</span>Replay</button>` : '';
  if (ph === 'ready') {
    controls = `<button class="mic" onclick="ivRecord()" aria-label="Record your answer"><span class="ms">mic</span></button>
      <div class="mic-label"><b>Tap to answer</b>Tap again when you finish</div>
      <button class="btn quiet" onclick="ivType()"><span class="ms">keyboard</span>Type instead</button>${replay}${endBtn}`;
  } else if (ph === 'speaking') {
    controls = `<button class="mic" disabled aria-label="Wait for the question"><span class="ms">mic</span></button>
      <div class="mic-label"><b>Listen</b>The interviewer is speaking</div>
      <button class="btn quiet" onclick="stopSpeaking()"><span class="ms">skip_next</span>Skip</button>${endBtn}`;
  } else if (ph === 'recording') {
    controls = `<button class="mic rec" onclick="ivRecord()" aria-label="Stop and submit"><span class="ms">stop</span></button>
      <div class="mic-label"><b>Recording</b>Tap to stop and submit</div>
      <button class="btn quiet" onclick="ivDiscard()"><span class="ms">restart_alt</span>Start over</button>${endBtn}`;
  } else if (ph === 'processing') {
    controls = `<div class="thinking"><span class="dots"><span></span><span></span><span></span></span>${rec.mode === 'device' ? 'Transcribing on your device. The first time can take a minute while it downloads.' : 'Saving your answer'}</div>`;
  } else if (ph === 'typing') {
    controls = `<div class="typebox" style="width:100%">${s.notice ? `<p class="err-inline" style="margin:0 0 8px">${esc(s.notice)}</p>` : ''}
      <label class="f" for="type-ans" style="color:var(--room-mute);margin-top:0">Your answer</label><textarea id="type-ans" placeholder="Answer as you would speak it"></textarea>
      <div class="controls"><button class="btn" style="background:#fff;color:var(--room)" onclick="ivSubmitTyped()">Submit answer</button><button class="btn quiet" onclick="iv.notice='';iv.phase='ready';renderRoom()"><span class="ms">mic</span>Answer by voice</button>${endBtn}</div></div>`;
  } else if (ph === 'error') {
    controls = `<div style="width:100%"><p class="err-inline">${esc(s.error)}</p><div class="controls"><button class="btn" style="background:#fff;color:var(--room)" onclick="askNext()"><span class="ms">refresh</span>Try again</button>${endBtn}</div></div>`;
  } else if (ph === 'ended') {
    controls = `<button class="btn lg" style="background:#fff;color:var(--room)" onclick="finishInterview()"><span class="ms">assignment</span>See my assessment</button>`;
  } else if (ph === 'scoreError') {
    controls = `<div style="width:100%"><p class="err-inline">${esc(s.error)}</p><div class="controls"><button class="btn" style="background:#fff;color:var(--room)" onclick="finishInterview()"><span class="ms">refresh</span>Try scoring again</button><button class="btn ghost" onclick="discardDraft()">Discard interview</button></div><p class="hint" style="color:var(--room-mute);margin-top:8px">Your answers are saved on this device, so you can also come back and score it later.</p></div>`;
  }

  const live = ph === 'recording' ? `<div class="live"><div class="lvl"><i id="lvl"></i></div><span class="timer" id="rec-timer">0:00</span><span id="live-text">${rec.mode === 'device' ? 'Recording. Your words will appear after you stop.' : 'Listening'}</span></div>` : '';
  const diffSeg = ['scoring', 'ended', 'scoreError'].includes(ph) ? '' : `<div class="seg" role="group" aria-label="Difficulty">${Object.entries(DIFFS).map(([k, v]) => `<button type="button" aria-pressed="${s.difficulty === k}" onclick="ivSetDifficulty('${k}')">${v}</button>`).join('')}</div>`;
  const convo = s.turns.length > 1 ? `<details class="panel convo"><summary>Conversation so far</summary>${s.turns.map(t => `<div class="turn ${t.role === 'candidate' ? 'cand' : ''}"><div class="who-l">${t.role === 'candidate' ? 'You' + (t.typed ? ' (typed)' : '') : esc(bp.interviewer)}</div>${esc(t.text)}</div>`).join('')}</details>` : '';

  mainEl().innerHTML = `<div class="page">
    <div class="room">
      <div class="room-top">
        <div class="nameplate"><div class="disc ${ph === 'speaking' ? 'talking' : ''}">${esc(initials(bp.interviewer))}</div>
          <div><b>${esc(bp.interviewer)}</b><small>${esc(bp.title)}, ${esc(bp.roundLabel.toLowerCase())}</small></div></div>
        ${diffSeg}
      </div>
      <div class="room-q" aria-live="polite">${stage}</div>
      <div class="controls">${controls}</div>
      ${live}
    </div>
    <p class="hint">${esc(s.persona.label)}. ${s.mode === 'full' ? 'Full interview: it ends with your chance to ask questions.' : 'Straight to questions: end whenever you like.'}</p>
    ${convo}
  </div>`;
  if (ph === 'typing') { const t = $('type-ans'); if (t) t.focus(); }
}

async function askNext() {
  if (!iv) return;
  iv.phase = 'thinking'; iv.error = null; renderRoom();
  try {
    const r = await ask('question', { system: buildInterviewerSystem(iv), messages: iv.msgs });
    const parsed = parseInterviewer(r.text, iv);
    if (!parsed.text) throw new Error('The interviewer returned an empty question. Try again.');
    iv.msgs.push({ role: 'assistant', content: r.text.trim() });
    if (parsed.type !== 'end') iv.qCount++;
    iv.turns.push({ role: 'interviewer', text: parsed.text, focus: parsed.focus, type: parsed.type });
    iv.diffChanged = false;
    if (parsed.type === 'end') {
      iv.phase = 'ended'; saveDraft(); renderRoom();
      await speakIv(parsed.text);
      return;
    }
    iv.phase = 'speaking'; saveDraft(); renderRoom();
    await speakIv(parsed.text);
    if (iv && iv.phase === 'speaking') { iv.phase = 'ready'; renderRoom(); }
  } catch (e) {
    if (!iv) return;
    iv.phase = 'error'; iv.error = e.message || String(e); renderRoom();
  }
}

async function ivRecord() {
  if (!iv) return;
  if (iv.phase === 'recording') return ivStopAndSubmit();
  if (iv.phase !== 'ready') return;
  try {
    await startCapture(
      t => { const el = $('live-text'); if (el) el.textContent = t; },
      (rms, sec) => { const l = $('lvl'); if (l) l.style.width = Math.min(100, rms * 900) + '%'; const tm = $('rec-timer'); if (tm) tm.textContent = fmtSec(sec); }
    );
    iv.phase = 'recording'; renderRoom();
  } catch (e) {
    toast(e.message, true);
    iv.phase = 'typing'; renderRoom();
  }
}
async function ivStopAndSubmit() {
  iv.phase = 'processing'; renderRoom();
  const m = await stopCapture(false);
  if (!m || !m.transcript) {
    iv.phase = 'typing'; iv.notice = 'No words were picked up. Type your answer, or switch back to voice and try again.'; renderRoom();
    return;
  }
  submitAnswer(m.transcript, m, false);
}
async function ivDiscard() { await stopCapture(true); iv.phase = 'ready'; renderRoom(); }
function ivType() { iv.phase = 'typing'; iv.notice = ''; renderRoom(); }
function ivSubmitTyped() {
  const t = ($('type-ans').value || '').trim();
  if (!t) { toast('Write your answer first.', true); return; }
  iv.notice = '';
  submitAnswer(t, null, true);
}
async function ivReplay() {
  const last = lastInterviewerTurn(iv);
  if (!last) return;
  iv.phase = 'speaking'; renderRoom();
  await speakIv(last.text);
  if (iv && iv.phase === 'speaking') { iv.phase = 'ready'; renderRoom(); }
}
function ivSetDifficulty(level) {
  if (!iv || iv.difficulty === level) return;
  iv.difficulty = level; iv.diffChanged = true;
  const lastMsg = iv.msgs[iv.msgs.length - 1];
  if (lastMsg && lastMsg.role === 'user') lastMsg.content = lastMsg.content.replace(/\n- The candidate changed the difficulty[^\n]*/g, '') + '\n- The candidate changed the difficulty to ' + DIFFS[level] + '. Apply it from this turn.';
  saveDraft();
  toast('Difficulty set to ' + DIFFS[level] + ' from the next question.');
  renderRoom();
}
function submitAnswer(text, metrics, typed) {
  iv.turns.push({ role: 'candidate', text, metrics, typed });
  const label = typed ? 'Candidate (typed)' : 'Candidate (speech-to-text)';
  iv.msgs.push({ role: 'user', content: label + ': ' + text + '\n\n' + buildBriefing(iv) });
  saveDraft();
  if (iv.qCount >= SAFETY_MAX_Q) { finishInterview(); return; }
  askNext();
}
async function ivEnd() {
  if (rec.active) {
    if (!confirm('Stop recording and end the interview? The answer you are recording now will not be included.')) return;
    await stopCapture(true);
  }
  stopSpeaking();
  const answered = iv.turns.filter(t => t.role === 'candidate').length;
  if (!answered) {
    if (!confirm('You have not answered anything yet. Leave without an assessment?')) { iv.phase = 'ready'; renderRoom(); return; }
    clearDraft(); iv = null; renderSetup(); return;
  }
  if (!confirm('End the interview and get your assessment?')) return;
  finishInterview();
}

// ======================================================================
// Scoring
// ======================================================================
function qaPairs(s) {
  const out = [];
  let pending = null;
  s.turns.forEach(t => {
    if (t.role === 'interviewer') { if (t.type !== 'end') pending = t; }
    else if (pending) { out.push({ n: out.length + 1, q: pending.text, a: t.text, focus: pending.focus, type: pending.type, metrics: t.metrics, typed: t.typed }); pending = null; }
  });
  return out;
}
function transcriptText(s) {
  return s.turns.map(t => (t.role === 'interviewer' ? 'Interviewer: ' : 'You: ') + t.text).join('\n\n');
}
const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    evidenceNotes: { type: 'array', items: { type: 'string' }, description: 'Write these FIRST: 4 to 10 short notes of concrete evidence you saw in the transcript (quote or paraphrase), good and bad, before judging anything.' },
    dims: {
      type: 'object',
      properties: Object.fromEntries(DIMS.map(d => [d.id, {
        type: 'object',
        properties: { score: { type: 'integer', minimum: 0, maximum: 5, description: '1 to 5, or 0 if the interview gave no real chance to show this.' }, evidence: { type: 'string', description: 'One short line of evidence from the transcript behind the rating, or why it was not assessed.' } },
        required: ['score', 'evidence'],
      }])),
      required: DIM_IDS,
    },
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    hireSignal: { type: 'string', enum: ['Strong no', 'No', 'Leaning no', 'Leaning yes', 'Yes', 'Strong yes'] },
    hireReason: { type: 'string', description: 'One sentence.' },
    summary: { type: 'string', description: 'Two honest sentences.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Up to 3 real strengths, each under 15 words.' },
    improvements: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, theme: { type: 'string', enum: THEME_IDS } }, required: ['text', 'theme'] }, description: 'Up to 3, each under 15 words, most important first.' },
    perQuestion: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, verdict: { type: 'string', enum: ['strong', 'okay', 'weak'] }, note: { type: 'string', description: 'Under 20 words.' } }, required: ['n', 'verdict', 'note'] } },
    betterAnswers: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, missing: { type: 'string' }, stronger: { type: 'string', description: 'Under 120 words, first person, only facts the candidate gave; [placeholders] for missing facts.' } }, required: ['n', 'missing', 'stronger'] }, description: 'For the two weakest answers.' },
    factCheck: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, correction: { type: 'string' } }, required: ['claim', 'correction'] } },
    deliveryNote: { type: 'string', description: 'One or two sentences on delivery based ONLY on the measured numbers given. Say "Not measured" if there are none.' },
    panelNote: { type: 'string', description: 'What this interviewer would say to a colleague after the candidate left. One or two candid sentences, in character.' },
  },
  required: ['evidenceNotes', 'dims', 'overallScore', 'hireSignal', 'hireReason', 'summary', 'strengths', 'improvements', 'perQuestion', 'betterAnswers', 'factCheck', 'deliveryNote', 'panelNote'],
};

function scoringSystem(s) {
  const p = s.persona, bp = s.bp;
  return `You are the lead evaluator on a hiring panel. You fill in a structured assessment sheet from an interview transcript. You are strict, fair and specific.

CONTEXT
- Position: ${bp.roundKey === 'admission' ? 'MBA programme admission' : (p.role || 'MBA graduate role') + (p.company ? ' at ' + p.company : '')}
- Round: ${ROUNDS[bp.roundKey].label}. Difficulty: ${DIFFS[s.difficulty]}. Format: ${s.mode === 'full' ? 'full interview with rapport opening and closing' : 'straight to questions'}.
- Interviewer: ${bp.interviewer}, ${bp.title}.
${p.jdText ? '- Job description (excerpt): ' + clip(p.jdText, 1500) : '- No job description given.'}

RULES
1. Evidence first. Fill evidenceNotes before anything else. Score only what the transcript shows. Never reward length, polish, jargon or a confident tone over substance; a short, precise answer beats a long vague one.
2. Answers came through speech-to-text. Ignore likely transcription errors (misheard words, acronyms, missing punctuation). Never penalise or fact-check them.
3. Rate each competency from 1 to 5:
   1 = not shown or clearly weak (vague, off-target or wrong)
   2 = below the bar (an attempt, little evidence)
   3 = meets the campus bar (clear and relevant, with some specifics)
   4 = strong (specific, quantified, well structured, owns their part)
   5 = exceptional (would stand out on a top-campus panel)
   Use 0 when the interview gave no real chance to show that competency. Do not guess.
4. Overall score from 0 to 100: below 40 = rejected in most rounds; 40 to 59 = below the bar; 60 to 74 = borderline to competitive; 75 to 89 = strong; 90 or above = rare. Keep it consistent with the ratings and the hire signal.
5. Judge the answers against the difficulty: a Tough round is harder, but do not inflate scores to compensate.
6. Fact check: only clear errors in general knowledge the candidate stated (facts, numbers, definitions, frameworks). Not claims about their own life, not opinions, not likely mishearings. If unsure, leave it out. An empty list is fine.
7. Per question: one entry for every question number in the transcript.
8. Stronger answers: for the two weakest answers, say what was missing and write a stronger version in the candidate's own voice using only facts they gave. Put a placeholder in square brackets for any fact they would need to supply, such as [your conversion rate].
9. Plain, direct English. No flattery.`;
}

async function scoreInterview(s) {
  const qa = qaPairs(s);
  if (!qa.length) throw new Error('There are no answers to score.');
  const delivery = aggregateMetrics(qa.map(x => x.metrics));
  const tx = qa.map(x => `Q${x.n} [${x.type === 'closing' ? 'closing' : x.focus}${x.type === 'followup' ? ', follow-up' : ''}]: ${x.q}\nA${x.n}${x.typed ? ' (typed)' : ''}: ${x.a}`).join('\n\n');
  const endTurn = s.turns.filter(t => t.role === 'interviewer' && t.type === 'end').pop();
  const dl = delivery
    ? `Spoken answers measured: ${delivery.answers}. Pace ${delivery.wpm} words per minute. Filler words ${delivery.fillerRate} per 100 words. Hedging phrases ${delivery.hedgeRate} per 100 words. Long pauses ${delivery.pausesPerMin} per minute. Vocal variety ${delivery.pitchSt || 'n/a'} semitones. Average answer ${delivery.avgAnswerSec} seconds. Average time to start ${delivery.startDelay} seconds.`
    : 'All answers were typed, so delivery was not measured.';
  const r = await ask('score', {
    system: scoringSystem(s),
    schema: SCORE_SCHEMA,
    prompt: `TRANSCRIPT\n${clip(tx, 60000).replace(/ {2,}/g, ' ')}${endTurn ? '\n\nInterviewer closing remark: ' + endTurn.text : ''}\n\nMEASURED DELIVERY (from the microphone, not the text)\n${dl}\n\nFill in the assessment sheet.`,
  });
  const d = r.data || {};
  const dims = {};
  DIMS.forEach(x => {
    const v = d.dims && d.dims[x.id];
    const sc = v && Number.isInteger(v.score) && v.score >= 1 && v.score <= 5 ? v.score : null;
    dims[x.id] = { score: sc, evidence: clip(v && v.evidence, 300) };
  });
  const avg = ids => { const v = ids.map(id => dims[id].score).filter(Boolean); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 20) : null; };
  const improvements = (Array.isArray(d.improvements) ? d.improvements : []).slice(0, 3).map(i => ({ text: clip(i.text, 160), theme: THEME_IDS.includes(i.theme) ? i.theme : null }));
  return {
    kind: 'interview', v: 2, createdAt: new Date().toISOString(),
    personaLabel: s.persona.label, personaId: s.persona.id, company: s.persona.company, role: s.persona.role,
    roundKey: s.bp.roundKey, roundLabel: s.bp.roundLabel, mode: s.mode, difficulty: s.difficulty,
    interviewerName: s.bp.interviewer, interviewerTitle: s.bp.title,
    blueprint: { roundKey: s.bp.roundKey, opener: s.bp.opener, interviewer: s.bp.interviewer },
    questions: qa.map(x => clip(x.q, 300)), transcript: transcriptText(s),
    delivery,
    wpm: delivery ? delivery.wpm : 0, fillers: delivery ? delivery.fillers : 0, fillerRate: delivery ? delivery.fillerRate : 0,
    pauseCount: delivery ? delivery.pauseCount : 0, pauseSec: delivery ? delivery.pauseSec : 0, pVar: delivery ? delivery.pVar : 0,
    wordCount: delivery ? delivery.wordCount : 0, durationSec: delivery ? delivery.durationSec : 0,
    overallScore: Math.max(0, Math.min(100, Math.round(Number(d.overallScore) || 0))),
    contentScore: avg(['evidence', 'knowledge', 'problem']), structureScore: avg(['clarity']), confidenceScore: avg(['composure', 'communication']),
    dims, hireSignal: d.hireSignal || '', hireReason: clip(d.hireReason, 300), summary: clip(d.summary, 600),
    strengths: (d.strengths || []).slice(0, 3).map(x => clip(x, 160)),
    improvements: improvements.map(i => i.text), improvementThemes: improvements,
    perQuestion: (d.perQuestion || []).map(x => ({ n: x.n, verdict: x.verdict, note: clip(x.note, 200) })),
    betterAnswers: (d.betterAnswers || []).slice(0, 2).map(x => ({ n: x.n, missing: clip(x.missing, 300), stronger: clip(x.stronger, 1200) })),
    factCheckItems: (d.factCheck || []).map(x => ({ claim: clip(x.claim, 300), correction: clip(x.correction, 300) })),
    factCheck: (d.factCheck || []).map(x => clip(x.claim, 200) + ' Correct: ' + clip(x.correction, 200)),
    deliveryNote: clip(d.deliveryNote, 400), panelNote: clip(d.panelNote, 400),
  };
}

async function finishInterview() {
  if (!iv) return;
  stopSpeaking();
  if (rec.active) await stopCapture(true);
  iv.phase = 'scoring'; iv.error = null; saveDraft(); renderRoom();
  let session;
  try {
    session = await scoreInterview(iv);
  } catch (e) {
    iv.phase = 'scoreError'; iv.error = 'Scoring failed: ' + (e.message || e); saveDraft(); renderRoom();
    return;
  }
  try {
    const { data, error } = await supa.from('sessions').insert({ user_id: currentUser.id, kind: 'interview', data: session }).select('id').single();
    if (error) throw error;
    session._rowId = data.id;
  } catch (e) {
    toast('Your assessment is ready but could not be saved to History: ' + (e.message || e), true);
  }
  try { await updateGrowthFromSession(session); } catch (e) { /* growth tracking is a bonus; never block results */ }
  clearDraft();
  iv = { active: false, result: session };
  if (currentTab === 'interview') renderResultPage(session);
  else toast('Your assessment is ready in the Mock interview tab.');
}

// ======================================================================
// Assessment sheet (used on the result page and in History)
// ======================================================================
function stampClass(sig) { return /^(Yes|Strong yes)$/.test(sig) ? 'yes' : /^Leaning/.test(sig) ? 'mid' : ''; }

function renderAssessment(s) {
  if (!s.dims) return renderLegacyAssessment(s);
  const fields = [
    ['Role', s.roundKey === 'admission' ? 'MBA admission' : (s.role || 'MBA role')], ['Company', s.company || 'Not specified'], ['Round', s.roundLabel || ''],
    ['Interviewer', (s.interviewerName || '') + (s.interviewerTitle ? ', ' + s.interviewerTitle : '')], ['Difficulty', DIFFS[s.difficulty] || ''], ['Date', fmtDate(s.createdAt)],
  ];
  const rows = DIMS.map(d => {
    const v = s.dims[d.id] || {};
    const cells = [1, 2, 3, 4, 5].map(n => `<td class="c">${v.score === n ? `<span class="circ" aria-label="Rated ${n} of 5">${n}</span>` : n}</td>`).join('');
    return `<tr><td class="dl"><b>${esc(d.label)}</b>${v.score ? `<span>${esc(v.evidence)}</span>` : ''}</td>${v.score ? cells : `<td colspan="5" class="c"><span class="na">Not assessed</span></td>`}</tr>`;
  }).join('');
  return `<div class="sheet-paper">
    <div class="sheet-head"><div><h2>Candidate assessment</h2><div class="hint">${esc(s.personaLabel || '')}</div></div></div>
    <div class="sheet-fields">${fields.map(f => `<div>${esc(f[0])}<b>${esc(f[1])}</b></div>`).join('')}</div>
    ${s.hireSignal ? `<div class="stamp ${stampClass(s.hireSignal)}"><small>Hire signal</small>${esc(s.hireSignal)}</div>` : ''}
    <div class="overall"><div><div class="num">${esc(s.overallScore)}</div><div class="of">out of 100</div></div><div class="sum"><p style="margin:0">${esc(s.summary)}</p>${s.hireReason ? `<p class="hint" style="margin:6px 0 0">${esc(s.hireReason)}</p>` : ''}</div></div>
    <table class="dimtable"><thead><tr><th>Competency</th>${[1, 2, 3, 4, 5].map(n => `<th class="c">${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    ${s.panelNote ? `<p class="panel-note">Said to a colleague after you left: <q>${esc(s.panelNote)}</q></p>` : ''}
  </div>`;
}

function renderLegacyAssessment(s) {
  const bar = (l, v) => v == null ? '' : `<div class="pbar"><span>${esc(l)}</span><div class="track"><div class="fillbar" style="width:${Math.max(0, Math.min(100, v))}%"></div></div><b>${esc(v)}</b></div>`;
  return `<div class="sheet-paper"><div class="sheet-head"><div><h2>Assessment</h2><div class="hint">${esc(s.personaLabel || s.topic || '')}, ${esc(fmtDate(s.createdAt))}</div></div></div>
    <div class="overall"><div><div class="num">${esc(s.overallScore)}</div><div class="of">out of 100</div></div><div class="sum"><p style="margin:0">${esc(s.summary || '')}</p></div></div>
    <div class="profile-bars">${bar('Content and relevance', s.contentScore)}${bar('Structure and clarity', s.structureScore)}${bar('Confidence of language', s.confidenceScore)}</div></div>`;
}

function assessmentExtras(s, idx) {
  const qs = s.questions || [];
  let html = '';
  if (s.perQuestion && s.perQuestion.length) {
    html += `<div class="panel"><h2>Question by question</h2>${s.perQuestion.map(p => `<div class="qreview"><div class="v ${esc(p.verdict)}" aria-label="${esc(p.verdict)}">${p.verdict === 'strong' ? '<span class="ms" style="font-size:17px;vertical-align:0">check</span>' : p.verdict === 'weak' ? '<span class="ms" style="font-size:17px;vertical-align:0">close</span>' : '<span class="ms" style="font-size:17px;vertical-align:0">remove</span>'}</div><div><div class="qq">${esc(qs[p.n - 1] || ('Question ' + p.n))}</div><div class="hint" style="color:var(--ink-2)">${esc(p.note)}</div></div></div>`).join('')}</div>`;
  }
  if (s.betterAnswers && s.betterAnswers.length) {
    html += `<div class="panel"><h2>How to answer these better</h2><p class="hint">Rewritten in your voice using only what you said. Fill the [brackets] with your real numbers.</p>${s.betterAnswers.map(b => `<div class="better"><b>${esc(qs[b.n - 1] || ('Question ' + b.n))}</b><p class="hint" style="margin:6px 0 0;color:var(--ink-2)">Missing: ${esc(b.missing)}</p><div class="mod">${esc(b.stronger)}</div></div>`).join('')}</div>`;
  }
  const facts = s.factCheckItems || (s.factCheck || []).map(f => ({ claim: f, correction: '' }));
  if (facts.length) html += `<div class="callout bad"><b>Fact check</b>${facts.map(f => `<div style="margin-top:6px">${esc(f.claim)}${f.correction ? `<br><span class="hint" style="color:var(--ink)">Correct: ${esc(f.correction)}</span>` : ''}</div>`).join('')}</div>`;
  if ((s.strengths && s.strengths.length) || (s.improvements && s.improvements.length)) {
    html += `<div class="grid2"><div class="panel"><h3>What worked</h3>${md((s.strengths || []).map(x => '- ' + x).join('\n'))}</div><div class="panel"><h3>Work on next</h3>${md((s.improvements || []).map(x => '- ' + x).join('\n'))}</div></div>`;
  }
  const dlv = s.delivery || (s.wpm ? { wpm: s.wpm, pVar: s.pVar, fillerRate: s.fillerRate } : null);
  html += `<div class="panel"><h2>Your delivery</h2><p class="hint">Measured from your microphone, not judged by the AI.</p>${deliveryHtml(dlv)}${s.deliveryNote ? `<p style="margin-top:12px">${esc(s.deliveryNote)}</p>` : ''}</div>`;
  html += `<div class="panel"><div class="row between"><h2>Practice plan</h2></div>${s.recommendations ? md(s.recommendations) : `<p class="hint">A short plan with drills aimed at your weakest areas from this session.</p>
    <div class="row" style="margin-top:8px"><button class="btn quiet" id="rec-btn-${idx}" onclick="getPracticePlan(${idx})">Make my practice plan</button><label class="check" style="margin:0"><input type="checkbox" id="rec-srch-${idx}"> Include current, real examples from the web (costs a little more)</label></div>`}</div>`;
  if (s.transcript) html += `<details class="panel"><summary style="cursor:pointer;font-weight:650">Full transcript</summary><pre class="tx">${esc(s.transcript)}</pre></details>`;
  return html;
}

// Sessions shown on screen, so buttons can refer to them by number
const shownSessions = [];
function registerSession(s) { shownSessions.push(s); return shownSessions.length - 1; }

async function getPracticePlan(idx) {
  const s = shownSessions[idx];
  if (!s) return;
  const btn = $('rec-btn-' + idx);
  const search = $('rec-srch-' + idx) && $('rec-srch-' + idx).checked;
  if (btn) { btn.disabled = true; btn.textContent = 'Writing your plan'; }
  const weak = s.dims ? DIMS.filter(d => s.dims[d.id] && s.dims[d.id].score && s.dims[d.id].score <= 3).map(d => d.label + ' (' + s.dims[d.id].score + '/5): ' + s.dims[d.id].evidence) : [];
  const dlv = s.delivery ? deliveryCards(s.delivery).filter(c => c.cls !== 'good').map(c => c.k + ': ' + c.v + ' (' + c.s + ')') : [];
  const prompt = `Make a short practice plan for an MBA student preparing for ${s.kind === 'interview' ? (s.roundLabel || 'placement') + ' interviews for ' + (s.role || 'an MBA role') + (s.company ? ' at ' + s.company : '') : 'placement interviews'}.
Weakest areas this session:
${weak.join('\n') || '(none rated below 4)'}
Points to improve: ${(s.improvements || []).join('; ')}
Delivery issues (measured): ${dlv.join('; ') || 'none flagged'}
Summary: ${s.summary || ''}

Write three numbered steps. Each step: what to fix, one specific drill they can do in 10 to 15 minutes (for example a prompt to practise in Speaking practice), and how they will know it worked. ${search ? 'Where useful, cite one current, real example (a company, campaign or news item) to practise with.' : ''} Under 220 words. Plain English, no fluff.`;
  try {
    const r = await ask('recommend', { prompt, search });
    s.recommendations = r.text;
    if (s._rowId) { const { _rowId, ...data } = s; await supa.from('sessions').update({ data }).eq('id', _rowId); }
    const panel = btn ? btn.closest('.panel') : null;
    if (panel) panel.innerHTML = `<div class="row between"><h2>Practice plan</h2></div>${md(s.recommendations)}`;
  } catch (e) {
    toast(e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Make my practice plan'; }
  }
}

function renderResultPage(s) {
  const idx = registerSession(s);
  mainEl().innerHTML = `<div class="page">
    <div class="page-head row between"><div><h1>Your assessment</h1><p>Here is how the panel scored you, and exactly what to fix.</p></div>
      <button class="btn" onclick="iv=null;go('interview')"><span class="ms">replay</span>New interview</button></div>
    ${renderAssessment(s)}
    ${assessmentExtras(s, idx)}
  </div>`;
}

// ======================================================================
// Growth areas: recurring weak spots across sessions
// ======================================================================
let growthAreas = null;
async function loadGrowth(force) {
  if (growthAreas && !force) return growthAreas;
  const { data } = await supa.from('growth').select('areas').eq('user_id', currentUser.id).maybeSingle();
  growthAreas = (data && Array.isArray(data.areas)) ? data.areas : [];
  return growthAreas;
}
async function saveGrowth(areas) {
  growthAreas = areas;
  const { error } = await supa.from('growth').upsert({ user_id: currentUser.id, areas, updated_at: new Date().toISOString() });
  if (error) toast('Could not save growth areas: ' + error.message, true);
}
const STOP = new Set('the a an and or of to in on for with at by from is are was were be been it this that your you their they not no but so if then than too very more most can could should would do does did have has had into about my me'.split(' '));
function normText(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function stemSet(t) { return new Set(normText(t).split(' ').filter(w => w.length > 2 && !STOP.has(w)).map(w => w.slice(0, 5))); }
function jaccard(a, b) { let i = 0; a.forEach(x => { if (b.has(x)) i++; }); const u = a.size + b.size - i; return u ? i / u : 0; }
function themeOf(a) {
  if (a.theme && THEME_IDS.includes(a.theme)) return THEMES.find(t => t.id === a.theme);
  const norm = normText(a.area), tokens = norm.split(' ');
  for (const th of THEMES) {
    if (th.kw.some(k => k.includes(' ') ? (' ' + norm + ' ').includes(' ' + k + ' ') : k.endsWith('*') ? tokens.some(t => t.startsWith(k.slice(0, -1))) : tokens.includes(k))) return th;
  }
  return null;
}
function reconcileGrowth(existing, upd) {
  const now = new Date().toISOString();
  const areas = (existing || []).map(a => ({ ...a }));
  const bump = (text, theme, reopen) => {
    let i = areas.findIndex(x => x.area === text);
    if (i < 0) {
      const s = stemSet(text); let best = -1, bs = 0;
      areas.forEach((x, j) => { if (theme && x.theme && x.theme !== theme) return; const v = jaccard(s, stemSet(x.area)); if (v > bs) { bs = v; best = j; } });
      if (bs >= 0.5) i = best;
    }
    if (i >= 0) {
      if (areas[i].ignored) return;
      areas[i].timesNoted = (areas[i].timesNoted || 1) + 1; areas[i].lastNoted = now;
      if (theme && !areas[i].theme) areas[i].theme = theme;
      areas[i].status = (areas[i].status === 'resolved' && !reopen) ? 'unchanged' : (areas[i].status === 'resolved' ? 'new' : 'unchanged');
    } else areas.push({ area: text, theme: theme || null, firstNoted: now, lastNoted: now, timesNoted: 1, status: 'new' });
  };
  (upd.stillPresent || []).forEach(t => { const a = areas.find(x => x.area === t); bump(t, a && a.theme, false); });
  (upd.resolved || []).forEach(t => { const i = areas.findIndex(x => x.area === t); if (i >= 0 && !areas[i].ignored) { areas[i].status = 'resolved'; areas[i].lastNoted = now; } });
  (upd.newIssues || []).forEach(n => bump(clip(n.text, 120), THEME_IDS.includes(n.theme) ? n.theme : null, true));
  return areas;
}
// Runs as a separate, cheap step AFTER scoring, so past weaknesses never bias the score.
async function updateGrowthFromSession(s) {
  const imps = s.improvementThemes || (s.improvements || []).map(t => ({ text: t, theme: null }));
  if (!imps.length) return;
  const areas = await loadGrowth();
  const tracked = areas.filter(a => !a.ignored && a.status !== 'resolved').sort((a, b) => (b.timesNoted || 0) - (a.timesNoted || 0)).slice(0, 15);
  let upd;
  if (!tracked.length) {
    upd = { stillPresent: [], resolved: [], newIssues: imps };
  } else {
    const texts = tracked.map(a => a.area);
    const schema = {
      type: 'object',
      properties: {
        stillPresent: { type: 'array', items: { type: 'string', enum: texts } },
        resolved: { type: 'array', items: { type: 'string', enum: texts } },
        newIssues: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, theme: { type: 'string', enum: THEME_IDS } }, required: ['text', 'theme'] } },
      },
      required: ['stillPresent', 'resolved', 'newIssues'],
    };
    const prompt = `Tracked weak areas from this candidate's earlier practice sessions:
${texts.map(t => '- ' + t).join('\n')}

This session's summary: ${s.summary || ''}
This session's points to improve:
${imps.map(i => '- ' + i.text + (i.theme ? ' (' + i.theme + ')' : '')).join('\n')}

Decide:
- stillPresent: tracked areas that clearly showed up again in this session.
- resolved: tracked areas this session gave a real chance to show, and that now look fixed. Leave out anything not tested.
- newIssues: points from this session that are NOT already tracked, written as short generic phrases of 3 to 8 words, each with the best theme.`;
    const r = await ask('growth', { prompt, schema });
    upd = r.data || {};
  }
  await saveGrowth(reconcileGrowth(areas, upd));
}
