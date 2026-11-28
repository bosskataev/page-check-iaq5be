// Пробная страница съёмки: экраны, камера, запись, журнал.
// Одноразовый код этапа 5 (D-188). План: docs/05-ux/capture-check.md, часть 1.
// Логика чисел, годности, исхода, предупреждений и отчёта — в logic.js. Тексты — только T[...] (номер = TXT-CAP-NN).
// Страница ничего никуда не отправляет. Снимки и видео — только в памяти вкладки.

import * as L from './logic.js';

const T = L.T;
const KEY = 'capture-check-journal-v2';
const YES = T[158];
const NO = T[159];

let state = L.newState();
let marks = [];
let storageOk = false;
let uaInfo = null; // {system, model, browser} — из userAgentData или строки браузера
let token = 0; // меняется при каждой смене экрана: отложенные ответы не трогают чужой экран

// То, что живёт только в памяти вкладки.
const rt = {
  stream: null,
  session: null, // текущая запись
  lastSession: null,
  ctl: null, // камера текущего шага 2–8
  urls: [], // адреса blob текущего шага
  media: [], // элементы video/img текущего шага
  previews: [],
  photos: [], // снимки шага 3: {url, img, f}
  onReturn: null
};

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Журнал в хранилище браузера (раздел 9, пункт 4): только текст и числа
// ---------------------------------------------------------------------------
function storageAvailable() {
  try {
    const k = KEY + '-test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function runStarted() {
  return !!(state.run.startedAt || state.run.failed);
}

// Ответы стартового экрана тоже сохраняются: если страница откроется заново до «Начать проверку»,
// она откроется с ними (раздел 9, пункт 4; TXT-CAP-343).
function save() {
  if (!storageOk) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ state: state, marks: marks }));
  } catch (e) {
    // хранилище переполнено или закрыто — проверка идёт без журнала
  }
}

function mark(step, what, phase) {
  marks.push({ t: Date.now(), step: step, what: what, phase: phase });
  if (marks.length > 500) marks.splice(0, marks.length - 500);
  save();
}

function clearJournal() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    // нечего стирать
  }
}

// ---------------------------------------------------------------------------
// Разметка
// ---------------------------------------------------------------------------
function h(tag, props, children) {
  const e = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
  }
  (children || []).forEach(function (c) {
    if (c === null || c === undefined || c === false) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

function p(text, cls) {
  return h('p', { class: cls || null, text: text });
}

function btn(text, onClick, cls) {
  return h('button', { type: 'button', class: cls || null, text: text, onclick: onClick });
}

function show(nodes) {
  token++;
  app.textContent = '';
  nodes.forEach(function (n) { if (n) app.appendChild(n); });
  window.scrollTo(0, 0);
}

function options(nums) {
  return nums.map(function (n) { return { label: T[n], value: L.ans(n) }; });
}

function splitOptions(n) {
  return T[n].split(' / ').map(function (l) { return { label: l, value: L.lowerFirst(l) }; });
}

// Вопрос с кнопками-ответами; ответ сразу пишется в журнал.
function choice(question, opts, get, set, after) {
  const row = h('div', { class: 'choices' });
  const buttons = opts.map(function (o) {
    const b = h('button', { type: 'button', text: o.label });
    b.addEventListener('click', function () {
      set(o.value);
      refresh();
      save();
      if (after) after(o.value);
    });
    row.appendChild(b);
    return { b: b, o: o };
  });
  function refresh() {
    const cur = get();
    buttons.forEach(function (x) { x.b.setAttribute('aria-pressed', String(cur === x.o.value)); });
  }
  refresh();
  return h('div', { class: 'q' }, [p(question, 'q-text'), row]);
}

function yesNo(question, obj, key, after) {
  return choice(question, splitOptions(39), function () { return obj[key]; }, function (v) { obj[key] = v; }, after);
}

function slot() {
  return h('div', { class: 'section' });
}

function fill(el, nodes) {
  el.textContent = '';
  nodes.forEach(function (n) { if (n) el.appendChild(n); });
}

// ---------------------------------------------------------------------------
// Сведения о браузере (И2–И6, И20, И23)
// ---------------------------------------------------------------------------
function detectUa() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  if (uad && typeof uad.getHighEntropyValues === 'function') {
    uaInfo = { system: null, model: null, browser: null };
    uad.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']).then(function (high) {
      uaInfo = L.describeUaData(uad.platform, high);
      applyUaInfo();
    }, function () {
      applyUaInfo();
    });
  } else {
    uaInfo = L.parseUserAgent(ua);
  }
}

function applyUaInfo() {
  if (runStarted()) {
    state.env.system = uaInfo.system;
    state.env.model = uaInfo.model;
    state.env.browser = uaInfo.browser;
    save();
  }
  const el = document.getElementById('ua-block');
  if (el) el.textContent = uaLine();
}

function uaLine() {
  const i = uaInfo || {};
  return T[20]
    .replace('{…}', i.system || T[21])
    .replace('{…}', i.model || T[21])
    .replace('{…}', i.browser || T[21])
    .replace('{…}', screen && screen.width ? String(screen.width) : T[21]); // TXT-CAP-20, TXT-CAP-21
}

function hasGUM() {
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

function hasWakeLock() {
  return !!(navigator.wakeLock && typeof navigator.wakeLock.request === 'function');
}

function measureEnv() {
  const e = state.env;
  e.ua = navigator.userAgent || '';
  e.system = uaInfo ? uaInfo.system : null;
  e.model = uaInfo ? uaInfo.model : null;
  e.browser = uaInfo ? uaInfo.browser : null;
  e.innerWidth = window.innerWidth;
  e.screenWidth = screen ? screen.width : null;
  e.secure = !!window.isSecureContext;
  e.storage = storageOk;
  e.hasGUM = hasGUM();
  e.hasRecorder = typeof window.MediaRecorder === 'function';
  e.hasWakeLock = hasWakeLock();
  if (e.hasRecorder && typeof window.MediaRecorder.isTypeSupported === 'function') {
    const r = L.pickRecorderType(function (t) { return window.MediaRecorder.isTypeSupported(t); });
    e.supportedTypes = r.supported;
    e.chosenType = r.chosen;
  } else {
    e.supportedTypes = [];
    e.chosenType = null;
  }
}

// ---------------------------------------------------------------------------
// Ошибки страницы (И19)
// ---------------------------------------------------------------------------
function addError(text) {
  const t = L.sanitizeErrorText(text);
  if (!t || state.errors.indexOf(t) >= 0 || state.errors.length >= 10) return;
  state.errors.push(t);
  save();
}

function errName(e) {
  if (e && e.name) return String(e.name);
  return L.sanitizeErrorText(String(e));
}

// ---------------------------------------------------------------------------
// Камера
// ---------------------------------------------------------------------------
const VIDEO_CONSTRAINTS = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };

function streamLive() {
  return !!rt.stream && rt.stream.getVideoTracks().some(function (t) { return t.readyState === 'live'; });
}

// Дорожки, которые остановила сама страница, помечаются: их конец — не «камера погасла».
function stopTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach(function (t) {
    t.byPage = true;
    try { t.stop(); } catch (e) { /* уже остановлена */ }
  });
}

function stopStream() {
  stopTracks(rt.stream);
  rt.stream = null;
  rt.previews.forEach(function (v) { try { v.srcObject = null; } catch (e) { /* нет */ } });
  rt.previews = [];
}

function watchTracks(stream) {
  stream.getTracks().forEach(function (t) {
    t.addEventListener('ended', function () { if (!t.byPage) mark(state.step, 'дорожка закончилась: ' + t.kind, 'событие'); });
    t.addEventListener('mute', function () { mark(state.step, 'дорожка заглушена: ' + t.kind, 'событие'); });
    t.addEventListener('unmute', function () { mark(state.step, 'дорожка снова идёт: ' + t.kind, 'событие'); });
  });
}

// Запрос камеры со звуком; если звук недоступен — без звука (в отчёте «Микрофон получен: нет»).
// Поток отдаётся вызвавшему: он сам решает, нужен ли ещё поток (экран мог смениться).
async function requestCamera() {
  const t0 = performance.now();
  let name = null;
  let stream = null;
  stopStream();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: true });
  } catch (e) {
    name = errName(e);
    if (state.env.hasGUM && name !== 'NotAllowedError' && name !== 'SecurityError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
        name = null;
        mark(state.step, 'микрофон недоступен, камера без звука', 'событие');
      } catch (e2) {
        name = errName(e2);
      }
    }
  }
  const seconds = (performance.now() - t0) / 1000;
  if (stream) {
    watchTracks(stream);
    return { ok: true, stream: stream, name: null, seconds: seconds };
  }
  return { ok: false, stream: null, name: name, seconds: seconds, kind: L.cameraErrorKind(name, state.env.hasGUM) };
}

// Принять поток, если экран, который его просил, ещё открыт; иначе выключить.
function takeStream(r, my) {
  if (!r.ok) return false;
  if (my !== token) { stopTracks(r.stream); return false; }
  stopStream();
  rt.stream = r.stream;
  return true;
}

