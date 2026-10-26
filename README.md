# A/B Gym Tracker

An offline-first web app for logging an A/B machine split on your phone. It shows last session's numbers, prefills weights, suggests when to add weight (double progression), and runs a rest timer. Data stays on the device in IndexedDB. There are no accounts, no backend, and no tracking.

## Stack

- Plain HTML, CSS, and JavaScript ES modules. No framework, no build step, no runtime dependencies.
- PWA: `manifest.webmanifest`, an offline service worker (`sw.js`), and icons.
- Storage: IndexedDB (`kv` store for program and settings, `sessions` store for workouts). `localStorage` holds only small UI state (rest timer, scroll position, dismissed banners).
- Tests: Node's built-in test runner (`node --test`).

```
app/                    ← the deployable static site
  index.html
  manifest.webmanifest
  sw.js                 service worker (cache-first app shell)
  css/app.css
  js/seed.js            default program (gym + home) + settings
  js/updates.js         one-time program updates for existing installs
  js/cut-config.js      fat-loss phase plan: every number the cut module uses
  js/cut.js             pure cut logic: week math, averages, e1RM, Sunday rule engine, checkpoints
  js/logic.js           pure logic: nextDay, suggestWeight, lastPerformance, deloadStatus, …
  js/backup.js          pure export/import planning + CSV
  js/db.js              IndexedDB wrapper
  js/chart.js           tiny inline-SVG line chart
  js/app.js             UI, router, rest timer, wake lock
  icons/
tests/                  unit tests for logic.js and backup.js
scripts/make-icons.mjs  regenerates PNG icons from icons/icon.svg (Playwright)
.github/workflows/pages.yml
```

## Run locally

Requires Node 18+ (only for the dev server and tests).

```sh
npm start          # serves ./app at http://localhost:8080
npm test           # unit tests
```

Any static server works (`python3 -m http.server -d app 8080`). Service workers need `localhost` or HTTPS.

To test on your phone over Wi-Fi, use the deployed HTTPS site. Over plain `http://<lan-ip>`, service workers and install don't work.

**Service worker in development:** the app shell is cache-first, so after editing files either tick *Update on reload* in DevTools → Application → Service Workers, or change `VERSION` in `app/sw.js`. The deploy workflow stamps the commit SHA into `VERSION` automatically, so each deploy ships a fresh cache and the app shows an *Update now* banner on the home screen.

## Build

There is no build step. `app/` is the production output.

## Deploy to GitHub Pages

1. Push this repo to GitHub. The workflow `.github/workflows/pages.yml` runs the tests on every push and deploys `app/` from the **default branch**.
2. In the repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Pages on a private repo needs a paid GitHub plan; otherwise make the repo public.
3. Merge to the default branch, or run the workflow by hand from the **Actions** tab (*Run workflow*).
4. Open `https://<user>.github.io/<repo>/`. For this repo that's **https://jareddubey.github.io/Exerciseapp/**.

Netlify or any other static host works too: publish the `app/` directory, with no build command.

## Install on iPhone

1. Open the URL in **Safari** (not an in-app browser).
2. Tap **Share → Add to Home Screen**.
3. Launch it once from the Home Screen icon while online. After that it works in airplane mode.

iOS can delete website data for sites that go unused. Installing to the Home Screen protects against that, but keep exporting backups (**Settings & backup → Export backup**). The app reminds you after 14 days.

## How it works

