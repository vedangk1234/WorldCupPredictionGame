# SETUP.md — Manual setup (Phase 1)

These are the steps **you** do by hand. ~15 minutes. None of this requires sharing
any secret with me — you paste SQL and set two public values. Do them in order.

---

## 0. Put the code in your repo

1. Copy all the files from this delivery into your local folder
   `C:\Users\vedan\Desktop\WcPrediction`.
2. Open a terminal there and install dependencies:
   ```bash
   npm install
   ```
   (Requires Node.js 18+.)

---

## 1. Create the database (Supabase)

1. Open your project: https://supabase.com/dashboard/project/ublhpyyaoapoytylrlvs
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this delivery, copy the **entire** file, paste it
   in, and click **Run**. You should see "Success. No rows returned."
   - Re-running it later is safe — it drops and recreates everything (which also
     clears game data, so only re-run intentionally).

## 2. Configure auth (important — one toggle)

Because usernames are mapped to hidden synthetic emails (`name@wc.local`), there's no
real inbox to confirm. So:

1. Left sidebar → **Authentication** → **Providers** → **Email**.
2. Make sure **Email** is enabled.
3. Turn **OFF** "Confirm email" (a.k.a. "Email confirmations"). Otherwise nobody can
   log in, because the confirmation mail goes nowhere.
4. Keep **Allow new users to sign up** ON.
5. Save.

## 3. Get your two public keys

1. Left sidebar → **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. In your project folder, create a file named **`.env.local`**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://ublhpyyaoapoytylrlvs.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-public-key-here
   ```
   (The `anon` key is safe in the browser — Row Level Security protects the data.)

## 4. Run it locally (optional sanity check)

```bash
npm run dev
```
Open http://localhost:3000 — you should see the landing page with a green dot and
**"Setup check passed"**. If it's red, the message tells you what's missing
(usually the env values or the schema not run yet).

## 5. Push to GitHub

```bash
git init                       # if not already a repo
git add .
git commit -m "Phase 1: foundation"
git branch -M main
git remote add origin https://github.com/vedangk1234/WorldCupPredictionGame.git
git push -u origin main
```
(If the remote already exists, just `git add . && git commit && git push`.)

## 6. Deploy on Vercel

1. https://vercel.com → **Add New… → Project** → import
   `vedangk1234/WorldCupPredictionGame`.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default.
3. **Environment Variables** → add the same two:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. When it finishes, open the URL — same "Setup check passed" page means
   the whole pipeline (GitHub → Vercel → Supabase) is green.

## 7. Make yourself admin — *after Phase 3 adds signup*

The signup screen arrives in Phase 3. Once it exists:
1. Sign up in the live app with your name + username + password.
2. Back in Supabase → **SQL Editor**, run (use the username you chose):
   ```sql
   update public.profiles set is_admin = true where username = 'vedang';
   ```
3. Refresh the app — you now have access to the admin panel.

---

### What's next
- **Phase 2:** I deliver the admin panel + seed data (teams, squads, all 72
  fixtures) + the scoring engine. You'll run one more seed SQL file and start setting
  underdogs.
- **Phase 3:** the prediction pages and leaderboards for everyone.

Tell me when the "Setup check passed" page is live (or if anything goes red) and I'll
ship Phase 2.
