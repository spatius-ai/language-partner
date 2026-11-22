// Language partner: a Spatius avatar in a real place, a red pen on your own words, a pocket of phrases.
import './partner.css';
import SCENES from '../../scenes.json';
import { canDraw, initSdk, loadSeat, type Seat } from './seat';

type Lang = 'es' | 'en' | 'zh' | 'ar' | 'fr';
type Scene = 'cafe' | 'hotel' | 'train' | 'lesson';
type Fix = { kind: 'fix' | 'nicer'; wrong: string; right: string; why: string };
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...document.querySelectorAll(s)] as T[];
const esc = (t: string) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const track = (name: string, props: Record<string, unknown> = {}) => { if (parent !== window) parent.postMessage({ type: 'spatius-event', demo: 'language-partner', name, props }, '*'); };
const NAMES: Record<Lang, string> = { es: 'Spanish', en: 'English', zh: 'Chinese', ar: 'Arabic', fr: 'French' };
const PLACE: Record<Scene, string> = { cafe: 'Café', hotel: 'Hotel', train: 'Train station', lesson: 'My lesson' };
const SESSION_SECONDS = 180;

const st = { face: 'camille', lang: 'es' as Lang, level: 'beginner', scene: 'cafe' as Scene, history: [] as { who: 'you' | 'camille'; text: string }[], pocket: [] as string[], fixes: [] as Fix[], started: 0, busy: false };
const scene = $('#scene'), subs = $('#subs'), stateEl = $('#state');
type Choices = { lang: Lang; level: string; scene: Scene; face: string; lesson: string };
let cfg: { appId: string; region: string; faces: Record<string, { name: string; avatarId: string }>; choices?: Choices } | null = null;
let seatFor = '';
const partner = () => cfg?.faces[st.face]?.name || 'Camille';
let seat: Seat | null = null;
let seatLoading: Promise<Seat | null> | null = null;
let drawable = true;
let timer = 0;

const data = () => (SCENES as any).scenes[st.scene];
const lines = () => data()[st.lang] as { title: string; items: string[]; open: string; tr: string };

// ---------- the scene: background, counter, board, place ----------
function applyScene() {
  const s = data();
  ($('#bg') as HTMLImageElement).src = `assets/lp/${s.image}.webp`;
  ($('#front') as HTMLImageElement).src = `assets/lp/${s.image}.webp`;
  $('#front').style.clipPath = `inset(${s.clip}% 0 0 0)`;
  $('#avatarBox').style.left = `${s.avatarX}%`;
  const b = $('#board');
  Object.assign(b.style, { left: `${s.board.l}%`, top: `${s.board.t}%`, width: `${s.board.w}%`, height: `${s.board.h}%` });
  const L = lines();
  const items = st.scene === 'lesson'
    ? ($<HTMLTextAreaElement>('#lessonText').value.split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 7))
    : L.items;
  b.className = `menu${st.lang === 'ar' ? ' rtl' : ''}${st.scene === 'lesson' ? ' lesson-board' : ''}${s.board.tight ? ' tight' : ''}`;
  b.innerHTML = `<h4>${esc(L.title)}</h4>` + items.map((it) => {
    const [word, extra] = it.split(' · ');
    return `<button type="button" data-say="${esc(word)}">${esc(word)} ${extra ? `<span>${esc(it.split(' · ').slice(1).join(' · '))}</span>` : ''}</button>`;
  }).join('') + `<span class="hint">tap to hear</span>`;
  $$<HTMLButtonElement>('#board button').forEach((btn) => (btn.onclick = () => { btn.classList.add('hot'); setTimeout(() => btn.classList.remove('hot'), 1200); void say(btn.dataset.say || ''); track('board_tap'); }));
  $('#lesson').hidden = st.scene !== 'lesson';
  ($('#q') as HTMLInputElement).placeholder = `Type in ${NAMES[st.lang]}, or ask: how do I say…?`;
  if (!st.history.length) showCamille(L.open, L.tr, true);
}

