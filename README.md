# InterviewIQ 2.0

Mock interview practice for MBA placements and B-school admissions. A different AI
interviewer, round and question mix every time, scored on a recruiter-style assessment
sheet, with your delivery measured from the microphone.

## What is in this folder

| File | What it does |
|---|---|
| `index.html` | The page and all the styling |
| `app.js` | Sign-in, navigation, voice, microphone and delivery measurements |
| `interview.js` | The interviewer, the variety engine, scoring and the assessment sheet |
| `pages.js` | Home, speaking practice, history, personas, about me, reads, coach, admin |
| `api/ask.js` | The only way the app talks to Claude. Checks login and credit, charges the real cost |
| `api/speak.js` | Reads questions aloud with Google Text-to-Speech (signed-in users only) |
| `api/admin.js` | Admin tools: users, credit, settings, moderation, credit history |
| `api/config.js` | Gives the browser your public Supabase details, so you never paste them into the code |
| `lib/shared.js` | Shared server code (prices, login check). Not a page |
| `supabase-setup.sql` | The whole database. Safe to run on a new project or over your current one |
| `vercel.json` | Gives scoring up to 60 seconds to finish |
| `package.json` | Server dependency list |

---

## Upgrading your current deployment (about 15 minutes)

Your users, sessions, personas and reads all carry over.

1. **Database.** Supabase > SQL Editor > New query > paste ALL of `supabase-setup.sql` > Run.
   It only adds what is missing and moves your old data (coach limits, coach usage,
   growth areas) to their new places. Running it twice is harmless.
2. **Files.** In your GitHub repo, delete the old `index.html` and everything in the old
   `api` folder. Upload every file from this folder, keeping the `api` and `lib` folders.
3. **Vercel environment variables.** Settings > Environment Variables. You already have the
   first four; add the fifth:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `SUPABASE_URL` | Supabase > Settings > API > Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key (secret, server only) |
   | `GOOGLE_TTS_API_KEY` | your Google Cloud key |
   | `SUPABASE_ANON_KEY` | **new:** the **anon public** key from the same Supabase page |

4. **Password reset links.** Supabase > Authentication > URL Configuration. Set Site URL to
   your Vercel address and add the same address under Redirect URLs.
5. **Recommended:** Supabase > Authentication > Providers > Email > turn **Confirm email ON**.
   With it off, anyone with your link can create endless accounts to collect free credit.
6. Vercel > Deployments > Redeploy.

## Setting up from scratch

1. Create accounts on Anthropic (API key plus a small top-up), Supabase (new project) and
   Google Cloud (enable "Text-to-Speech API", create an API key, billing on; you stay in
   the free tier at this scale).
2. Run `supabase-setup.sql` in the Supabase SQL Editor.
3. Push these files to a GitHub repo and import it into Vercel.
4. Add the five environment variables above, then redeploy.
5. Do steps 4 and 5 of the upgrade list.
6. Open the app, create your account, then in the Supabase SQL Editor run (with your email):
   ```sql
   update public.profiles set is_admin = true, credits_inr = 999999 where email = 'you@example.com';
   ```
   Reload. You now see the Admin page.

---

## Money and credit

- Every AI call is priced from the tokens it actually used and charged at **₹250 per US
  dollar** of cost (your old rate). Change it with the `INR_PER_USD` variable.
- Credit is reserved in the database before each call and the real cost is settled after,
  so firing many requests at once cannot overspend a balance. Failed calls are refunded.
- A full interview typically costs about 6 to 8 US cents in AI usage (roughly ₹15 to ₹20
  at ₹250 per dollar): about half for the questions, half for the scorecard. Students need
  at least ₹8 to start one.
- Admin usage is free but still recorded, so the Admin page shows your real total spend.
- Every top-up, removal and AI charge is written to a credit history you can view in Admin.
- In Admin > Settings you control the free credit for new accounts, the number of coach
  questions per user, and (optionally) which email domains get the free credit.

