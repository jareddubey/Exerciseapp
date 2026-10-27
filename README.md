# Gym Tracker

An offline-first web app for logging a 3-day full-body program (Mon/Wed/Fri) plus a Tue/Thu "Armor" day (core, hips, shoulder) on your phone. It shows last session's numbers, prefills weights, suggests when to add weight (double progression), and runs a rest timer that walks you through paired exercises. Data stays on the device in IndexedDB. There are no accounts, no backend, and no tracking.

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
  js/logic.js           pure logic: nextDay, suggestWeight, pairs, deloadStatus, …
  js/backup.js          pure export/import planning + CSV
  js/db.js              IndexedDB wrapper
  js/chart.js           tiny inline-SVG line chart
  js/app.js             UI, router, rest timer, wake lock
  icons/
tests/                  unit tests for logic, program, updates and backup
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

- **Days**: Mon, Wed and Fri are full body; Armor is for Tue and Thu: recovery, mobility and motor control, about 50 min (supported dead bug, bird dog, side plank, hip flexor stretch, and the shoulder control drills: right-shoulder superset, supine DB fly, row to ER), followed by Zone 2 cardio such as a long dog walk. Light shoulder drills build centering rather than muscle, so their cue is to end a set when the shoulder stops feeling centered, not at failure. Lifting days open with a warm-up note and the right-shoulder superset as an easy 2-set primer, so shoulder control work is daily. Every day ends with a right posterior capsule stretch, alternating: sleeper stretch on lifting days, cross-body stretch on Armor.
- **Next session**: today's scheduled day. If it's already done today, or on a weekend, the first lifting day not yet done this week (Mon-Sun), else Armor. The home screen also lets you start any other day. Sessions from the old A/B program keep their A/B labels in history.
- **Pairs**: exercises with the same pair letter on a day (A1, A2) alternate sets and are grouped together in the session. Each exercise's rest is the rest *after* it, before the next one, so A1 → short rest → A2 → longer rest → A1. The rest timer names what's next and moves on to the next pair when one is finished. Set the letter under **Program → Edit → Pair letter**.
- **Gym or Home**: a toggle on the start screen picks where you're training. Home Mon/Wed/Fri work the same patterns with dumbbells, a pull-up bar, bands and an incline bench; Armor is the same in both places. Home exercises have their own ids, so their history and progression are separate from the gym; exercises that are truly the same (lateral raise, push-up, Armor) share an id. Edit the home days under **Program → Home**.
- **Load types**: each exercise is *Weight*, *Dumbbells* (logged per hand, shown as "lb ea"), *Bodyweight* or *Band* (no weight; note the band in the exercise note), or *Bar height* (the weight column holds the notch, e.g. incline push-ups). When every set reaches the top of the range, a band shows **↑ Stronger band**, a bar height **↓ Lower the bar a notch**, and a bodyweight exercise with a range **↑ Harder variation**.
- **Reps, seconds or meters**: each exercise counts reps, seconds (holds such as side plank) or meters (carries). The −/+ buttons move seconds and meters by 5.
- **Program updates**: changes to the default program ship as one-time updates (`app/js/updates.js`) that run on launch and show a home-screen notice. Small updates work by exercise id and offer **Undo**; the 3-day redesign replaced the A/B program and has no Undo.
- **Prefill**: each set's weight comes from last time on the same day if there is one (hack squat is heavy on Monday and lighter on Friday), otherwise from the latest session of any day. Reps stay blank; the greyed placeholder shows last time's reps. The first tap on − or + fills that number in.
- **Double progression**: if every set last time reached `repMax` (with at least the programmed number of sets), weights prefill at `+increment` and an **↑ Add 5 lb** badge appears. Deload sessions don't count as the basis. It's only a prefill, so you can always change it.
- **Weight stepper**: the card's −/+ changes all *unticked* sets. Typing a weight in one set carries it to later unticked sets that had the same value.
- **Shared exercises**: exercises with the same `id` share history. Name, cue and load are the same everywhere; sets, rep range, rest and pair belong to each day, so editing them on Monday leaves Friday alone. In the program editor, add an exercise from the *Exercise* dropdown to reuse it on another day.
- **Swap vs. rename**: *Edit* keeps the id, so history continues. *Swap* creates a new exercise, and the old history stays under the old id.
- **Swap mid-workout**: each exercise card has **⇄ Swap**. Pick a known exercise or enter a new one. It applies to this workout only, unless you tick *Also replace it in the program*. An untouched exercise is replaced in place. One that already has logged sets is kept, and the new one is added after it.
- **Edit mid-workout**: each exercise card has **✎ Edit** to change its name, cue, load type, sets, rep range, rest, increment and reps-per-side. It keeps the same id, so history and progression continue. It applies to this workout only, unless you tick *Also save to the program*: name, cue and load change on every day the exercise appears on, sets, reps and rest on this day only. Lowering sets removes only empty sets from the end; sets with reps or a tick are kept. In a deload session the Sets field is today's count, and the program gets one more.
- **Deload**: after 6 weeks (counted from the last deload, or from your first session), a banner offers *Start deload week* (7 days, one set less per exercise) or *Deload done* (resets the counter).
- **Autosave**: every input is saved as you type. An unfinished session reopens where you left it, including the rest timer and scroll position.
- **Rest timer**: ticking a set starts it. It vibrates where supported (not on iOS), beeps (optional; iOS mutes it with the silent switch), and flashes the bar. While a session is open, Screen Wake Lock keeps the display on where supported.
- **Units**: lb by default; switch to kg in settings. Each session records its unit and is converted for display and suggestions. Program increments convert too (5 lb ↔ 2.5 kg).

## Backup format

The JSON export holds `{ format: "ab-gym-tracker", version: 3, exportedAt, program, settings, sessions }`. Version 1 and 2 files still import: their sessions merge as usual, a `cut` record (from the removed cut tracker) is ignored, and an old A/B program is not applied. Import merges by session id: new sessions are added; sessions that already exist with different content are only replaced if you confirm; a different program is only applied if you confirm.

The CSV export has columns `date, session, exercise, set, weight, reps, note, unit, deload, location`.
