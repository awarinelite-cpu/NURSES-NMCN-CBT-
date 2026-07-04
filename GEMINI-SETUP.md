# Connecting Gemini AI (Study Plan & Countdown)

The "Set your NMCN exam date → personalised countdown & study plan" feature uses
Google's Gemini API. Follow ONE of the options below.

## Step 1 — Get a Gemini API key (free)
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **Create API key** and copy it (starts with `AIza...`)

## Option A — Recommended (secure, key stays on the server)

### If you deploy on Vercel:
1. Open your project on https://vercel.com → **Settings → Environment Variables**
2. Add:
   - Name: `GEMINI_API_KEY`
   - Value: *(paste your key)*
   - Environments: Production, Preview, Development
3. Click **Save**, then go to **Deployments → ⋯ → Redeploy**

That's it. The new serverless function at `/api/generate-plan` will handle all
AI requests and your key is never visible to users.

### If you deploy on Render (Node server via `server.js`):
1. Render dashboard → your service → **Environment**
2. Add `GEMINI_API_KEY` = *(your key)*
3. Save — Render redeploys automatically.

## Option B — Quick but less secure (key inside the app bundle)
Only use this if you can't use Option A. Anyone can extract the key from the
website's JavaScript or the Android APK, so restrict the key first:
- In https://aistudio.google.com → API key settings, restrict it to the
  **Generative Language API** only, and set a daily quota cap.

Then add this environment variable to your build (Vercel/Render/Netlify) and
redeploy:

```
REACT_APP_GEMINI_API_KEY=AIza...your-key...
```

## Android (Capacitor) app note
The Android app is served from a local origin, so it can't reach `/api/...` by
itself. Set this build-time variable so it knows your website's address:

```
REACT_APP_API_BASE=https://your-site.vercel.app
```

Then rebuild the web assets and re-sync Capacitor:

```
npm run build
npx cap sync android
```

## How it works after setup
1. Student taps **Set →** on the dashboard banner (or opens Study Plan page)
2. They choose exam date, weak categories, study days, hours/day and goal
3. Gemini generates a week-by-week plan using their actual performance data
4. The plan + exam date are saved to Firestore (`studyPlans/{uid}`)
5. The dashboard shows a live countdown that changes colour as the exam nears,
   and every topic in the plan has a **Drill** button that launches practice
   questions on that topic.
