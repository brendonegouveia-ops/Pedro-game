// Every tunable number, every line of copy, and the cast live here.
// Time unit: 1 real second = 1 game minute. "t" below is seconds (== game minutes) since 9:00 AM.

export const GAME = {
  width: 390,
  height: 844,
  title: "NICK'S GOT IT",
  startHour: 9, // 9:00 AM Saturday
};

// ---------------------------------------------------------------- cast
export const CAST = {
  nick: { name: 'Nick', catchphrase: 'I got it, I got it.' },
  evelyn: { name: 'Evelyn', age: 5 },
  nora: { name: 'Nora', age: 2 },
  tyler: { name: 'Tyler', age: 7, note: 'the neighbor kid' },
  eloise: { name: 'Eloise', note: 'the dog (scruffy, medium-sized)' },
  kayla: { name: 'Kayla', note: "Nick's wife, offscreen: end card, texts, Call Kayla" },
  kaylasMom: { name: "Kayla's mom", note: 'offscreen: FaceTime at 3:00 PM' },
} as const;

// ---------------------------------------------------------------- house
// 2x2 grid. Orthogonal neighbours are 1 hop, diagonal rooms are 2 hops.
export const ROOMS = {
  kitchen: { name: 'Kitchen', col: 0, row: 0 },
  living: { name: 'Living Room', col: 1, row: 0 },
  garage: { name: 'Garage', col: 0, row: 1 },
  backyard: { name: 'Backyard', col: 1, row: 1 },
} as const;

export const MOVE = {
  hopSec: 0.5, // one room hop at base speed
  lowCoffeeSpeed: 0.6, // "40% slower" below the coffee threshold
};

// ---------------------------------------------------------------- core loop
export const QUEUE_MAX = 4;

export const PATIENCE = {
  baseSec: 8,
  shrinkPerHour: 0.06, // patience x (1 - 0.06 * hours since 9 AM)
  minFactor: 0.5,
  crySpeedupPerKid: 0.2, // each OTHER crying kid speeds your timers up 20%
  // Multipliers on base patience. Fetch / multi-stop jobs get more room.
  kind: {
    snack: 1.3,
    juice_box: 1.3,
    sippy_cup: 1.3,
    diaper: 1.0,
    uppy: 1.0,
    watch_this: 1.0,
    booboo: 1.4,
    lost_shoe: 1.9,
    screen_time: 1.0,
    fight: 1.1,
    spill: 1.5,
    needs_out: 1.3,
  },
};

// Gesture sizes. Rub distance is in design px (390-wide canvas); ~1000 px/s is a brisk rub.
export const GESTURES = {
  diaperHoldSec: 1.5,
  watchThisHoldSec: 2.0,
  coffeeHoldSec: 1.0,
  doorHoldSec: 1.5,
  bandaidRubPx: 1200, // ~1.2 s of rubbing
  flipMashTaps: 7,
  flipMashWindowSec: 2.2,
  swipeMinPx: 45,
  holdDecayPerSec: 0.6, // released hold drains at this fraction-of-full per second
};

export const CHAOS = {
  max: 100,
  expireKid: 10, // per expired kid request
  expireDog: 6, // expired spill / needs_out
  cryPerSec: 0.3, // per crying kid
  decayPerSec: 0.25, // while nobody is crying
  screenTimeNo: 4,
  meltdownMult: 2, // screen-time "Yes" comes back 60 s later at 2x severity
  dirt: 3,
  earlyDropCry: 4,
  smokeAlarm: 15,
  thermostatPerSec: 0.5,
  napWake: 10,
  missedUhHuh: 5,
};

export const CRY = {
  sec: 10,
  noraSec: 12,
};

// Seconds (== game minutes) between a kid's requests. Divided by the rate multiplier.
export const REQUEST_GAP: Record<'evelyn' | 'nora' | 'tyler', [number, number]> = {
  evelyn: [6, 12],
  nora: [6, 11],
  tyler: [6, 11],
};
export const FIRST_REQUEST_SEC = 4;
export const RATE_AFTER_3PM_PER_HOUR = 0.15; // uncapped