// ---------- subtitles ----------
function showCamille(text: string, tr: string, intro = false) {
  subs.className = `subs${st.lang === 'ar' ? ' rtl' : ''}`;
  subs.innerHTML = `<span class="who">${partner()} · ${PLACE[st.scene]} · ${st.level}</span><span class="line" dir="auto">${esc(text)}</span>${tr ? `<span class="tr">${esc(tr)}</span>` : ''}${intro ? '<span class="tr">Press Start talking to hear her.</span>' : ''}`;
}
function showYou(text: string, fix: Fix | null, good: string | null) {
  subs.className = `subs${st.lang === 'ar' ? ' rtl' : ''}`;
  let line = esc(text);
  if (fix) {
    const at = text.indexOf(fix.wrong);
    line = `${esc(text.slice(0, at))}<span class="w wrong ${fix.kind}">${esc(fix.wrong)}<span class="fix">${esc(fix.right)}</span></span>${esc(text.slice(at + fix.wrong.length))}`;
  }
  subs.innerHTML = `<span class="who">You</span><span class="line" dir="auto">${line}</span>${fix ? `<span class="why ${fix.kind}">✎ ${esc(fix.why)}</span>` : good ? `<span class="why good">✓ ${esc(good)}</span>` : ''}`;
}
function addPocket(p: string) {
  if (!p || st.pocket.includes(p)) return;
  st.pocket.push(p);
  $('#pocketEmpty')?.remove();
  const c = document.createElement('span'); c.className = 'chip hp-type-label'; c.textContent = p; c.dir = 'auto';
  $('#pocket').appendChild(c);
}
const setState = (t: string, talking = false) => { stateEl.textContent = t; scene.classList.toggle('talking', talking); };

