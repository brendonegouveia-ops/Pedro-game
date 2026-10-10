# Pedro Makes It to Game Night

**Play it:** https://brendonegouveia-ops.github.io/pedro-game/

Endless 3D lane-dodger. Pedro is driving his brand-new silver Jetta to game night, way too fast. Get him **10 miles** to game night before he wrecks it like the last one, then keep going for score.

- **Lives:** Pedro has **3 chouriço links** (bottom-left). Every hit costs one, he says something like "I can fix that", and the Jetta looks more beat-up: scuffs and a cracked window, then duct tape, a smashed taillight and smoke. The third hit ends the run.
- **Music:** an original synthesized Portuguese *vira*-style folk loop (accordion, oom-pah bass, tambourine) that speeds up with the car.
- **Phone:** swipe left/right, or tap the left/right half of the screen. Buttons bottom-right: pause, music, sound.
- **Desktop:** ← → or A / D. P pauses, M mutes everything, N toggles music, Space restarts after a crash.
- The whole game is the single file `index.html` (Three.js `0.169.0` loads from jsdelivr). There's no build step. It runs from GitHub Pages or straight from disk (`file://`, needs internet for Three.js).

## Tweaking the game

Everything tunable lives in the `CONFIG` object at the top of the `<script id="pedro-core">` block in `index.html`. Edit a number, commit, and Pages redeploys within a minute or so. Common knobs:

| What | CONFIG key(s) |
|---|---|
| Start / top speed (mph) | `startSpeedMph` (80), `maxSpeedMph` (165) |
| How fast it gets hard | `difficultyCurve`, a list of `[miles, 0..1]` points. Default starts at 0.22 (no warm-up) and reaches full brutality at mile 9 (~4 min) |
| Game-night distance | `milestoneMiles` (default 10), `milestoneBonus` |
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
| Power-ups | `powerupChance`, `powerupWeights` (order: Full Coverage, Brake Check, Fresh Detail, Carpool, Donut, Chouriço), `brakeCheckSec`, `freshDetailSec`, `carpoolSec`, `carpoolMultiplier`, `donutSec`, `donutSpeedMult` |
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
| 👥 **Carpool** | 2× score for 8 s. |
| 🍩 **Donut** | Sugar rush: drive 30% faster for 5 s (more points per second, too). |
| ❤ **Chouriço** (very rare) | Gives back one chouriço link and repairs one stage of damage. At full links it's worth points instead. |

Only one timed effect runs at a time; a new one replaces the old one. Full Coverage sits in its own slot and lasts until it's used, and a hit it absorbs doesn't cost a link.

## Fairness guarantee

Traffic comes in rows from a seeded PRNG (mulberry32). Every row is validated before it is committed: it must leave a **guaranteed-open lane** that Pedro can reach from the previous row's open lane within the clear gap between the rows. Each lane change counts as `laneChangeMs + reactionSec` at the speed Pedro will be doing when he gets there, multiplied by `donutSpeedMult`, so the guarantee holds even mid-donut. Every move also has to leave 1.5 m of spare room. Lane-changers count as blocking both of their lanes, and tailgaters count as blocking theirs. A row that fails is regenerated, up to 8 tries, then replaced with an empty row.

- **Replay a run:** the game-over screen shows its seed. Open `…/pedro-game/?seed=12345` to replay that exact traffic.
- **See the guarantee:** add `?debug` to the URL (e.g. `?debug&seed=12345`). A green strip marks each row's guaranteed-open lane, and a panel shows fps, difficulty, and spawner stats. `?debug&start=2.5` starts the run at mile 2.5.

## Verification tools (`/tools`)

None of this is needed to play; it's for checking changes before pushing.

```sh
cd tools && npm install
node fairness.mjs            # 10 seeds × 1,000 rows, independent fairness check (no browser)
node fairness.mjs 1000 3 --mutate   # sabotages the spawner to prove the checker catches violations
node smoke.mjs               # headless Chromium at iPhone size: input, crash, power-ups, audio, share, autopilot
node smoke.mjs --quick       # same, minus the two long autopilot runs
```

- `fairness.mjs` re-derives every hitbox interval from `CONFIG` instead of trusting the spawner. It checks each row's guaranteed lane, then runs a brute-force path search over the whole run.
- `smoke.mjs` fails on any console error and writes screenshots to `tools/out/`.
- Its autopilot drives with real key events, following the guaranteed lane and dodging as late as it safely can. It must get through the first 30 s, the 10-mile milestone stretch and full-difficulty 165 mph traffic **without taking a single hit**.

## Notes

- **iPhone sound:** sound starts on your first tap (an iOS rule). It's also silenced by the ring/silent switch, like any web audio on iOS.
- **Saved data:** the high score and mute setting live in `localStorage`. Private browsing just doesn't save them.
- **Battery:** the game pauses automatically when you switch tabs or lock the phone; tap to resume.