export const REQUEST_WEIGHTS = {
  nora: { diaper: 0.35, sippy_cup: 0.35, uppy: 0.3 },
  evelyn: { snack: 0.2, juice_box: 0.15, watch_this: 0.2, booboo: 0.15, lost_shoe: 0.1, screen_time: 0.2 },
  tyler: { snack: 0.2, juice_box: 0.1, watch_this: 0.25, booboo: 0.2, lost_shoe: 0.05, screen_time: 0.2 },
} as const;

export const FIGHT = {
  chancePerSec: 0.035, // per room holding 2+ idle kids
};

export const MELTDOWN_DELAY_SEC = 60;

export const UPPY = {
  carrySec: 20,
  earlyDropCryChance: 0.3,
};

export const WANDER = {
  gapSec: [4, 9] as [number, number],
  noraGapSec: [7, 13] as [number, number],
  moveChance: 0.55,
};

export const DOG = {
  joinT: 150, // 11:30
  actionGapSec: [9, 16] as [number, number],
  weights: { spill: 0.3, steals_shoe: 0.2, needs_out: 0.25, bark: 0.25 },
  needsOutCooldownSec: 60,
  outsideSec: 20,
  maxSpills: 2,
};

export const GRILL = {
  // Burgers are on during these windows (t ranges). Lunch rush at 12:00, dinner from 5:00 PM.
  windows: [
    [180, 240],
    [480, Infinity],
  ] as [number, number][],
  flipEverySec: 10,
  flipPatienceSec: 8,
};

export const THERMOSTAT = {
  firstT: [75, 110] as [number, number],
  gapSec: [70, 130] as [number, number],
};

export const COFFEE = {
  drainSec: 90,
  slowBelow: 0.25,
};

export const NAP = {
  startT: 240, // 1:00 PM
  endT: 330, // 2:30 PM
  crankyUntilT: 360, // 3:00 PM
  crankyPatience: 0.7, // her timers -30%
  noise: {
    barkByHops: [60, 35, 15], // bark loudness by hops from the couch (Living Room)
    fightPerSec: 18, // fight open in Living Room or Kitchen
    decayPerSec: 5,
  },
};

export const FACETIME = {
  t: 360, // 3:00 PM
  durationSec: 20,
  promptEverySec: 4,
  firstPromptSec: 1,
  promptWindowSec: 2.6,
};

export const ABILITIES = {
  dadJoke: { cooldownSec: 25, freezeSec: 3 },
  callKayla: { charges: 2 },
  becauseISaidSo: { cooldownSec: 40 },
};

// ---------------------------------------------------------------- timeline
export const TIMELINE = {
  noraJoins: 60, // 10:00
  dogJoins: DOG.joinT, // 11:30
  lunchRush: 180, // 12:00
  nap: NAP.startT, // 1:00 PM
  tylerJoins: 240, // 1:00 PM
  noraWakes: NAP.endT, // 2:30 PM
  faceTime: FACETIME.t, // 3:00 PM
  rampStart: 360, // after 3:00 PM: +15% request rate per game hour
  runningLate: 540, // 6:00 PM
};

// ---------------------------------------------------------------- copy
export const TEXTS = {
  start: { from: 'Kayla', body: 'Thank you SO much babe 💕 Nora’s show ends at 10. Back by 6!' },
  noraJoins: { from: 'Kayla', body: 'Her show ended. She’s all yours 😘' },
  dogJoins: { from: 'Kayla', body: 'Did you latch the crate? The crate has a latch.' },
  lunchRush: { from: 'Kayla', body: 'Lunch?? Please not just goldfish crackers' },
  tyler: { from: 'Tyler', body: 'Can Tyler come over?' },
  nap: { from: 'Kayla', body: 'Nap at 1!! Couch is fine. DON’T let Eloise bark' },
  noraWakes: { from: 'Kayla', body: 'Is she up? How was the nap?' },
  faceTime: { from: "Kayla's mom", body: 'FaceTime… ☎️' },
  runningLate: { from: 'Kayla', body: 'running late 🙃' },
  // Ambient texts, drawn at random once in a while.
  ambient: [
    'how’s it going?? 😊',
    'did they eat anything green',
    'Nora needs sunscreen if she’s outside',
    'pls don’t touch the thermostat',
    'Evelyn says you said a bad word?',
    'is the grill on? Why is the grill on',
    'love you! you got this 💪',
    'did you find the other shoe',
  ],
};

