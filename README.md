# Pedro Makes It to Game Night

**Play it:** https://brendonegouveia-ops.github.io/pedro-game/

3D lane-dodger. Pedro is driving his brand-new silver Jetta to game night at Carlson's, way too fast, every week.

- **Weeks are levels.** Each week is one drive to game night: Week 1 is 10 miles, Week 2 is 12, and so on (+2 mi a week, capped at 25). Every week starts further up the difficulty curve and tops out faster (165 mph in Week 1, +3 mph a week up to 195). Each week's game night has its own theme (Catan night, Poker night, Mario Kart night…).
- **Checkpoints.** Making it to game night pays a bonus (3,000 + 1,000 per week, plus 500 per chouriço link left), Pedro says something, and the next week unlocks. A wreck retries the same week. Links refill every week. Progress is saved on the phone, and the title screen has a week picker (◀ ▶, or ← → on a keyboard) for any week you've reached.
- **Weather.** Weeks 1–2 are clear. Week 3 is rain: the fog pulls in, so traffic shows up about 2 s out instead of 3. Week 4 is snow. From Week 5 on, each week is rain or snow (fixed per week number, so Week 7 is always the same weather).
- **Road work** (from Week 2, in the later part of each week, earlier as the weeks go on): an edge lane closes for 220–480 m. An arrow board flashes which way to merge, an orange diamond sign stands on the shoulder before it, and cones and barrels line the closed lane. It never closes the lane you need: the fairness check treats it as a blocker for its whole length.
- **Snow hazards.** *Snowplow trains*: 2–3 slow orange plows staggered across adjacent lanes, always leaving a reachable lane open. *Black ice*: shiny blue patches in the two middle lanes. Steering onto one carries you one more lane in the same direction (with a fishtail, a skid and a Pedro line). Driving straight over it is fine, and the guaranteed lane never runs through ice.
- **Final stretch.** Two miles out, Carlson turns the speakers up: the accordion music builds and drops into dubstep. The last ~200 m before the driveway are traffic-free.
- **Coins** along the road pay extra, and a full trail earns a bonus. Many trails run straight at a car, so grabbing them all means swerving out at the last second.
- **How to Play** opens on the first visit (and from the ❓ button on the title screen): rules, lives, coins, tailgaters, every power-up.

- **Lives:** Pedro has **3 chouriço links** (bottom-left). Every hit costs one, he says something like "I can fix that", and the Jetta looks more beat-up: scuffs and a cracked window, then duct tape, a smashed taillight and smoke. The third hit ends the run.
- **Tailgaters:** a rear-view mirror pops up at the top of the screen when they're coming. It has one column per lane with Pedro's car at the top, and each tailgater is a red dot sliding up its lane (several at once, side by side if they share a lane). If one is in your lane, that column flashes and a **MOVE!** tag appears.
- **Music:** an original synthesized Portuguese *corridinho*-style accordion dance (2/4, parallel thirds, musette reeds, oom-pah bass, ferrinhos) that speeds up with the car. In each week's final two miles it builds and drops into dubstep (wobble bass, half-time drums).
- **Phone:** swipe left/right, or tap the left/right half of the screen. Buttons bottom-right: pause, music, sound.
- **Desktop:** ← → or A / D. P pauses, M mutes everything, N toggles music. After a drive, Space retries the week (or starts the next one if you made it).
- The whole game is the single file `index.html` (Three.js `0.169.0` loads from jsdelivr). There's no build step. It runs from GitHub Pages or straight from disk (`file://`, needs internet for Three.js).

## Tweaking the game

Everything tunable lives in the `CONFIG` object at the top of the `<script id="pedro-core">` block in `index.html`. Edit a number, commit, and Pages redeploys within a minute or so. Common knobs:

