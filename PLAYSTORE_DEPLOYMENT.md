# Clario — Play Store Deployment Guide

Full process to publish the Android app (`.aab`) to Google Play.

---

## What's already done ✅
- App name (home screen): **Clario**
- Play Store listing title: **Clario: Mood Tracker & Calm** (set in Play Console, step 4)
- Square 1024×1024 icons generated (`icon.png`, `adaptive-icon.png`)
- All `expo-doctor` checks pass (21/21)
- TypeScript compiles clean
- Production `.aab` build running on EAS (`buildType: app-bundle`)
- Backend live on Render (`https://echo-yg4t.onrender.com`)
- Signing keystore exists on EAS servers (managed credentials)

---

## STEP 1 — Get the `.aab` file

The EAS build produces an Android App Bundle. When the build finishes:

```bash
cd clario-app/clario-mobile
eas build:list --platform android --limit 1
```

Download the `.aab` from the build page (link printed in the build output), OR
have EAS submit it directly (see Step 6).

---

## STEP 2 — Google Play Console account (one-time, $25)

1. Go to https://play.google.com/console
2. Sign up with your Google account (**shahsudha259@gmail.com**)
3. Pay the **one-time $25** registration fee (needs an international card)
4. Choose account type:
   - **Personal** — quick, no extra verification for individuals
   - **Organization** — needs a D-U-N-S number (skip unless you have a company)
5. Complete identity verification (they may ask for ID + address). This can take
   a few hours to 2 days — **do this early.**

> ⚠️ New personal developer accounts created after Nov 2023 must run a
> **12-tester / 14-day closed test** before they can publish to production.
> See Step 5b — plan for this, it affects your timeline.

---

## STEP 3 — Create the app in Play Console

1. **Create app** → fill in:
   - App name: `Clario: Mood Tracker & Calm`
   - Default language: English (US)
   - App or game: **App**
   - Free or paid: **Free** (in-app subscriptions are separate)
2. Accept the declarations.

---

## STEP 4 — Store listing (use the ASO copy)

**Main store listing** → fill in:

| Field | Value |
|---|---|
| App name | `Clario: Mood Tracker & Calm` |
| Short description (80) | `Track your moods, beat stress & build calming daily rituals. Feel better daily.` |
| Full description (4000) | *(see ASO doc — the full description block)* |

**Graphics (required):**
- **App icon**: 512×512 PNG (export from `icon.png`)
- **Feature graphic**: 1024×500 PNG (banner — make one in Canva/Figma)
- **Phone screenshots**: min 2, up to 8 (1080×1920 or similar). Use your best
  screens: garden → mood tracking → daily check → breathing.

---

## STEP 5 — Set up the release

### 5a. Upload the bundle
1. **Release → Testing → Internal testing** (start here, safest)
2. **Create new release**
3. Upload the `.aab` file
4. Add release notes (e.g. "First release 🌱")
5. **Save → Review release → Start rollout to Internal testing**

### 5b. Closed testing (required for new personal accounts)
- Add **12+ testers** (emails) to a closed test track
- Keep the test running **14 days minimum**
- Then you unlock production access

> Tip: use your 200 existing users / friends as the 12 testers to satisfy this fast.

### 5c. Promote to Production
Once eligible: **Release → Production → Create release → promote the tested build.**

---

## STEP 6 — (Optional) Automated submission with EAS

Instead of manual upload, you can push builds straight to Play with one command.
Requires a **Google service account key**:

1. Play Console → **Setup → API access** → create/link a Google Cloud project
2. Create a **service account**, grant it "Release manager" permission
3. Download the JSON key → save as `clario-mobile/google-play-key.json`
   *(already referenced in `eas.json`; keep it gitignored — it's a secret)*
4. Then:
```bash
cd clario-app/clario-mobile
eas submit --platform android --profile production --latest
```
This uploads the newest EAS build to the **internal** track automatically.

---

## STEP 7 — Required compliance forms (Play won't publish without these)

In Play Console → **Policy / App content**, complete ALL of:
- [ ] **Privacy policy URL** (required — host a page; you have a website)
- [ ] **Data safety** form (declare: you collect email, audio, usage data; encrypted in transit)
- [ ] **Content rating** questionnaire (health/wellness → likely "Everyone")
- [ ] **Target audience** (13+ — NOT children, avoids strict rules)
- [ ] **Ads** declaration (you have none → "No ads")
- [ ] **Government app** → No
- [ ] **Financial features** → No (unless you disclose subscriptions here)
- [ ] **App access** — give Google a test login (create a demo account so
      reviewers can get past your paywall/login)

---

## STEP 8 — In-app subscriptions (for revenue)

To charge weekly/monthly/yearly via Play:
1. Play Console → **Monetize → Products → Subscriptions**
2. Create 3 base plans (weekly / monthly / yearly) with **USD** pricing
3. Google auto-converts to local currency for each country
4. Wire Play Billing into the app (RevenueCat is the easiest path for Expo)

> For launch you can ship free + trial and add Play Billing in the next update.

---

## Timeline reality check
- Account verification: hours–2 days
- Closed test (new accounts): **14 days** ← the real bottleneck
- Review after submitting: usually 1–3 days
- **Start the Play Console account + closed test NOW** so it's ready.

---

## Common rejection reasons (avoid these)
- No privacy policy URL → **host one before submitting**
- Reviewers can't log in → **provide a demo account in "App access"**
- Data safety form doesn't match actual data use → be accurate
- Microphone permission with no clear in-app explanation → your voice feature covers this
