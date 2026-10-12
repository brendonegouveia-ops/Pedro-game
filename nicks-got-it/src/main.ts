import Phaser from 'phaser';
import './style.css';
import { CAST, END_LINES } from './config';
import { isMuted, play, resumeAudio, setMuted, suspendAudio, unlockAudio } from './audio';
import { buzz, hapticsSupported, setHaptics } from './haptics';
import { beginRun, submitScore, topScores, type ScoreRow } from './leaderboard';
import { load, save } from './storage';
import { GameScene } from './game/GameScene';
import { H, W } from './game/layout';
import { clockString, type Sim } from './sim/sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const saved = load();
setMuted(!saved.sound);
setHaptics(saved.haptics);

// ---------------------------------------------------------------- viewport
// iOS Safari's 100vh includes the hidden toolbar; use the visual viewport instead.
function fitViewport() {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
}
fitViewport();
window.visualViewport?.addEventListener('resize', fitViewport);
window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 250));

// No pinch zoom, double-tap zoom, long-press menus, or pull-to-refresh while playing.
const block = (e: Event) => e.preventDefault();
document.addEventListener('contextmenu', block);
document.addEventListener('gesturestart', block as EventListener);
document.addEventListener('gesturechange', block as EventListener);
document.addEventListener('dblclick', block);
document.addEventListener(
  'touchmove',
  (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('.scroll')) return; // let the help/leaderboard cards scroll
    e.preventDefault();
  },
  { passive: false },
);
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

// ---------------------------------------------------------------- game
const scene = new GameScene();
const R = scene.R;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * R,
  height: H * R,
  backgroundColor: '#1d1f2b',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 1, touch: { capture: true } },
  render: { antialias: true, roundPixels: false },
  disableContextMenu: true,
  banner: false,
  scene: [scene],
});

let runId: string | null = null;
let lastSim: Sim | null = null;
let paused = false;
let playing = false;

game.events.once('scene-ready', () => {
  scene.hooks = {
    sfx: play,
    haptic: buzz,
    gameOver: showEnd,
    pause: () => pause(),
  };
});

// ---------------------------------------------------------------- overlays
function open(id: string) {
  $(id).setAttribute('data-open', '');
}
function close(id: string) {
  $(id).removeAttribute('data-open');
}

function syncButtons() {
  const label = isMuted() ? '🔇 Sound off' : '🔊 Sound on';
  for (const id of ['soundBtn', 'soundBtn2']) {
    $(id).textContent = label;
    $(id).setAttribute('aria-pressed', String(!isMuted()));
  }
  const hb = $('hapticsBtn');
  hb.textContent = hapticsSupported() ? (saved.haptics ? '📳 Haptics on' : '📴 Haptics off') : '📴 No haptics here';
  $('bestLine').textContent = saved.best > 0 ? `Your best: ${clockString(saved.best)}` : '';
}
syncButtons();

function toggleSound() {
  unlockAudio(); // also a user gesture, so this is a valid place to unlock iOS audio
  setMuted(!isMuted());
  saved.sound = !isMuted();
  save(saved);
  syncButtons();
  play('tap');
}
$('soundBtn').addEventListener('click', toggleSound);
$('soundBtn2').addEventListener('click', toggleSound);
$('hapticsBtn').addEventListener('click', () => {
  saved.haptics = !saved.haptics;
  setHaptics(saved.haptics);
  save(saved);
  syncButtons();
  buzz(30);
});

$('helpBtn').addEventListener('click', () => open('help'));
$('boardBtn').addEventListener('click', async () => {
  open('board');
  renderBoard($('boardList'), undefined, null);
  renderBoard($('boardList'), await topScores(), null);
});
document.querySelectorAll('#help .close, #board .close').forEach((b) =>
  b.addEventListener('click', () => {
    close('help');
    close('board');
    if (!saved.seenHelp) {
      saved.seenHelp = true;
      save(saved);
    }
  }),
);