| What | CONFIG key(s) |
|---|---|
| Start / top speed (mph) | `startSpeedMph` (80), `maxSpeedMph` (165) |
| How fast it gets hard | `difficultyCurve`, a list of `[miles, 0..1]` points. Week 1 uses it as-is: starts at 0.22 (no warm-up), full brutality at mile 9 (~4 min) |
| Weeks | `weekBaseMiles` (10), `weekMilesStep` (2), `weekMaxMiles` (25): week length. `weekDifficultyStep` (0.13) / `weekDifficultyCap` (0.85): how far up the curve each week starts. `weekTopSpeedStepMph` (3) / `weekTopSpeedCapMph` (195): top speed per week |
| Week rewards | `weekBonus` (`[3000, 1000]` = 3,000 + 1,000 × (week − 1)), `weekLifeBonus` (per link left) |
| Final stretch | `weekDropMiles` (dubstep drop, 2 mi out), `weekFinishClearMeters` (traffic-free run-in), `finishSec` |
| Weather | `weatherWeeks` (`['clear', 'clear', 'rain', 'snow']` for weeks 1–4), `weatherRotate` (what later weeks pick from), `weather.{clear,rain,snow}.fogNear/fogFar` (visibility) |
| Road work | `closureMinWeek` (2), `closureChance`, `closureMeters`, `closureGapMeters`, `closureStartFrac` / `closureStartFracStep` / `closureStartFracMin` (how far into a week closures start) |
| Snowplows | `plowChance`, `plowTrioChance`, `plowStaggerMeters`, `plowSpeedFrac`, `hazardSize.plow` |
| Black ice | `iceChance`, `iceMeters`, `iceSlideMs` |
| Coins | `coinPoints`, `coinTrailBonus`, `coinTrailChance`, `coinTrailMin`/`Max`, `coinRiskyChance`, `coinBailSec` |
| Lives | `lives` (3), `hitGraceSec` (invulnerable time after a hit) |
| Speech bubble time | `speechSec` |
| Music | `musicVolume`, `musicBpm` |
| Traffic density | `rowGapSec` (gap between waves at difficulty 0 → 1), `rowLanesBlocked`, `emptyRowChance` |
| When hazards appear | `unlockMiles` (trucks, cones/debris, lane-changers, tailgaters) |
| Hazard mix | `hazardWeights`, `changerChance`, `tailgaterChance` |
| Lane-changer telegraph | `blinkerSec` (0.75 s) |
| Forgiveness | `hitboxScale` (0.8 = hitboxes are 80% of the visual size), `reactionSec` |
| Lane-change feel | `laneChangeMs` (150) |
| Scoring | `pointsPerMeter`, `nearMissPoints`, `nearMissMargin`, `lateDodgeSec` |
| Power-ups | `powerupChance`, `powerupBag` (a shuffled deck, order: Full Coverage, Brake Check, Fresh Detail, Donut, Chouriço; default 4/4/3/4/1 = one chouriço per 16 power-ups, never the same one twice in a row), `brakeCheckSec`, `freshDetailSec`, `donutSec`, `donutSpeedMult` |
| Camera | `fovBase`, `fovMax`, `shakeMax`, `camHeight`, `camBack` |
| Share link | `shareUrl` |

Speeds and the HUD are in mph and miles. Internally the world uses meters (1 unit = 1 m), so a few spawn-distance keys end in `Meters`.

### Adding roast lines and Pedro's one-liners

These arrays sit right below `CONFIG`. Add a string per inside joke:

| Array | When it shows |
|---|---|
| `ROASTS` | Game-over screen. `{miles}` and `{score}` are filled in. |
| `LIFE_LOST_LINES` | Speech bubble every time Pedro loses a chouriço link ("I can fix that", "My insurance will cover it"…). |
| `HIT_LINES` | Bumps that don't cost a life: shield hits, plowing during Fresh Detail ("Ayo, my bad"…). |
| `REPAIR_LINES` | Grabbing the rare chouriço. |
| `DONUT_LINES` | Grabbing a donut. |
| `WEEK_COMPLETE_LINES` | Making it to game night (week-complete screen). `{week}` is filled in. |
| `GAME_NIGHTS` | What's on the table each week (cycles): "Catan night", "Poker night"… |
| `ROADWORK_LINES`, `PLOW_LINES` | The first road closure / plow train of a drive. |
| `ICE_LINES` | Sliding on black ice. |

