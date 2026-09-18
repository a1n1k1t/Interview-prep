# InterviewIQ — put this online (no coding needed)

You'll create 2 free accounts and do some clicking. About 15 minutes.

## 1. Get a Claude API key
1. Go to console.anthropic.com and sign up / log in.
2. Go to **Settings → API Keys → Create Key**. Copy it somewhere safe — you'll paste it once, in step 4.
3. Under **Billing**, add a small credit top-up (even $5 is enough for months at daily practice — see cost notes below).

## 2. Put this project on GitHub
1. Go to github.com and create a free account if you don't have one.
2. Click **New repository**, name it `interviewiq`, keep it **Private**, click Create.
3. On the new repo's page, click **uploading an existing file**, then drag in all 3 files/folders from this download (`index.html`, `api/ask.js`, `package.json`, `README.md`). Commit.

## 3. Deploy on Vercel
1. Go to vercel.com, sign up using your GitHub account (one click).
2. Click **Add New… → Project**, pick your `interviewiq` repo, click **Import**.
3. Leave all settings as default. Click **Deploy**. Wait ~1 minute.

## 4. Add your API key
1. In the Vercel project, go to **Settings → Environment Variables**.
2. Add: Name = `ANTHROPIC_API_KEY`, Value = the key you copied in step 1.
3. Go to **Deployments**, click the "..." menu on the latest one, click **Redeploy**.

## 5. Done
Vercel gives you a URL like `interviewiq-yourname.vercel.app`. Open it on your phone or laptop — that's your app, live, with no Claude.ai needed.

## Notes
- History and guest profiles are stored in your browser (not a shared server), so they stay on whichever device you use — no login needed, but it also means switching devices starts fresh.
- Live transcription works in Chrome/Edge; other browsers fall back to typing your answer.
- Cost: with daily 10-min practice, expect well under $1/month on the API — see the pricing math from earlier in this conversation. Nothing charges until you use it.
- To update the app later: edit the file on GitHub (or ask an AI to edit it for you), commit — Vercel redeploys automatically.