function queryPerms() {
  function one(name) {
    try {
      if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return Promise.resolve(null);
      return navigator.permissions.query({ name: name }).then(function (s) { return s.state; }, function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  return Promise.all([one('camera'), one('microphone')]).then(function (r) { return { camera: r[0], microphone: r[1] }; });
}

function preview() {
  const v = h('video', { class: 'preview', playsinline: true, 'webkit-playsinline': true, muted: true, autoplay: true });
  v.muted = true;
  v.playsInline = true;
  rt.previews.push(v);
  return v;
}

function attachPreview(v) {
  if (!rt.stream || !v) return;
  if (rt.previews.indexOf(v) < 0) rt.previews.push(v);
  v.srcObject = rt.stream;
  const pr = v.play();
  if (pr && pr.catch) pr.catch(function () { /* показ начнётся сам */ });
}

function cameraSettings() {
  const vt = rt.stream ? rt.stream.getVideoTracks()[0] : null;
  const s = vt && typeof vt.getSettings === 'function' ? vt.getSettings() : {};
  state.steps[2].camera = {
    facing: s.facingMode || null,
    width: typeof s.width === 'number' ? s.width : null,
    height: typeof s.height === 'number' ? s.height : null,
    fps: typeof s.frameRate === 'number' ? s.frameRate : null
  };
  state.steps[2].mic = rt.stream ? rt.stream.getAudioTracks().length > 0 : false;
}

// Подсказка, как разрешить камеру (h4 — подзаголовки TXT-CAP-51, 54, 57).
function hintNode(text) {
  return L.HINT_HEADINGS.indexOf(text) >= 0 ? h('h4', { text: text }) : p(text);
}

function hintNodes1() {
  if (state.run.opened === 'browser') return [T[51], T[52], T[53], T[54], T[55], T[56]].map(hintNode);
  return [hintNode(T[57]), p(T[58])];
}

// ---------------------------------------------------------------------------
// Камера на шагах 2–8 (раздел 9, пункт 15; И22)
// ---------------------------------------------------------------------------
// Включает камеру сам; показывает сообщение по виду ошибки (TXT-CAP-313…319, 344, 350);
// «картинки нет» — через 5 секунд без картинки или когда камера погасла посреди шага.
// hooks.onReady — картинка пошла; hooks.onLost(why) — камеры нет ('error', 'nopic', 'recording').
function makeCam(n, previewEl, hooks) {
  const st = state.steps[n];
  const ctl = {
    n: n, my: token, message: null, kind: null, errorName: null, pictureOk: false, everOn: false,
    o5Here: false, busy: false, poll: null, timer: null,
    top: slot(), o5El: slot(), bottom: slot()
  };
  rt.ctl = ctl;

  function alive() { return ctl.my === token; }

  function render() {
    if (!ctl.message) {
      fill(ctl.top, []);
      fill(ctl.bottom, []);
      return;
    }
    const kind = ctl.message === 'error' ? ctl.kind : ctl.message;
    const m = L.stepCameraMessage(n, kind, { opened: state.run.opened, askO5: ctl.o5Here });
    fill(ctl.top, [m.heading ? h('h3', { text: m.heading }) : null].concat(m.texts.map(function (t) { return p(t, 'error'); })));
    fill(ctl.bottom, m.hints.map(hintNode).concat([m.retry ? btn(m.retry, request, 'primary') : null]));
  }

  function renderO5() {
    if (!ctl.o5Here || ctl.o5El.firstChild) return;
    fill(ctl.o5El, [choice(T[43], options([44, 45, 46, 47]), function () { return state.o5; }, function (v) {
      state.o5 = v;
      state.o5Step = n;
    })]);
  }

  function stopWatch() {
    clearInterval(ctl.poll);
    clearTimeout(ctl.timer);
    ctl.poll = null;
    ctl.timer = null;
  }

  function pictureCame() {
    stopWatch();
    ctl.pictureOk = true;
    if (ctl.message === 'nopic') { ctl.message = null; render(); }
    mark(n, 'картинка камеры пошла', 'событие');
    if (n === 2) { cameraSettings(); save(); }
    hooks.onReady();
  }

  function watchPicture() {
    stopWatch();
    ctl.pictureOk = false;
    if (!previewEl) return;
    ctl.poll = setInterval(function () {
      if (!alive()) { stopWatch(); return; }
      if (previewEl.videoWidth > 0) pictureCame();
    }, 200);
    ctl.timer = setTimeout(function () {
      ctl.timer = null;
      if (!alive() || ctl.pictureOk) return;
      ctl.message = 'nopic';
      mark(n, 'картинки нет 5 секунд', 'событие');
      render();
      hooks.onLost('nopic');
    }, L.NO_PICTURE_SECONDS * 1000);
  }

  function watchEnd() {
    const vt = rt.stream ? rt.stream.getVideoTracks()[0] : null;
    if (!vt) return;
    vt.addEventListener('ended', function () {
      if (vt.byPage || !alive()) return;
      mark(n, 'камера погасла посреди шага', 'событие');
      const s = rt.session;
      if (s && !s.finalized && s.step === n) { hooks.onLost('recording'); return; }
      stopWatch();
      ctl.pictureOk = false;
      ctl.message = 'nopic';
      render();
      hooks.onLost('nopic');
      // Если картинка вернётся сама — сообщение убирается.
      watchPictureAfterLoss();
    });
  }

  function watchPictureAfterLoss() {
    if (!previewEl) return;
    ctl.poll = setInterval(function () {
      if (!alive()) { stopWatch(); return; }
      if (streamLive() && previewEl.videoWidth > 0) pictureCame();
    }, 500);
  }

  function on() {
    ctl.everOn = true;
    if (ctl.message === 'error') { ctl.message = null; render(); }
    attachPreview(previewEl);
    watchEnd();
    watchPicture();
  }

  // Доступ на шаге получен — сразу в журнал (поле TXT-CAP-361).
  function granted() {
    st.granted = true;
    mark(n, 'доступ к камере получен', 'событие');
  }

  function request() {
    if (ctl.busy || !alive()) return;
    ctl.busy = true;
    hooks.onLost('busy');
    mark(n, 'запрос камеры', 'начато');
    requestCamera().then(function (r) {
      ctl.busy = false;
      mark(n, 'запрос камеры', 'закончено');
      if (r.ok) granted(); // запрос на этом шаге получил доступ, даже если ответ пришёл после ухода с шага
      if (!takeStream(r, ctl.my)) {
        if (r.ok || !alive()) return;
      } else {
        on();
        return;
      }
      if (r.name === 'NotAllowedError') st.denied = true;
      ctl.errorName = r.name;
      if (ctl.everOn) {
        ctl.message = 'nopic';
      } else {
        ctl.message = 'error';
        ctl.kind = r.kind;
        if (r.kind === 'denied' && L.askO5OnStep(state)) {
          ctl.o5Here = true;
          if (state.o5Shown.indexOf(n) < 0) state.o5Shown.push(n);
        }
      }
      save();
      render();
      renderO5();
      hooks.onLost(ctl.message);
    }).catch(function (e) {
      ctl.busy = false;
      addError(e && e.name ? e.name + (e.message ? ': ' + e.message : '') : String(e));
    });
  }

  ctl.request = request;
  ctl.nodes = [ctl.top, ctl.o5El, ctl.bottom];
  ctl.start = function () {
    ctl.my = token; // экран уже показан (show меняет token)
    if (!state.env.hasGUM) {
      ctl.message = 'unsupported';
      render();
      hooks.onLost('unsupported');
      return;
    }
    if (streamLive()) {
      // Камера, включённая на прошлом шаге, работает и на этом: доступ на шаге есть.
      granted();
      on();
      return;
    }
    request();
  };
  ctl.ui = function () {
    return { message: ctl.message === 'unsupported' ? 'unsupported' : ctl.message, errorName: ctl.errorName, o5Here: ctl.o5Here };
  };
  ctl.pause = stopWatch;
  return ctl;
}

// ---------------------------------------------------------------------------
// Измерение файлов (И11–И15)
// ---------------------------------------------------------------------------
function keepUrl(blob) {
  const url = URL.createObjectURL(blob);
  rt.urls.push(url);
  return url;
}

function dropUrl(url) {
  const i = rt.urls.indexOf(url);
  if (i >= 0) rt.urls.splice(i, 1);
  try { URL.revokeObjectURL(url); } catch (e) { /* нет */ }
}

function dropMedia(el) {
  if (!el) return;
  try {
    if (el.tagName === 'VIDEO') { el.pause(); el.removeAttribute('src'); el.load(); } else { el.removeAttribute('src'); }
  } catch (e) { /* нет */ }
  const i = rt.media.indexOf(el);
  if (i >= 0) rt.media.splice(i, 1);
}

function releaseMedia() {
  if (rt.session) abandonSession();
  rt.media.forEach(function (m) {
    try {
      if (m.tagName === 'VIDEO') { m.pause(); m.removeAttribute('src'); m.load(); } else { m.removeAttribute('src'); }
    } catch (e) { /* нет */ }
  });
  rt.media = [];
  rt.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* нет */ } });
  rt.urls = [];
  rt.photos = [];
}

function playedSeconds(v) {
  let s = 0;
  try {
    for (let i = 0; i < v.played.length; i++) s += v.played.end(i) - v.played.start(i);
  } catch (e) { /* нет */ }
  return s;
}