- **Gym or Home**: a toggle on the start screen picks where you're training. Home A/B work the same muscle groups as gym A/B with dumbbells, a pull-up bar, bands and an incline bench. Home sessions count in the same A/B rotation. Home exercises have their own ids, so their history and progression are separate from the gym; exercises that are truly the same (dead bug) share an id. Edit the home days under **Program → Home**.
- **Load types**: each exercise is *Weight*, *Dumbbells* (logged per hand, shown as "lb ea"), *Bodyweight* (reps only) or *Band* (reps only; note the band in the exercise note). A band exercise shows **↑ Stronger band** once every set reaches the top of the rep range.
- **Program updates**: changes to the default program ship as one-time updates (`app/js/updates.js`) that run on launch, work by exercise id so your own edits are kept, and show a home-screen notice with **Undo**.
- **Next session**: the opposite of the last finished one, which gives A/B/A then B/A/B. The home screen also lets you start the other day.
- **Prefill**: each set's weight comes from last time. Reps stay blank; the greyed placeholder shows last time's reps. The first tap on − or + fills that number in.
- **Double progression**: if every set last time reached `repMax` (with at least the programmed number of sets), weights prefill at `+increment` and an **↑ Add 5 lb** badge appears. Deload sessions don't count as the basis. It's only a prefill, so you can always change it.
- **Weight stepper**: the card's −/+ changes all *unticked* sets. Typing a weight in one set carries it to later unticked sets that had the same value.
- **Shared exercises**: exercises with the same `id` share history and progression. For example, `biceps_curl` appears in both A and B. In the program editor, add an exercise from the *Exercise* dropdown to reuse it on the other day.
- **Swap vs. rename**: *Edit* keeps the id, so history continues. *Swap* creates a new exercise, and the old history stays under the old id.
- **Swap mid-workout**: each exercise card has **⇄ Swap**. Pick a known exercise or enter a new one. It applies to this workout only, unless you tick *Also replace it in the program*. An untouched exercise is replaced in place. One that already has logged sets is kept, and the new one is added after it.
- **Edit mid-workout**: each exercise card has **✎ Edit** to change its name, cue, load type, sets, rep range, rest, increment and reps-per-side. It keeps the same id, so history and progression continue. It applies to this workout only, unless you tick *Also save to the program*, which updates every day the exercise appears on. Lowering sets removes only empty sets from the end; sets with reps or a tick are kept. In a deload session the Sets field is today's count, and the program gets one more.
- **Deload**: after 6 weeks (counted from the last deload, or from your first session), a banner offers *Start deload week* (7 days, one set less per exercise) or *Deload done* (resets the counter).
- **Autosave**: every input is saved as you type. An unfinished session reopens where you left it, including the rest timer and scroll position.
- **Rest timer**: ticking a set starts it. It vibrates where supported (not on iOS), beeps (optional; iOS mutes it with the silent switch), and flashes the bar. While a session is open, Screen Wake Lock keeps the display on where supported.
- **Units**: lb by default; switch to kg in settings. Each session records its unit and is converted for display and suggestions. Program increments convert too (5 lb ↔ 2.5 kg).

## Cut tracking

A 12-week fat-loss phase module. It **recommends** calorie changes every Sunday from fixed rules; it never changes the target until you tap **Accept**.

- **Plan**: all numbers live in `app/js/cut-config.js` (`DEFAULT_CUT_CONFIG`). The device keeps an edited copy (Settings → Cut plan); missing keys fall back to the defaults.
- **Logging**: daily weigh-in on the home screen (one per date; a second entry asks before replacing), optional body fat % (display only, never used by rules) and note. Waist on the Sunday check-in, two readings averaged. Holidays and 3-5 main lifts under cut settings. Main lifts reuse your logged workout sets; no separate lift log.
- **Weeks**: week N is the Mon-Sun ending on the Nth Sunday after the start date. Dates are stored as local `YYYY-MM-DD` days, so DST can't move a weigh-in between weeks.
- **Rules** (`evaluateWeek` in `cut.js`), from week `firstRuleWeek` on, over this week plus the previous non-skipped week(s):
  1. Skip a week with a holiday or fewer than `minWeighinsPerWeek` weigh-ins. It neither counts toward nor resets a streak.
  2. Slow loss (< 0.5 lb/wk) both weeks and main lifts down this week → no change, review sleep/recovery/intake.
  3. Loss > 1.25 lb/wk or main lifts down, both weeks → +150 kcal.
  4. Slow loss both weeks → −150 kcal, unless that goes below the floor ("At calorie floor: review plan").
  5. Otherwise on track.
  Only weeks ≥ `firstRuleWeek` count toward a streak, so the earliest recommendation is week 4. Accepting resets the streaks; dismissing doesn't.
- **Strength**: Epley e1RM `weight × (1 + reps/30)` from sets of 1-12 reps, kg sessions converted to lb. A lift is down when its best e1RM is more than 2% below the previous week's; main lifts are down when more than half of those trained in both weeks are.
- **Weekly change** is the previous week's average minus this week's (week 1 vs the start weight). If the previous week has too few weigh-ins, the last full week is used, divided by the weeks between.
- **Checkpoints** pass when that week's average weight and that Sunday's waist (or the latest in the 7 days before) are both at or under the max.
- **Dashboard** (`#/cut`): weight chart (daily dots, 7-day average shown with 4+ entries in the window, dashed target line, shaded on-track band, checkpoints, holidays), waist chart with goal range, best e1RM per week per main lift, status tiles, and a weekly table. Tap or drag a chart to read values.

## Backup format

The JSON export holds `{ format: "ab-gym-tracker", version: 2, exportedAt, program, settings, sessions, cut }`. Version 1 files (no `cut`) still import. Cut entries missing on this device are added; entries that differ, and a different plan or main-lift list, are only replaced if you confirm. Import merges by session id: new sessions are added; sessions that already exist with different content are only replaced if you confirm; a different program is only applied if you confirm.

The CSV export has columns `date, session, exercise, set, weight, reps, note, unit, deload, location`.
