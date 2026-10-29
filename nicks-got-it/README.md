# NICK'S GOT IT

Kayla’s out until 5. Game night at Carlson’s is at 5. Nick said “I got it.”

A mobile-first browser survival game in 3D. A third-person camera follows Nick through the house and backyard; walk him with an on-screen D-pad and handle every job with a big thumb gesture on the action pad. **Make it to 5:00 PM and Nick goes to game night**; that unlocks the next week, a harder version of the same Saturday. If **Chaos** hits 100 first, game night's off and you retry the week. Desktop works with a keyboard or mouse.

The clock runs 1.5 game minutes per real second, so a week is about 5 minutes 20 seconds (9:00 AM to 5:00 PM). Every other timer (request patience, cooldowns, FaceTime, cries) is in real seconds.

Stack: Three.js 0.158 (the 3D house, characters and camera) under a transparent Phaser 3.90 layer (HUD, bubbles, D-pad, action pad), TypeScript, Vite. Cloudflare Pages hosts the static build, and Pages Functions + D1 run the leaderboard. All art and sound are generated in code (low-poly primitives, canvas textures, WebAudio synthesis), with no model, image or audio files.

**How the 3D works.** The simulation is still 2D: the floor plan in `src/sim/house.ts` (rooms, walls, doors, furniture, stations) is the ground plane, with sim (x, y) = 3D (x, z) and 1 unit = 1 design px (~40 per meter). `src/three/World3D.ts` builds the house from it and renders it on a canvas underneath Phaser's; the 2D layer places request bubbles, speech and station icon chips by projecting through the 3D camera.

- **Camera.** Behind and above Nick with a fixed heading, so ▲ on the D-pad always walks away from the camera. It eases after him on wall-clock time.
- **Walls.** Cutaway height (about chest high) so rooms read from above; any wall between the camera and Nick fades out.
- **Off-screen requests.** Their bubbles pin to the edge of the 3D view with an arrow pointing toward them. A minimap (top right) shows rooms, doorways, Nick (orange), the kids and Eloise, and every request colored by its timer.
- **Furniture is solid.** Counter, kitchen table, couch, coffee table, TV stand, playpen, workbench, grill, sandbox and the tree trunk block movement; the pathfinder routes around them. Stations on or beside furniture are within the 40 px station reach.

## Run it locally

```bash
cd nicks-got-it
npm install
npm run dev            # game only, http://localhost:5173 (leaderboard shows "offline")
npm run pages:dev      # build + Pages Functions + local D1 at http://localhost:8788
                       # first time only: npm run db:migrate:local
```

Tests:

```bash
npm test               # sim rules + navigation (21 tests) + balance bots (4)
npm run balance        # prints survival times for idle / scripted players
npm run typecheck      # game + functions
npx vite preview &     # or `npm run pages:dev`
npm run smoke -- http://localhost:4173/   # Playwright, iPhone 13 profile, real touch events
```

The smoke test walks Nick across the house by holding a finger on the grill, then drives every gesture (TAP, HOLD, RUB, SWIPE, MASH, choice, tap-each-kid) end to end with CDP touch events. It also checks Dad Joke, FaceTime “uh-huh”, pause on blur, the end card and the landscape rotate overlay. When `/api` is served, it also posts a score that should be rejected (a fast-forwarded run) and an honest one that should be accepted. Screenshots go to `test-results/`.

## Shareable link (GitHub Pages)

**Play:** https://brendonegouveia-ops.github.io/pedro-game/nick/

The repo's GitHub Pages site serves `nick/index.html` from `main`. It's one self-contained file built from this project, so after changing the game, rebuild it and commit it with your change:

```bash
npm run build:pages   # writes ../nick/index.html
```

That page has no backend, so the leaderboard shows "offline" there; progress and best runs are saved on each player's device. The full leaderboard needs the Cloudflare deploy below.

## Quick prototype link (no deploy)

`npm run build:artifact` writes one self-contained HTML page (`artifact/nicks-got-it.html`): the game code and CSS are inlined; Phaser 3.90.0 and Three.js 0.158.0 (the last release with the `build/three.min.js` global build) load from jsDelivr, with unpkg as a fallback. It can be published as a private claude.ai Artifact and opened on a phone. The leaderboard shows "offline" there, because there are no Pages Functions behind it.

## Deploy to Cloudflare Pages

1. Create the database and copy the printed `database_id` into `wrangler.toml`:
   ```bash
   npx wrangler d1 create nicks-got-it
   npm run db:migrate:remote
   ```
2. Deploy, with either option:
   - **CLI:** `npm run deploy` (runs `wrangler pages deploy dist`).
   - **Git integration:** set the project's root directory to `nicks-got-it`, the build command to `npm run build`, and the output directory to `dist`. Pages reads the D1 binding (`DB`) from `wrangler.toml`. If your project predates `wrangler.toml` support, add the binding under Settings → Functions → D1 bindings instead.

No secrets are needed. `schema.sql` is idempotent.

### Leaderboard API