export const KAYLA_CALL_REPLIES = ['Sure babe! 💕', 'k'];
export const KAYLA_OUT_OF_CHARGES = 'Kayla is “in a meeting.” On a Saturday.';

export const DAD_JOKES: string[] = [
  'Why was the coffee maker so calm? It knew how to filter out the noise.',
  'What’s the difference between me and the weather report? The weather report admits when it’s wrong.',
  'What do you call a dad who finishes every chore on his list? Fictional.',
  'Why are cargo shorts so reliable? They always carry their own weight.',
  'Why did the burger go back to school? It wanted to be well-done.',
  'What’s the thermostat’s favorite season? Whatever I set it to.',
  'Why did the snack drawer feel lonely? Everybody takes, nobody asks how it’s doing.',
  'Why did the playpen get a raise? It really knows how to keep things contained.',
  'What did the band-aid say to the knee? “I’ve got you covered. Stop picking.”',
  'How does a dad fix a dented juice box? With a little straw-tegy.',
  'Why did the couch win the election? Strong support. Plenty of cushion in the budget.',
  'What do you call a sleeping toddler? Proof of a miracle. Shhh.',
  'My coffee and I have a deal. It holds me up, I hold it up.',
  'Why did the grill join a band? It had great flip-hop rhythm.',
  'What do you call a garage full of single shoes? Sole-itary confinement.',
  'Why did the smoke alarm get a standing ovation? It really knows how to make a scene.',
  'Why did the dog sit by the back door all day? She was working on her out-reach.',
  'What did the sippy cup say from under the couch? “I’m not lost. I’m on sabbatical.”',
  'I asked the grill how it was doing. It said things were heating up.',
  'Why don’t socks and sandals ever argue? They know they’re a perfect match.',
  'What did the lawn say to the mower? “Let’s keep this short.”',
  'Why did the toddler bring a ladder to lunch? She heard the snacks were on the top shelf.',
  'What do you call a dad in the garage for six hours? Organizing. It’s called organizing.',
  'Why was the juice box so good at hide and seek? It never cracked under pressure. Only the straw did.',
  'What’s a dad’s favorite kind of math? Rounding up to “basically done.”',
];

export const GROANS = ['Ugh, Dad.', 'Daaad.', 'Nooo.', 'Why.', 'Booo.'];
export const NORA_GROAN = 'Bah!';
export const DOG_GROAN = 'Hrrmf.';

export const NICK_LINES = {
  queueFull: 'Four things. I got four things.',
  handsBusy: 'Free hand’s busy.',
  handsFullPhone: 'Can’t, I’m on with your mom.',
  nothingHere: 'Hm. Never mind.',
  thermostatOk: '72. Perfect. Nobody touch it.',
  grillIdle: 'Grill’s cold. Patience.',
  grillWait: 'Not yet. Let it sear.',
  doorIdle: 'Door’s fine. It’s a door.',
  emptySpot: 'Just a spider.',
  needItem: (item: string) => `Need a ${item} first.`,
  dirt: 'Rub some dirt on it. Builds character.',
  foundShoe: 'Found it! It was in the… never mind.',
  setDown: 'There. Perfect. Don’t—',
  bisNone: 'Nobody asked for screens. Yet.',
};

export const END_LINES: Record<string, string[]> = {
  smoke: ['Babe. Why is the fire department here?', 'I could smell the grill from the car.'],
  thermostat: ['Why is it 61 degrees in here?', 'Who touched the thermostat.'],
  facetime: ['My mom says you kept saying “uh-huh” to nothing.'],
  nap: ['Did she nap? She did not nap.'],
  cry: ['Why is everyone crying. Why are YOU crying.', 'Okay. Everybody breathe.'],
  default: ['So… how’d it go?', 'I leave for ONE day.', 'Why is the dog wearing a shoe?'],
};

export const ITEM_NAMES = {
  snack: 'snack',
  juice_box: 'juice box',
  sippy_cup: 'sippy cup',
  bandaid: 'band-aid',
} as const;
