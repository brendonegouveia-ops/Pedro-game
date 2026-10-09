# Pedro Makes It to Game Night

**Play it:** https://brendonegouveia-ops.github.io/pedro-game/

Endless 3D lane-dodger. Pedro is driving his brand-new silver Jetta to game night, way too fast. Get him there (3 miles) without wrecking it like the last one, then keep going for score.

- **Phone:** swipe left/right, or tap the left/right half of the screen.
- **Desktop:** ← → or A / D. P pauses, M mutes, Space restarts after a crash.
- The whole game is the single file `index.html` (Three.js `0.169.0` loads from jsdelivr). There's no build step. It runs from GitHub Pages or straight from disk (`file://`, needs internet for Three.js).

## Tweaking the game

Everything tunable lives in the `CONFIG` object at the top of the `<script id="pedro-core">` block in `index.html`. Edit a number, commit, and Pages redeploys within a minute or so. Common knobs:

| What | CONFIG key(s) |
|---|---|
| Start / top speed (mph) | `startSpeedMph`, `maxSpeedMph` |
| How fast it gets hard | `difficultyCurve`, a list of `[miles, 0..1]` points. Default: easy at ~30 s, hard at ~2 min, brutal at ~4 min |
| Game-night distance | `milestoneMiles` (default 3), `milestoneBonus` |
| Traffic density | `rowGapSec` (gap between waves at difficulty 0 → 1), `rowLanesBlocked`, `emptyRowChance` |
| When hazards appear | `unlockMiles` (trucks, cones/debris, lane-changers, tailgaters) |
| Hazard mix | `hazardWeights`, `changerChance`, `tailgaterChance` |
| Lane-changer telegraph | `blinkerSec` (0.75 s) |
| Forgiveness | `hitboxScale` (0.8 = hitboxes are 80% of the visual size), `reactionSec` |
| Lane-change feel | `laneChangeMs` (150) |
| Scoring | `pointsPerMeter`, `nearMissPoints`, `nearMissMargin`, `lateDodgeSec` |
| Power-ups | `powerupChance`, `powerupWeights`, `brakeCheckSec`, `freshDetailSec`, `carpoolSec`, `carpoolMultiplier` |
| Camera | `fovBase`, `fovMax`, `shakeMax`, `camHeight`, `camBack` |
| Share link | `shareUrl` |

Speeds and the HUD are in mph and miles. Internally the world uses meters (1 unit = 1 m), so a few spawn-distance keys end in `Meters`.

### Adding roast lines

`ROASTS` sits right below `CONFIG`. Add a string per inside joke. `{miles}` and `{score}` are filled in when the line is shown:

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

Only one timed effect runs at a time; a new one replaces the old one. Full Coverage sits in its own slot and lasts until it's used.

## Fairness guarantee

Traffic comes in rows from a seeded PRNG (mulberry32). Every row is validated before it is committed: it must leave a **guaranteed-open lane** that Pedro can reach from the previous row's open lane within the clear gap between the rows. Each lane change counts as `laneChangeMs + reactionSec` at the speed Pedro will be doing when he gets there. Lane-changers count as blocking both of their lanes, and tailgaters count as blocking theirs. A row that fails is regenerated, up to 8 tries, then replaced with an empty row.

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
- Its autopilot drives with real key events, following the guaranteed lane and dodging as late as it safely can. It must survive both the milestone stretch and full-difficulty 160 mph traffic without crashing.

## Notes

- **iPhone sound:** sound starts on your first tap (an iOS rule). It's also silenced by the ring/silent switch, like any web audio on iOS.
- **Saved data:** the high score and mute setting live in `localStorage`. Private browsing just doesn't save them.
- **Battery:** the game pauses automatically when you switch tabs or lock the phone; tap to resume.