Optional variables: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_MODEL_FAST`
(default `claude-haiku-5-5`, used for cheap helper tasks), `PRICES_JSON` (override
per-token prices if Anthropic changes them), `WEB_SEARCH_USD` (default 0.01 per search).

## Privacy, in plain words

Students' sessions are private to them. As admin you can see each user's balance and a
summary line per session (not full transcripts). Tell your friends that before they join.

---

## What changed in 2.0

**Interviews no longer repeat**
- Each interview gets a different interviewer (name, title, years of experience, manner),
  one of 25 opening moves, a shuffled competency plan, a rotating mix of question formats
  (behavioural, CV probe, mini case, guesstimate, current affairs, teach-it-simply,
  devil's advocate, rapid-fire and more), random curveballs, and fresh scenario seeds.
- Your last interviews' questions are passed to the interviewer as a do-not-repeat list,
  and your last five opening moves and interviewers are never reused.
- Round types: HR and fit, functional, CV deep-dive, case and guesstimate, stress, final
  round with a senior leader, B-school admission interview, or Surprise me.
- The interviewer follows research-based probing: asks for the number and its source,
  what was yours alone, what would have happened if you had not acted, explain it to a
  non-expert, push to the edge of what you know. Never more than two follow-ups on a story.
- Full interviews end properly with "Do you have any questions for me?".
- Optional company research (web search) gives the interviewer recent company news.
- Answers are known to come through speech-to-text, so mishearings are not treated as
  mistakes. Speech recognition defaults to Indian English, with Indian English voices.

**Scoring like a real panel**
- Nine competencies rated 1 to 5 with written evidence: clarity of thought, communication
  and listening, evidence and impact, business and domain knowledge, problem solving and
  judgement, self-awareness and authenticity, motivation and fit, leadership and
  ownership, composure under pressure. Untested areas are marked "Not assessed".
- A hire signal (Strong no to Strong yes), a question-by-question review, stronger
  rewrites of your two weakest answers using only your own facts, and a stricter fact check.
- The scorer sees the role and job description, extracts evidence before scoring, and does
  NOT see your past weaknesses (that comparison runs as a separate step afterwards).
- If scoring fails, nothing fake is saved; you can retry, and the interview is kept.

**Delivery, measured from your voice**
- Pace (on speaking time only), filler words, hedging words, long pauses, vocal variety in
  semitones, average answer length and time to start. Leading and trailing silence no
  longer distorts the numbers, and "I would like to" no longer counts as a filler.

**Fixes from the code review**
- All user and AI text is escaped before it reaches the page (closes the persona and
  AI-output script injection holes).
- Coach limits, credit and admin rights are enforced on the server and in the database.
- The SQL file now matches the app; reads, likes, about me and deleting sessions work on a
  fresh install.
- Microphone always stops when you end; the recording indicator shows; failed questions
  show a Retry button instead of your hidden instructions; streaks break on missed days;
  editing a newspaper title edits the right item; interviews survive a page refresh and
  can be resumed or scored later; voice works on iPhones (unlocked on your first tap).
- Reads show cover images instead of loading every PDF, and likes update in place.

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| "cannot find your Supabase details" | `SUPABASE_URL` or `SUPABASE_ANON_KEY` missing in Vercel | Add both, redeploy |
| "SUPABASE_URL looks wrong" | Extra text after `.supabase.co` | Copy the Project URL again, nothing after `.co` |
| "Server is missing ..." | That Vercel variable is missing | Add it, redeploy |
| "You are out of credit" | Balance too low | Top up from Admin |
| "This page needs its database table" | Setup SQL not run | Run `supabase-setup.sql` |
| Voice silent | Voice off in Settings, or `GOOGLE_TTS_API_KEY` missing | Settings > Test voice |
| Phone transcription slow the first time | It downloads a small speech model once | Wait once; it is cached after |
| "email rate limit exceeded" | Supabase's free email limit | Wait an hour, or use custom SMTP in Supabase |