| Route | Does |
|---|---|
| `POST /api/run` | Records a server-side start time and returns `{ runId }`. The client calls it when a run starts. |
| `GET /api/scores` | Returns the top 20 as `{ scores: [{ name, week, minutes }] }`. |
| `POST /api/scores` | Takes `{ runId, name, week, minutes }` (minutes = clock time reached that week) and returns `{ rank, scores }`. Ranked by week, then minutes. |

The anti-cheat is a plausibility floor, not real security. A score of N game minutes needs a run that started at least 0.9 × N / 1.5 real seconds ago. The week number is the client's claim and isn't verified. Each `runId` can post exactly once (claimed atomically in D1), and runs expire after 6 h. A determined cheater can still wait the time out and post a fake number. Names are NFKC-normalized, stripped to letters, digits, space and `.'_-`, and capped at 14 characters. There is no profanity filter.

## How it plays

- **Walking.** The D-pad on the left of the bottom deck walks Nick (left thumb). Pressing between two arrows walks diagonally. Clipping a doorframe slides him around it (up to 18 px), so lining up with a doorway isn't fiddly. Desktop: WASD or the arrow keys, or click the D-pad.
- **Doing jobs.** Walk up to a kid or a spill (within 46 px) or a station (within 34 px) and that job shows on the **action pad** on the right (right thumb), even while you're still walking. The current job stays up until Nick is 12 px past its reach, so shuffling around doesn't flicker it. When two things are in reach, a kid's request beats a station, then the nearest wins. With nothing doable in reach, the pad says why ("Evelyn wants a snack. Kitchen."). Two thumbs at once (D-pad + action pad) are supported.
- **Commitment.** Once your thumb starts a HOLD, RUB, SWIPE or MASH, Nick is locked in place until you let go (or the taps stop). Every other timer keeps running.
- **Gestures.** TAP. HOLD: 1.5 s, or 2 s for watch_this. Letting go drains the ring instead of resetting it. RUB: about 1,200 design-px of back-and-forth drag (~1.2 s). SWIPE: one flick in the direction shown. MASH: 7 taps inside 2.2 s.
- **The house.** The backyard (grill) runs along the top. Below it the kitchen (counter with coffee, snacks, juice, sippy cups; high chair; back door) and the living room (thermostat, playpen, couch) are one open-plan space. The garage (band-aids and four shoe hiding spots) is under the kitchen. Doorways (64–76 px, drawn as light thresholds with frames): kitchen ↔ backyard, living room ↔ backyard (slider), kitchen ↔ garage, garage ↔ living room. The whole plan is always on screen, so every request timer stays visible.
- **Pathfinding.** Walkers use A* on an 8 px grid with a 2 px clearance margin, then head for the furthest point on the path they can see. A target on or inside a wall snaps to the nearest open spot.
- **On my way.** Grabbing the item a kid asked for (snack, juice box, sippy cup, or a band-aid for a boo-boo) tops their timer up to 60% and slows it to 35% speed while Nick carries it; the bubble turns blue and a blue ring marks the kid.
- **No dead items.** A crying kid takes whatever snack, drink or band-aid Nick holds: stand next to them and tap. The crying stops and Chaos drops by 3.
- **Hands.** Nick has one free hand: one item, or Nora, or the FaceTime phone. The panel shows what's in it and has a **Put it down** button. The HUD shows it read-only.
- **Abilities** (bottom bar, keys 1–3): Dad Joke freezes every request and system timer for 3 s, with a 25 s cooldown. It doesn't stop the clock, which is your score. Call Kayla has 2 charges: tap the ability, then a bubble. Her replies go “Sure babe! 💕” → “k”. Because I Said So clears every open screen_time and has a 40 s cooldown.
- **Weeks.** Week N's Saturday is harder: patience starts at 110% in week 1 and drops 5% per week (floor 65%), requests come 12% faster per week, Chaos drains 8% slower per week, and fights break out 25% more often. From week 3, Kayla texts "running late 🙃" at 4:45 and game night slides to 5:30. Each week has a generic game night theme (board games, poker, trivia…). Progress (highest unlocked week) and your best run are saved on the device; the title screen has a week picker.
- **Desktop keys.** WASD (and arrows, except while a swipe or rub is up) walk. 1–3 abilities. Space/Enter tap, hold, mash, or pick the first choice. Arrows swipe or rub. Z/X pick choices. U says “uh-huh”. P/Esc pauses.

## Tuning

Every number and every line of copy is in `src/config.ts` (walk speed and reach radii are under `MOVE`); the floor plan (rooms, walls, doors, station positions) is in `src/sim/house.ts`. `config.ts` holds: cast, patience, gesture sizes, chaos values, cry timing, request weights and gaps, dog, grill, thermostat, coffee, nap, FaceTime, abilities, timeline, the 25 dad jokes, Kayla's texts and the end-card lines. The sim (`src/sim/sim.ts`) is pure TypeScript with a seeded RNG, so you can tune it against `npm run balance`.

Balance as shipped (`npm run balance`): 12 seeds per row; bots walk the real floor plan with pathfinding and never misjudge a target, so humans on a D-pad will do worse.

