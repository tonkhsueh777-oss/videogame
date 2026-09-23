(() => {
  'use strict';

  const REVEAL_BEFORE_END = 1.8;
  const HOLD_MS = 900;
  const STORY = {
    intro: { src: './media/01_intro.mp4', prompt: '敌袭！', choices: [
      { id: 'fight', label: '滑动招架', arrow: '←', direction: 180, effect: 'parry', next: 'fight' },
      { id: 'escape', label: '闪避', arrow: '→', direction: 0, effect: 'dodge', next: 'escape' },
    ] },
    fight: { src: './media/02A_fight.mp4', prompt: '抓住破绽！', choices: [
      { id: 'core', label: '刺向核心', arrow: '↑', direction: -90, effect: 'thrust', next: 'core-ending' },
      { id: 'chain', label: '斩断石链', arrow: '↘', direction: 45, effect: 'slash', next: 'chain-ending' },
    ] },
    escape: { src: './media/02B_escape.mp4', prompt: '快速决断！', choices: [
      { id: 'seal', label: '长按启动封印', arrow: '封', hold: true, effect: 'seal', next: 'seal-ending' },
      { id: 'bridge', label: '冲过吊桥', arrow: '→', direction: 0, effect: 'dodge', next: 'bridge-ending' },
    ] },
    'core-ending': { src: './media/03A1_core.mp4', title: '破魔', choices: [] },
    'chain-ending': { src: './media/03A2_chain.mp4', title: '借势', choices: [] },
    'seal-ending': { src: './media/03B1_seal.mp4', title: '封魔', choices: [] },
    'bridge-ending': { src: './media/03B2_bridge.mp4', title: '断桥', choices: [] },
  };

  const $ = id => document.getElementById(id);
  const video = $('scene-video');
  const stage = $('stage');
  const layer = $('choices');
  const buttons = $('choice-buttons');
  const frozen = $('frozen-frame');
  const trail = $('slash-trail');
  const trailContext = trail.getContext('2d');
  const state = { id: 'intro', history: [], started: false, locked: true, qte: false,
    generation: 0, failures: 0, error: false, suspended: false, loading: false };
  let watchdog, feedbackTimer, frameCallback;
  let gesture = null;
  let holdFrame = 0;
  let effectUntil = 0;
  let audioContext;
  let metadataProbe = null;
  let warmedGeneration = -1;
  const warmed = new Set();

  function visible(element, show) {
    element.classList.toggle('overlay-visible', show);
    element.setAttribute('aria-hidden', String(!show));
    element.inert = !show;
  }
  function node() { return STORY[state.id]; }
  function resetGesture() {
    cancelAnimationFrame(holdFrame);
    if (gesture && layer.hasPointerCapture?.(gesture.pointerId)) layer.releasePointerCapture(gesture.pointerId);
    gesture = null;
    const ring = buttons.querySelector('.hold-progress');
    if (ring) ring.style.strokeDashoffset = '100';
    trailContext.clearRect(0, 0, trail.width, trail.height);
  }
  function hideQte() {
    state.qte = false;
    resetGesture();
    visible(layer, false);
  }
  function showQte() {
    if (!state.started || state.locked || state.error || state.suspended || state.loading || node().title || state.qte) return;
    state.qte = true;
    $('choice-prompt').textContent = node().prompt;
    buttons.replaceChildren();
    for (const choice of node().choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `combat-action${choice.hold ? ' seal-action' : ''}`;
      button.dataset.choice = choice.id;
      button.setAttribute('aria-label', `${choice.label}，也可点击`);
      // All content is defined above, never supplied by users or URLs.
      button.innerHTML = choice.hold
        ? '<span class="seal-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="hold-track" cx="32" cy="32" r="28"/><circle class="hold-progress" cx="32" cy="32" r="28" pathLength="100"/></svg><span>封</span></span><span class="action-label">长按启动封印</span>'
        : `<span class="gesture-arrow" aria-hidden="true">${choice.arrow}</span><span class="action-label">${choice.label}</span>`;
      // Pointer taps are handled on pointerup, so a cancelled hold cannot turn into a click.
      button.addEventListener('click', event => { if (event.detail === 0) choose(choice); });
      buttons.append(button);
    }
    visible(layer, true);
  }
  function checkQte() {
    if (Number.isFinite(video.duration) && video.currentTime >= Math.max(0, video.duration - REVEAL_BEFORE_END)) showQte();
  }
  function captureFrame() {
    if (video.readyState < 2 || !video.videoWidth) return;
    frozen.width = video.videoWidth;
    frozen.height = video.videoHeight;
    try {
      frozen.getContext('2d').drawImage(video, 0, 0, frozen.width, frozen.height);
      frozen.classList.add('frame-visible');
    } catch { /* Same-origin MP4 normally permits capture; retain the stage cover if unavailable. */ }
  }
  function armWatchdog() {
    clearTimeout(watchdog);
    if (!state.started || state.error || state.suspended || document.hidden) return;
    const generation = state.generation;
    watchdog = setTimeout(() => {
      if (generation === state.generation && !video.ended) fail('影片载入失败，请检查网络后重新载入。');
    }, 20000);
  }
  function loading(show) {
    state.loading = show;
    visible($('loading-panel'), show);
    if (show) { resetGesture(); visible(layer, false); state.qte = false; armWatchdog(); }
  }
  function continuePrompt() {
    clearTimeout(watchdog);
    state.suspended = true;
    loading(false);
    hideQte();
    visible($('continue-panel'), true);
  }
  function playCurrent() {
    const generation = state.generation;
    state.suspended = false;
    visible($('continue-panel'), false);
    // Must be invoked synchronously from enter / retry / continue user events.
    try {
      const pending = video.play();
      if (pending) pending.catch(error => {
        if (generation !== state.generation || state.error) return;
        if (error.name === 'NotAllowedError' || error.name === 'AbortError') continuePrompt();
        else fail('影片载入失败，请重新载入。');
      });
    } catch { continuePrompt(); }
  }
  function fail(message) {
    if (state.error) return;
    state.error = true;
    state.failures += 1;
    clearTimeout(watchdog);
    captureFrame();
    video.pause();
    hideQte();
    loading(false);
    visible($('continue-panel'), false);
    $('error-message').textContent = message;
    $('error-restart').hidden = state.failures < 2;
    visible($('error-panel'), true);
  }
  function stopProbe() {
    if (!metadataProbe) return;
    metadataProbe.onloadedmetadata = metadataProbe.onerror = null;
    metadataProbe.removeAttribute('src');
    metadataProbe.load();
    metadataProbe = null;
  }
  function warmNextLayer() {
    if (warmedGeneration === state.generation || video.currentTime < .5 || video.paused || state.loading) return;
    warmedGeneration = state.generation;
    if (navigator.connection?.saveData) return;
    const generation = state.generation;
    const queue = node().choices.map(choice => STORY[choice.next].src).filter(src => !warmed.has(src));
    function next() {
      if (generation !== state.generation || !queue.length) return;
      const src = queue.shift();
      // One temporary, silent metadata probe at a time, never seven video players.
      const probe = document.createElement('video');
      metadataProbe = probe;
      probe.preload = 'metadata';
      probe.muted = true;
      probe.playsInline = true;
      const complete = () => {
        if (metadataProbe !== probe) return;
        warmed.add(src);
        stopProbe();
        next();
      };
      probe.onloadedmetadata = complete;
      probe.onerror = complete;
      probe.src = src;
      probe.load();
    }
    next();
  }
  function activate(id, { retry = false, initial = false } = {}) {
    captureFrame();
    state.generation += 1;
    state.id = id;
    state.locked = true;
    state.error = false;
    state.suspended = false;
    if (!retry) state.failures = 0;
    clearTimeout(watchdog);
    clearTimeout(feedbackTimer);
    if (frameCallback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameCallback);
    stopProbe();
    hideQte();
    visible($('ending-panel'), false);
    visible($('error-panel'), false);
    visible($('continue-panel'), false);
    loading(true);
    if (!initial) {
      video.pause();
      video.src = node().src;
      video.load();
    }
    playCurrent();
  }
  function frameReady() {
    if (state.error || state.suspended || video.readyState < 2 || video.paused) return;
    const generation = state.generation;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      if (generation !== state.generation || state.error || state.suspended || video.paused) return;
      frozen.classList.remove('frame-visible');
      stage.removeAttribute('data-effect');
      loading(false);
      state.locked = false;
      checkQte();
    }, Math.max(0, effectUntil - performance.now()));
  }
  function metallicClash() {
    if (!audioContext || audioContext.state !== 'running') return;
    const now = audioContext.currentTime;
    [1280, 2137].forEach(frequency => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .45, now + .12);
      gain.gain.setValueAtTime(.035, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .15);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .16);
    });
  }
  function choose(choice) {
    if (!state.qte || state.locked || state.error || state.loading || state.suspended) return;
    state.locked = true; // Lock before any feedback, promises or DOM work.
    captureFrame();
    stage.dataset.effect = choice.effect;
    effectUntil = performance.now() + 220;
    if (choice.effect === 'parry') metallicClash();
    try { navigator.vibrate?.(choice.hold ? 25 : 12); } catch { /* Optional feedback. */ }
    state.history.push(state.id);
    activate(choice.next);
  }
  function resizeTrail() {
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    trail.width = Math.round(rect.width * ratio);
    trail.height = Math.round(rect.height * ratio);
    trailContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function drawTrail(x, y) {
    if (!gesture) return;
    const bounds = stage.getBoundingClientRect();
    trailContext.strokeStyle = 'rgba(255,235,187,.65)';
    trailContext.lineWidth = 3;
    trailContext.lineCap = 'round';
    trailContext.shadowColor = '#fff0c8';
    trailContext.shadowBlur = 9;
    trailContext.beginPath();
    trailContext.moveTo(gesture.lastX - bounds.left, gesture.lastY - bounds.top);
    trailContext.lineTo(x - bounds.left, y - bounds.top);
    trailContext.stroke();
    gesture.lastX = x;
    gesture.lastY = y;
  }
  layer.addEventListener('pointerdown', event => {
    if (!state.qte || state.locked || gesture || !event.isPrimary || event.button !== 0) return;
    const bounds = stage.getBoundingClientRect();
    const relativeY = (event.clientY - bounds.top) / bounds.height;
    if (relativeY < .35 || relativeY > .85) return;
    event.preventDefault();
    const button = event.target.closest('[data-choice]');
    const choice = node().choices.find(item => item.id === button?.dataset.choice);
    gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, lastY: event.clientY, time: performance.now(), maxDistance: 0, choice, holdCancelled: false };
    layer.setPointerCapture(event.pointerId);
    if (choice?.hold) {
      const ring = button.querySelector('.hold-progress');
      function tick(now) {
        if (!gesture || gesture.holdCancelled) return;
        const progress = Math.min(1, (now - gesture.time) / HOLD_MS);
        ring.style.strokeDashoffset = String(100 * (1 - progress));
        if (progress === 1) choose(choice);
        else holdFrame = requestAnimationFrame(tick);
      }
      holdFrame = requestAnimationFrame(tick);
    }
  });
  layer.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.maxDistance = Math.max(gesture.maxDistance, distance);
    if (distance > 20 && gesture.choice?.hold) {
      gesture.holdCancelled = true;
      cancelAnimationFrame(holdFrame);
      buttons.querySelector('.hold-progress').style.strokeDashoffset = '100';
    }
    drawTrail(event.clientX, event.clientY);
  });
  layer.addEventListener('pointerup', event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const current = gesture;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    const distance = Math.hypot(dx, dy);
    const duration = performance.now() - current.time;
    let choice;
    if (Math.max(distance, current.maxDistance) < 12 && duration < 300) choice = current.choice;
    else if (distance >= 60 && duration <= 800) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      choice = node().choices.find(item => Number.isFinite(item.direction)
        && Math.abs(((angle - item.direction + 540) % 360) - 180) <= 33);
    }
    resetGesture();
    if (choice) choose(choice);
  });
  layer.addEventListener('pointercancel', resetGesture);
  layer.addEventListener('lostpointercapture', resetGesture);
  layer.addEventListener('contextmenu', event => event.preventDefault());

  $('enter-button').addEventListener('click', () => {
    if (state.started) return;
    state.started = true;
    visible($('enter-screen'), false);
    video.muted = false;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      try { audioContext = new Audio(); audioContext.resume().catch(() => {}); } catch { /* Sound is optional. */ }
    }
    activate('intro', { initial: true });
  });
  $('restart-button').addEventListener('click', restart);
  $('error-restart').addEventListener('click', restart);
  function restart() { state.history = []; activate('intro'); }
  $('back-button').addEventListener('click', () => {
    if (state.locked || !state.history.length) return;
    activate(state.history.pop());
  });
  $('error-retry').addEventListener('click', () => { if (state.error) activate(state.id, { retry: true }); });
  $('continue-button').addEventListener('click', () => { loading(true); playCurrent(); });
  video.addEventListener('loadedmetadata', () => { if (state.started && !state.error) armWatchdog(); });
  video.addEventListener('canplay', () => {
    // playing + an actual decoded frame, rather than canplay alone, removes the old frame.
    if (state.started && !state.error && !state.suspended) armWatchdog();
  });
  video.addEventListener('playing', () => {
    if (state.error || state.suspended) return;
    armWatchdog();
    if (video.requestVideoFrameCallback) {
      const generation = state.generation;
      frameCallback = video.requestVideoFrameCallback(() => { if (generation === state.generation) frameReady(); });
    } else frameReady();
  });
  video.addEventListener('timeupdate', () => {
    if (!state.started || state.error || state.suspended) return;
    if (!video.paused) {
      armWatchdog();
      warmNextLayer();
    }
    checkQte();
  });
  video.addEventListener('waiting', () => {
    if (!state.started || state.error || state.suspended || video.ended) return;
    captureFrame();
    loading(true);
  });
  video.addEventListener('stalled', () => {
    if (!state.started || state.error || state.suspended || video.ended) return;
    if (video.readyState < 3) { captureFrame(); loading(true); }
  });
  video.addEventListener('error', () => { if (state.started) fail('影片载入失败，请重新载入。'); });
  video.addEventListener('ended', () => {
    if (state.error || state.suspended) return;
    clearTimeout(watchdog);
    state.locked = false;
    loading(false);
    frozen.classList.remove('frame-visible');
    if (node().title) {
      hideQte();
      $('ending-title').textContent = node().title;
      visible($('ending-panel'), true);
    } else showQte();
  });
  document.addEventListener('visibilitychange', () => {
    resetGesture();
    if (document.hidden) { clearTimeout(watchdog); return; }
    if (state.started && !state.error && !video.ended && video.paused) continuePrompt();
    else if (state.started && !video.ended) armWatchdog();
  });
  window.addEventListener('resize', () => { resetGesture(); resizeTrail(); });
  resizeTrail();
  for (const element of document.querySelectorAll('[aria-hidden="true"]')) {
    if (element.matches('section')) element.inert = true;
  }
  // Only intro metadata before the explicit user gesture. No Base64, blobs, fetch or autoplay.
  video.src = STORY.intro.src;
  video.load();
})();