`ROASTS` also fill in `{left}` (miles short of game night) and `{week}`.

```js
const ROASTS = [
  "Another Jetta, another insurance claim.",
  "Pedro's new Jetta lasted {miles} miles.",
  "The group chat has been notified.",
  // add yours here
];
```

## Power-ups

| Power-up | Effect |
|---|---|
| 🛡 **Full Coverage** | Absorbs one crash (blue bubble). |
| ⏱ **Brake Check** | 4 s of slow motion. |
| ✨ **Fresh Detail** | 5 s of invincibility. The car glows and traffic bounces aside. |
| 🍩 **Donut** | Sugar rush: drive 30% faster for 5 s (more points per second, too). |
| ❤ **Chouriço** (very rare) | Gives back one chouriço link and repairs one stage of damage. At full links it's worth points instead. |

Only one timed effect runs at a time; a new one replaces the old one. Full Coverage sits in its own slot and lasts until it's used, and a hit it absorbs doesn't cost a link.

## Leaderboard

After each drive, players can type a name and add their score. **🏆 Leaderboard** on the title and game-over screens shows the top 10, ranked by score. Each row shows which week the score came from.

**Adding the week column to an existing board** (one-time, for boards set up before weeks existed). In Supabase, open **SQL Editor → New query**, paste, and click **Run**:

```sql
alter table public.scores add column if not exists week integer not null default 1 check (week between 1 and 999);
notify pgrst, 'reload schema';
```

Scores already on the board become Week 1. Until this runs, the game keeps working: it saves and reads scores without the week, and rows just don't show one.

The board is **shared by everyone**: it's connected to a Supabase project through `leaderboardUrl` / `leaderboardKey` in `CONFIG`. Phones that saved scores before the board went online get asked once whether to add them to the shared board. Duplicates are skipped, and the **Add them** button stays in the board until it's used.

If you blank out those two values, the game falls back to a per-device board. To point it at a different Supabase project (about 5 minutes):

1. Create a free account and a new project at https://supabase.com. Any name and region work.
2. In the project, open **SQL Editor → New query**, paste this, and click **Run**. It's safe to re-run; Supabase may warn about "destructive operations" because of the two `drop policy if exists` lines, which only replace the access rules:

   ```sql
   create table if not exists public.scores (
     id bigint generated always as identity primary key,
     name text not null check (char_length(name) between 1 and 16),
     score integer not null check (score between 0 and 5000000),
     miles real not null check (miles between 0 and 500),
     week integer not null default 1 check (week between 1 and 999),
     created_at timestamptz not null default now()
   );
   alter table public.scores enable row level security;
   drop policy if exists "anyone can read scores" on public.scores;
   drop policy if exists "anyone can add a score" on public.scores;
   create policy "anyone can read scores" on public.scores for select to anon using (true);
   create policy "anyone can add a score" on public.scores for insert to anon with check (true);
   grant select, insert on public.scores to anon;
   alter table public.scores add column if not exists week integer not null default 1 check (week between 1 and 999);
   create index if not exists scores_score_idx on public.scores (score desc);
   notify pgrst, 'reload schema';
   ```

3. Open **Project Settings → API** (called **API Keys** / **Data API** in newer dashboards) and copy:
   - the **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the public **anon** key, or the **publishable** key (`sb_publishable_…`). Never use the `service_role` / secret key.
4. Paste both into `CONFIG` in `index.html`:

   ```js
   leaderboardUrl: 'https://abcdefgh.supabase.co',
   leaderboardKey: 'sb_publishable_…',
   ```