| Week | Slow bot | Sharp bot | Perfect bot |
|---|---|---|---|
| 1 | 8/12 make it | 11/12 | 12/12 |
| 2 | 6/12 | 11/12 | 12/12 |
| 4 (5:30 goal) | 0/12, median 4:07 PM | 0/12, median 4:21 PM | 2/12, median 5:06 PM |

An idle player loses around 11:40 AM. The fastest knobs are `WEEKS` (per-week steps), `MOVE.speed`, `REQUEST_GAP` and `CHAOS.decayPerSec`.

## Interpretations and deviations from the brief

- **3D, third person.** The brief asked for a portrait 2D cross-section; this version renders a 3D house with a follow camera. Rules, timers, gestures and the 390×844 portrait layout are unchanged.
- **Free movement replaces the tap-to-queue loop.** The original brief had a 4-item action queue with numbered markers, a route line, and 0.5 s room hops. That's gone: you walk Nick with a D-pad and jobs trigger by proximity. The brief's one-thumb rule is relaxed: the D-pad and action pad are meant for two thumbs (one at a time still works).
- **Weeks and a 5:00 PM goal replace the open-ended score.** The brief scored a run by the clock time when Chaos hit 100. Now you survive to 5:00 PM to win the week; the leaderboard ranks runs by week, then by the clock time reached. The 6:00 PM "running late" text became the week-3+ 4:45 PM delay. The clock runs 1.5× faster than the brief's 1 s = 1 min, so a week is ~5 minutes.

- **Haptics.** The brief ends at “Haptics: navigator.vibrate”. Short pulses fire on gesture completion, cries, the smoke alarm, FaceTime and game over, with a toggle in Pause. iOS Safari has no Vibration API, so haptics do nothing on iPhone.
- **Nap wake-ups use a meter.** A smoke alarm fills it instantly. A bark fills 60 / 35 / 15 depending on how many rooms Eloise is from the couch. A fight in the Living Room or Kitchen adds 18/s while it lasts. The meter drains 5/s, and Nora wakes at 100 (+10 Chaos, cranky until 3:00 PM). So a single bark in the Living Room does not wake her on its own. This keeps the “Shhh” meter meaningful instead of making barks a coin flip.
- **Patience per request.** Base patience is 8 s, multiplied per request type: ×1.25 for on-the-spot jobs (diaper, uppy, watch_this, screen_time), ×1.7 for fetch jobs and boo-boos, ×2.4 for the lost shoe (3 spots), ×1.8 for a spill, ×1.6 for needs_out, ×1.3 for a fight. It shrinks 6% per game hour, down to a floor of 50%.
- **Chaos.** An expired kid request adds +10, and each crying kid adds +0.3/s. Chaos decays 0.25/s while nobody is crying. The decay pauses while the thermostat is wrong, so that event really adds +0.5/s.
- **Grill.** It runs during the 12:00 lunch rush (until 1:00 PM) and again from 3:30 PM (an early dinner before game night). A flip is due 10 s after the last one, and the burger burns 8 s after that.
- **Band-aid.** It has to be fetched from the Garage first. Rubbing dirt on it works anywhere, instantly, for +3.
- **Lost shoe.** Three of the four Garage spots light up, and the shoe turns up on the third check.
- **Kids hold still while they want something.** Idle kids (and Eloise) wander from room to room through the doorways.
- **watch_this** counts from anywhere in the kid's room, matching "stand in the kid's room".
- **FaceTime.** At 3:00 PM the phone takes the free hand for 20 s. A held item goes into a pocket and comes back afterwards. A carried Nora is set down without a cry roll. Five “uh-huh” prompts appear 4 s apart, each with a 2.6 s window.
- **Rotate overlay.** It only shows on touch devices in landscape (`pointer: coarse` and height ≤ 600 px). Desktop is never asked to rotate.
- **Clock.** The game runs on wall-clock time, not Phaser's smoothed delta, so 1 s = 1 game minute even on slow frames. Frames are capped at 0.25 s, and the game auto-pauses on blur, tab hide and landscape.

## Files

```
src/config.ts          cast, tuning, timeline, jokes, copy
src/sim/house.ts       floor plan: rooms, walls, doors, stations, collision, steering
src/sim/sim.ts         pure simulation (movement, jobs, rules, timeline)
src/three/World3D.ts   3D house, furniture, stations, lights, follow camera, wall fading, highlight rings, projection
src/three/models.ts    low-poly Nick, Evelyn, Tyler, Nora, Eloise (walk cycles) + held items
src/game/GameScene.ts  2D overlay: HUD, D-pad, ability bar, projected bubbles/speech/chips, edge arrows, minimap
src/game/panel.ts      Action Panel gestures
src/game/art.ts        2D icons (bubbles, chips, panel) and the FaceTime face
src/audio.ts           WebAudio SFX (groan, smoke alarm, cry, sizzle, bark, UI)
src/main.ts            viewport/safe-area handling, overlays, pause, leaderboard UI
functions/             Pages Functions (leaderboard) + schema.sql
tests/                 vitest: rules + balance bots
tools/smoke.mjs        Playwright end-to-end smoke test
```