function startGame() {
  // iOS: AudioContext must be created/resumed inside this tap handler.
  unlockAudio();
  close('start');
  close('end');
  close('pause');
  paused = false;
  playing = true;
  runId = null;
  void beginRun().then((id) => (runId = id));
  scene.startRun((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  play('pop');
  buzz(15);
}

$('startBtn').addEventListener('click', () => {
  if (!saved.seenHelp) {
    saved.seenHelp = true;
    save(saved);
    open('help');
    const btn = document.querySelector('#help .close') as HTMLElement;
    const go = () => {
      btn.removeEventListener('click', go);
      startGame();
    };
    btn.addEventListener('click', go);
    unlockAudio();
    return;
  }
  startGame();
});
$('againBtn').addEventListener('click', startGame);
$('titleBtn').addEventListener('click', () => {
  close('end');
  open('start');
  syncButtons();
});

// ---------------------------------------------------------------- pause
function pause() {
  if (!playing || paused || !scene.running) return;
  paused = true;
  scene.running = false;
  scene.releaseInput(); // a held finger or key must not keep Nick walking after resume
  suspendAudio();
  open('pause');
}
function resume() {
  if (!paused) return;
  if (isRotated()) return;
  paused = false;
  close('pause');
  unlockAudio();
  resumeAudio();
  scene.running = true;
}
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => {
  paused = false;
  playing = false;
  scene.running = false;
  close('pause');
  open('start');
  syncButtons();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', () => pause());
window.addEventListener('pagehide', () => pause());

const rotateMq = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)');
const isRotated = () => rotateMq.matches;
rotateMq.addEventListener?.('change', () => {
  if (isRotated()) pause();
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  // Pause/resume keys live here only, so one keypress can't both pause and resume.
  if (paused) {
    if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      resume();
    }
  } else if (playing && !e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    pause();
  } else if (!playing && $('start').hasAttribute('data-open') && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    $('startBtn').click();
  } else if (e.code === 'Space' || e.code.startsWith('Arrow')) {
    e.preventDefault(); // never scroll the page
  }
});

// ---------------------------------------------------------------- end card
function endQuote(sim: Sim): string {
  const lines = END_LINES[sim.topCause()] ?? END_LINES.default;
  return `“${lines[Math.floor(Math.random() * lines.length)]}” — ${CAST.kayla.name}`;
}

function showEnd(sim: Sim) {
  playing = false;
  lastSim = sim;
  const minutes = Math.floor(sim.t);
  const isBest = minutes > saved.best;
  if (isBest) {
    saved.best = minutes;
    save(saved);
  }
  $('endQuote').textContent = endQuote(sim);
  $('endTime').textContent = clockString(minutes);
  $('endBest').textContent = isBest ? 'New personal best!' : `Your best: ${clockString(saved.best)}`;
  const s = sim.stats;
  const stats: [string, number | string][] = [
    ['handled', s.handled],
    ['cries', s.cries],
    ['dad jokes', s.jokes],
    ['coffee refills', s.coffeeRefills],
    ['smoke alarms', s.smokeAlarms],
    ['“dirt on it”', s.dirt],
  ];
  $('endStats').innerHTML = stats.map(([k, v]) => `<li><b>${v}</b>${k}</li>`).join('');
  ($('nameInput') as HTMLInputElement).value = saved.name;
  $('submitMsg').textContent = '';
  ($('submitBtn') as HTMLButtonElement).disabled = false;
  $('submitForm').style.display = minutes > 0 ? 'flex' : 'none';
  open('end');
  renderBoard($('endBoard'), undefined, null);
  void topScores().then((rows) => renderBoard($('endBoard'), rows, null));
}

$('submitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lastSim) return;
  const input = $('nameInput') as HTMLInputElement;
  const name = input.value.trim().slice(0, 14);
  if (!name) {
    $('submitMsg').textContent = 'Name first. Even “Dad” works.';
    return;
  }
  input.blur();
  saved.name = name;
  save(saved);
  const btn = $('submitBtn') as HTMLButtonElement;
  btn.disabled = true;
  $('submitMsg').textContent = 'Posting…';
  if (!runId) runId = await beginRun();
  if (!runId) {
    $('submitMsg').textContent = 'Leaderboard is offline. Your best is saved on this phone.';
    btn.disabled = false;
    return;
  }
  const minutes = Math.floor(lastSim.t);
  const res = await submitScore(runId, name, minutes);
  if (!res) {
    $('submitMsg').textContent = 'Leaderboard is offline. Try again in a bit.';
    btn.disabled = false;
    return;
  }
  if ('error' in res) {
    $('submitMsg').textContent = `Couldn’t post: ${res.error}`;
    return;
  }
  $('submitMsg').textContent = `You’re #${res.rank}.`;
  renderBoard($('endBoard'), res.scores, { name, minutes });
});

// rows: undefined = loading, null = backend unreachable.
function renderBoard(el: HTMLElement, rows: ScoreRow[] | null | undefined, me: { name: string; minutes: number } | null) {
  if (rows === undefined) {
    el.innerHTML = '<li class="empty"><span class="n">Loading…</span></li>';
    return;
  }
  if (rows === null) {
    el.innerHTML = '<li class="empty"><span class="n">Leaderboard offline.</span></li>';
    return;
  }
  if (!rows.length) {
    el.innerHTML = '<li class="empty"><span class="n">No scores yet. Be the first dad.</span></li>';
    return;
  }
  let marked = false;
  el.innerHTML = rows
    .map((r) => {
      const mine = !marked && me && r.name === me.name && r.minutes === me.minutes;
      if (mine) marked = true;
      return `<li class="${mine ? 'me' : ''}"><span class="n">${escapeHtml(r.name)}</span><span class="t">${clockString(r.minutes)}</span></li>`;
    })
    .join('');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// Expose a tiny handle for the headless smoke test.
(window as unknown as { __nick: unknown }).__nick = { scene, game, pause, resume, get paused() { return paused; } };