// Длительность по файлу: сразу; если бесконечность или не число — перемотка в конец и ожидание durationchange ≤ 10 с.
function measureVideo(player, f, onUpdate) {
  f.fileSeconds = null;
  f.durationMethod = null;
  f.playable = null;
  f.audio = null;
  f.width = null;
  f.height = null;
  let measuring = false;
  const metaTimer = setTimeout(function () {
    if (f.durationMethod === null) { f.durationMethod = T[160]; save(); onUpdate(); }
  }, 10000);

  function setDuration(d, method) {
    f.fileSeconds = d;
    f.durationMethod = method;
    save();
    onUpdate();
  }

  player.addEventListener('loadedmetadata', function () {
    clearTimeout(metaTimer);
    f.width = player.videoWidth || null;
    f.height = player.videoHeight || null;
    audioStatic();
    const d = player.duration;
    if (typeof d === 'number' && isFinite(d)) {
      setDuration(d, T[188]);
      return;
    }
    measuring = true;
    let done = false;
    function finish(d2, method) {
      if (done) return;
      done = true;
      player.removeEventListener('durationchange', onDC);
      clearTimeout(tm);
      try { player.currentTime = 0; } catch (e) { /* нет */ }
      measuring = false;
      setDuration(d2, method);
    }
    function onDC() {
      if (typeof player.duration === 'number' && isFinite(player.duration)) finish(player.duration, T[189]);
    }
    const tm = setTimeout(function () { finish(null, T[160]); }, 10000);
    player.addEventListener('durationchange', onDC);
    try { player.currentTime = 1e101; } catch (e) { /* нет */ }
  }, { once: true });

  player.addEventListener('canplay', function () {
    if (f.playable === null) { f.playable = YES; save(); onUpdate(); }
  });
  player.addEventListener('error', function () {
    f.playable = T[165];
    if (f.durationMethod === null) { clearTimeout(metaTimer); f.durationMethod = T[160]; }
    save();
    onUpdate();
  });

  // И14: звуковая дорожка — все признаки, какие есть в браузере (решение оркестратора Д-35):
  // audioTracks — при loadedmetadata и ещё раз после начала проигрывания; mozHasAudio;
  // webkitAudioDecodedByteCount вместе с webkitVideoDecodedByteCount — во время проигрывания и после,
  // но не во время перемотки для длительности. Итог — L.audioVerdict; нет ответа — «не сообщает».
  const seen = { yes: false, no: false };
  function addAudio(sig) {
    const s = L.audioSignal(sig);
    if (s === 'yes') seen.yes = true;
    if (s === 'no') seen.no = true;
    const v = L.audioVerdict([seen.yes ? 'yes' : null, seen.no ? 'no' : null]);
    if (v !== f.audio) { f.audio = v; save(); onUpdate(); }
  }
  function tracksCheck() {
    if (player.audioTracks && typeof player.audioTracks.length === 'number') addAudio({ kind: 'tracks', n: player.audioTracks.length });
  }
  function audioStatic() {
    tracksCheck();
    if (typeof player.mozHasAudio === 'boolean') addAudio({ kind: 'moz', value: player.mozHasAudio });
  }
  player.addEventListener('playing', tracksCheck, { once: true });
  if (typeof player.webkitAudioDecodedByteCount === 'number') {
    const check = function () {
      if (measuring || seen.yes) return;
      addAudio({
        kind: 'webkit',
        audio: player.webkitAudioDecodedByteCount,
        video: player.webkitVideoDecodedByteCount,
        played: playedSeconds(player)
      });
    };
    player.addEventListener('timeupdate', check);
    player.addEventListener('pause', check);
    player.addEventListener('ended', check);
  }
}

function videoPlayer(url) {
  const v = h('video', { controls: true, playsinline: true, 'webkit-playsinline': true, preload: 'metadata' });
  v.playsInline = true;
  v.src = url;
  rt.media.push(v);
  return v;
}

// Фото из файла: размеры после декодирования. Имя файла не читается.
function photoFromFile(file, f, done) {
  f.received = file.size > 0 ? YES : T[198];
  f.bytes = file.size;
  f.type = file.type || null;
  f.width = null;
  f.height = null;
  const img = h('img', { class: 'shot', alt: '' });
  rt.media.push(img);
  const url = keepUrl(file);
  img.onload = function () { f.width = img.naturalWidth || null; f.height = img.naturalHeight || null; save(); done(img, url); };
  img.onerror = function () { save(); done(img, url); };
  img.src = url;
  return { img: img, url: url };
}

// notInReport — файл в отчёт не идёт: TXT-CAP-325 вместо TXT-CAP-109.
function photoNodes(f, img, notInReport) {
  const nodes = [img, p(L.photoLine(f), 'line')];
  if (!L.withinPhotoLimit(f.bytes)) nodes.push(p(L.overLimitText(f.bytes, L.PHOTO_LIMIT_MB, notInReport), 'error'));
  return nodes;
}

// Видео из файла (камера телефона, галерея, запасной путь шагов 4–6): плеер, строка TXT-CAP-135, подсказка TXT-CAP-98.
// notInReport — видео запасного пути: TXT-CAP-324 и TXT-CAP-325 вместо TXT-CAP-108 и TXT-CAP-109.
function videoFromFile(file, f, area, notInReport, onUpdate) {
  f.received = file.size > 0 ? YES : T[198];
  f.bytes = file.size;
  f.type = file.type || null;
  const url = keepUrl(file);
  const player = videoPlayer(url);
  const lineEl = slot();
  function update() {
    const nodes = [];
    if (f.durationMethod !== null) nodes.push(p(L.fileVideoLine(f), 'line'));
    if (!L.withinVideoLimit(f.bytes)) nodes.push(p(L.overLimitText(f.bytes, L.VIDEO_LIMIT_MB, notInReport), 'error'));
    if (f.playable === T[165]) nodes.push(p(notInReport ? T[324] : T[108], 'error'));
    fill(lineEl, nodes);
    if (onUpdate) onUpdate();
  }
  measureVideo(player, f, update);
  update();
  fill(area, [player, p(T[98], 'hint'), lineEl]);
  return { player: player, url: url };
}

// Скрытый выбор файла; capture="environment" — штатная камера, без него — галерея.
function picker(accept, capture, onFile, onCancel) {
  const input = h('input', { type: 'file', accept: accept, class: 'file-input', tabindex: '-1', 'aria-hidden': 'true' });
  if (capture) input.setAttribute('capture', 'environment');
  // Запасной признак возврата без файла (PHONE3-01): событие «cancel» у выбора файла есть
  // только с Safari 16.4 и Chrome 113. Если после открытия выбора страница снова стала видимой
  // или окно получило фокус, а за 1 секунду файл не пришёл, — считаем, что файл не вернулся.
  let watch = null;
  function disarm() {
    if (!watch) return;
    clearTimeout(watch.timer);
    window.removeEventListener('focus', watch.back);
    document.removeEventListener('visibilitychange', watch.back);
    watch = null;
  }
  input.addEventListener('change', function () {
    disarm();
    const file = input.files && input.files[0];
    if (file) onFile(file); else onCancel();
  });
  input.addEventListener('cancel', function () { disarm(); onCancel(); });
  input.armReturnCheck = function () {
    disarm();
    const w = { timer: 0, back: null };
    w.back = function () {
      if (watch !== w) return;
      if (!input.isConnected) { disarm(); return; }
      if (document.visibilityState === 'hidden') return;
      clearTimeout(w.timer);
      w.timer = setTimeout(function () {
        if (watch !== w) return;
        disarm();
        if (input.isConnected) onCancel();
      }, 1000);
    };
    window.addEventListener('focus', w.back);
    document.addEventListener('visibilitychange', w.back);
    watch = w;
  };
  return input;
}

function openPicker(input) {
  try { input.value = ''; } catch (e) { /* нет */ }
  if (input.armReturnCheck) input.armReturnCheck();
  input.click();
}

function kindOk(file, prefix) {
  return !file.type || file.type.indexOf(prefix) === 0;
}

