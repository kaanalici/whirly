/* =========================================================
   WHIRLYBIRD — gökyüzüne tırman
   Tek dosya, sıfır bağımlılık. Canvas 420x720 dünyası.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------- sabitler ---------------- */

  var W = 420, H = 720;
  var GRAV = 2380;
  var JUMP = 1090;
  var SPRING_MULT = 1.62;
  var MOVE_ACC = 2700;
  var MAX_VX = 440;
  var START_CAM = -H * 0.55;
  var APEX = (JUMP * JUMP) / (2 * GRAV);

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });

  var UA = navigator.userAgent || '';
  var isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|IEMobile/i.test(UA) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA));
  var isTouch = isMobile ||
    !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  /* ---------------- kalite / çözünürlük ----------------
     Telefon GPU'larında shadowBlur ve tam ekran karışım katmanları
     çok pahalıdır. Kare hızına göre üç kademe arasında geçilir. */

  var QUALITY_LEVELS = [
    { dpr: 2.00, glow: 1, parts: 1.00, stars: 1.00, clouds: 1.00, grid: 1.00 }, /* masaüstü */
    { dpr: 1.50, glow: 0, parts: 0.60, stars: 0.55, clouds: 0.65, grid: 0.80 }, /* telefon */
    { dpr: 1.15, glow: 0, parts: 0.35, stars: 0.30, clouds: 0.40, grid: 0.55 }  /* zayıf telefon */
  ];

  var BASE_DPR = window.devicePixelRatio || 1;
  var qLevel = isTouch ? 1 : 0;
  var Q = QUALITY_LEVELS[qLevel];
  var GLOW = Q.glow;
  var DPR = 1;

  function applyCanvasSize() {
    var dpr = Math.min(BASE_DPR, Q.dpr);
    /* piksel bütçesi: dolgu (fill-rate) maliyetini sınırlar */
    var budget = isTouch ? 620000 : 1500000;
    dpr = Math.min(dpr, Math.sqrt(budget / (W * H)));
    DPR = Math.max(1, Math.round(dpr * 20) / 20);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  applyCanvasSize();

  function setQuality(level) {
    qLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
    Q = QUALITY_LEVELS[qLevel];
    GLOW = Q.glow;
    applyCanvasSize();
    bgKey = '';
    makeClouds();
  }

  /* shadowBlur tabanlı parlama — mobilde tamamen kapatılır */
  function glowOn(color, blur) {
    if (GLOW > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * GLOW;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
    }
  }
  function glowOff() {
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
  }

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------------- renk / tema ---------------- */

  function hexRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    var a = hexRgb(c1), b = hexRgb(c2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' +
      Math.round(lerp(a[1], b[1], t)) + ',' +
      Math.round(lerp(a[2], b[2], t)) + ')';
  }

  var THEMES = [
    { at: 0, sky: ['#070418', '#2a0946'], plat: ['#00e5ff', '#0a5f74'], glow: '#00e5ff', star: 0.35, cloud: 0.6, grid: 1.0 },
    { at: 700, sky: ['#160526', '#5c0a4e'], plat: ['#ff2d95', '#7a0a45'], glow: '#ff2d95', star: 0.55, cloud: 0.6, grid: 0.85 },
    { at: 1500, sky: ['#04121d', '#053a45'], plat: ['#39ffcc', '#0a6a5c'], glow: '#39ffcc', star: 0.8, cloud: 0.45, grid: 0.55 },
    { at: 2500, sky: ['#04030f', '#170a30'], plat: ['#a96bff', '#45208a'], glow: '#a96bff', star: 1.0, cloud: 0.3, grid: 0.25 },
    { at: 3800, sky: ['#02010a', '#22041c'], plat: ['#ff3d6e', '#7a0a24'], glow: '#ff3d6e', star: 1.0, cloud: 0.18, grid: 0.12 }
  ];

  var themeCache = { m: -1, th: null };
  function themeFor(m) {
    if (themeCache.m === m) return themeCache.th;
    var i = 0;
    while (i < THEMES.length - 1 && m >= THEMES[i + 1].at) i++;
    var a = THEMES[i];
    var b = THEMES[Math.min(i + 1, THEMES.length - 1)];
    var span = b.at - a.at;
    var t = span > 0 ? clamp((m - a.at) / span, 0, 1) : 0;
    t = t * t * (3 - 2 * t);
    var th = {
      index: i,
      prog: Math.round(t * 16),
      skyTop: mix(a.sky[0], b.sky[0], t),
      skyBottom: mix(a.sky[1], b.sky[1], t),
      platTop: mix(a.plat[0], b.plat[0], t),
      platBot: mix(a.plat[1], b.plat[1], t),
      glow: mix(a.glow, b.glow, t),
      star: lerp(a.star, b.star, t),
      cloud: lerp(a.cloud, b.cloud, t),
      grid: lerp(a.grid, b.grid, t)
    };
    themeCache = { m: m, th: th };
    return th;
  }

  /* ---------------- ses ---------------- */

  /* dosyadan (file://) açıldığında localStorage hata verebilir */
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
      return value;
    } catch (e) { return null; }
  }

  var actx = null;
  var soundOn = store('wb_sound') !== '0';

  function audio() {
    if (!soundOn) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    var ac = audio();
    if (!ac) return;
    var t0 = ac.currentTime;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function sfx(kind) {
    if (!soundOn) return;
    if (kind === 'jump') { tone(420, 0.1, 'triangle', 0.045, 620); }
    else if (kind === 'spring') { tone(330, 0.22, 'sine', 0.06, 880); }
    else if (kind === 'star') { tone(880, 0.1, 'triangle', 0.05); tone(1320, 0.14, 'triangle', 0.04, 1760); }
    else if (kind === 'break') { tone(220, 0.16, 'sawtooth', 0.045, 90); }
    else if (kind === 'cloud') { tone(500, 0.12, 'sine', 0.03, 300); }
    else if (kind === 'die') { tone(300, 0.5, 'sawtooth', 0.06, 60); tone(140, 0.6, 'square', 0.035, 50); }
    else if (kind === 'start') { tone(520, 0.1, 'triangle', 0.05); tone(780, 0.16, 'triangle', 0.045, 900); }
    else if (kind === 'mile') { tone(660, 0.09, 'square', 0.03); tone(990, 0.12, 'square', 0.028, 1200); }
    else if (kind === 'shield') { tone(520, 0.12, 'triangle', 0.05); tone(780, 0.16, 'sine', 0.045, 1040); }
    else if (kind === 'magnet') { tone(300, 0.26, 'sine', 0.05, 620); tone(900, 0.2, 'triangle', 0.03, 500); }
    else if (kind === 'jet') { tone(180, 0.42, 'sawtooth', 0.06, 700); tone(520, 0.34, 'square', 0.03, 1100); }
    else if (kind === 'shieldBreak') { tone(900, 0.28, 'square', 0.05, 180); tone(420, 0.34, 'sawtooth', 0.045, 90); }
  }

  /* ---------------- oyun durumu ---------------- */

  var G = {
    mode: 'menu',            // menu | play | paused | over
    time: 0,
    camY: START_CAM,
    player: null,
    platforms: [],
    stars: [],
    traps: [],
    items: [],
    particles: [],
    floaters: [],
    clouds: [],
    keys: { left: false, right: false },
    pointer: { active: false, x: null },
    touch: { active: false, side: 0, id: null },
    highestY: 0,
    maxUp: 0,
    meters: 0,
    starsGot: 0,
    score: 0,
    shield: false,
    magnet: 0,
    jet: 0,
    invuln: 0,
    shake: 0,
    flash: 0,
    mile: 0,
    best: parseInt(store('wb_best') || '0', 10) || 0,
    bird: { x: W / 2, y: 0, vx: 0, vy: 0, r: 17, face: 1, tilt: 0, squash: 0, rotor: 0 },
    trailTimer: 0,
    overAt: 0
  };

  /* kontrol stili: 'pc' (klavye/fare) veya 'touch' (ekranın yarısına bas) */
  var savedInput = store('wb_input');
  var inputMode = (savedInput === 'touch' || savedInput === 'pc')
    ? savedInput
    : (isTouch ? 'touch' : 'pc');

  /* ---------------- yardımcılar ---------------- */

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      r = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function starPath(cx, cy, r, points, inner) {
    points = points || 5;
    inner = inner || 0.45;
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / points;
      var rad = (i % 2) ? r * inner : r;
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------------- parçacık / yazı ---------------- */

  var MAX_PARTICLES = 240;

  function capParticles(extra) {
    var max = Math.round(MAX_PARTICLES * (isTouch ? 0.65 : 1));
    var over = G.particles.length + extra - max;
    if (over > 0) G.particles.splice(0, over);
  }

  function burst(x, y, n, color, power) {
    power = power || 1;
    n = Math.max(3, Math.round(n * Q.parts));
    capParticles(n);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(40, 190) * power;
      G.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: rand(0.3, 0.7), max: 0.7,
        size: rand(2, 5),
        color: color,
        grav: 520
      });
    }
  }

  function puff(x, y, n) {
    n = Math.max(2, Math.round(n * Q.parts));
    capParticles(n);
    for (var i = 0; i < n; i++) {
      G.particles.push({
        x: x + rand(-14, 14), y: y + rand(-4, 4),
        vx: rand(-60, 60), vy: rand(-40, 20),
        life: rand(0.4, 0.8), max: 0.8,
        size: rand(4, 9),
        color: 'rgba(255,255,255,0.9)',
        grav: -30
      });
    }
  }

  function floater(x, y, text, color) {
    G.floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: 1, max: 1 });
  }

  /* ---------------- dünya kurulumu ---------------- */

  function makeClouds() {
    G.clouds = [];
    var n = Math.max(4, Math.round(13 * Q.clouds));
    for (var i = 0; i < n; i++) {
      G.clouds.push({
        x: rand(-40, W + 40),
        y: rand(0, 1400),
        s: rand(0.5, 1.35),
        a: rand(0.35, 0.8),
        drift: rand(-6, 6),
        tint: Math.random() < 0.5 ? '0,229,255' : '255,45,149'
      });
    }
  }

  function reset() {
    G.bird = { x: W / 2, y: -26, vx: 0, vy: -JUMP, r: 17, face: 1, tilt: 0, squash: 0, rotor: 0 };
    G.camY = START_CAM;
    G.platforms = [];
    G.stars = [];
    G.traps = [];
    G.items = [];
    G.particles = [];
    G.floaters = [];
    G.highestY = 0;
    G.maxUp = 0;
    G.meters = 0;
    G.starsGot = 0;
    G.score = 0;
    G.shield = false;
    G.magnet = 0;
    G.jet = 0;
    G.invuln = 0;
    G.shake = 0;
    G.flash = 0;
    G.mile = 0;
    G.trailTimer = 0;
    G.pointer.active = false;
    G.pointer.x = null;
    G.touch.active = false;
    G.touch.id = null;
    G.touch.side = 0;

    addPlatform((W - 250) / 2, 0, 250, 'normal');
    for (var i = 0; i < 16; i++) spawnPlatform();
    makeClouds();
    updatePowersHud(true);
  }

  function addPlatform(x, y, w, type) {
    G.platforms.push({
      x: x, y: y, w: w, h: 13, type: type || 'normal',
      baseX: x, phase: rand(0, 6.28), speed: rand(0.8, 1.5), range: rand(26, 66),
      dead: false, fade: 1
    });
  }

  function spawnPlatform() {
    var diff = clamp(G.meters / 2000, 0, 1);
    var gap = rand(74, 102) + diff * 24;
    G.highestY -= gap;

    var w = lerp(88, 56, diff) + rand(-5, 5);
    var x = rand(14, W - 14 - w);
    var dist = -G.highestY;
    var r = Math.random();
    var type = 'normal';

    if (dist > 700 && r < 0.11) type = 'moving';
    else if (dist > 1300 && r < 0.21) type = 'break';
    else if (dist > 350 && r < 0.32) type = 'cloud';

    var pl = {
      x: x, y: G.highestY, w: w, h: 13, type: type,
      baseX: x, phase: rand(0, 6.28), speed: rand(0.7, 1.5), range: rand(28, 70),
      dead: false, fade: 1
    };

    if (type === 'normal' && dist > 220 && Math.random() < 0.11) pl.spring = true;

    /* platformda duran eşyalar: kalkan / mıknatıs / jetpack */
    if (type === 'normal' && !pl.spring && dist > 420 && Math.random() < 0.14) {
      var roll = Math.random();
      pl.item = roll < 0.34 ? 'shield' : (roll < 0.68 ? 'magnet' : 'jet');
    }

    if (!pl.item && dist > 160 && Math.random() < 0.26) pl.star = true;

    G.platforms.push(pl);

    if (pl.star) {
      G.stars.push({
        x: pl.x + pl.w / 2, y: pl.y - 36, r: 11,
        phase: rand(0, 6.28), got: false, plat: pl
      });
    }

    if (pl.item) {
      G.items.push({
        type: pl.item, x: pl.x + pl.w / 2, y: pl.y - 32, r: 15,
        phase: rand(0, 6.28), got: false, plat: pl
      });
    }

    if (dist > 800) {
      var chance = clamp((dist - 800) / 4500, 0, 0.34);
      if (Math.random() < chance) {
        var tx = rand(50, W - 50);
        G.traps.push({
          x: tx, baseX: tx, y: G.highestY - gap * 0.5,
          r: 14, range: rand(24, 76), phase: rand(0, 6.28),
          speed: 1.1 + diff * 1.6 + rand(0, 0.8), angle: rand(0, 6.28)
        });
      }
    }
  }

  /* ---------------- akış ---------------- */

  function startGame() {
    reset();
    setMode('play');
    sfx('start');
    updateHud(true);
    if (inputMode === 'touch') {
      goFullscreen();
      showTouchHint();
    }
  }

  function goMenu() {
    reset();
    setMode('menu');
    $('menu-best').textContent = G.best;
  }

  /* ---------------- tam ekran (telefon) ---------------- */

  function goFullscreen() {
    var el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        var p = req.call(el, { navigationUI: 'hide' });
        if (p && p.then) p.then(lockPortrait).catch(function () { });
      }
    } catch (e) { }
  }

  function lockPortrait() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        var p = screen.orientation.lock('portrait');
        if (p && p.catch) p.catch(function () { });
      }
    } catch (e) { }
  }

  /* ---------------- kontrol stili ---------------- */

  function applyInputMode(mode, persist) {
    inputMode = (mode === 'touch') ? 'touch' : 'pc';
    if (persist !== false) store('wb_input', inputMode);

    var btns = document.querySelectorAll('.mode-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-mode') === inputMode);
    }
    $('ctrl-pc').classList.toggle('hidden', inputMode !== 'pc');
    $('ctrl-touch').classList.toggle('hidden', inputMode !== 'touch');

    G.touch.active = false;
    G.touch.side = 0;
    G.pointer.active = false;
    G.pointer.x = null;
  }

  function setMode(mode) {
    G.mode = mode;
    $('menu').classList.toggle('hidden', mode !== 'menu');
    $('over').classList.toggle('hidden', mode !== 'over');
    $('pause').classList.toggle('hidden', mode !== 'paused');
    $('hud').classList.toggle('hidden', mode === 'menu' || mode === 'over');
    if (mode !== 'play') hideTouchHint();
  }

  var touchHintTimer = null;
  function showTouchHint() {
    var el = $('hint-touch');
    el.classList.add('show');
    clearTimeout(touchHintTimer);
    touchHintTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  function hideTouchHint() {
    $('hint-touch').classList.remove('show');
    clearTimeout(touchHintTimer);
  }

  function showOver(isNew) {
    G.mode = 'over';
    G.overAt = G.time;
    setMode('over');
    $('over-score').textContent = G.score;
    $('over-meters').textContent = G.meters + ' m';
    $('over-stars').textContent = '★ ' + G.starsGot;
    $('over-best').textContent = G.best;
    $('new-rec').classList.toggle('hidden', !isNew);
    $('over-title').textContent = isNew ? 'YENİ REKOR!' : 'DÜŞTÜN!';
  }

  function die() {
    if (G.mode !== 'play') return;
    var p = G.bird;
    G.shake = 16;
    G.flash = 0.55;
    burst(p.x, p.y, 30, '#00e5ff', 1.5);
    burst(p.x, p.y, 14, '#ff2d95', 1.2);
    sfx('die');

    var isNew = G.score > G.best;
    if (isNew) {
      G.best = G.score;
      try { store('wb_best', String(G.best)); } catch (e) { }
    }
    showOver(isNew);
  }

  /* ---------------- güncelleme ---------------- */

  function update(dt) {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 34);
    G.flash = Math.max(0, G.flash - dt * 1.8);
    updateParticles(dt);

    if (G.mode === 'play') {
      updatePlay(dt);
    } else if (G.mode === 'over') {
      updateOver(dt);
    } else if (G.mode === 'menu') {
      updateMenu(dt);
    }
    updateClouds(dt);
  }

  function updateMenu(dt) {
    G.bird.rotor += dt;
    if (!G.player) { /* noop */ }
  }

  function updateOver(dt) {
    // dünya donuk; sadece parçacıklar ve yazılar akar
    G.bird.rotor += dt * 0.2;
  }

  function updateParticles(dt) {
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { G.particles.splice(i, 1); continue; }
      pt.vy += (pt.grav || 0) * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    for (var j = G.floaters.length - 1; j >= 0; j--) {
      var fl = G.floaters[j];
      fl.life -= dt * 1.1;
      fl.y -= 34 * dt;
      if (fl.life <= 0) G.floaters.splice(j, 1);
    }
  }

  function updateClouds(dt) {
    for (var i = 0; i < G.clouds.length; i++) {
      var c = G.clouds[i];
      c.x += c.drift * dt;
      if (c.x < -120) c.x = W + 120;
      if (c.x > W + 120) c.x = -120;
    }
  }

  function updatePlay(dt) {
    var p = G.bird;

    /* --- yatay hareket --- */
    var ax = 0;
    if (G.keys.left) ax -= MOVE_ACC;
    if (G.keys.right) ax += MOVE_ACC;
    if (ax === 0 && inputMode === 'touch') {
      /* ekranın sol yarısı -> sol, sağ yarısı -> sağ */
      if (G.touch.active && G.touch.side !== 0) ax = G.touch.side * MOVE_ACC;
    } else if (ax === 0 && G.pointer.active && G.pointer.x !== null) {
      /* bilgisayarda fareyi basılı tutup sürükleme */
      var d = G.pointer.x - p.x;
      if (Math.abs(d) > 5) ax = clamp(d * 17, -MOVE_ACC, MOVE_ACC);
    }

    if (ax !== 0) {
      p.vx += ax * dt;
      p.face = ax > 0 ? 1 : -1;
    } else {
      p.vx *= Math.pow(0.0016, dt);
      if (Math.abs(p.vx) < 3) p.vx = 0;
    }
    p.vx = clamp(p.vx, -MAX_VX, MAX_VX);
    p.x += p.vx * dt;

    if (p.x < -p.r) p.x = W + p.r;
    else if (p.x > W + p.r) p.x = -p.r;

    /* --- dikey hareket --- */
    var prevBottom = p.y + p.r;

    if (G.invuln > 0) G.invuln = Math.max(0, G.invuln - dt);
    if (G.magnet > 0) G.magnet = Math.max(0, G.magnet - dt);

    if (G.jet > 0) {
      /* jetpack: sabit hızlı yükseliş, alev izi */
      G.jet = Math.max(0, G.jet - dt);
      p.vy = -940;
      if (Math.random() < 0.85) {
        G.particles.push({
          x: p.x + rand(-4, 4),
          y: p.y + 15,
          vx: rand(-40, 40),
          vy: rand(120, 300),
          life: rand(0.18, 0.34), max: 0.34,
          size: rand(2.5, 5),
          color: Math.random() < 0.5 ? 'rgba(255,176,32,0.9)' : 'rgba(255,72,90,0.85)',
          grav: 260
        });
      }
      if (G.jet === 0) {
        p.vy = -JUMP * 0.55;
        burst(p.x, p.y + 10, 14, '#ffb020', 1.1);
      }
    } else {
      p.vy = Math.min(p.vy + GRAV * dt, 1650);
    }
    p.y += p.vy * dt;

    p.tilt = clamp(p.vx / 1100, -0.26, 0.26);
    p.squash = Math.max(0, p.squash - dt * 4.5);
    p.rotor += dt * (p.vy < 0 ? 2.6 : 1.1);

    /* --- platforma çarpma --- */
    if (p.vy > 0) {
      var bottom = p.y + p.r;
      for (var i = 0; i < G.platforms.length; i++) {
        var pl = G.platforms[i];
        if (pl.dead) continue;
        if (p.x + 9 < pl.x || p.x - 9 > pl.x + pl.w) continue;
        if (prevBottom <= pl.y + 2 && bottom >= pl.y) {
          bounce(pl);
          break;
        }
      }
    }

    /* --- kamera --- */
    var camTarget = p.y - H * 0.46;
    if (camTarget < G.camY) {
      G.camY += (camTarget - G.camY) * Math.min(1, dt * 11);
    }

    /* --- skor --- */
    if (-p.y > G.maxUp) G.maxUp = -p.y;
    G.meters = Math.max(0, Math.floor((G.maxUp - APEX) / 4));
    G.score = G.meters + G.starsGot * 16;

    var mileNow = Math.floor(G.meters / 250) * 250;
    if (mileNow > G.mile && mileNow >= 250) {
      G.mile = mileNow;
      floater(W / 2, G.camY + 190, mileNow + ' m!', '#7df9ff');
      sfx('mile');
    }
    updateHud();
    updatePowersHud();

    /* --- iz --- */
    if (Math.abs(p.vx) > 230 || p.vy < -400) {
      G.trailTimer -= dt;
      if (G.trailTimer <= 0) {
        G.trailTimer = 0.055;
        G.particles.push({
          x: p.x - p.face * 14 + rand(-4, 4),
          y: p.y + rand(-2, 8),
          vx: -p.vx * 0.15 + rand(-14, 14),
          vy: rand(-16, 16) - 20,
          life: rand(0.25, 0.45), max: 0.45,
          size: rand(2, 3.6),
          color: 'rgba(255,45,149,0.75)',
          grav: -20
        });
      }
    }

    /* --- platformlar, yıldızlar, tuzaklar --- */
    for (var k = 0; k < G.platforms.length; k++) {
      var pf = G.platforms[k];
      if (pf.type === 'moving' && !pf.dead) {
        pf.phase += dt * pf.speed;
        pf.x = pf.baseX + Math.sin(pf.phase) * pf.range;
        if (pf.x < 8) { pf.x = 8; pf.baseX = 8; pf.range = -pf.range; }
        if (pf.x + pf.w > W - 8) { pf.x = W - 8 - pf.w; pf.baseX = pf.x; pf.range = -pf.range; }
      }
      if (pf.dead) pf.fade -= dt * 3.2;
    }

    for (var s = 0; s < G.stars.length; s++) {
      var st = G.stars[s];
      if (st.got) continue;
      st.phase += dt * 3;
      if (st.plat && !st.pull) {
        st.x = st.plat.x + st.plat.w / 2;
        st.y = st.plat.y - 36;
      }
      var dx = p.x - st.x, dy = p.y - st.y;
      var sd = Math.sqrt(dx * dx + dy * dy) || 1;

      /* mıknatıs: yakındaki shard'ları oyuncuya çeker */
      if (G.magnet > 0 && sd < 230) {
        st.pull = true;
        var sp = 300 + (230 - sd) * 2.2;
        st.x += (dx / sd) * sp * dt;
        st.y += (dy / sd) * sp * dt;
        if (!st.sparkT || st.sparkT <= 0) {
          st.sparkT = 0.06;
          G.particles.push({
            x: st.x, y: st.y, vx: rand(-20, 20), vy: rand(-20, 20),
            life: 0.2, max: 0.2, size: rand(1.4, 2.6),
            color: 'rgba(255,45,149,0.8)', grav: 0
          });
        }
      }
      if (st.sparkT > 0) st.sparkT -= dt;

      if (sd < p.r + st.r + 6) {
        st.got = true;
        G.starsGot++;
        sfx('star');
        burst(st.x, st.y, 12, '#00e5ff', 1.1);
        floater(st.x, st.y - 6, '+1 ★', '#7df9ff');
        G.flash = Math.max(G.flash, 0.18);
      }
    }

    /* --- eşyalar (kalkan / mıknatıs / jetpack) --- */
    for (var it = 0; it < G.items.length; it++) {
      var item = G.items[it];
      if (item.got) continue;
      item.phase += dt * 2.2;
      if (item.plat && !item.plat.dead) {
        item.x = item.plat.x + item.plat.w / 2;
        item.y = item.plat.y - 32;
      }
      var idx = p.x - item.x, idy = p.y - item.y;
      if (idx * idx + idy * idy < (p.r + item.r + 8) * (p.r + item.r + 8)) {
        collectItem(item);
      }
    }

    for (var t = 0; t < G.traps.length; t++) {
      var tr = G.traps[t];
      tr.phase += dt * tr.speed;
      tr.x = tr.baseX + Math.sin(tr.phase) * tr.range;
      if (tr.x < 26) { tr.x = 26; tr.baseX = 26; tr.range = -tr.range; }
      if (tr.x > W - 26) { tr.x = W - 26; tr.baseX = tr.x; tr.range = -tr.range; }
      tr.angle += dt * 7;
      if (G.jet > 0 || G.invuln > 0) continue;
      var tdx = p.x - tr.x, tdy = p.y - tr.y;
      if (tdx * tdx + tdy * tdy < (p.r + tr.r * 0.82) * (p.r + tr.r * 0.82)) {
        if (G.shield) {
          /* kalkan bir testereyi parçalar */
          G.shield = false;
          G.invuln = 0.9;
          G.shake = 12;
          G.flash = Math.max(G.flash, 0.3);
          burst(tr.x, tr.y, 26, '#00e5ff', 1.5);
          burst(tr.x, tr.y, 14, '#ffffff', 1.1);
          floater(tr.x, tr.y - 10, 'KALKAN KIRILDI', '#7df9ff');
          G.traps.splice(t, 1);
          t--;
          sfx('shieldBreak');
          continue;
        }
        die();
        return;
      }
    }

    /* --- dünyayı besle / temizle --- */
    while (G.highestY > G.camY - 320) spawnPlatform();
    var below = G.camY + H + 160;
    G.platforms = G.platforms.filter(function (x) { return x.y < below && !(x.dead && x.fade <= 0); });
    G.stars = G.stars.filter(function (x) { return !x.got && x.y < below; });
    G.traps = G.traps.filter(function (x) { return x.y < below; });
    G.items = G.items.filter(function (x) { return !x.got && x.y < below; });

    /* --- düşme --- */
    if (p.y - G.camY > H + 140) {
      die();
    }
  }

  function collectItem(item) {
    item.got = true;
    var p = G.bird;

    if (item.type === 'shield') {
      G.shield = true;
      sfx('shield');
      burst(item.x, item.y, 18, '#00e5ff', 1.2);
      floater(item.x, item.y - 10, 'KALKAN', '#7df9ff');
      G.flash = Math.max(G.flash, 0.16);
    } else if (item.type === 'magnet') {
      G.magnet = 8;
      sfx('magnet');
      burst(item.x, item.y, 18, '#ff2d95', 1.2);
      floater(item.x, item.y - 10, 'MIKNATIS 8s', '#ffb3d8');
    } else {
      G.jet = 1.8;
      p.vy = -940;
      sfx('jet');
      burst(item.x, item.y, 22, '#ffb020', 1.4);
      floater(item.x, item.y - 10, 'JETPACK', '#ffd08a');
      G.shake = Math.max(G.shake, 6);
      G.flash = Math.max(G.flash, 0.2);
    }
    updatePowersHud();
  }

  function bounce(pl) {
    var p = G.bird;
    p.y = pl.y - p.r;
    var spring = !!pl.spring && pl.type === 'normal';
    p.vy = -JUMP * (spring ? SPRING_MULT : 1);
    p.squash = spring ? 0.42 : 0.26;

    if (pl.type === 'break') {
      pl.dead = true;
      pl.fade = 1;
      burst(pl.x + pl.w / 2, pl.y + 4, 14, '#ffb020', 1.1);
      sfx('break');
    } else if (pl.type === 'cloud') {
      pl.dead = true;
      pl.fade = 1;
      puff(pl.x + pl.w / 2, pl.y, 12);
      sfx('cloud');
    } else if (spring) {
      sfx('spring');
      burst(pl.x + pl.w / 2, pl.y, 10, '#9ff0a8', 1.1);
      G.shake = Math.max(G.shake, 5);
    } else {
      sfx('jump');
      burst(p.x, p.y + 14, 5, 'rgba(255,255,255,0.8)', 0.55);
    }

    G.shake = Math.max(G.shake, spring ? 5 : 1.7);
  }

  /* ---------------- HUD ---------------- */

  var lastHudKey = '';
  function updateHud(force) {
    var key = G.meters + '|' + G.starsGot + '|' + G.best;
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    $('hud-meters').textContent = G.meters;
    $('hud-stars').textContent = G.starsGot;
    $('hud-best').textContent = G.best;
  }

  var lastPowersKey = '';
  function updatePowersHud(force) {
    var key = (G.shield ? 1 : 0) + '|' + Math.ceil(G.magnet) + '|' + Math.ceil(G.jet * 10);
    if (!force && key === lastPowersKey) return;
    lastPowersKey = key;
    $('pw-shield').classList.toggle('hidden', !G.shield);
    $('pw-magnet').classList.toggle('hidden', G.magnet <= 0);
    $('pw-jet').classList.toggle('hidden', G.jet <= 0);
    $('pw-magnet-t').textContent = Math.ceil(G.magnet);
    $('pw-jet-t').textContent = (Math.ceil(G.jet * 10) / 10).toFixed(1);
  }

  /* ---------------- çizim ---------------- */

  /* ---------------- arka plan önbelleği ----------------
     Gökyüzü + küre her karede yeniden çizilmez; tema değişince
     bir kez hazırlanıp kopyalanır. */

  var bgCanvas = document.createElement('canvas');
  var bgCtx = bgCanvas.getContext('2d', { alpha: false });
  var bgKey = '';

  function drawSkyAndOrb(th) {
    var wpx = Math.max(1, Math.round(W * DPR));
    var hpx = Math.max(1, Math.round(H * DPR));
    var key = th.index + '|' + th.prog + '|' + wpx;

    if (bgCanvas.width !== wpx || bgCanvas.height !== hpx) {
      bgCanvas.width = wpx;
      bgCanvas.height = hpx;
      bgKey = '';
    }

    if (bgKey !== key) {
      bgKey = key;
      var b = bgCtx;
      b.setTransform(DPR, 0, 0, DPR, 0, 0);
      var sky = b.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, th.skyTop);
      sky.addColorStop(1, th.skyBottom);
      b.fillStyle = sky;
      b.fillRect(0, 0, W, H);
      drawOrb(b, th);
    }

    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  function draw() {
    var th = themeFor(G.meters);

    drawSkyAndOrb(th);

    /* arka plan yıldızları */
    if (th.star > 0.02) drawBgStars(th.star);

    /* perspektif ızgara */
    drawNeonGrid(th);

    /* neon sis */
    drawClouds(th);

    /* dünya */
    if (G.mode === 'menu') {
      drawMenuScene();
    } else {
      ctx.save();
      if (G.shake > 0.25) {
        ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
      }
      ctx.translate(0, -G.camY);

      drawPlatforms(th);
      drawStarPickups();
      drawItems();
      drawTraps();
      drawBird(G.bird.x, G.bird.y, G.time);
      drawParticles();
      drawFloaters();

      ctx.restore();
    }

    /* dokunmatik yön göstergesi */
    if (G.mode === 'play' && inputMode === 'touch' && G.touch.active && G.touch.side !== 0) {
      drawTouchZone(G.touch.side, th);
    }

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.55) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawTouchZone(side, th) {
    var half = W / 2;
    var x0 = side > 0 ? half : 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* basılan yarıyı hafifçe aydınlat */
    var g = ctx.createLinearGradient(side > 0 ? W : 0, 0, half, 0);
    g.addColorStop(0, 'rgba(0,229,255,0.12)');
    g.addColorStop(1, 'rgba(0,229,255,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, half, H);

    /* kenar çizgisi */
    ctx.strokeStyle = 'rgba(120,245,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(side > 0 ? W - 3 : 3, 0);
    ctx.lineTo(side > 0 ? W - 3 : 3, H);
    ctx.stroke();
    ctx.restore();

    /* yön oku */
    var ay = H * 0.5;
    var ax = side > 0 ? W - 34 : 34;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(210,252,255,0.95)';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    glowOn('#00e5ff', 22);
    ctx.beginPath();
    ctx.moveTo(ax - 8 * side, ay - 12);
    ctx.lineTo(ax + 7 * side, ay);
    ctx.lineTo(ax - 8 * side, ay + 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawMenuScene() {
    // menüde arka planda süzülen kuş ve birkaç platform
    var t = G.time;
    var by = H - 92 + Math.sin(t * 1.8) * 7;
    drawPlatform(W / 2 - 70, H - 58, 140, 'normal', themeFor(0));
    drawBird(W / 2, by, t, 0.06);
  }

  function drawClouds(th) {
    for (var i = 0; i < G.clouds.length; i++) {
      var c = G.clouds[i];
      var sy = c.y - G.camY * 0.55;
      var span = 1500;
      sy = ((sy % span) + span) % span - 340;
      if (sy < -180 || sy > H + 180) continue;
      var alpha = c.a * th.cloud * 0.30;
      if (alpha <= 0.01) continue;
      var r = 92 * c.s;
      var g = ctx.createRadialGradient(c.x, sy, 0, c.x, sy, r);
      g.addColorStop(0, 'rgba(' + c.tint + ',' + alpha + ')');
      g.addColorStop(0.55, 'rgba(' + c.tint + ',' + (alpha * 0.45) + ')');
      g.addColorStop(1, 'rgba(' + c.tint + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(c.x - r, sy - r, r * 2, r * 2);
    }
  }

  function drawOrb(c, th) {
    var x = 322, y = 126;
    var rg = c.createRadialGradient(x, y, 4, x, y, 150);
    rg.addColorStop(0, th.glow);
    rg.addColorStop(0.3, 'rgba(255,255,255,0.12)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = rg;
    c.fillRect(0, 0, W, 380);
    c.restore();

    c.save();
    if (GLOW > 0) {
      c.shadowColor = th.glow;
      c.shadowBlur = 36 * GLOW;
    }
    c.strokeStyle = th.glow;
    c.lineWidth = 2;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.arc(x, y, 30, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 0.14;
    c.fillStyle = th.glow;
    c.fill();
    c.restore();

    c.save();
    c.globalAlpha = 0.85;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x - 5, y - 7, 7, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawNeonGrid(th) {
    var a = th.grid;
    if (a < 0.04) return;
    var horizon = H * 0.62;
    var phase = ((-G.camY * 0.45) % 76) / 76;

    ctx.save();
    ctx.strokeStyle = th.glow;
    ctx.lineWidth = 1;

    /* ufka yaklaşan dikey çizgiler */
    var vStep = Q.grid < 0.7 ? 2 : 1;
    ctx.globalAlpha = 0.30 * a;
    for (var i = -9; i <= 9; i += vStep) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 15, horizon);
      ctx.lineTo(W / 2 + i * 155, H + 40);
      ctx.stroke();
    }

    /* yatay çizgiler */
    var hStep = Q.grid < 0.7 ? 2 : 1;
    for (var k = 0; k < 12; k += hStep) {
      var t = (k + phase) / 12;
      var y = horizon + Math.pow(t, 2.2) * (H - horizon + 50);
      ctx.globalAlpha = 0.34 * a * (1 - t * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    /* ufuk parlaması */
    ctx.globalAlpha = 0.75 * a;
    glowOn(th.glow, 20);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(W, horizon);
    ctx.stroke();
    ctx.restore();
  }

  function drawBgStars(alpha) {
    var n = Math.max(16, Math.round(80 * Q.stars));
    ctx.save();
    ctx.globalAlpha = alpha;
    for (var i = 0; i < n; i++) {
      var x = (i * 137.5) % W;
      var y = ((i * 251.7) % H);
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(G.time * 1.3 + i));
      var sz = (i % 7 === 0) ? 1.9 : 1.1;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * tw) + ')';
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatforms(th) {
    for (var i = 0; i < G.platforms.length; i++) {
      var pl = G.platforms[i];
      var sy = pl.y - G.camY;
      if (sy < -80 || sy > H + 80) continue;

      ctx.save();
      ctx.globalAlpha = pl.dead ? Math.max(0, pl.fade) : 1;
      if (pl.type === 'cloud') drawCloudPlatform(pl);
      else drawPlatform(pl.x, pl.y, pl.w, pl.type, th);

      if (pl.spring) drawSpring(pl.x + pl.w / 2, pl.y);
      ctx.restore();
    }
  }

  function drawPlatform(x, y, w, type, th) {
    th = th || themeFor(G.meters);
    var accent = (type === 'break') ? '#ffb020' : th.platTop;

    ctx.save();
    glowOn(accent, 14);
    ctx.fillStyle = 'rgba(7,10,20,0.92)';
    rr(x, y, w, 13, 6);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.95;
    rr(x + 0.8, y + 0.8, w - 1.6, 11.4, 5.4);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = accent;
    rr(x + 8, y + 3, w - 16, 2, 1);
    ctx.fill();
    ctx.restore();

    if (type === 'moving') {
      ctx.save();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◄ ►', x + w / 2, y + 7.6);
      ctx.restore();
    } else if (type === 'break') {
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      var cx = x + w * 0.38;
      ctx.beginPath();
      ctx.moveTo(cx, y + 2);
      ctx.lineTo(cx + 5, y + 6.5);
      ctx.lineTo(cx - 1, y + 11);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCloudPlatform(pl) {
    ctx.save();
    glowOn('#66f6ff', 18);
    ctx.strokeStyle = 'rgba(130,245,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = 'rgba(80,225,255,0.10)';
    rr(pl.x, pl.y + 1, pl.w, 11, 5.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#bffcff';
    rr(pl.x + 9, pl.y + 4, pl.w - 18, 2, 1);
    ctx.fill();
    ctx.restore();
  }

  function drawSpring(cx, py) {
    ctx.save();
    glowOn('#39ff88', 14);
    ctx.strokeStyle = '#7bff9a';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    for (var i = 0; i < 2; i++) {
      var yy = py - 5 - i * 6;
      ctx.beginPath();
      ctx.moveTo(cx - 7, yy);
      ctx.lineTo(cx, yy - 6);
      ctx.lineTo(cx + 7, yy);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(57,255,136,0.9)';
    ctx.fillRect(cx - 9, py - 2, 18, 2);
  }

  function drawStarPickups() {
    for (var i = 0; i < G.stars.length; i++) {
      var st = G.stars[i];
      if (st.got) continue;
      var sy = st.y - G.camY;
      if (sy < -60 || sy > H + 60) continue;
      var yy = st.y + Math.sin(st.phase) * 4;
      ctx.save();
      ctx.translate(st.x, yy);
      ctx.rotate(Math.sin(st.phase * 0.6) * 0.25);
      glowOn('rgba(0,229,255,0.95)', 20);
      ctx.fillStyle = '#bffcff';
      starPath(0, 0, st.r + 2, 4, 0.3);
      ctx.fill();
      ctx.fillStyle = '#00e5ff';
      starPath(0, 0, st.r * 0.58, 4, 0.32);
      ctx.fill();
      glowOff();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- eşyalar: kalkan / mıknatıs / jetpack ---------------- */

  var ITEM_RGB = { shield: '0,229,255', magnet: '255,45,149', jet: '255,176,32' };

  function drawItems() {
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.got) continue;
      var sy = it.y - G.camY;
      if (sy < -70 || sy > H + 70) continue;

      var rgb = ITEM_RGB[it.type] || '255,255,255';
      var bob = Math.sin(it.phase) * 4;

      ctx.save();
      ctx.translate(it.x, it.y + bob);
      ctx.scale(1.12, 1.12);

      /* hale */
      var halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
      halo.addColorStop(0, 'rgba(' + rgb + ',0.40)');
      halo.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();

      glowOn('rgba(' + rgb + ',0.95)', 16);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(' + rgb + ')';
      ctx.fillStyle = 'rgba(' + rgb + ',0.18)';

      if (it.type === 'shield') drawShieldIcon();
      else if (it.type === 'magnet') drawMagnetIcon();
      else drawJetIcon();

      ctx.restore();
    }
  }

  function drawShieldIcon() {
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 3;
      var px = Math.cos(a) * 11;
      var py = Math.sin(a) * 12;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    glowOff();
    ctx.strokeStyle = 'rgba(235,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(-1, 4);
    ctx.lineTo(5, -4);
    ctx.stroke();
  }

  function drawMagnetIcon() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -1, 8, Math.PI, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, -1);
    ctx.lineTo(-8, 7);
    ctx.moveTo(8, -1);
    ctx.lineTo(8, 7);
    ctx.stroke();

    glowOn('rgba(125,249,255,0.95)', 16);
    ctx.strokeStyle = '#7df9ff';
    ctx.beginPath();
    ctx.moveTo(-8, 5);
    ctx.lineTo(-8, 9);
    ctx.moveTo(8, 5);
    ctx.lineTo(8, 9);
    ctx.stroke();
  }

  function drawJetIcon() {
    ctx.fillStyle = 'rgba(255,176,32,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(7.5, -3, 6, 8);
    ctx.lineTo(-6, 8);
    ctx.quadraticCurveTo(-7.5, -3, 0, -12);
    ctx.closePath();
    ctx.fill();

    /* kanatlar */
    ctx.fillStyle = 'rgba(255,120,60,0.95)';
    ctx.beginPath();
    ctx.moveTo(-5, 5);
    ctx.lineTo(-10, 11);
    ctx.lineTo(-4, 9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, 5);
    ctx.lineTo(10, 11);
    ctx.lineTo(4, 9);
    ctx.closePath();
    ctx.fill();

    /* pencere */
    ctx.save();
    glowOff();
    ctx.fillStyle = '#0a0d16';
    ctx.beginPath();
    ctx.arc(0, -1.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* alev */
    var fl = 0.6 + 0.4 * Math.sin(G.time * 18);
    ctx.save();
    glowOff();
    ctx.fillStyle = 'rgba(255,230,140,' + (0.65 + 0.3 * fl) + ')';
    ctx.beginPath();
    ctx.moveTo(-3.5, 8);
    ctx.lineTo(0, 8 + 9 * fl);
    ctx.lineTo(3.5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTraps() {
    for (var i = 0; i < G.traps.length; i++) {
      var tr = G.traps[i];
      var sy = tr.y - G.camY;
      if (sy < -60 || sy > H + 60) continue;
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(tr.angle);

      // neon testere dişleri
      glowOn('#ff2d6e', 12);
      ctx.fillStyle = '#ff5c8a';
      for (var k = 0; k < 10; k++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 10) * k);
        ctx.beginPath();
        ctx.moveTo(tr.r - 3, -4.5);
        ctx.lineTo(tr.r + 5, 0);
        ctx.lineTo(tr.r - 3, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      glowOff();

      var sg = ctx.createRadialGradient(-3, -3, 2, 0, 0, tr.r);
      sg.addColorStop(0, '#2b3244');
      sg.addColorStop(1, '#0a0d16');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, tr.r - 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,90,140,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, tr.r - 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#7df9ff';
      glowOn('#00e5ff', 10);
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // tehlike halesi (nabız)
      var pulse = 0.12 + 0.10 * Math.sin(G.time * 5 + tr.phase);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ff2d6e';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r + 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.particles.length; i++) {
      var pt = G.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFloaters() {
    for (var i = 0; i < G.floaters.length; i++) {
      var f = G.floaters[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.font = '800 16px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      glowOn(f.color, 14);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /* ---------------- kuş ---------------- */

  function drawBird(x, y, t, tiltOverride) {
    var p = G.bird;
    var tilt = (tiltOverride !== undefined) ? tiltOverride : p.tilt;
    var squash = p.squash || 0;
    var rotorSpeed = G.mode === 'play' ? 22 : 9;
    var rotor = Math.cos(t * rotorSpeed);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(p.face * (1 + squash * 0.45), 1 - squash * 0.55);

    /* arka itici parıltısı */
    var glow = ctx.createRadialGradient(-14, 10, 0, -14, 10, 30);
    glow.addColorStop(0, 'rgba(255,45,149,0.55)');
    glow.addColorStop(1, 'rgba(255,45,149,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-50, -22, 70, 64);

    /* rotor */
    var rw = 13 + Math.abs(rotor) * 16;
    ctx.save();
    glowOn('#00e5ff', 16);
    ctx.strokeStyle = 'rgba(170,248,255,0.92)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-rw, -25);
    ctx.lineTo(rw, -25);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath();
    ctx.arc(0, -25, 2.6, 0, Math.PI * 2);
    ctx.fill();

    /* direk */
    ctx.strokeStyle = '#2b3a52';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -24);
    ctx.stroke();

    /* kuyruk */
    ctx.beginPath();
    ctx.moveTo(-13, -3);
    ctx.lineTo(-31, -8);
    ctx.lineTo(-30, -2);
    ctx.lineTo(-13, 5);
    ctx.closePath();
    ctx.fillStyle = '#1a2438';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,229,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* kuyruk ışığı */
    ctx.save();
    glowOn('#ff2d95', 10);
    ctx.fillStyle = '#ff2d95';
    ctx.beginPath();
    ctx.arc(-30, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* gövde */
    var bg = ctx.createLinearGradient(0, -13, 0, 14);
    bg.addColorStop(0, '#334665');
    bg.addColorStop(0.5, '#16202f');
    bg.addColorStop(1, '#080d16');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,229,255,0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    /* neon şerit */
    ctx.save();
    glowOn('#00e5ff', 10);
    ctx.strokeStyle = 'rgba(0,229,255,0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12, 6.5);
    ctx.lineTo(11, 7);
    ctx.stroke();
    ctx.restore();

    /* kokpit */
    var cg = ctx.createLinearGradient(2, -10, 14, 6);
    cg.addColorStop(0, 'rgba(220,255,255,0.95)');
    cg.addColorStop(1, 'rgba(0,190,255,0.45)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(7, -2, 9.5, 7.4, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,252,255,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* cam parlaması */
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(4.5, -5.2, 3.4, 2, -0.4, 0, Math.PI * 2);
    ctx.fill();

    /* yan itici */
    ctx.save();
    glowOn('#ff2d95', 14);
    ctx.fillStyle = 'rgba(255,45,149,0.85)';
    ctx.beginPath();
    ctx.ellipse(-14, 8, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* iniş takımları */
    ctx.strokeStyle = '#3a4c6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, 12);
    ctx.lineTo(-8, 17);
    ctx.moveTo(8, 12);
    ctx.lineTo(8, 17);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-15, 17.5);
    ctx.lineTo(15, 17.5);
    ctx.stroke();

    /* yanıp sönen lamba */
    var blink = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    glowOn('#ff2d95', 12);
    ctx.fillStyle = 'rgba(255,45,149,' + (0.35 + blink * 0.65) + ')';
    ctx.beginPath();
    ctx.arc(15, 4, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* kalkan halkası */
    if (G.shield) {
      ctx.save();
      ctx.rotate(-t * 1.1);
      ctx.strokeStyle = 'rgba(120,245,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      glowOn('#00e5ff', 16);
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------------- ana döngü ----------------

     Sabit adımlı simülasyon: oyun hızı kare hızına bağlı değildir.
     Yavaş cihazda kare atlanır ama oyun aynı hızda ilerler. */

  var STEP = 1 / 60;
  var acc = 0;
  var last = 0;
  var perfAcc = 0, perfN = 0, perfCool = 1.2;

  /* kare süresini ölç, sürekli yavaşsa kaliteyi düşür */
  function perfSample(ms) {
    /* arka plana atılmış / kısıtlanmış sekmede ölçüm yapma */
    if (document.hidden || ms > 100) { perfAcc = 0; perfN = 0; return; }
    if (perfCool > 0) { perfCool -= ms / 1000; return; }
    perfAcc += ms;
    perfN++;
    if (perfN < 40) return;
    var avg = perfAcc / perfN;
    perfAcc = 0;
    perfN = 0;
    if (avg > 22 && qLevel < QUALITY_LEVELS.length - 1) {
      setQuality(qLevel + 1);
      perfCool = 1.1;
    } else {
      perfCool = 0.3;
    }
  }

  function frame(ts) {
    if (!last) last = ts;
    var real = (ts - last) / 1000;
    last = ts;
    if (real > 0.25) real = 0.25;      /* sekme arkada kalınca sıçrama olmasın */

    perfSample(real * 1000);

    acc += real;
    var steps = 0;
    while (acc >= STEP && steps < 6) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > STEP * 4) acc = 0;       /* aşırı birikimi at */

    draw();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { acc = 0; last = 0; }
  });

  /* ---------------- giriş ---------------- */

  function toWorldX(clientX) {
    var rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * W;
  }

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'left') {
      G.keys.left = true;
      e.preventDefault();
    } else if (k === 'arrowright' || k === 'd' || k === 'right') {
      G.keys.right = true;
      e.preventDefault();
    } else if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (G.mode === 'menu' || G.mode === 'over') startGame();
      else if (G.mode === 'paused') setMode('play');
    } else if (k === 'p' || k === 'escape') {
      e.preventDefault();
      if (G.mode === 'play') setMode('paused');
      else if (G.mode === 'paused') setMode('play');
    } else if (k === 'm') {
      toggleSound();
    }
  });

  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'left') G.keys.left = false;
    if (k === 'arrowright' || k === 'd' || k === 'right') G.keys.right = false;
  });

  /* ---- dokunmatik / fare ---- */

  function halfOf(clientX) {
    return toWorldX(clientX) < W / 2 ? -1 : 1;
  }

  function startTouch(e) {
    G.touch.active = true;
    G.touch.id = e.pointerId;
    G.touch.side = halfOf(e.clientX);
    G.pointer.active = false;
    G.pointer.x = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
    hideTouchHint();
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (G.mode !== 'play') return;
    if (inputMode === 'touch') {
      e.preventDefault();
      startTouch(e);
    } else {
      G.pointer.active = true;
      G.pointer.x = toWorldX(e.clientX);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (inputMode === 'touch') {
      if (!G.touch.active || e.pointerId !== G.touch.id) return;
      /* parmak basılıyken diğer yarıya kaydırırsan yön değişir */
      G.touch.side = halfOf(e.clientX);
      e.preventDefault();
      return;
    }
    if (!G.pointer.active) return;
    G.pointer.x = toWorldX(e.clientX);
  });

  function endPointer(e) {
    if (e && e.pointerId !== undefined && G.touch.active && e.pointerId !== G.touch.id) return;
    G.touch.active = false;
    G.touch.id = null;
    G.touch.side = 0;
    G.pointer.active = false;
    G.pointer.x = null;
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', function () { endPointer(); });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------------- butonlar ---------------- */

  document.querySelectorAll('.mode-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      applyInputMode(b.getAttribute('data-mode'));
      sfx('start');
    });
  });

  $('btn-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-menu').addEventListener('click', goMenu);
  $('btn-resume').addEventListener('click', function () { setMode('play'); });
  $('btn-pause-menu').addEventListener('click', goMenu);
  $('btn-pause').addEventListener('click', function () {
    if (G.mode === 'play') setMode('paused');
    else if (G.mode === 'paused') setMode('play');
  });

  function toggleSound() {
    soundOn = !soundOn;
    try { store('wb_sound', soundOn ? '1' : '0'); } catch (e) { }
    $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) sfx('jump');
  }
  $('btn-sound').addEventListener('click', toggleSound);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'play') setMode('paused');
  });

  /* ---------------- ölçek ---------------- */

  function viewportSize() {
    var vv = window.visualViewport;
    return {
      w: (vv && vv.width) || window.innerWidth,
      h: (vv && vv.height) || window.innerHeight
    };
  }

  function layout() {
    var v = viewportSize();
    var s = Math.min(v.w / W, v.h / H);
    document.getElementById('frame').style.setProperty('--s', s);

    /* tarayıcı yakınlaştırması / ekran değişimi */
    var dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - BASE_DPR) > 0.01) {
      BASE_DPR = dpr;
      applyCanvasSize();
      bgKey = '';
    }
  }

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 150); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', layout);
    window.visualViewport.addEventListener('scroll', layout);
  }
  layout();

  /* ---------------- başlat ---------------- */

  window.__whirlybird = {
    G: G,
    startGame: startGame,
    goMenu: goMenu,
    setMode: setMode,
    update: update,
    draw: draw,
    reset: reset,
    spawnPlatform: spawnPlatform,
    setInputMode: applyInputMode,
    getInputMode: function () { return inputMode; },
    setQuality: setQuality,
    getQuality: function () { return qLevel; },
    getDPR: function () { return DPR; },
    isTouch: isTouch
  };

  $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  applyInputMode(inputMode, false);
  goMenu();

  // menü arka planı için dünya hazır
  G.camY = START_CAM;
  requestAnimationFrame(frame);
})();