// ---------- the avatar ----------
// Place the avatar behind this scene's counter: head and shoulders above it, the rest hidden.
// The values per place are set by eye in scenes.json ("fit"): y moves her up, scale sets her size.
function fitAvatar(view: any, tries = 40) {
  const f = data().fit || { y: 0.25, scale: 0.6 };
  try { view.avatarTransform = { x: 0, y: f.y, scale: f.scale }; }
  catch { if (tries > 0) setTimeout(() => fitAvatar(view, tries - 1), 150); } // the renderer is still starting: try again shortly
}
let currentView: any = null;
function getSeat(): Promise<Seat | null> {
  if (!cfg || !drawable) return Promise.resolve(null);
  if (seatFor !== st.face) { seat?.dispose(); seat = null; seatLoading = null; currentView = null; $('#avatarBox').classList.remove('live'); }
  seatFor = st.face;
  const face = st.face;
  return (seatLoading ??= (async () => {
    $('#load').textContent = `${partner()} is getting ready…`;
    $('#load').classList.add('on');
    try {
      const r = await fetch('api/session', { method: 'POST' });
      const s = await r.json();
      if (!r.ok) throw new Error(s.error || 'No session.');
      await initSdk(s);
      const { start, view } = await loadSeat($('#avatar'), cfg!.faces[face].avatarId, (f) => ($('#load').textContent = `${partner()} is getting ready… ${Math.round(f * 100)}%`));
      if (face !== st.face) return null;
      currentView = view;
      (window as any).__pv = view; // for checking the fit in tests
      if (!(window as any).__nofit) fitAvatar(view);
      seat = await start();
      void seat.connect().catch(() => undefined);
      $('#avatarBox').classList.add('live');
      return seat;
    } catch (e) {
      console.warn('[partner] voice only', e);
      drawable = false;
      return null;
    } finally {
      $('#load').classList.remove('on');
    }
  })());
}
async function voice(text: string) {
  const r = await fetch('api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: st.lang, level: st.level, face: st.face }) });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || 'The voice did not come through.');
  const reader = r.body.getReader();
  let held = new Uint8Array(0); let ended = false;
  return async (): Promise<Int16Array | null> => {
    for (;;) {
      if (held.length >= 9600 || (ended && held.length >= 2)) { const whole = held.length - (held.length % 2); const out = new Int16Array(held.slice(0, whole).buffer); held = held.slice(whole); return out; }
      if (ended) return null;
      const { value, done } = await reader.read();
      if (done) { ended = true; continue; }
      const n = new Uint8Array(held.length + value.length); n.set(held); n.set(value, held.length); held = n;
    }
  };
}
async function playPlain(next: () => Promise<Int16Array | null>) {
  const ctx = new AudioContext({ sampleRate: 24000 }); let at = ctx.currentTime + 0.05;
  for (let c = await next(); c; c = await next()) { const buf = ctx.createBuffer(1, c.length, 24000); const ch = buf.getChannelData(0); for (let i = 0; i < c.length; i++) ch[i] = c[i] / 32768; const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(at); at += buf.duration; }
  await new Promise((r) => setTimeout(r, Math.max(0, (at - ctx.currentTime) * 1000)));
}
async function say(text: string) {
  if (!text) return;
  setState('Speaking', true);
  try {
    const next = await voice(text);
    const s = await getSeat();
    if (s) await s.stream(next).done; else await playPlain(next);
  } catch (e) {
    console.warn(e);
    subs.insertAdjacentHTML('beforeend', `<span class="why">${esc((e as Error).message)}</span>`);
  } finally { if (!scene.classList.contains('done')) setState('Your turn'); }
}

// ---------- the conversation ----------
function startSession() {
  if (st.started) return;
  st.started = Date.now();
  timer = window.setTimeout(() => endSession(), SESSION_SECONDS * 1000);
}
async function start() {
  if (scene.classList.contains('done')) reset();
  startSession();
  const L = lines();
  showCamille(L.open, L.tr);
  st.history.push({ who: 'camille', text: L.open });
  track('start', { lang: st.lang, scene: st.scene, level: st.level });
  scene.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await say(L.open);
  $('#q').focus();
}
async function send(text: string) {
  text = text.trim();
  if (!text || st.busy) return;
  if (scene.classList.contains('done')) keepTalking();
  if (!st.history.length) { void start(); }
  startSession();
  st.busy = true;
  showYou(text, null, null);
  setState('Thinking');
  try {
    const r = await fetch('api/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, face: st.face, lang: st.lang, level: st.level, scene: st.scene, lesson: $<HTMLTextAreaElement>('#lessonText').value, history: st.history }) });
    const a = await r.json();
    if (!r.ok || a.error) { subs.insertAdjacentHTML('beforeend', `<span class="why">${esc(a.error || 'Something went wrong.')}</span>`); return; }
    st.history.push({ who: 'you', text });
    showYou(text, a.fix, a.good);
    if (a.fix) st.fixes.push(a.fix);
    (a.pocket || []).forEach(addPocket);
    $$<HTMLButtonElement>('#board button').forEach((b) => b.classList.toggle('hot', (a.board || []).some((x: string) => x.startsWith(b.dataset.say || '~'))));
    track('message', { fix: a.fix?.kind || (a.good ? 'good' : 'none') });
    await new Promise((res) => setTimeout(res, a.fix ? 2600 : 1400)); // time to read the red pen
    showCamille(a.reply, a.translation);
    st.history.push({ who: 'camille', text: a.reply });
    await say(a.reply);
  } catch (e) {
    subs.insertAdjacentHTML('beforeend', `<span class="why">${esc((e as Error).message)}</span>`);
  } finally {
    st.busy = false; if (stateEl.textContent === 'Thinking') setState('Your turn');
  }
}
$('#ask').onsubmit = (e) => { e.preventDefault(); const q = $<HTMLInputElement>('#q'); const v = q.value; q.value = ''; void send(v); };
$('#start').onclick = () => void start();

// ---------- microphone ----------
let rec: MediaRecorder | null = null;
$('#mic').onclick = async () => {
  const mic = $('#mic');
  if (rec) { rec.stop(); return; }
  if (st.busy) return;
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { subs.insertAdjacentHTML('beforeend', '<span class="why">Allow the microphone, or type your answer.</span>'); return; }
  if (!st.history.length) void start();
  void getSeat();
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); rec = r;
  const parts: Blob[] = []; r.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize); let heard = false, quiet = performance.now(); const began = performance.now();
  const tick = window.setInterval(() => {
    an.getFloatTimeDomainData(buf); const rms = Math.sqrt(buf.reduce((n, x) => n + x * x, 0) / buf.length);
    if (rms > 0.02) { heard = true; quiet = performance.now(); }
    const now = performance.now();
    if ((heard && now - quiet > 1400) || now - began > 15000 || (!heard && now - began > 7000)) r.stop();
  }, 100);
  r.onstop = async () => {
    window.clearInterval(tick); void ac.close(); stream.getTracks().forEach((t) => t.stop()); rec = null;
    mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false');
    if (!heard || !parts.length) { setState('Your turn'); return; }
    setState('Listening');
    const res = await fetch('api/hear', { method: 'POST', headers: { 'Content-Type': r.mimeType || 'audio/webm', 'x-lang': st.lang }, body: new Blob(parts, { type: r.mimeType || 'audio/webm' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.text) { subs.insertAdjacentHTML('beforeend', `<span class="why">${esc(d.error || "I didn't catch that. Try again, or type it.")}</span>`); setState('Your turn'); return; }
    void send(d.text);
  };
  r.start(250); mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); setState('Listening');
};

// ---------- end: the pocket opens ----------
const WOW: Record<Lang, string> = { es: '¡Muy bien!', en: 'Well done!', zh: '很好！', ar: 'أحسنت!', fr: 'Bravo !' };
let nextScene: Scene = 'hotel';
function endSession() {
  window.clearTimeout(timer);
  seat?.interrupt();
  $('#sumNew').innerHTML = st.pocket.length ? st.pocket.map((p) => `<li dir="auto">${esc(p)}</li>`).join('') : '<li>Say a few sentences to fill your pocket.</li>';
  $('#sumFix').innerHTML = st.fixes.length ? st.fixes.map((f) => `<li dir="auto"><s>${esc(f.wrong)}</s> ${esc(f.right)}</li>`).join('') : '<li>No mistakes. Well done!</li>';
  nextScene = (['cafe', 'hotel', 'train'] as Scene[]).find((s) => s !== st.scene) || 'hotel';
  $('#sumNext').innerHTML = (st.fixes.slice(0, 2).map((f) => `<li>${esc(f.why)}</li>`).join('')) || '<li>Try a harder level, or a new place.</li>';
  $('#sumWow').textContent = WOW[st.lang];
  $('#sumNextPlace').textContent = `Try the ${PLACE[nextScene].toLowerCase()}`;
  setState('Done'); scene.classList.add('done');
  $('#sumAgain').focus({ preventScroll: true });
  track('end', { pocket: st.pocket.length, fixes: st.fixes.length });
}
function reset() {
  scene.classList.remove('done'); st.history = []; st.pocket = []; st.fixes = []; st.started = 0; window.clearTimeout(timer);
  $$('#pocket .chip').forEach((c) => c.remove());
  if (!$('#pocketEmpty')) $('#pocket').insertAdjacentHTML('beforeend', '<span class="empty hp-type-label" id="pocketEmpty">Phrases you get right land here.</span>');
}
$('#end').onclick = () => endSession();
// three ways out of the pocket: keep talking, start again, or go to the next place
function keepTalking() {
  if (!scene.classList.contains('done')) return;
  scene.classList.remove('done'); setState('Your turn');
  window.clearTimeout(timer); timer = window.setTimeout(() => endSession(), SESSION_SECONDS * 1000);
  $('#q').focus();
}
$('#sumClose').onclick = keepTalking;
$('#sumKeep').onclick = keepTalking;
$('#sumAgain').onclick = () => { reset(); void start(); };
$('#sumNextPlace').onclick = () => { ($(`#scenes [data-scene="${nextScene}"]`) as HTMLButtonElement).click(); void start(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') keepTalking(); });

// ---------- choices ----------
function group(id: string, key: 'lang' | 'level' | 'scene') {
  $(id).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    $$(`${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    (st as any)[key] = b.dataset[key];
    reset(); seat?.interrupt(); setState('Ready');
    applyScene(); track(`${key}_pick`, { [key]: (st as any)[key] });
    if (key === 'scene' && currentView) fitAvatar(currentView); // each place has its own counter height
  });
}
group('#langs', 'lang'); group('#levels', 'level'); group('#scenes', 'scene');
$('#faces').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'); if (!b || b.dataset.face === st.face) return;
  $$('#faces button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  st.face = b.dataset.face!;
  $('#avatarBox').classList.toggle('other', st.face !== 'camille');
  reset(); setState('Ready'); applyScene(); track('face_pick', { face: st.face });
  if (seat) void getSeat();
});
$('#lessonText').addEventListener('input', () => { if (st.scene === 'lesson') applyScene(); });
$$<HTMLButtonElement>('.info-btn').forEach((b) => (b.onclick = () => { const box = document.getElementById(b.getAttribute('aria-controls')!)!; const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); box.hidden = !open; }));

// ---------- build it: the download starts with the learner's choices ----------
$('#download')?.addEventListener('click', (e) => { // only on the demo page; the template has no Build it buttons
  const q = new URLSearchParams({ lang: st.lang, level: st.level, scene: st.scene, face: st.face });
  const lesson = $<HTMLTextAreaElement>('#lessonText').value.trim();
  if (st.scene === 'lesson' && lesson) q.set('lesson', lesson.slice(0, 1500));
  (e.currentTarget as HTMLAnchorElement).href = `api/download?${q}`;
  track('download', { lang: st.lang, scene: st.scene, face: st.face });
});
$('#deploy')?.addEventListener('click', () => track('deploy_click'));
$('#github')?.addEventListener('click', () => track('github_click'));

// ---------- start ----------
applyScene();
// the page starts with the choices from the server (your .env), if it sends them
function useChoices(c: Choices) {
  if (c.lesson) $<HTMLTextAreaElement>('#lessonText').value = c.lesson;
  const press = (sel: string) => { const b = document.querySelector<HTMLButtonElement>(sel); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); };
  press(`#faces [data-face="${c.face}"]`); press(`#langs [data-lang="${c.lang}"]`); press(`#levels [data-level="${c.level}"]`); press(`#scenes [data-scene="${c.scene}"]`);
}
// choices in the address (?lang=fr&scene=hotel, used by embed.js) win over the server's starting choices
const fromUrl = (c: Partial<Choices> = {}) => { const q = new URLSearchParams(location.search); for (const k of ['lang', 'level', 'scene', 'face'] as const) { const v = q.get(k); if (v && /^[a-z]{2,12}$/.test(v)) (c as any)[k] = v; } return c as Choices; };
fetch('api/config').then((r) => r.json()).then(async (c) => { cfg = c; useChoices(fromUrl({ ...(c.choices || {}) })); drawable = await canDraw(); }).catch(() => { drawable = false; });
const report = () => parent !== window && parent.postMessage({ type: 'spatius-embed-height', demo: 'language-partner', height: document.documentElement.scrollHeight }, '*');
new ResizeObserver(report).observe(document.body);