// ---------------------------------------------------------------------------
// Экран «Начало»
// ---------------------------------------------------------------------------
function renderStart() {
  state.screen = 'start';
  const run = state.run;
  const capEl = p('', 'info');
  const whereEl = slot();
  const startBtn = btn(T[24], startRun, 'primary');

  function refresh() {
    const cap = L.runNumber(run.phone, run.opened);
    capEl.textContent = cap ? L.runNumberText(cap) : '';
    capEl.hidden = !cap;
    startBtn.disabled = !cap;
    if (run.opened && run.opened !== 'browser') {
      if (!whereEl.firstChild) {
        fill(whereEl, [choice(T[14], options([15, 16, 17]), function () { return run.where; }, function (v) { run.where = v; })]);
      }
    } else {
      run.where = null;
      fill(whereEl, []);
    }
  }

  const modelIn = h('input', { type: 'text', id: 'model', maxlength: '60', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  modelIn.value = run.model || '';
  modelIn.addEventListener('input', function () { run.model = modelIn.value; save(); });
  const osIn = h('input', { type: 'text', id: 'os', maxlength: '30', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  osIn.value = run.os || '';
  osIn.addEventListener('input', function () { run.os = osIn.value; save(); });

  show([
    h('h1', { text: T[1] }),
    p(T[2]),
    p(T[3]),
    p(T[343], 'notice'),
    window.isSecureContext ? null : p(T[28], 'error'),
    storageOk ? null : p(T[29], 'notice'),
    choice(T[4], [5, 6, 7, 8].map(function (n) { return { label: T[n], value: T[n] }; }),
      function () { return run.phone; }, function (v) { run.phone = v; }, refresh),
    p(T[9], 'hint'),
    choice(T[10], [{ label: T[11], value: 'browser' }, { label: T[12], value: 'telegram' }, { label: T[13], value: 'max' }],
      function () { return run.opened; }, function (v) { run.opened = v; }, refresh),
    whereEl,
    capEl,
    h('h2', { text: T[19] }),
    h('p', { id: 'ua-block', text: uaLine() }),
    h('label', { for: 'model', text: T[171] }),
    modelIn,
    h('label', { for: 'os', text: T[22] }),
    osIn,
    p(T[23], 'hint'),
    startBtn,
    failButton()
  ]);
  refresh();
  save();
}

function startRun() {
  if (!L.runNumber(state.run.phone, state.run.opened)) return;
  state.run.startedAt = Date.now();
  measureEnv();
  state.screen = 'before';
  save();
  renderBefore();
}

// ---------------------------------------------------------------------------
// Экран «Перед съёмкой»
// ---------------------------------------------------------------------------
function renderBefore() {
  state.screen = 'before';
  save();
  show([
    h('h2', { text: T[33] }),
    p(T[34]),
    p(T[35], 'notice'),
    btn(T[36], function () { enterStep(1); }, 'primary'),
    failButton()
  ]);
}

// ---------------------------------------------------------------------------
// Шаги: вход, выход, навигация, предупреждение перед «Дальше» (раздел 9, пункт 14)
// ---------------------------------------------------------------------------
function enterStep(n) {
  releaseMedia();
  rt.previews.forEach(function (v) { try { v.srcObject = null; } catch (e) { /* нет */ } });
  rt.previews = [];
  rt.ctl = null;
  rt.onReturn = null;
  rt.onProblem = null;
  state.screen = 'step';
  state.step = n;
  state.openStep = n;
  state.steps[n].status = 'active';
  mark(n, 'шаг', 'начато');
  save();
  renderStep(n, {});
}

function finishStep(n, how) {
  const st = state.steps[n];
  st.status = how === 'skipped' ? 'skipped' : 'done';
  state.openStep = null;
  mark(n, 'шаг', 'закончено');
}

// Отметка камеры ставится по тому, что на шаге в момент ухода (раздел 9, пункт 15).
function leaveStep(n, how) {
  const st = state.steps[n];
  if (n >= 2 && n <= 8) {
    const ctl = rt.ctl;
    const actionDone = n === 3 ? st.photos > 0 : (n >= 4 ? st.attempts > 0 : false);
    const msg = ctl && (ctl.message === 'error' || ctl.message === 'nopic') ? ctl.message : null;
    st.mark = L.markOnLeave(n, { hasGUM: state.env.hasGUM, message: msg, errorName: ctl ? ctl.errorName : null, actionDone: actionDone });
    if (ctl) ctl.pause();
  }
  releaseMedia();
  finishStep(n, how);
  rt.ctl = null;
  save();
}

function goNext(n, how) {
  // К шагу 9 — только после хотя бы одного неудачного запроса камеры на шаге 1.
  // Пока камеру не запрашивали, «Дальше» ведёт на шаг 2: камеру запросит он. «Пропустить» — тоже на шаг 2.
  const s1 = state.steps[1];
  if (n === 1 && how === 'done' && !s1.granted && s1.first) {
    leaveStep(1, how);
    for (let k = 2; k <= 8; k++) {
      state.steps[k].status = 'done';
      state.steps[k].mark = { kind: 'nocam' };
    }
    state.jumped = true;
    stopStream();
    save();
    enterStep(9);
    return;
  }
  leaveStep(n, how);
  if (n >= 8) stopStream();
  if (n === 10) goReport();
  else enterStep(n + 1);
}

function goReport() {
  releaseMedia();
  stopStream();
  state.screen = 'report';
  save();
  renderReport();
}

// uiFn — что на экране шага для предупреждения (logic.nextWarnings).
function navNodes(n, uiFn) {
  const warnEl = h('div', { class: 'warn', 'aria-live': 'polite' });
  warnEl.hidden = true;
  // Набор причин последнего показанного на этом шаге предупреждения (раздел 9, пункт 14; Д-22):
  // повторное «Дальше» ведёт дальше, если набор тот же; если изменился — предупреждение снова.
  let lastShown = null;
  function next() {
    const ui = uiFn ? uiFn() : {};
    const set = L.nextWarningSet(state, n, ui);
    if (L.warnAgain(lastShown, set)) {
      const reasons = L.nextWarnings(state, n, ui);
      lastShown = set;
      mark(n, 'предупреждение перед «Дальше»: ' + reasons.join(','), 'событие');
      fill(warnEl, reasons.map(function (r) { return p(T[r], 'error'); }).concat([p(T[299])]));
      warnEl.hidden = false;
      try { warnEl.scrollIntoView({ block: 'center' }); } catch (e) { /* нет */ }
      return;
    }
    goNext(n, 'done');
  }
  return h('div', { class: 'nav' }, [
    warnEl,
    btn(T[38], next, 'primary'),
    btn(T[37], function () { goNext(n, 'skipped'); }, 'secondary'),
    failButton()
  ]);
}

function failButton() {
  return btn(T[25], goFailed, 'secondary');
}

function stepFrame(n, body, uiFn) {
  return [h('h2', { text: L.stepTitle(n, state.run.opened) }), p(T[35], 'notice')].concat(body, [navNodes(n, uiFn)]);
}

function camUi() {
  const base = rt.ctl ? rt.ctl.ui() : {};
  base.recordingNow = !!rt.session && !rt.session.finalized;
  return base;
}

function renderStep(n, opts) {
  if (n === 1) return renderStep1(opts);
  if (n === 2) return renderStep2();
  if (n === 3) return renderStep3();
  if (n >= 4 && n <= 8) return renderVideoStep(n);
  if (n === 9) return renderStep9();
  return renderStep10();
}

// ---------------------------------------------------------------------------
// Шаг 1. Доступ к камере
// ---------------------------------------------------------------------------
function renderStep1(opts) {
  const s1 = state.steps[1];
  const browser = state.run.opened === 'browser';
  const statusEl = slot();
  const note48 = slot();
  const errorEl = slot();
  const galleryEl = slot();
  const followEl = slot();
  const startBtn = btn(T[42], function () { request(false); }, 'primary');
  let busy = false;

  if (!s1.permBefore) {
    queryPerms().then(function (pr) { if (!s1.permBefore) { s1.permBefore = pr; save(); } });
  }

  function request(isRetry) {
    if (busy) return;
    busy = true;
    startBtn.disabled = true;
    const my = token;
    mark(1, isRetry ? 'повторный запрос камеры' : 'запрос камеры', 'начато');
    const before = s1.permBefore ? Promise.resolve() : queryPerms().then(function (pr) { if (!s1.permBefore) s1.permBefore = pr; });
    before.then(requestCamera).then(function (r) {
      const rec = { ok: r.ok, name: r.name, seconds: r.seconds };
      if (!isRetry && !s1.first) s1.first = rec;
      else { s1.retries = (s1.retries || 0) + 1; s1.last = rec; }
      if (r.ok) {
        takeStream(r, my);
        s1.granted = true;
        s1.errorKind = null;
        mark(1, 'доступ к камере получен', 'событие');
      } else {
        s1.errorKind = r.kind;
        if (r.name === 'NotAllowedError') s1.denied = true;
        if (r.kind === 'denied') s1.denialShown = true;
      }
      return queryPerms().then(function (pr) {
        s1.permAfter = pr;
        mark(1, isRetry ? 'повторный запрос камеры' : 'запрос камеры', 'закончено');
        save();
        busy = false;
        startBtn.disabled = false;
        if (my === token) refresh();
      });
    }).catch(function (e) {
      busy = false;
      startBtn.disabled = false;
      addError(e && e.name ? e.name + (e.message ? ': ' + e.message : '') : String(e));
    });
  }

  function refresh() {
    startBtn.hidden = !!(s1.first || s1.granted);
    // О5 и TXT-CAP-48
    if (s1.first && !statusEl.firstChild) {
      if (state.o5Shown.indexOf(1) < 0) { state.o5Shown.push(1); save(); }
      fill(statusEl, [choice(T[43], options([44, 45, 46, 47]), function () { return state.o5; }, function (v) {
        state.o5 = v;
        state.o5Step = 1;
      }, refresh48)]);
    }
    refresh48();
    // Сообщение об ошибке
    if (!s1.granted && s1.errorKind) {
      const nodes = [];
      if (s1.errorKind === 'denied') {
        nodes.push(h('h3', { text: T[49] }), p(T[50]));
        hintNodes1().forEach(function (x) { nodes.push(x); });
        nodes.push(btn(T[59], function () { request(true); }, 'primary'));
      } else {
        nodes.push(p(L.cameraErrorText(s1.errorKind), 'error'));
        nodes.push(btn(T[70], function () { request(true); }, 'primary'));
      }
      if (storageOk) {
        nodes.push(btn(T[173], reloadByButton, 'secondary'));
        nodes.push(p(T[176], 'hint'));
      }
      fill(errorEl, nodes);
      if (!galleryEl.firstChild) fill(galleryEl, galleryAtDenial());
    } else {
      fill(errorEl, []);
      if (s1.granted) fill(galleryEl, []);
    }
    // О6 и О7 — после повторной попытки: «Я разрешил — попробовать снова» или перезагрузки кнопкой
    if (s1.denialShown && ((s1.retries || 0) > 0 || (state.reloads || 0) > 0) && !followEl.firstChild) {
      s1.askedFollow = true;
      save();
      fill(followEl, [
        choice(T[61], options([62, 63, 64, 181]), function () { return s1.o6; }, function (v) { s1.o6 = v; }),
        yesNo(T[65], s1, 'o7')
      ]);
    }
  }

  function refresh48() {
    fill(note48, browser && s1.granted && state.o5 === L.ans(46) ? [p(T[48], 'info')] : []);
  }

  // «Выбрать из галереи» при отказе (FR-PRT-021). Фото в отчёт не идёт: при превышении — TXT-CAP-325.
  function galleryAtDenial() {
    const area = slot();
    const msg = slot();
    const input = picker('image/*', false, function (file) {
      if (!kindOk(file, 'image/')) { fill(msg, [p(T[143], 'error')]); return; }
      fill(msg, []);
      mark(1, 'выбор фото из галереи', 'начато');
      releaseMedia();
      const f = {};
      s1.gallery = T[213];
      save();
      photoFromFile(file, f, function (img) {
        fill(area, photoNodes(f, img, true));
        mark(1, 'выбор фото из галереи', 'закончено');
      });
    }, function () { /* ничего не выбрано */ });
    return [
      input,
      btn(T[60], function () {
        if (s1.gallery !== T[213]) { s1.gallery = T[214]; save(); }
        openPicker(input);
      }, 'secondary'),
      p(T[178], 'hint'),
      msg,
      area
    ];
  }

  show(stepFrame(1, [
    opts.reloaded ? p(T[172], 'info') : null,
    p(browser ? T[41] : T[175]),
    startBtn,
    statusEl,
    note48,
    errorEl,
    galleryEl,
    followEl
  ], function () { return {}; }));
  refresh();
}

function reloadByButton() {
  if (!storageOk) return;
  releaseMedia();
  stopStream();
  state.reloadPending = true;
  mark(1, 'перезагрузка кнопкой на шаге 1', 'событие');
  save();
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Шаг 2. Камера на странице
// ---------------------------------------------------------------------------
function renderStep2() {
  const s2 = state.steps[2];
  const v = preview();
  const cam = makeCam(2, v, { onReady: function () {}, onLost: function () {} });
  show(stepFrame(2, [v].concat(cam.nodes, [
    choice(T[72], splitOptions(73), function () { return s2.o8; }, function (x) { s2.o8 = x; }),
    yesNo(T[74], s2, 'o9'),
    yesNo(T[75], s2, 'o10')
  ]), camUi));
  cam.start();
}

// ---------------------------------------------------------------------------
// Шаг 3. Фото на странице
// ---------------------------------------------------------------------------
function renderStep3() {
  const s3 = state.steps[3];
  const v = preview();
  const shotsEl = slot();
  const afterEl = slot();
  const questionsEl = slot();
  const takeBtn = btn(T[79], function () { takePhoto(false); }, 'primary');
  const retakeBtn = btn(T[80], function () { takePhoto(true); }, 'secondary');
  let busy = false;
  let ready = false;
  const cam = makeCam(3, v, {
    onReady: function () { ready = true; refresh(); },
    onLost: function () { ready = false; refresh(); }
  });

  function refresh() {
    const count = rt.photos.length;
    takeBtn.hidden = count >= 2;
    retakeBtn.hidden = count === 0;
    // Кнопки недоступны, пока картинка камеры не пошла (раздел 9, пункт 15).
    takeBtn.disabled = !ready || busy;
    retakeBtn.disabled = !ready || busy;
    fill(afterEl, count === 1 ? [p(T[78], 'info')] : []);
    if (count >= 1 && !questionsEl.firstChild) {
      fill(questionsEl, [
        yesNo(T[82], s3, 'o11'),
        choice(T[83], splitOptions(39).concat(options([84])), function () { return s3.o12; }, function (x) { s3.o12 = x; })
      ]);
    }
    const nodes = [];
    rt.photos.forEach(function (ph, i) {
      nodes.push(ph.img, p(L.photoLine(ph.f), 'line'));
      // В отчёт идёт последнее фото; у первого из двух — TXT-CAP-325.
      if (!L.withinPhotoLimit(ph.f.bytes)) nodes.push(p(L.overLimitText(ph.f.bytes, L.PHOTO_LIMIT_MB, i < rt.photos.length - 1), 'error'));
    });
    fill(shotsEl, nodes);
  }

  function takePhoto(replace) {
    if (busy || !ready || !streamLive()) return;
    const w = v.videoWidth;
    const hgt = v.videoHeight;
    if (!w || !hgt) return;
    busy = true;
    refresh();
    mark(3, replace ? 'фото заново' : 'фото', 'начато');
    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    canvas.getContext('2d').drawImage(v, 0, 0, w, hgt);
    canvas.toBlob(function (blob) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
      busy = false;
      const f = { received: NO, width: w, height: hgt, bytes: 0, type: null };
      if (blob) {
        f.received = blob.size > 0 ? YES : T[198];
        f.bytes = blob.size;
        f.type = blob.type || null;
      }
      if (replace && rt.photos.length) {
        const old = rt.photos.pop();
        dropMedia(old.img);
        dropUrl(old.url);
      } else {
        s3.photos = (s3.photos || 0) + 1;
      }
      s3.file = f;
      if (blob) {
        const url = keepUrl(blob);
        const img = h('img', { class: 'shot', alt: '', src: url });
        rt.media.push(img);
        rt.photos.push({ url: url, img: img, f: f });
      }
      mark(3, replace ? 'фото заново' : 'фото', 'закончено');
      save();
      refresh();
    }, 'image/jpeg');
  }

  show(stepFrame(3, [p(T[77]), v].concat(cam.nodes, [takeBtn, shotsEl, afterEl, retakeBtn, questionsEl]), camUi));
  refresh();
  cam.start();
}

// ---------------------------------------------------------------------------
// Шаги 4–8. Видео на странице
// ---------------------------------------------------------------------------
const VIDEO_TEXT = { 4: 86, 5: 88, 6: 90, 7: 112, 8: 114 };

// И18 меряется только на шагах 4–6: на шагах 7–8 обрыв записи — предмет В9.
function offer(reason, n) {
  if (!(n >= 4 && n <= 6)) return;
  state.offer.shown = true;
  if (state.offer.reasons.indexOf(reason) < 0) state.offer.reasons.push(reason);
  save();
}

// Предложение снять камерой телефона (FR-PRT-020): текст, кнопки TXT-CAP-106 и TXT-CAP-107, под ними TXT-CAP-323.
// between — узлы между текстом и кнопками (вопрос О23, если файла записи нет).
// Файл отсюда в отчёт и в исход не идёт; отмена выбора ничего не пишет (раздел 9, пункт 16).
function offerNodes(text, between) {
  const area = slot();
  const msg = slot();
  let cur = null;
  function onFile(file) {
    if (!kindOk(file, 'video/')) { fill(msg, [p(T[142], 'error')]); return; }
    fill(msg, []);
    if (cur) { dropMedia(cur.player); dropUrl(cur.url); }
    mark(state.step, 'видео из запасного пути', 'событие');
    cur = videoFromFile(file, {}, area, true);
  }
  const cam = picker('video/*', true, onFile, function () { /* ничего не выбрано */ });
  const gal = picker('video/*', false, onFile, function () { /* ничего не выбрано */ });
  return [p(text, 'error')].concat(between || [], [
    cam, gal,
    btn(T[106], function () { openPicker(cam); }, 'primary'),
    btn(T[107], function () { openPicker(gal); }, 'secondary'),
    p(T[323], 'hint'),
    msg, area
  ]);
}

function renderVideoStep(n) {
  const st = state.steps[n];
  const limit = L.STEP_LIMITS[n] || null;
  const body = [p(T[VIDEO_TEXT[n]])];
  if (n === 5 || n === 6) body.push(p(T[312], 'notice'));

  // Браузер не умеет записывать (И5): на шагах 4–6 — предложение снять камерой телефона, на 7–8 — TXT-CAP-322.
  if (state.env.hasGUM && !state.env.hasRecorder) {
    const pr = L.recordingProblem(n, 'norecorder');
    if (pr.offer) {
      offer(T[199], n);
      body.push(h('div', {}, offerNodes(pr.text)));
    } else {
      body.push(p(pr.text, 'error'));
    }
    show(stepFrame(n, body, camUi));
    return;
  }

  const v = preview();
  const counterEl = p('', 'counter');
  const startBtn = btn(T[91], function () { startRecording(); }, 'primary');
  const stopBtn = btn(T[92], function () { if (rt.session) requestStop(rt.session, 'button'); }, 'primary');
  const resultEl = slot();
  const returnEl = slot();
  const problemEl = slot();
  const offerEl = slot();
  const againBtn = btn(T[102], recordAgain, 'secondary');
  counterEl.hidden = true;
  stopBtn.hidden = true;
  againBtn.hidden = true;
  startBtn.disabled = true;
  let ready = false;

  const cam = makeCam(n, v, {
    onReady: function () { ready = true; startBtn.disabled = false; },
    onLost: function (why) {
      ready = false;
      startBtn.disabled = true;
      // Камера погасла во время записи: на шагах 4–6 страница останавливает запись сама (раздел 9, пункт 15).
      if (why === 'recording' && n <= 6 && rt.session && !rt.session.finalized) cameraLost(rt.session);
    }
  });

  function recordAgain() {
    releaseMedia();
    fill(resultEl, []);
    fill(offerEl, []);
    fill(problemEl, []);
    againBtn.hidden = true;
    startBtn.hidden = false;
    startBtn.disabled = true;
    ready = false;
    v.hidden = false;
    // «Записать заново» начинает счёт уходов и ответ О23 с нуля (раздел 9, пункт 17).
    st.hiddenCount = 0;
    if (n <= 6) st.o23 = null;
    save();
    cam.request();
  }

  function startRecording() {
    if (rt.session || !ready || !streamLive()) return;
    releaseMedia();
    fill(resultEl, []);
    fill(offerEl, []);
    fill(problemEl, []);
    st.attempts = (st.attempts || 0) + 1;
    st.file = { received: NO };
    st.hiddenCount = 0;
    st.wake = null;
    if (n <= 6) { st.o13s = null; st.o13p = null; st.o13e = null; st.o23 = null; }
    if (n >= 7) {
      st.onReturnRec = null; st.onReturnCam = null; st.o14 = null; st.asked14 = false; st.o15 = null;
      fill(returnEl, []);
    }
    st.recording = true;
    mark(n, 'запись', 'начато');
    save();
    let rec;
    try {
      rec = state.env.chosenType ? new MediaRecorder(rt.stream, { mimeType: state.env.chosenType }) : new MediaRecorder(rt.stream);
    } catch (e) {
      failBeforeStart(errName(e));
      return;
    }
    if (rec.mimeType) state.env.recorderType = rec.mimeType;
    const session = {
      step: n, attempt: st.attempts, my: token, rec: rec, stream: rt.stream, chunks: [], sizes: [], mutes: 0,
      tCall: performance.now(), sysCall: Date.now(), tStart: null, sysStart: null, fallbackStart: false,
      requested: null, error: null, cameraLost: false, endHidden: false,
      wasHidden: false, stoppedWhileHidden: false, finalized: false, abandoned: false, limit: limit,
      videoTrack: rt.stream.getVideoTracks()[0] || null, camSnapshot: null, level: startLevel(rt.stream),
      sentinels: [], limitTimer: null, counterTimer: null, startCheck: null, stopWait: null, onFinal: onFinal
    };
    rt.session = session;
    wakeRequest(session);
    // И25: сообщения браузера о заглушённой видеодорожке — от нажатия «Начать запись» до конца записи.
    if (session.videoTrack) {
      session.videoTrack.addEventListener('mute', function () { if (!session.finalized) session.mutes += 1; });
    }
    // Порции по одной секунде (раздел 9, пункт 21): каждая — в памяти вкладки по порядку получения;
    // размер каждой, в том числе пустой, — числом, чтобы номер порции совпадал с секундой записи (И24).
    rec.ondataavailable = function (e) {
      if (session.finalized) return;
      const d = e && e.data;
      session.sizes.push(d && typeof d.size === 'number' ? d.size : 0);
      if (d && d.size) session.chunks.push(d);
    };
    rec.onstart = function () {
      begin(session, performance.now(), Date.now(), true);
      if (rec.mimeType) { state.env.recorderType = rec.mimeType; save(); }
    };
    rec.onerror = function (ev) {
      const err = ev && ev.error;
      const name = err && err.name ? String(err.name) : 'error';
      mark(n, 'ошибка записи: ' + name, 'событие');
      if (session.abandoned) return; // запись брошена уходом с шага — остановлена кнопкой, а не ошибкой
      session.error = name;
      session.endHidden = document.visibilityState === 'hidden';
      endOrAwaitStop(session);
    };
    rec.onstop = function () {
      if (!session.requested && !session.error && !session.cameraLost) session.endHidden = document.visibilityState === 'hidden';
      finalize(session);
    };
    try {
      // Порциями по 1000 мс — обход ошибки Safari с записью video/mp4 одним куском (E-187; D-238; раздел 9, пункт 21).
      rec.start(L.CHUNK_MS);
    } catch (e) {
      session.error = errName(e);
      mark(n, 'ошибка записи: ' + session.error, 'событие');
      finalize(session);
      return;
    }
    // Нет события start за 1,5 секунды — отсчёт и предел от нажатия (раздел 9, пункт 13).
    session.startCheck = setTimeout(function () {
      if (session.tStart === null && !session.finalized && rec.state === 'recording') {
        mark(n, 'нет события start, отсчёт от нажатия', 'событие');
        begin(session, session.tCall, session.sysCall, false);
      }
    }, L.START_EVENT_WAIT_SECONDS * 1000);
    startBtn.hidden = true;
    stopBtn.hidden = false;
    counterEl.hidden = false;
    counterEl.textContent = L.counterText(0, limit);
  }

  // fromEvent — отсчёт от события start. Если оно пришло после запасного отсчёта от нажатия,
  // отсчёт и предел пересчитываются от него.
  function begin(session, t, sysT, fromEvent) {
    if (session.finalized || session.abandoned) return;
    if (session.tStart !== null) {
      if (!(fromEvent && session.fallbackStart)) return;
      clearTimeout(session.limitTimer);
      clearInterval(session.counterTimer);
      mark(n, 'событие start пришло после запасного отсчёта, отсчёт от него', 'событие');
    }
    session.fallbackStart = !fromEvent;
    session.tStart = t;
    session.sysStart = sysT;
    if (session.requested) return; // остановка уже запрошена: только начало отсчёта, без таймеров
    if (session.limit) {
      const target = t + session.limit * 1000;
      const tick = function () {
        const left = target - performance.now();
        if (left <= 0) requestStop(session, 'limit');
        else session.limitTimer = setTimeout(tick, Math.min(left, 1000));
      };
      session.limitTimer = setTimeout(tick, Math.min(session.limit * 1000, 1000));
    }
    session.counterTimer = setInterval(function () {
      if (session.my === token) counterEl.textContent = L.counterText(Math.floor((performance.now() - session.tStart) / 1000), session.limit);
    }, 250);
  }

  function failBeforeStart(name) {
    // Запись не началась: порций нет (И24, И25).
    st.file = { received: NO, stopReason: 'error', chunks: 0, chunkMinBytes: null, chunkMinAt: null, mutes: 0 };
    st.recording = false;
    mark(n, 'ошибка записи: ' + name, 'событие');
    mark(n, 'запись', 'закончено');
    showProblem('error', false);
    save();
    againBtn.hidden = false;
    startBtn.hidden = true;
  }

  // О23 после записи на шагах 4–6, если страница пропадала с экрана (раздел 9, пункт 17).
  function o23Nodes() {
    if (!(n <= 6 && st.hiddenCount > 0)) return [];
    const note = slot();
    function refresh311() {
      fill(note, (n === 5 || n === 6) && (st.o23 === L.ans(308) || st.o23 === L.ans(309)) ? [p(T[311], 'notice')] : []);
    }
    const q = choice(T[306], options([307, 308, 309, 310]), function () { return st.o23; }, function (x) { st.o23 = x; }, refresh311);
    refresh311();
    return [q, note];
  }

  // Ошибка записи: 4–6 — с предложением снять камерой телефона; 7–8 — без него,
  // а если запись прекратилась, пока страница была скрыта, — только после ответа О14.
  function showProblem(kind, hasFile) {
    const pr = L.recordingProblem(n, kind);
    if (pr.offer) {
      offer(kind === 'empty' ? T[201] : T[200], n);
      fill(offerEl, offerNodes(pr.text, hasFile ? [] : o23Nodes()));
      return;
    }
    const f = st.file || {};
    function render() {
      fill(problemEl, f.stopReason === 'hidden' && !st.o14 ? [] : [p(pr.text, 'error')]);
    }
    render();
    rt.onProblem = render;
  }

  function onFinal(session, blob) {
    if (session.my !== token) return;
    const f = st.file;
    counterEl.hidden = true;
    stopBtn.hidden = true;
    startBtn.hidden = true;
    againBtn.hidden = false;
    v.hidden = true;
    const top = [];
    if (limit && f.stopReason === 'limit') top.push(p(L.autoStopText(limit), 'info'));
    if (limit && f.stopReason === 'button') top.push(p(T[96], 'info'));
    const hasFile = !!blob && blob.size > 0;
    if (f.stopReason === 'error' || f.stopReason === 'hidden') showProblem('error', hasFile);
    else if (f.received === T[198]) showProblem('empty', false);
    if (!hasFile) {
      fill(resultEl, top);
      return;
    }
    const player = videoPlayer(keepUrl(blob));
    const lineEl = slot();
    const qEl = slot();
    function update() {
      const nodes = [];
      if (f.durationMethod !== null) nodes.push(p(L.pageVideoLine(f), 'line'));
      if (!L.withinVideoLimit(f.bytes)) nodes.push(p(L.overLimitText(f.bytes, L.VIDEO_LIMIT_MB), 'error'));
      if (limit && typeof f.fileSeconds === 'number' && isFinite(f.fileSeconds) && !L.durationWithinStep(f.fileSeconds, limit)) {
        nodes.push(p(L.tooLongText(L.wholeSeconds(f.fileSeconds), limit), 'error'));
      }
      if (f.playable === T[165]) nodes.push(p(T[108], 'error'));
      fill(lineEl, nodes);
    }
    measureVideo(player, f, update);
    update();
    if (n <= 6) {
      fill(qEl, o23Nodes().concat([yesNo(T[99], st, 'o13s'), yesNo(T[100], st, 'o13p'), yesNo(T[101], st, 'o13e')]));
    } else {
      fill(qEl, [choice(T[121], options([122, 123, 124, 125]), function () { return st.o15; }, function (x) { st.o15 = x; })]);
    }
    fill(resultEl, top.concat([player, p(T[98], 'hint'), lineEl, qEl]));
  }

  // О14 после возвращения (шаги 7 и 8)
  rt.onReturn = function () {
    if (n < 7 || returnEl.firstChild) return;
    st.asked14 = true;
    save();
    fill(returnEl, [
      choice(T[115], options([116, 117, 118, 119]), function () { return st.o14; }, function (x) { st.o14 = x; }, function () {
        if (rt.onProblem) rt.onProblem();
      }),
      p(T[120], 'hint')
    ]);
  };
  rt.onProblem = null;

  body.push(v);
  show(stepFrame(n, body.concat(cam.nodes, [counterEl, startBtn, stopBtn, returnEl, problemEl, resultEl, offerEl, againBtn]), camUi));
  cam.start();
}

// Просьба не гасить экран (И23; раздел 9, пункт 18). Без navigator.wakeLock (iOS 15) — ничего не делает.
function wakeRequest(session) {
  if (!state.env.hasWakeLock || !hasWakeLock()) return;
  let pr;
  try {
    pr = navigator.wakeLock.request('screen');
  } catch (e) {
    wakeResult(session, null, e);
    return;
  }
  Promise.resolve(pr).then(function (sentinel) { wakeResult(session, sentinel, null); }, function (e) { wakeResult(session, null, e || {}); });
}

function wakeResult(session, sentinel, err) {
  const st = state.steps[session.step];
  if (sentinel) {
    // Ответ пришёл после конца записи — удавшаяся просьба сразу отпускается.
    if (session.finalized || session.abandoned) releaseSentinel(sentinel);
    else session.sentinels.push(sentinel);
  }
  // На шаге уже началась новая запись — итог прежней просьбы не пишется.
  if (st.attempts !== session.attempt) return;
  if (err) {
    if (!st.wake || st.wake.state !== 'denied') st.wake = { state: 'denied', name: err.name ? String(err.name) : null };
    mark(session.step, 'просьба не гасить экран отклонена', 'событие');
  } else if (!st.wake) {
    st.wake = { state: 'ok' };
  }
  save();
}

function releaseSentinel(sentinel) {
  try {
    const r = sentinel.release();
    if (r && r.catch) r.catch(function () { /* уже отпущена */ });
  } catch (e) { /* уже отпущена */ }
}

function requestStop(session, reason) {
  if (session.requested || session.finalized) return;
  session.requested = reason;
  endOrAwaitStop(session);
}

// Раздел 9, пункт 21: файл собирается из порций после события stop. Запись идёт — остановить её;
// уже inactive (браузер остановил её сам, последняя порция и stop ещё в пути) — ждать stop,
// а если он не придёт за L.STOP_EVENT_WAIT_SECONDS — собрать из того, что пришло.
function endOrAwaitStop(session) {
  if (session.finalized) return;
  let state;
  try { state = session.rec.state; } catch (e) { state = undefined; }
  if (L.endAction(state) === 'stop') {
    try { session.rec.stop(); } catch (e) { finalize(session); } // stop() не удался — события stop не будет
    return;
  }
  if (session.stopWait) return;
  // Если stop так и не пришёл, часы записи кончаются в момент, когда запись оказалась inactive, а не после ожидания.
  const waitT = performance.now();
  const waitSys = Date.now();
  session.stopWait = setTimeout(function () {
    if (!session.finalized) finalize(session, waitT, waitSys);
  }, L.STOP_EVENT_WAIT_SECONDS * 1000);
}

// Камера погасла во время записи на шагах 4–6: страница останавливает запись сама.
function cameraLost(session) {
  if (session.finalized || session.requested) return;
  session.cameraLost = true;
  session.endHidden = document.visibilityState === 'hidden';
  mark(session.step, 'камера погасла во время записи, запись остановлена', 'событие');
  endOrAwaitStop(session);
}

// Уход с шага во время записи: запись останавливается («кнопкой», И12), а её камера выключается сразу,
// не дожидаясь события stop, — иначе следующий шаг подхватит гаснущий поток и не запросит камеру снова.
function abandonSession() {
  const s = rt.session;
  if (!s) return;
  s.abandoned = true;
  rt.session = null;
  clearTimeout(s.limitTimer);
  clearInterval(s.counterTimer);
  clearTimeout(s.startCheck);
  requestStop(s, 'button');
  stopTracks(s.stream);
  if (rt.stream === s.stream) stopStream();
}

function trackState(track) {
  if (!track) return T[160];
  return track.readyState === 'live' && !track.muted ? T[208] : T[209];
}

// Окончание записи: часы от start до stop (обе — страницы и системные), остановка дорожек (раздел 9, пункт 12), измерение.
function finalize(session, atT, atSys) {
  if (session.finalized) return;
  session.finalized = true;
  const tStop = typeof atT === 'number' ? atT : performance.now();
  const sysStop = typeof atSys === 'number' ? atSys : Date.now();
  clearTimeout(session.limitTimer);
  clearInterval(session.counterTimer);
  clearTimeout(session.startCheck);
  clearTimeout(session.stopWait);
  session.sentinels.forEach(releaseSentinel);
  session.sentinels = [];
  if (document.visibilityState === 'hidden' && !session.requested) session.endHidden = true;
  session.camSnapshot = trackState(session.videoTrack);
  rt.lastSession = session;
  const level = session.level ? session.level.stop() : null;
  stopTracks(session.stream);
  if (rt.stream === session.stream) stopStream();
  const n = session.step;
  const st = state.steps[n];
  if (st.attempts !== session.attempt) return; // уже началась новая запись
  const f = st.file || { received: NO };
  st.file = f;
  f.clockSeconds = session.tStart !== null ? (tStop - session.tStart) / 1000 : null;
  f.sysSeconds = session.sysStart !== null ? (sysStop - session.sysStart) / 1000 : null;
  f.countFrom = session.tStart === null ? null : (session.fallbackStart ? 'press' : 'start');
  if (session.requested && !session.error && !session.cameraLost) f.stopReason = session.requested;
  else f.stopReason = session.endHidden || session.stoppedWhileHidden ? 'hidden' : 'error';
  f.level = level;
  // И24, И25: только числа — сами порции в журнал не идут. И у записи, брошенной уходом с шага.
  const cs = L.chunkStats(session.sizes);
  f.chunks = cs.count;
  f.chunkMinBytes = cs.minBytes;
  f.chunkMinAt = cs.minAt;
  f.mutes = session.mutes;
  session.sizes = [];
  if (session.rec.mimeType) state.env.recorderType = session.rec.mimeType;
  const type = session.rec.mimeType || state.env.chosenType || '';
  let blob = null;
  try {
    blob = type ? new Blob(session.chunks, { type: type }) : new Blob(session.chunks);
  } catch (e) {
    blob = new Blob(session.chunks);
  }
  session.chunks = [];
  f.bytes = blob.size;
  f.type = blob.type || null;
  if (f.stopReason === 'error' || f.stopReason === 'hidden') f.received = blob.size > 0 ? YES : NO;
  else f.received = blob.size > 0 ? YES : T[198];
  st.recording = false;
  if (rt.session === session) rt.session = null;
  mark(n, 'запись', 'закончено');
  save();
  if (session.abandoned) return;
  session.onFinal(session, blob);
}

// И10: наибольший уровень звука во время записи через AnalyserNode.
function startLevel(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !stream.getAudioTracks().length) return null;
  try {
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let max = 0;
    let measured = false;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () { /* нет */ });
    const iv = setInterval(function () {
      if (ctx.state !== 'running') return;
      an.getByteTimeDomainData(buf);
      measured = true;
      const lv = L.peakLevel(buf);
      if (lv > max) max = lv;
    }, 100);
    return {
      stop: function () {
        clearInterval(iv);
        try { src.disconnect(); } catch (e) { /* нет */ }
        try { ctx.close(); } catch (e) { /* нет */ }
        return measured ? max : null;
      }
    };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Шаги 9 и 10: один снимок — фото или видео (кнопка, ответ, что открылось, файл, О22, вопросы)
// ---------------------------------------------------------------------------
// n — 9 или 10; item — state.steps[n].v или .p; kind — 'video' или 'photo'.
function fileItem(n, item, kind, buttonText) {
  const msg = slot();
  const askEl = slot();
  const area = slot();
  const o22El = slot();
  const qEl = slot();
  let cur = null;

  function questions() {
    if (!item.file) { fill(qEl, []); return; }
    fill(qEl, kind === 'video'
      ? [yesNo(T[99], item, 'o13s'), yesNo(T[100], item, 'o13p'), yesNo(T[101], item, 'o13e')]
      : [yesNo(T[82], item, 'o11')]);
  }

  // О22 — только после выбора файла; на шаге 9 — только при О16 «Галерея», «Другое» или «Ничего».
  function renderO22() {
    const need = n === 10 ? !!item.file : L.o22Shown9(item);
    if (!need) {
      if (n === 9 && item.o22 !== null) { item.o22 = null; save(); }
      fill(o22El, []);
      return;
    }
    if (!o22El.firstChild) fill(o22El, [yesNo(T[180], item, 'o22'), p(T[347], 'hint')]);
  }

  function onFile(file) {
    if (!kindOk(file, kind === 'video' ? 'video/' : 'image/')) {
      // Файл не того вида полученным не считается: прежний файл и ответы о нём остаются;
      // если файла нужного вида нет, снимок не проверен (7.1, правило 4; Д-21 (г)).
      L.wrongKindFile(item);
      save();
      fill(msg, [p(T[kind === 'video' ? 142 : 143], 'error')]);
      return;
    }
    fill(msg, []);
    mark(n, kind === 'video' ? 'видео получено' : 'фото получено', 'событие');
    if (cur) { dropMedia(cur.el); dropUrl(cur.url); cur = null; }
    // Новый файл стирает прежний и ответы о нём; О16 и О17 остаются, кроме ответа
    // «сам ничего не снял (не выбрал)» — его файл стирает (раздел 9, пункты 19 и 20; Д-21, Д-28).
    L.goodFile(item, n, kind);
    renderAsk();
    fill(o22El, []);
    if (kind === 'video') {
      const r = videoFromFile(file, item.file, area, false);
      cur = { el: r.player, url: r.url };
    } else {
      const r = photoFromFile(file, item.file, function (img) {
        fill(area, photoNodes(item.file, img, false));
      });
      cur = { el: r.img, url: r.url };
    }
    save();
    questions();
    renderO22();
  }

  function onCancel() {
    // Нажатие кончилось без файла — признак «последним получен файл не того вида» снимается (7.1, правило 4).
    L.noFileReturned(item);
    save();
    // TXT-CAP-136 — только на шаге 9 и только если у этой кнопки файла ещё нет.
    if (n === 9 && !item.file) fill(msg, [p(T[136], 'error')]);
  }

  const input = picker(kind === 'video' ? 'video/*' : 'image/*', n === 9, onFile, onCancel);

  // Вопрос, что открылось: О16 (шаг 9) или О17 (шаг 10). Вариант «сам ничего не снял (не выбрал)»
  // показывается, только пока у кнопки нет файла нужного вида (Д-28).
  function renderAsk() {
    if (n === 9 ? !item.asked16 : !item.asked17) return;
    if (n === 9) {
      fill(askEl, [choice(T[130], options(L.o16Options(item)), function () { return item.o16; }, function (x) { item.o16 = x; }, renderO22)]);
    } else {
      const extra = L.o17Extra(item);
      const opts = splitOptions(39).concat(extra ? options([extra]) : []);
      fill(askEl, [choice(T[141], opts, function () { return item.o17; }, function (x) { item.o17 = x; })]);
    }
  }

  function ask() {
    if (askEl.firstChild) return;
    if (n === 9) item.asked16 = true; else item.asked17 = true;
    renderAsk();
    save();
  }

  return [
    input,
    btn(buttonText, function () { ask(); openPicker(input); }, 'primary'),
    msg, askEl, area, o22El, qEl
  ];
}

// ---------------------------------------------------------------------------
// Шаг 9. Обычная камера телефона
// ---------------------------------------------------------------------------
function renderStep9() {
  const s9 = state.steps[9];
  show(stepFrame(9, [
    state.jumped ? p(T[177], 'info') : null,
    p(T[127])
  ].concat(
    fileItem(9, s9.v, 'video', T[128]),
    fileItem(9, s9.p, 'photo', T[129])
  ), function () { return {}; }));
}

// ---------------------------------------------------------------------------
// Шаг 10. Готовый файл из галереи
// ---------------------------------------------------------------------------
function renderStep10() {
  const s10 = state.steps[10];
  show(stepFrame(10, [p(T[138])].concat(
    fileItem(10, s10.p, 'photo', T[139]),
    fileItem(10, s10.v, 'video', T[140])
  ), function () { return {}; }));
}

// ---------------------------------------------------------------------------
// Открытие после падения (И17) и «Запуск не получился»
// ---------------------------------------------------------------------------
function renderRecover(n) {
  state.screen = 'recover';
  state.recoverStep = n;
  save();
  show([
    p(L.crashText(L.stepTitle(n, state.run.opened)), 'notice'),
    // К незаконченному шагу не возвращаемся; после падения на шаге 10 следующий — отчёт (раздел 9, пункт 4).
    btn(T[31], function () {
      finishStep(n, 'done');
      state.recoverStep = null;
      save();
      if (n >= 10) goReport();
      else enterStep(n + 1);
    }, 'primary'),
    btn(T[32], function () {
      finishStep(n, 'done');
      state.recoverStep = null;
      goReport();
    }, 'secondary'),
    failButton()
  ]);
}

function goFailed() {
  if (state.screen === 'step' && state.openStep !== null) {
    releaseMedia();
    finishStep(state.openStep, 'done');
  } else if (state.screen === 'recover' && state.recoverStep) {
    finishStep(state.recoverStep, 'done');
  }
  releaseMedia();
  stopStream();
  if (!state.run.startedAt) {
    state.run.startedAt = Date.now();
    measureEnv();
  }
  state.screen = 'failed';
  state.run.failed = true;
  save();
  renderFailed();
}

function renderFailed() {
  state.screen = 'failed';
  const area = h('textarea', { id: 'fail-reason', maxlength: '300' });
  area.value = state.run.failedReason || '';
  area.addEventListener('input', function () { state.run.failedReason = area.value; save(); });
  show([
    h('label', { for: 'fail-reason', text: T[26] }),
    area,
    btn(T[27], function () {
      state.run.failed = true;
      state.run.failedReason = area.value;
      goReport();
    }, 'primary')
  ]);
}

// ---------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------
function renderReport() {
  state.screen = 'report';
  const fin = state.final;
  const reportEl = h('textarea', { class: 'report', id: 'report', readonly: true, rows: '24', 'aria-label': T[144] });
  const copyMsg = p('', 'info');
  copyMsg.hidden = true;
  const eraseEl = slot();

  function update() {
    reportEl.value = L.buildReport(state);
  }

  const quality = h('input', { type: 'text', id: 'quality', maxlength: '60', autocomplete: 'off' });
  quality.value = fin.quality || '';
  quality.addEventListener('input', function () { fin.quality = quality.value; save(); update(); });
  const note = h('textarea', { id: 'note', maxlength: '1000' });
  note.value = fin.note || '';
  note.addEventListener('input', function () { fin.note = note.value; save(); update(); });

  function copy() {
    update();
    const text = reportEl.value;
    function fallback() {
      let ok = false;
      try {
        reportEl.readOnly = false;
        reportEl.focus();
        reportEl.select();
        reportEl.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      reportEl.readOnly = true;
      return ok;
    }
    function done(ok) {
      copyMsg.textContent = ok ? T[150] : T[151];
      copyMsg.className = ok ? 'info' : 'error';
      copyMsg.hidden = false;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback()); });
    } else {
      done(fallback());
    }
  }

  function askErase() {
    fill(eraseEl, [
      p(T[153], 'notice'),
      btn(T[154], erase, 'primary'),
      btn(T[155], function () { fill(eraseEl, [btn(T[152], askErase, 'secondary')]); }, 'secondary')
    ]);
  }

  function erase() {
    clearJournal();
    releaseMedia();
    stopStream();
    state = L.newState();
    marks = [];
    show([
      h('h2', { text: T[144] }),
      p(T[156], 'info'),
      btn(T[157], function () { renderStart(); }, 'primary')
    ]);
  }

  show([
    h('h2', { text: T[144] }),
    choice(T[145], splitOptions(39), function () { return fin.o18; }, function (x) { fin.o18 = x; }, update),
    h('label', { for: 'quality', text: T[146] }),
    quality,
    h('label', { for: 'note', text: T[147] }),
    note,
    p(T[148], 'hint'),
    reportEl,
    btn(T[149], copy, 'primary'),
    copyMsg,
    eraseEl
  ]);
  fill(eraseEl, [btn(T[152], askErase, 'secondary')]);
  update();
  save();
}

// ---------------------------------------------------------------------------
// События страницы: сворачивание, уход, ошибки
// ---------------------------------------------------------------------------
function onVisibility() {
  const hidden = document.visibilityState === 'hidden';
  mark(state.step, hidden ? 'страница скрыта' : 'страница видна', 'событие');
  const n = state.step;
  if (state.screen !== 'step' || !(n >= 4 && n <= 8)) return;
  const s = rt.session;
  const st = state.steps[n];
  const live = !!s && !s.finalized && s.step === n;
  // Уходы со страницы во время записи (И16, И21).
  if (hidden) {
    if (live) {
      s.wasHidden = true;
      st.hiddenCount = (st.hiddenCount || 0) + 1;
      save();
    }
    return;
  }
  if (live) {
    if (s.rec.state === 'recording') wakeRequest(s); // просьба снова, пока запись идёт (И23)
    else s.stoppedWhileHidden = true;
  }
  if (n !== 7 && n !== 8) return;
  // Возвращение на страницу: состояние записи и камеры (И16)
  if (st.hiddenCount > 0 && st.onReturnRec === null) {
    if (live) {
      const recording = s.rec.state === 'recording';
      st.onReturnRec = recording ? T[210] : T[211];
      st.onReturnCam = trackState(s.videoTrack);
    } else {
      // Запись закончилась, пока страница была скрыта: камера — как была в момент окончания записи.
      const last = rt.lastSession;
      st.onReturnRec = T[211];
      st.onReturnCam = last && last.step === n && last.camSnapshot ? last.camSnapshot : T[160];
    }
    save();
    if (rt.onReturn) rt.onReturn();
  }
}

function init() {
  storageOk = storageAvailable();
  detectUa();
  const saved = storageOk ? loadJournal() : null;
  if (saved && saved.state && saved.state.version === L.STATE_VERSION && saved.state.steps) {
    state = saved.state;
    marks = saved.marks || [];
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', function () { mark(state.step, 'pagehide', 'событие'); });
  window.addEventListener('error', function (e) {
    addError(e && e.message ? e.message : (e && e.error && e.error.name ? e.error.name : 'error'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    const r = e ? e.reason : null;
    addError(r && r.name ? r.name + (r.message ? ': ' + r.message : '') : String(r));
  });

  // Открытие после перезагрузки кнопкой на шаге 1 (раздел 9, пункт 11) — не падение.
  if (state.reloadPending) {
    state.reloadPending = false;
    state.reloads = (state.reloads || 0) + 1;
    mark(1, 'страница открыта после перезагрузки кнопкой', 'событие');
    state.screen = 'step';
    state.step = 1;
    state.openStep = 1;
    save();
    renderStep(1, { reloaded: true });
    return;
  }

  // Открытие после падения: незаконченный шаг (И17).
  if (state.openStep !== null && state.openStep !== undefined) {
    const n = state.openStep;
    state.openStep = null;
    state.crashes.push(n);
    const st = state.steps[n];
    st.crashed = true;
    if (st.recording) {
      if (n === 7 || n === 8) st.onReturnRec = T[212];
      st.recording = false;
    }
    mark(n, 'страница открыта заново, шаг не закончен', 'событие');
    save();
    renderRecover(n);
    return;
  }

  if (state.screen === 'before') renderBefore();
  else if (state.screen === 'recover' && state.recoverStep) renderRecover(state.recoverStep);
  else if (state.screen === 'failed') renderFailed();
  else if (state.screen === 'report') renderReport();
  else renderStart();
}

init();
