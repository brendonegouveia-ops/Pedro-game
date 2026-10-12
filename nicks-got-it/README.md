# NICK'S GOT IT

Kayla’s out for the day. Nick said “I got it.” It’s 9:00 AM on a Saturday.

This is a mobile-first, top-down browser survival game. You walk Nick freely around a bird's-eye floor plan of the house and backyard, and every job ends in a big thumb gesture. You play it one-handed in portrait, or with a mouse or keyboard on desktop. 1 real second = 1 game minute. The run ends when **Chaos** reaches 100, and your score is the time on the clock (“1:47 PM”). Scores go to a global leaderboard.

Stack: Phaser 3.90 + TypeScript + Vite. Cloudflare Pages hosts the static build, and Pages Functions + D1 run the leaderboard. All art and sound are generated in code: Graphics primitives and WebAudio synthesis, with no image or audio files.

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
| `GET /api/scores` | Returns the top 20 as `{ scores: [{ name, minutes }] }`. |
| `POST /api/scores` | Takes `{ runId, name, minutes }` and returns `{ rank, scores }`. |

The anti-cheat is a plausibility floor, not real security. A score of N game minutes needs a run that started at least 0.9·N real seconds ago. Each `runId` can post exactly once (claimed atomically in D1), and runs expire after 6 h. A determined cheater can still wait the time out and post a fake number. Names are NFKC-normalized, stripped to letters, digits, space and `.'_-`, and capped at 14 characters. There is no profanity filter.

## How it plays

- **Walking.** Touch and hold anywhere on the house and Nick walks toward your finger; let go and he stops. If a wall is in the way he heads for the right doorway on his own, so holding on the grill from the garage takes him through the kitchen and out the back door. On desktop, click and hold, or use WASD / arrow keys. A dotted line and a ring show where he's headed.
- **Doing jobs.** Stop next to a kid or a spill (within 40 px), or on a station (within 24 px), and the **Action Panel** slides up with that job. Walking hides it, and walking away skips it. When two things are in reach, a kid's request beats a station, then the nearest wins. With nothing doable in reach, the panel tells you why ("Evelyn wants a snack. Kitchen.").
- **Commitment.** Once your thumb starts a HOLD, RUB, SWIPE or MASH, Nick is locked in place until you let go (or the taps stop). Every other timer keeps running.
- **Gestures.** TAP. HOLD: 1.5 s, or 2 s for watch_this. Letting go drains the ring instead of resetting it. RUB: about 1,200 design-px of back-and-forth drag (~1.2 s). SWIPE: one flick in the direction shown. MASH: 7 taps inside 2.2 s.
- **The house.** The backyard (grill, back door) runs along the top. Below it are the kitchen (counter with coffee, snacks, juice, sippy cups; high chair) and the living room (thermostat, playpen, couch). The garage (band-aids and four shoe hiding spots) is under the kitchen. Doors: kitchen ↔ backyard, living room ↔ backyard (slider), kitchen ↔ living room, kitchen ↔ garage, garage ↔ living room. The whole plan is always on screen, so every request timer stays visible.
- **Hands.** Nick has one free hand: one item, or Nora, or the FaceTime phone. The panel shows what's in it and has a **Put it down** button. The HUD shows it read-only.
- **Abilities** (bottom bar, keys 1–3): Dad Joke freezes every request and system timer for 3 s, with a 25 s cooldown. It doesn't stop the clock, which is your score. Call Kayla has 2 charges: tap the ability, then a bubble. Her replies go “Sure babe! 💕” → “k”. Because I Said So clears every open screen_time and has a 40 s cooldown.
- **Desktop keys.** WASD (and arrows, except while a swipe or rub is up) walk. 1–3 abilities. Space/Enter tap, hold or mash. Arrows swipe or rub. Z/X pick choices. U says “uh-huh”. P/Esc pauses.

## Tuning

Every number and every line of copy is in `src/config.ts` (walk speed and reach radii are under `MOVE`); the floor plan (rooms, walls, doors, station positions) is in `src/sim/house.ts`. `config.ts` holds: cast, patience, gesture sizes, chaos values, cry timing, request weights and gaps, dog, grill, thermostat, coffee, nap, FaceTime, abilities, timeline, the 25 dad jokes, Kayla's texts and the end-card lines. The sim (`src/sim/sim.ts`) is pure TypeScript with a seeded RNG, so you can tune it against `npm run balance`.

Balance as shipped. These are median clock times over 12 seeds, from scripted bots that walk the real floor plan but steer perfectly and never misjudge a target, so humans will land earlier:

| Player | Median end |
|---|---|
| Idle (does nothing) | ~11:00 AM |
| Bot, slow reactions | ~2:30 PM (3:10 PM with abilities) |
| Bot, instant reactions | ~3:20 PM (4:20 PM with abilities) |

Walking is now real travel time (190 px/s; the worst trip, garage to grill, is about 4 s), so the same rules play harder than a tap-to-queue version would. This needs human playtesting: the fastest knobs are `MOVE.speed`, `REQUEST_GAP` and `CHAOS.decayPerSec`.

## Interpretations and deviations from the brief

- **Free movement replaces the tap-to-queue loop.** The original brief had a 4-item action queue with numbered markers, a route line, and 0.5 s room hops. That's gone: you steer Nick directly and jobs trigger by proximity. Everything else in the brief (requests, gestures, hands, abilities, timeline) is unchanged.

- **Haptics.** The brief ends at “Haptics: navigator.vibrate”. Short pulses fire on gesture completion, cries, the smoke alarm, FaceTime and game over, with a toggle in Pause. iOS Safari has no Vibration API, so haptics do nothing on iPhone.
- **Nap wake-ups use a meter.** A smoke alarm fills it instantly. A bark fills 60 / 35 / 15 depending on how many rooms Eloise is from the couch. A fight in the Living Room or Kitchen adds 18/s while it lasts. The meter drains 5/s, and Nora wakes at 100 (+10 Chaos, cranky until 3:00 PM). So a single bark in the Living Room does not wake her on its own. This keeps the “Shhh” meter meaningful instead of making barks a coin flip.
- **Patience per request.** Base patience is 8 s, multiplied per request type: ×1.3 for fetch jobs, ×1.4 for boo-boos, ×1.9 for the lost shoe (3 spots), ×1.5 for a spill, ×1.3 for needs_out. It shrinks 6% per game hour, down to a floor of 50%.
- **Chaos.** An expired kid request adds +10, and each crying kid adds +0.3/s. Chaos decays 0.25/s while nobody is crying. The decay pauses while the thermostat is wrong, so that event really adds +0.5/s.
- **Grill.** It runs during the 12:00 lunch rush (until 1:00 PM) and again from 5:00 PM. A flip is due 10 s after the last one, and the burger burns 8 s after that.
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
src/game/GameScene.ts  rendering, hold-to-walk input, HUD, ability bar, overlays
src/game/panel.ts      Action Panel gestures
src/game/art.ts        procedural characters, icons, top-down floor plan
src/audio.ts           WebAudio SFX (groan, smoke alarm, cry, sizzle, bark, UI)
src/main.ts            viewport/safe-area handling, overlays, pause, leaderboard UI
functions/             Pages Functions (leaderboard) + schema.sql
tests/                 vitest: rules + balance bots
tools/smoke.mjs        Playwright end-to-end smoke test
```