Both values are designed to be public. The table policies only allow reading scores and adding new ones; nobody can edit or delete rows from the game. Anyone determined could still post a fake score with that key, which is fine for a friend group. To remove a bogus entry, delete the row in Supabase's **Table Editor**.

## Fairness guarantee

Traffic comes in rows from a seeded PRNG (mulberry32). Every row is validated before it is committed: it must leave a **guaranteed-open lane** that Pedro can reach from the previous row's open lane within the clear gap between the rows. Each lane change counts as `laneChangeMs + reactionSec` at the speed Pedro will be doing when he gets there, multiplied by `donutSpeedMult`, so the guarantee holds even mid-donut. Every move also has to leave 1.5 m of spare room. Lane-changers count as blocking both of their lanes, and tailgaters count as blocking theirs. A row that fails is regenerated, up to 8 tries, then replaced with an empty row.

Road closures span many rows, so they get extra rules: a closure starts exactly where a row starts, ends exactly where a row ends, only ever closes an edge lane that isn't the lane Pedro is guaranteed to be in, and its lane counts as blocked in every row (and every gap) along the way. Black ice counts as blocked for the guaranteed lane (you're never forced onto it). Snowplow trains are ordinary rows of slow, long vehicles.

- **Replay a run:** the game-over screen shows its seed. Open `…/pedro-game/?seed=12345` to replay that exact traffic. The seed applies to the first run only; restarting goes back to fresh random runs.
- **See the guarantee:** add `?debug` to the URL (e.g. `?debug&seed=12345`). A green strip marks each row's guaranteed-open lane, and a panel shows fps, difficulty, and spawner stats. `?debug&start=2.5` starts the run at mile 2.5, and `?debug&week=4` jumps to Week 4.

## Verification tools (`/tools`)

None of this is needed to play; it's for checking changes before pushing.

```sh
cd tools && npm install
node fairness.mjs            # weeks 1, 3, 6, 11 × 10 seeds × 1,000 rows, independent fairness check (no browser)
node fairness.mjs 1000 10 --weeks=1,2,3,4,5   # pick the weeks
node fairness.mjs 1000 3 --mutate=closure --weeks=2,4   # also: --mutate=ice; each sabotage must be caught
node fairness.mjs 1000 3 --mutate   # sabotages the spawner to prove the checker catches violations
node smoke.mjs               # headless Chromium at iPhone size: input, crash, power-ups, audio, share, autopilot
node smoke.mjs --quick       # same, minus the two long autopilot runs
```

- `fairness.mjs` re-derives every hitbox interval and each week's difficulty offset and top speed from `CONFIG` instead of trusting the spawner. It checks each row's guaranteed lane, that no move between rows crosses a closed lane, that closures start and end on row boundaries, then runs a brute-force path search over the whole run. It also fails if closures, plows or ice show up in a week where they don't belong (or never show up where they do).
- `smoke.mjs` fails on any console error and writes screenshots to `tools/out/`.
- Its autopilot drives with real key events, following the guaranteed lane and dodging as late as it safely can. It must get through the first 30 s, the run-in to game night at the end of Week 1, full-difficulty Week 6 (rain + road work) at ~180 mph, and a Week 4 snow stretch with plows, black ice and road work **without taking a single hit or sliding on ice**.

## Notes

- **iPhone sound:** sound starts on your first tap (an iOS rule). The game tells iOS it's media playback, so it plays through the speaker even with the ring/silent switch on (iOS 16.4+ uses `navigator.audioSession`; older versions use a silent looping audio element). Use the in-game 🔊 / ♪ buttons to mute.
- **Saved data:** the high score, unlocked weeks, and mute setting live in `localStorage`. Private browsing just doesn't save them.
- **Battery:** the game pauses automatically when you switch tabs or lock the phone; tap to resume.
