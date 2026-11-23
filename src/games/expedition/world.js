/**
 * 《余烬远征》世界渲染：多层视差、日夜循环、天气、动态光照、地域主题。
 * 全部程序化生成，静态层缓存为可无缝平铺的离屏长条。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, P = ER.platform;
  var VIEW_W = 540, VIEW_H = 640, GROUND = 520;
  var STRIP = 1080; // 平铺长条宽度
  var DAY_LEN = 150; // 一次日夜循环秒数

  // 天空关键帧：[顶部, 地平线]，依次为 黎明 / 白天 / 黄昏 / 夜晚
  var BIOMES = [
    {
      key: 'forest', name: '晨雾林地', boss: '腐根巨兽', bossType: 'brute', bossTint: '#5a9a3a',
      sky: [['#2a3a6a', '#f4b088'], ['#3a86d0', '#cfeaff'], ['#3a2a5a', '#f08a5a'], ['#060a1c', '#1c2a4a']],
      far: '#5a7aa0', mid: '#2e5a48', near: '#1c3a26', ground: '#3e6a2e', groundDark: '#22381a', fog: '#d8f0e0',
      weather: 'leaves', night: 'fireflies', celestial: true, dark: 0.0, props: ['tree', 'tree', 'bush', 'lantern', 'rock', 'tree'],
      mobs: ['slime', 'slime', 'imp', 'wisp'], tint: null, accent: '#7dff9a',
    },
    {
      key: 'lava', name: '熔烬矿脉', boss: '熔心烬王', bossType: 'king', bossTint: null,
      sky: [['#1a0606', '#5a1a0a'], ['#240808', '#7a2a0a'], ['#1a0606', '#5a1a0a'], ['#0c0303', '#3a0e04']],
      far: '#3a1410', mid: '#2a0c08', near: '#1a0604', ground: '#3a1c14', groundDark: '#1a0a06', fog: '#ff6a2a',
      weather: 'embers', celestial: false, dark: 0.55, lava: true, props: ['crystal', 'torch', 'rock', 'pillar', 'torch'],
      mobs: ['imp', 'wisp', 'ghoul', 'imp'], tint: null, accent: '#ff8a3a',
    },
    {
      key: 'frost', name: '霜歌冻原', boss: '霜鬃督军', bossType: 'brute', bossTint: '#7ac8ff',
      sky: [['#2a3a7a', '#e0b0d0'], ['#5a90d0', '#e8f4ff'], ['#2a2a6a', '#d090c0'], ['#02061a', '#0e1c3a']],
      far: '#a8c0e0', mid: '#6a88b8', near: '#3a4a7a', ground: '#e8f0ff', groundDark: '#a0b4d8', fog: '#ffffff',
      weather: 'snow', aurora: true, celestial: true, dark: 0.1, props: ['pine', 'pine', 'icespike', 'rock', 'lantern'],
      mobs: ['bat', 'ghoul', 'slime', 'wisp'], tint: '#8ad0ff', accent: '#bfe8ff',
    },
    {
      key: 'storm', name: '雷鸣海崖', boss: '怒潮蛮王', bossType: 'brute', bossTint: '#3a6a8a',
      sky: [['#1a2230', '#4a5a6a'], ['#2a3442', '#6a7a8a'], ['#1a1a2a', '#4a4a5a'], ['#06080e', '#141a24']],
      far: '#3a4a5a', mid: '#2a3644', near: '#18202a', ground: '#4a4a44', groundDark: '#24241e', fog: '#8a9aaa',
      weather: 'rain', lightning: true, sea: true, celestial: false, dark: 0.35, props: ['rock', 'ruin', 'torch', 'rock'],
      mobs: ['bat', 'ghoul', 'imp', 'slime'], tint: null, accent: '#9af0ff',
    },
    {
      key: 'astral', name: '星陨神殿', boss: '星噬之王', bossType: 'king', bossTint: '#6a3ad0',
      sky: [['#0a0420', '#3a1a5a'], ['#140a3a', '#5a2a8a'], ['#0a0420', '#3a1a5a'], ['#04020e', '#1a0a3a']],
      far: '#2a1a5a', mid: '#1e1244', near: '#120a2a', ground: '#3a2a5a', groundDark: '#1a1030', fog: '#b08aff',
      weather: 'stardust', stars: true, celestial: false, dark: 0.45, props: ['pillar', 'crystal', 'ruin', 'crystal'],
      mobs: ['wisp', 'bat', 'slime', 'ghoul'], tint: '#b08aff', accent: '#d49bff',
    },
  ];

  // ------------------------------------------------------------------ 平铺长条生成
  function periodicHeight(seed, amps) {
    var ph = [];
    for (var i = 0; i < amps.length; i++) ph.push(U.hash2(seed, i) * Math.PI * 2);
    return function (x) {
      var y = 0;
      for (var k = 0; k < amps.length; k++) y += amps[k][1] * Math.sin((Math.PI * 2 * amps[k][0] * x) / STRIP + ph[k]);
      return y;
    };
  }

  function makeRidge(color, fogColor, baseY, amps, seed, fogA, peaks) {
    var c = P.createOffscreenCanvas(STRIP, VIEW_H);
    var g = c.getContext('2d');
    var f = periodicHeight(seed, amps);
    g.beginPath();
    g.moveTo(0, VIEW_H);
    for (var x = 0; x <= STRIP; x += 4) {
      var y = baseY + f(x);
      if (peaks) y -= Math.pow(Math.max(0, Math.sin((x / STRIP) * Math.PI * 2 * peaks + seed)), 6) * 60;
      g.lineTo(x, y);
    }
    g.lineTo(STRIP, VIEW_H);
    g.closePath();
    var grd = g.createLinearGradient(0, baseY - 120, 0, VIEW_H);
    grd.addColorStop(0, U.mix(color, fogColor, fogA * 0.6));
    grd.addColorStop(0.5, color);
    grd.addColorStop(1, U.mix(color, '#000000', 0.3));
    g.fillStyle = grd;
    g.fill();
    // 山脊高光
    g.strokeStyle = U.rgba(U.mix(color, '#ffffff', 0.35), 0.5);
    g.lineWidth = 2;
    g.stroke();
    return c;
  }

  function makeTreeLine(B, seed) {
    var c = P.createOffscreenCanvas(STRIP, VIEW_H);
    var g = c.getContext('2d');
    var col = B.mid;
    g.fillStyle = col;
    var f = periodicHeight(seed, [[1, 18], [3, 10]]);
    g.beginPath(); g.moveTo(0, VIEW_H);
    for (var x = 0; x <= STRIP; x += 6) g.lineTo(x, GROUND - 70 + f(x));
    g.lineTo(STRIP, VIEW_H); g.closePath(); g.fill();
    for (var i = 0; i < 70; i++) {
      var tx = (i / 70) * STRIP + U.hash2(i, seed) * 10;
      var h = 60 + U.hash2(seed, i) * 80;
      var by = GROUND - 66 + f(tx);
      if (B.key === 'forest' || B.key === 'storm') {
        g.beginPath(); g.arc(tx, by - h * 0.7, h * 0.35, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(tx - h * 0.2, by - h * 0.45, h * 0.3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(tx + h * 0.22, by - h * 0.5, h * 0.28, 0, Math.PI * 2); g.fill();
      } else if (B.key === 'frost') {
        for (var k = 0; k < 4; k++) {
          var w = h * (0.42 - k * 0.08);
          g.beginPath(); g.moveTo(tx - w, by - k * h * 0.22); g.lineTo(tx, by - h - k * 6); g.lineTo(tx + w, by - k * h * 0.22); g.closePath(); g.fill();
        }
      } else if (B.key === 'astral') {
        g.fillRect(tx - 7, by - h * 1.2, 14, h * 1.2);
        g.fillRect(tx - 12, by - h * 1.2 - 8, 24, 8);
      } else {
        g.beginPath(); g.moveTo(tx - 16, by); g.lineTo(tx - 4, by - h); g.lineTo(tx + 6, by - h * 0.6); g.lineTo(tx + 14, by); g.closePath(); g.fill();
      }
    }
    // 雾气渐层
    var fg = g.createLinearGradient(0, GROUND - 160, 0, GROUND);
    fg.addColorStop(0, U.rgba(B.fog, 0));
    fg.addColorStop(1, U.rgba(B.fog, 0.18));
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = fg;
    g.fillRect(0, 0, STRIP, VIEW_H);
    return c;
  }

  function makeGround(B) {
    var h = VIEW_H - GROUND + 10;
    var c = P.createOffscreenCanvas(STRIP, h);
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, B.ground);
    grd.addColorStop(1, B.groundDark);
    g.fillStyle = grd;
    g.fillRect(0, 0, STRIP, h);
    // 石块纹理
    for (var i = 0; i < 160; i++) {
      var x = U.hash2(i, 7) * STRIP, y = 18 + U.hash2(7, i) * (h - 20);
      var w = 10 + U.hash2(i, 9) * 34;
      g.fillStyle = U.rgba(U.mix(B.groundDark, '#000000', 0.2), 0.35);
      g.beginPath(); g.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = U.rgba(U.mix(B.ground, '#ffffff', 0.25), 0.25);
      g.beginPath(); g.ellipse(x - 2, y - 2, w * 0.6, w * 0.15, 0, 0, Math.PI * 2); g.fill();
    }
    // 地表边缘
    g.fillStyle = U.mix(B.ground, '#ffffff', B.key === 'frost' ? 0.6 : 0.2);
    for (var x2 = 0; x2 < STRIP; x2 += 3) {
      var bh = 4 + Math.abs(Math.sin(x2 * 0.13) * 4) + (B.key === 'forest' ? Math.abs(Math.sin(x2 * 0.7)) * 5 : 0);
      g.fillRect(x2, 0, 3, bh);
    }
    if (B.lava) {
      // 熔岩裂缝
      g.globalCompositeOperation = 'lighter';
      for (var j = 0; j < 22; j++) {
        var lx = U.hash2(j, 3) * STRIP, ly = 30 + U.hash2(3, j) * (h - 40);
        g.strokeStyle = 'rgba(255,110,30,0.75)';
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(lx, ly);
        for (var q = 0; q < 5; q++) g.lineTo(lx + q * 14 + U.hash2(q, j) * 8, ly + (U.hash2(j, q) - 0.5) * 14);
        g.stroke();
      }
    }
    return c;
  }

  function makeForeground(B) {
    var c = P.createOffscreenCanvas(STRIP, 120);
    var g = c.getContext('2d');
    g.fillStyle = U.mix(B.near, '#000000', 0.55);
    for (var i = 0; i < 40; i++) {
      var x = (i / 40) * STRIP + U.hash2(i, 77) * 20;
      var hh = 30 + U.hash2(77, i) * 60;
      if (B.key === 'forest' || B.key === 'storm') {
        for (var b = -3; b <= 3; b++) {
          g.beginPath(); g.moveTo(x + b * 4, 120); g.quadraticCurveTo(x + b * 9, 120 - hh * 0.6, x + b * 14, 120 - hh * (1 - Math.abs(b) * 0.12)); g.lineTo(x + b * 4 + 3, 120); g.fill();
        }
      } else {
        g.beginPath(); g.ellipse(x, 120, 30 + hh * 0.4, hh * 0.5, 0, Math.PI, 0); g.fill();
      }
    }
    return c;
  }

  function makeCloud(seed) {
    var c = P.createOffscreenCanvas(260, 110);
    var g = c.getContext('2d');
    for (var i = 0; i < 9; i++) {
      var x = 50 + U.hash2(i, seed) * 160, y = 55 + (U.hash2(seed, i) - 0.5) * 30;
      var r = 22 + U.hash2(i + 3, seed) * 26;
      var grd = g.createRadialGradient(x, y - r * 0.3, 2, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  // ------------------------------------------------------------------ 世界
  function World(biomeIndex) {
    this.lights = [];
    this.light = P.createOffscreenCanvas(VIEW_W / 2, VIEW_H / 2);
    this.lctx = this.light.getContext('2d');
    this.particles = [];
    this.flash = 0;
    this.bolt = null;
    this.boltT = U.rand(4, 8);
    this.time = DAY_LEN * 0.18;
    this.stars = [];
    for (var i = 0; i < 140; i++) this.stars.push({ x: Math.random() * VIEW_W, y: Math.random() * 380, s: U.rand(0.5, 2), p: Math.random() * 6 });
    this.clouds = [];
    this.cloudImgs = [makeCloud(1), makeCloud(2), makeCloud(3)];
    for (var j = 0; j < 6; j++) this.clouds.push({ x: Math.random() * 900, y: U.rand(40, 230), s: U.rand(0.6, 1.4), img: j % 3, v: U.rand(4, 12) });
    this.setBiome(biomeIndex);
  }

  World.BIOMES = BIOMES;
  World.GROUND = GROUND;
  World.VIEW_H = VIEW_H;

  World.prototype.setBiome = function (i) {
    this.bi = ((i % BIOMES.length) + BIOMES.length) % BIOMES.length;
    var B = this.B = BIOMES[this.bi];
    this.layers = [
      { img: makeRidge(B.far, B.fog, GROUND - 210, [[1, 40], [2, 30], [5, 12], [9, 5]], 11, 0.7, 3), k: 0.08 },
      { img: makeRidge(U.mix(B.far, B.mid, 0.5), B.fog, GROUND - 150, [[1, 26], [3, 22], [7, 9]], 23, 0.45, 0), k: 0.18 },
      { img: makeTreeLine(B, 31), k: 0.38 },
    ];
    this.groundImg = makeGround(B);
    this.fgImg = makeForeground(B);
    this.particles.length = 0;
  };

  /** 当前时间段：返回 {phase 0~1, night 0~1, sky:[top,bottom]} */
  World.prototype.dayInfo = function () {
    var p = (this.time / DAY_LEN) % 1;
    var seg = p * 4, i = Math.floor(seg), f = seg - i;
    var A = this.B.sky[i % 4], Bk = this.B.sky[(i + 1) % 4];
    var e = f * f * (3 - 2 * f);
    var top = U.mix(A[0], Bk[0], e), bot = U.mix(A[1], Bk[1], e);
    // 夜晚程度：0.75 附近最暗
    var night = Math.max(0, Math.cos((p - 0.8) * Math.PI * 2)) * 1.0;
    night = U.clamp(night * 1.2 - 0.1, 0, 1);
    return { phase: p, night: night, top: top, bot: bot };
  };

  World.prototype.addLight = function (x, y, r, color, intensity) {
    if (this.lights.length < 60) this.lights.push({ x: x, y: y, r: r, c: color || '#ffb347', i: intensity == null ? 1 : intensity });
  };

  World.prototype.update = function (dt, camX, speed) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    var B = this.B, info = this.dayInfo();
    var i, p;
    for (i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      c.x -= c.v * dt;
      if (c.x < -300) { c.x = 600 + Math.random() * 200; c.y = U.rand(40, 230); }
    }
    // 天气粒子（屏幕空间）
    var rate = { leaves: 3, embers: 18, snow: 30, rain: 90, stardust: 10 }[B.weather] || 0;
    var n = rate * dt;
    while (n > 0) {
      if (Math.random() < n) this.spawnWeather(B.weather);
      n -= 1;
    }
    if (B.night && info.night > 0.4 && Math.random() < dt * 6) {
      this.particles.push({ t: 'firefly', x: Math.random() * VIEW_W, y: U.rand(300, 560), vx: U.rand(-10, 10), vy: U.rand(-8, 8), life: U.rand(3, 6), max: 6, p: Math.random() * 6 });
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.life -= dt;
      var par = p.depth || 1;
      p.x += (p.vx - speed * 0.9 * par) * dt;
      p.y += p.vy * dt;
      if (p.t === 'leaf') { p.rot += p.vr * dt; p.vx += Math.sin(this.time * 2 + p.p) * 20 * dt; }
      if (p.t === 'snow') p.x += Math.sin(this.time * 1.5 + p.p) * 12 * dt;
      if (p.t === 'firefly') { p.vx += U.rand(-30, 30) * dt; p.vy += U.rand(-30, 30) * dt; }
      if (p.t === 'rain' && p.y > GROUND + 20 * par) {
        p.life = 0;
        if (Math.random() < 0.3) this.particles.push({ t: 'splash', x: p.x, y: GROUND + 10 * par, vx: 0, vy: 0, life: 0.25, max: 0.25 });
      }
      if (p.life <= 0 || p.y > VIEW_H + 20 || p.x < -40) this.particles.splice(i, 1);
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    // 闪电
    if (B.lightning) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = U.rand(5, 11);
        this.strike(U.rand(60, 480));
      }
      if (this.bolt) { this.bolt.t -= dt; if (this.bolt.t <= 0) this.bolt = null; }
    }
    void camX;
  };

  World.prototype.strike = function (x) {
    var pts = [[x + U.rand(-60, 60), -10]];
    var y = -10, cx = pts[0][0];
    while (y < GROUND - 140) {
      y += U.rand(20, 45);
      cx += U.rand(-30, 30);
      pts.push([cx, y]);
    }
    var branches = [];
    for (var b = 0; b < 3; b++) {
      var s = pts[U.randi(2, pts.length - 2)];
      var br = [s], bx = s[0], by = s[1];
      for (var k = 0; k < 4; k++) { bx += U.rand(-40, 40); by += U.rand(15, 35); br.push([bx, by]); }
      branches.push(br);
    }
    this.bolt = { pts: pts, br: branches, t: 0.35 };
    this.flash = 1;
    ER.audio.play('bigBoom', 0.5);
  };

  World.prototype.spawnWeather = function (kind) {
    var depth = U.rand(0.4, 1.3);
    if (kind === 'leaves') {
      this.particles.push({ t: 'leaf', x: U.rand(0, VIEW_W + 100), y: -10, vx: U.rand(-30, -10), vy: U.rand(30, 60), life: 14, max: 14, rot: Math.random() * 6, vr: U.rand(-3, 3), p: Math.random() * 6, depth: depth, c: U.pick(['#e8a03a', '#c8602a', '#8ac04a', '#f0c060']) });
    } else if (kind === 'embers') {
      this.particles.push({ t: 'ember', x: U.rand(0, VIEW_W + 100), y: VIEW_H + 10, vx: U.rand(-15, 15), vy: U.rand(-80, -30), life: U.rand(4, 8), max: 8, p: Math.random() * 6, depth: depth });
    } else if (kind === 'snow') {
      this.particles.push({ t: 'snow', x: U.rand(0, VIEW_W + 120), y: -10, vx: U.rand(-25, -5), vy: U.rand(30, 70) * depth, life: 18, max: 18, p: Math.random() * 6, depth: depth, s: depth * 2.2 });
    } else if (kind === 'rain') {
      this.particles.push({ t: 'rain', x: U.rand(0, VIEW_W + 200), y: U.rand(-40, 0), vx: -140, vy: 900 * depth, life: 2, max: 2, depth: depth });
    } else if (kind === 'stardust') {
      this.particles.push({ t: 'dust', x: U.rand(0, VIEW_W + 100), y: U.rand(0, GROUND), vx: U.rand(-10, 10), vy: U.rand(-15, -5), life: U.rand(3, 6), max: 6, p: Math.random() * 6, depth: depth, c: U.pick(['#d49bff', '#9ad8ff', '#fff2a0']) });
    }
  };

  // ---------------- 背景（角色之前绘制） ----------------
  World.prototype.renderBack = function (ctx, camX, t) {
    var B = this.B, info = this.dayInfo();
    var sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, info.top);
    sky.addColorStop(1, info.bot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    var i;
    // 星空
    var starA = B.stars ? 1 : info.night;
    if (starA > 0.02) {
      for (i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        var tw = 0.5 + Math.sin(t * 2 + s.p) * 0.5;
        ctx.fillStyle = 'rgba(255,255,255,' + (starA * tw * 0.9) + ')';
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
    if (B.stars) this.renderNebula(ctx, t);
    if (B.aurora) this.renderAurora(ctx, t, Math.max(0.35, info.night));
    // 日月
    if (B.celestial) {
      var ang = info.phase * Math.PI * 2 - Math.PI * 0.6;
      var sx = 270 + Math.cos(ang) * 260, sy = 420 - Math.sin(ang) * 330;
      if (sy < GROUND) {
        G.glow(ctx, sx, sy, 160, '#ffd9a0', 0.5);
        G.rays(ctx, sx, sy, 420, '#fff0c8', t * 0.05, 14, 0.12);
        ctx.fillStyle = '#fff6dc';
        ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill();
      }
      var mx = 270 + Math.cos(ang + Math.PI) * 260, my = 420 - Math.sin(ang + Math.PI) * 330;
      if (my < GROUND) {
        G.glow(ctx, mx, my, 90, '#bcd4ff', 0.4);
        ctx.fillStyle = '#e8eeff';
        ctx.beginPath(); ctx.arc(mx, my, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(150,160,200,0.5)';
        ctx.beginPath(); ctx.arc(mx - 6, my - 4, 5, 0, Math.PI * 2); ctx.arc(mx + 7, my + 6, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (B.lava) {
      var lg = ctx.createLinearGradient(0, 0, 0, 160);
      lg.addColorStop(0, 'rgba(0,0,0,0.6)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, VIEW_W, 160);
      // 洞顶钟乳石
      ctx.fillStyle = '#120404';
      for (i = 0; i < 14; i++) {
        var kx = ((i * 97 - camX * 0.3) % 640 + 640) % 640 - 50;
        var kh = 40 + U.hash2(i, 5) * 90;
        ctx.beginPath(); ctx.moveTo(kx - 18, 0); ctx.lineTo(kx, kh); ctx.lineTo(kx + 18, 0); ctx.closePath(); ctx.fill();
      }
    }
    // 云
    if (B.celestial || B.key === 'storm') {
      for (i = 0; i < this.clouds.length; i++) {
        var c = this.clouds[i];
        ctx.save();
        ctx.globalAlpha = (B.key === 'storm' ? 0.55 : 0.75) * (1 - info.night * 0.6);
        var cx = ((c.x - camX * 0.04) % 900 + 900) % 900 - 260;
        ctx.drawImage(this.cloudImgs[c.img], cx, c.y, 260 * c.s, 110 * c.s);
        ctx.restore();
      }
    }
    // 闪电
    if (this.bolt) this.renderBolt(ctx);
    // 视差山脉
    for (i = 0; i < this.layers.length; i++) {
      var L = this.layers[i];
      var off = ((camX * L.k) % STRIP + STRIP) % STRIP;
      ctx.drawImage(L.img, -off, 0);
      ctx.drawImage(L.img, STRIP - off, 0);
      if (i === 1 && B.sea) this.renderSea(ctx, t);
      // 层间雾带
      var fy = GROUND - 140 + i * 40;
      var fg = ctx.createLinearGradient(0, fy - 50, 0, fy + 60);
      fg.addColorStop(0, U.rgba(B.fog, 0));
      fg.addColorStop(0.5, U.rgba(B.fog, 0.12 * (1 - info.night * 0.5)));
      fg.addColorStop(1, U.rgba(B.fog, 0));
      ctx.fillStyle = fg;
      ctx.fillRect(0, fy - 50, VIEW_W, 110);
    }
    // 近景道具
    this.renderProps(ctx, camX, t);
    // 地面
    var goff = ((camX) % STRIP + STRIP) % STRIP;
    ctx.drawImage(this.groundImg, -goff, GROUND - 6);
    ctx.drawImage(this.groundImg, STRIP - goff, GROUND - 6);
    if (B.lava) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var la = 0.25 + Math.sin(t * 2) * 0.08;
      var lgr = ctx.createLinearGradient(0, GROUND, 0, VIEW_H);
      lgr.addColorStop(0, 'rgba(255,90,20,0)');
      lgr.addColorStop(1, 'rgba(255,90,20,' + la + ')');
      ctx.fillStyle = lgr;
      ctx.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND);
      ctx.restore();
    }
  };

  World.prototype.renderNebula = function (ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var cols = ['#6a2aff', '#ff3a9a', '#2a8aff'];
    for (var i = 0; i < 3; i++) {
      var x = 140 + i * 140 + Math.sin(t * 0.1 + i) * 30, y = 140 + Math.cos(t * 0.13 + i * 2) * 30;
      G.glow(ctx, x, y, 170, cols[i], 0.22);
    }
    // 流星
    var k = (t * 0.35) % 1;
    if (k < 0.25) {
      var mx = 520 - k * 1600, my = 40 + k * 500;
      var gr = ctx.createLinearGradient(mx, my, mx + 120, my - 40);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 120, my - 40); ctx.stroke();
    }
    ctx.restore();
  };

  World.prototype.renderAurora = function (ctx, t, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var cols = ['#3affb0', '#3ac8ff', '#c05aff'];
    for (var b = 0; b < 3; b++) {
      ctx.strokeStyle = U.rgba(cols[b], 0.07 * a);
      for (var pass = 0; pass < 4; pass++) {
        ctx.lineWidth = 50 - pass * 11;
        ctx.beginPath();
        for (var x = -20; x <= 560; x += 20) {
          var y = 110 + b * 34 + Math.sin(x * 0.012 + t * 0.4 + b * 1.7) * 30 + Math.sin(x * 0.031 - t * 0.7) * 10 - pass * 6;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  World.prototype.renderSea = function (ctx, t) {
    var y0 = GROUND - 120;
    ctx.fillStyle = '#1a2a38';
    ctx.fillRect(0, y0, VIEW_W, 70);
    ctx.strokeStyle = 'rgba(180,220,255,0.25)';
    ctx.lineWidth = 2;
    for (var r = 0; r < 5; r++) {
      ctx.beginPath();
      for (var x = 0; x <= VIEW_W; x += 12) {
        var y = y0 + 8 + r * 13 + Math.sin(x * 0.05 + t * (1.5 + r * 0.3) + r) * 3;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };

  World.prototype.renderBolt = function (ctx) {
    var b = this.bolt;
    var a = b.t / 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var draw = function (pts, w) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.lineWidth = w * 3; ctx.strokeStyle = 'rgba(140,180,255,' + 0.35 * a + ')'; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.stroke();
    };
    draw(b.pts, 3);
    for (var i = 0; i < b.br.length; i++) draw(b.br[i], 1.5);
    ctx.restore();
  };

  /** 近景道具：按世界坐标确定性放置 */
  World.prototype.renderProps = function (ctx, camX, t) {
    var B = this.B;
    var SPACING = 170, k = 0.75;
    var start = Math.floor((camX * k - 100) / SPACING), end = Math.floor((camX * k + VIEW_W + 100) / SPACING);
    for (var i = start; i <= end; i++) {
      var h = U.hash2(i, 41 + this.bi);
      if (h < 0.25) continue;
      var type = B.props[Math.floor(U.hash2(41, i) * B.props.length)];
      var x = i * SPACING + h * 60 - camX * k;
      this.drawProp(ctx, type, x, GROUND + 4, 0.8 + U.hash2(i, 3) * 0.5, t, i);
    }
  };

  World.prototype.drawProp = function (ctx, type, x, y, s, t, seed) {
    var B = this.B;
    var dark = U.mix(B.near, '#000000', 0.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    var sway = Math.sin(t * 1.2 + seed) * 0.03;
    switch (type) {
      case 'tree':
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(-7, -90, 14, 90);
        ctx.rotate(sway);
        var cs = [[0, -130, 46], [-30, -105, 34], [30, -108, 36], [0, -160, 32]];
        for (var c = 0; c < cs.length; c++) {
          ctx.fillStyle = U.mix(B.near, '#000000', 0.1 * c);
          ctx.beginPath(); ctx.arc(cs[c][0], cs[c][1], cs[c][2], 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = U.rgba(U.mix(B.near, '#ffffff', 0.25), 0.4);
        ctx.beginPath(); ctx.arc(-12, -150, 18, 0, Math.PI * 2); ctx.fill();
        break;
      case 'pine':
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(-5, -30, 10, 30);
        ctx.rotate(sway * 0.5);
        for (var p = 0; p < 4; p++) {
          var w = 44 - p * 9, yy = -24 - p * 30;
          ctx.fillStyle = U.mix(B.near, '#000000', p * 0.05);
          ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(0, yy - 46); ctx.lineTo(w, yy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath(); ctx.moveTo(-w * 0.6, yy - 16); ctx.lineTo(0, yy - 46); ctx.lineTo(w * 0.5, yy - 18); ctx.lineTo(0, yy - 30); ctx.closePath(); ctx.fill();
        }
        break;
      case 'bush':
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(-16, -14, 18, 0, Math.PI * 2); ctx.arc(10, -18, 22, 0, Math.PI * 2); ctx.arc(30, -10, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8463a';
        ctx.beginPath(); ctx.arc(4, -28, 3, 0, Math.PI * 2); ctx.arc(-14, -20, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'rock':
        ctx.fillStyle = U.mix(B.groundDark, '#000000', 0.2);
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-24, -30); ctx.lineTo(4, -42); ctx.lineTo(30, -24); ctx.lineTo(38, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = U.rgba(U.mix(B.ground, '#ffffff', 0.3), 0.35);
        ctx.beginPath(); ctx.moveTo(-24, -30); ctx.lineTo(4, -42); ctx.lineTo(0, -26); ctx.closePath(); ctx.fill();
        break;
      case 'lantern':
      case 'torch':
        ctx.fillStyle = '#2a1a12';
        ctx.fillRect(-3, -76, 6, 76);
        if (type === 'lantern') {
          ctx.fillRect(-3, -76, 22, 4);
          ctx.fillStyle = '#ffd27a';
          G.roundRect(ctx, 10, -72, 14, 18, 3); ctx.fill();
          this.addLight(x + 17 * s, y - 63 * s, 90, '#ffc070', 0.9 + Math.sin(t * 8 + seed) * 0.08);
        } else {
          var fl = Math.sin(t * 14 + seed) * 2;
          ctx.fillStyle = '#ff8a2a';
          ctx.beginPath(); ctx.moveTo(-7, -76); ctx.quadraticCurveTo(0, -100 - fl, 7, -76); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe14a';
          ctx.beginPath(); ctx.moveTo(-3, -76); ctx.quadraticCurveTo(0, -90 - fl, 3, -76); ctx.closePath(); ctx.fill();
          this.addLight(x, y - 84 * s, 110, '#ff9a3a', 1 + Math.sin(t * 11 + seed) * 0.12);
        }
        break;
      case 'crystal':
        var cc = B.lava ? '#ff6a2a' : '#b08aff';
        ctx.globalCompositeOperation = 'source-over';
        for (var q = 0; q < 3; q++) {
          ctx.save();
          ctx.rotate((q - 1) * 0.35);
          var hh = 50 - Math.abs(q - 1) * 16;
          ctx.fillStyle = U.mix(cc, '#000000', 0.3);
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(0, -hh); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = U.rgba(U.mix(cc, '#ffffff', 0.5), 0.8);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -hh); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        this.addLight(x, y - 24 * s, 80, cc, 0.7 + Math.sin(t * 3 + seed) * 0.15);
        break;
      case 'icespike':
        ctx.fillStyle = 'rgba(190,230,255,0.85)';
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-4, -70); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(14, -44); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.moveTo(-4, -70); ctx.lineTo(-1, 0); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
        break;
      case 'pillar':
        ctx.fillStyle = U.mix(B.near, '#888888', 0.25);
        ctx.fillRect(-14, -120, 28, 120);
        ctx.fillRect(-20, -128, 40, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (var r = 0; r < 4; r++) ctx.fillRect(-10 + r * 6, -118, 2, 116);
        if (B.stars) {
          ctx.fillStyle = '#d49bff';
          ctx.fillRect(-4, -100, 8, 8);
          this.addLight(x, y - 96 * s, 70, '#b08aff', 0.6);
        }
        break;
      case 'ruin':
        ctx.fillStyle = U.mix(B.near, '#777777', 0.2);
        ctx.fillRect(-40, -60, 22, 60);
        ctx.fillRect(16, -34, 22, 34);
        ctx.fillRect(-40, -68, 60, 10);
        break;
    }
    ctx.restore();
  };

  // ---------------- 前景（角色之后绘制） ----------------
  World.prototype.renderFront = function (ctx, camX, t) {
    var info = this.dayInfo(), B = this.B, i, p;
    // 天气
    ctx.save();
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      var k = Math.min(1, p.life / (p.max || 1) * 3);
      if (p.t === 'leaf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(p.depth, p.depth * Math.abs(Math.cos(p.rot * 1.3)) + 0.2);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.t === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + p.depth * 0.35) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      } else if (p.t === 'rain') {
        ctx.strokeStyle = 'rgba(180,210,255,' + (0.25 + p.depth * 0.25) + ')';
        ctx.lineWidth = p.depth;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 18 * p.depth); ctx.stroke();
      } else if (p.t === 'splash') {
        ctx.strokeStyle = 'rgba(200,225,255,' + p.life * 3 + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, (0.25 - p.life) * 40, 2, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      var fade = Math.min(1, p.life / 1.2);
      if (p.t === 'ember') {
        var fl = 0.6 + Math.sin(t * 10 + p.p) * 0.4;
        G.glow(ctx, p.x, p.y, 6 * p.depth, '#ff7a2a', fl * fade);
        ctx.fillStyle = 'rgba(255,220,140,' + fl * fade + ')';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      } else if (p.t === 'firefly') {
        var fa = (0.5 + Math.sin(t * 4 + p.p) * 0.5) * fade;
        G.glow(ctx, p.x, p.y, 10, '#d8ff7a', fa);
      } else if (p.t === 'dust') {
        var da = (0.5 + Math.sin(t * 5 + p.p) * 0.5) * fade;
        G.glow(ctx, p.x, p.y, 5 * p.depth, p.c, da);
      }
    }
    ctx.restore();
    // 前景遮挡（视差速度大于地面）
    var off = ((camX * 1.35) % STRIP + STRIP) % STRIP;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.fgImg, -off, VIEW_H - 120);
    ctx.drawImage(this.fgImg, STRIP - off, VIEW_H - 120);
    ctx.restore();
    void B; void info;
  };

  /** 光照合成：环境暗度 + 光源挖洞 + 彩色辉光 */
  World.prototype.renderLighting = function (ctx, extraDark) {
    var info = this.dayInfo(), B = this.B;
    var dark = U.clamp(B.dark + (B.celestial ? info.night * 0.62 : 0) + (extraDark || 0), 0, 0.85);
    var lc = this.lctx;
    var lw = this.light.width, lh = this.light.height;
    var i, L;
    if (dark > 0.03) {
      lc.globalCompositeOperation = 'source-over';
      lc.clearRect(0, 0, lw, lh);
      lc.fillStyle = 'rgba(6,6,22,' + dark + ')';
      lc.fillRect(0, 0, lw, lh);
      lc.globalCompositeOperation = 'destination-out';
      for (i = 0; i < this.lights.length; i++) {
        L = this.lights[i];
        var r = L.r * 0.5 * (0.8 + L.i * 0.2);
        var gx = L.x * 0.5, gy = L.y * 0.5;
        var grd = lc.createRadialGradient(gx, gy, 0, gx, gy, r);
        grd.addColorStop(0, 'rgba(0,0,0,' + Math.min(1, L.i) + ')');
        grd.addColorStop(0.5, 'rgba(0,0,0,' + Math.min(1, L.i) * 0.6 + ')');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = grd;
        lc.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
    }
    // 彩色辉光（越暗越明显）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var ga = 0.12 + dark * 0.35;
    for (i = 0; i < this.lights.length; i++) {
      L = this.lights[i];
      var gr2 = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.8);
      gr2.addColorStop(0, U.rgba(L.c, ga * L.i));
      gr2.addColorStop(1, U.rgba(L.c, 0));
      ctx.fillStyle = gr2;
      ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(220,235,255,' + this.flash * 0.55 + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.lights.length = 0;
  };

  ER.ExpWorld = World;
})();
