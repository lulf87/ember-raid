/**
 * 原型 C：《灰烬独行者》—— 竖屏割草肉鸽
 * 单指虚拟摇杆走位，自动攻击；升级三选一构筑技能；坚持 3 分钟击败烬王；局外余烬永久成长。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, A = ER.audio, P = ER.platform;
  var SAVE_KEY = 'er_surv_v1';
  var RUN_GOAL = 180; // 3 分钟
  var MAX_ENEMIES = 260;

  var CLASSES = {
    warrior: { name: '铁誓战士', desc: '皮糙肉厚，近身横扫', color: '#5b8cff', hp: 170, speed: 182, start: 'cleave', glyph: 'shield', kind: 'warrior' },
    mage: { name: '焰歌法师', desc: '余烬飞弹，远程追踪', color: '#ff6b4a', hp: 100, speed: 195, start: 'missile', glyph: 'flame', kind: 'mage' },
    priest: { name: '晨辉祭司', desc: '贯穿射线，持续回复', color: '#7dffb0', hp: 125, speed: 188, start: 'beam', glyph: 'cross', regen: 1.2, kind: 'priest' },
  };
  var CLASS_ORDER = ['warrior', 'mage', 'priest'];

  var SKILLS = {
    cleave: { name: '裂地斩', color: '#dfe8ff', desc: function (l) { return '朝最近的敌人挥剑横扫，范围 ' + (100 + 10 * l) + '，伤害 ' + (20 + 9 * l); } },
    missile: { name: '余烬飞弹', color: '#ff8a3a', desc: function (l) { return '自动追踪敌人，数量 ' + (1 + Math.floor(l / 2)) + '，伤害 ' + (14 + 7 * l); } },
    whirl: { name: '旋风斩', color: '#9ab8ff', desc: function (l) { return '周期性环身横扫，范围 ' + (80 + 16 * l) + '，伤害 ' + (22 + 9 * l); } },
    beam: { name: '晨辉射线', color: '#fff2a0', desc: function (l) { return '贯穿一条直线的圣光，伤害 ' + (26 + 11 * l); } },
    orbit: { name: '烬火环', color: '#ffb347', desc: function (l) { return (1 + l) + ' 颗火球环绕自身，伤害 ' + (10 + 5 * l); } },
    chain: { name: '雷鸣链', color: '#9af0ff', desc: function (l) { return '闪电弹跳 ' + (2 + l) + ' 次，伤害 ' + (20 + 9 * l); } },
    frost: { name: '霜环', color: '#bfe8ff', desc: function (l) { return '冰霜新星冻结周围，范围 ' + (130 + 16 * l) + '，减速 50%'; } },
    might: { name: '怒焰', color: '#ff5a5a', passive: true, desc: function () { return '全部伤害 +15%'; } },
    haste: { name: '急速', color: '#ffe14a', passive: true, desc: function () { return '技能冷却 -9%'; } },
    vigor: { name: '坚韧', color: '#7dff9a', passive: true, desc: function () { return '生命上限 +20% 并回复生命'; } },
    swift: { name: '疾风', color: '#7dffef', passive: true, desc: function () { return '移动速度 +10%'; } },
    magnet: { name: '引魂', color: '#d49bff', passive: true, desc: function () { return '拾取范围 +35%'; } },
  };
  var MAX_LV = 5;

  var META = [
    { key: 'atk', name: '余烬之力', desc: '伤害 +8%', max: 10 },
    { key: 'hp', name: '坚韧之心', desc: '生命 +15', max: 10 },
    { key: 'spd', name: '疾风步', desc: '移速 +4%', max: 5 },
    { key: 'mag', name: '引魂之手', desc: '拾取范围 +15%', max: 5 },
    { key: 'xp', name: '学徒心得', desc: '经验 +8%', max: 5 },
  ];
  function metaCost(lv) { return 20 + lv * 18; }

  var ENEMY = {
    imp: { hp: 8, speed: 78, dmg: 8, r: 13, color: '#ff5a4a', xp: 1 },
    bat: { hp: 6, speed: 128, dmg: 6, r: 10, color: '#b35cff', xp: 1 },
    ghoul: { hp: 26, speed: 48, dmg: 14, r: 18, color: '#7ad04a', xp: 3 },
    elite: { hp: 360, speed: 62, dmg: 26, r: 34, color: '#ff9a2a', xp: 30, elite: true },
    boss: { hp: 3500, speed: 70, dmg: 40, r: 58, color: '#ff3a1a', xp: 0, boss: true },
  };

  function loadSave() {
    var s = P.storage.get(SAVE_KEY, null);
    if (!s) s = { embers: 0, meta: {}, cls: 'mage', best: { time: 0, kills: 0 }, wins: 0 };
    return s;
  }
  function writeSave(s) { P.storage.set(SAVE_KEY, s); }

  function drawGlyph(ctx, glyph, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (glyph === 'shield') {
      ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.45, -s * 0.35); ctx.lineTo(s * 0.38, s * 0.2);
      ctx.lineTo(0, s * 0.55); ctx.lineTo(-s * 0.38, s * 0.2); ctx.lineTo(-s * 0.45, -s * 0.35); ctx.closePath(); ctx.fill();
    } else if (glyph === 'flame') {
      ctx.moveTo(0, -s * 0.6); ctx.quadraticCurveTo(s * 0.5, 0, s * 0.3, s * 0.4); ctx.quadraticCurveTo(0, s * 0.6, -s * 0.3, s * 0.4);
      ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.6); ctx.fill();
    } else {
      ctx.fillRect(-s * 0.14, -s * 0.5, s * 0.28, s); ctx.fillRect(-s * 0.5, -s * 0.14, s, s * 0.28);
    }
    ctx.restore();
  }

  // ================================================================== 一局游戏
  function Run(save) {
    this.save = save;
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    var C = CLASSES[save.cls];
    this.C = C;
    var meta = save.meta;
    this.mods = {
      dmg: 1 + (meta.atk || 0) * 0.08,
      speed: C.speed * (1 + (meta.spd || 0) * 0.04),
      magnet: 90 * (1 + (meta.mag || 0) * 0.15),
      xp: 1 + (meta.xp || 0) * 0.08,
      cdr: 1,
      regen: C.regen || 0,
    };
    var maxHp = C.hp + (meta.hp || 0) * 15;
    this.hero = { x: 0, y: 0, hp: maxHp, maxHp: maxHp, r: 16, hurtT: 0, face: 1 };
    this.skills = {};
    this.skills[C.start] = 1;
    this.timers = {};
    this.enemies = [];
    this.gems = [];
    this.projs = [];
    this.bolts = [];
    this.chests = [];
    this.t = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = 5;
    this.spawnAcc = 0;
    this.eliteT = 45;
    this.bossSpawned = false;
    this.state = 'play';
    this.levelChoices = null;
    this.rerolls = 2;
    this.revived = false;
    this.stick = null;
    this.orbAngle = 0;
    this.pendingLevels = 0;
    this.paused = false;
    this.banner = { s: '坚持 3 分钟，击败烬王！', t: 3, c: '#ffd27a' };
    this.hitStop = 0;
    this.runEmbers = 0;
    this.hero.walk = 0;
    this.hero.atk = 0;
    this.grid = new Map();
  }

  Run.prototype.enter = function () { A.play('warn'); };

  Run.prototype.onDown = function (p) {
    if (this.state !== 'play' || this.paused) return;
    this.stick = { ox: p.x, oy: p.y, x: p.x, y: p.y };
  };
  Run.prototype.onMove = function (p) {
    if (!this.stick) return;
    this.stick.x = p.x; this.stick.y = p.y;
  };
  Run.prototype.onUp = function () { this.stick = null; };

  Run.prototype.dmgMul = function () { return this.mods.dmg * (1 + (this.skills.might || 0) * 0.15); };
  Run.prototype.cd = function (base) { return base * Math.pow(0.91, this.skills.haste || 0); };
  Run.prototype.magnetR = function () { return this.mods.magnet * (1 + (this.skills.magnet || 0) * 0.35); };
  Run.prototype.speed = function () { return this.mods.speed * (1 + (this.skills.swift || 0) * 0.1); };

  // ---------------- 空间哈希 ----------------
  var CELL = 64;
  Run.prototype.buildGrid = function () {
    var g = this.grid;
    g.clear();
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      var key = (Math.floor(e.x / CELL) + 5000) * 10000 + (Math.floor(e.y / CELL) + 5000);
      var b = g.get(key);
      if (!b) { b = []; g.set(key, b); }
      b.push(e);
    }
  };
  Run.prototype.query = function (x, y, r, out) {
    out.length = 0;
    var x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    var y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (var cx = x0; cx <= x1; cx++) {
      for (var cy = y0; cy <= y1; cy++) {
        var b = this.grid.get((cx + 5000) * 10000 + (cy + 5000));
        if (b) for (var i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  };
  var tmp = [];

  Run.prototype.nearest = function (x, y, maxR, exclude) {
    var best = null, bd = maxR * maxR;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || (exclude && exclude.indexOf(e) >= 0)) continue;
      var d = U.dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  // ---------------- 生成 ----------------
  Run.prototype.spawn = function (type) {
    if (this.enemies.length >= MAX_ENEMIES && type !== 'elite' && type !== 'boss') return;
    var D = ENEMY[type];
    var a = Math.random() * Math.PI * 2;
    var dist = type === 'boss' ? 420 : U.rand(560, 640);
    var hpMul = 1 + (this.t / 60) * 0.4;
    var e = {
      type: type, D: D, x: this.hero.x + Math.cos(a) * dist, y: this.hero.y + Math.sin(a) * dist * 1.1,
      hp: D.hp * hpMul, max: D.hp * hpMul, r: D.r, speed: D.speed * U.rand(0.9, 1.1), hurt: 0, slowT: 0, atkT: 0,
      kx: 0, ky: 0, phase: Math.random() * 6, orbHit: 0,
    };
    this.enemies.push(e);
    return e;
  };

  Run.prototype.update = function (dt) {
    if (this.paused) return;
    if (this.hitStop > 0) { this.hitStop -= dt; this.fx.update(dt * 0.2); return; }
    this.hero.atk = Math.max(0, this.hero.atk - dt * 3.5);
    this.hero.walk += dt * (this.hero.moving ? 13 : 2);
    this.fx.update(dt);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.state !== 'play') return;
    var h = this.hero;
    this.t += dt;
    // 移动
    if (this.stick) {
      var dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      var l = Math.sqrt(dx * dx + dy * dy);
      if (l > 4) {
        var mag = Math.min(1, l / 55);
        h.x += (dx / l) * this.speed() * mag * dt;
        h.y += (dy / l) * this.speed() * mag * dt;
        if (Math.abs(dx) > 2) h.face = dx > 0 ? 1 : -1;
        h.moving = true;
      } else h.moving = false;
      if (l > 70) { this.stick.ox = this.stick.x - (dx / l) * 70; this.stick.oy = this.stick.y - (dy / l) * 70; }
    } else h.moving = false;
    h.hurtT = Math.max(0, h.hurtT - dt);
    if (this.mods.regen) h.hp = Math.min(h.maxHp, h.hp + this.mods.regen * dt);

    // 刷怪
    var rate = Math.min(16, 1.3 + this.t / 18);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      var roll = Math.random();
      var type = this.t > 40 && roll < 0.22 ? 'ghoul' : this.t > 20 && roll < 0.45 ? 'bat' : 'imp';
      this.spawn(type);
    }
    this.eliteT -= dt;
    if (this.eliteT <= 0 && !this.bossSpawned) {
      this.eliteT = 45;
      this.spawn('elite');
      this.banner = { s: '精英怪出现！击杀掉落宝箱', t: 2, c: '#ffb347' };
      A.play('warn');
    }
    if (!this.bossSpawned && this.t >= RUN_GOAL) {
      this.bossSpawned = true;
      this.boss = this.spawn('boss');
      this.boss.hp = this.boss.max = 3500 * (1 + this.level * 0.06);
      this.banner = { s: '烬王·末焰 降临！', t: 3, c: '#ff5a3a' };
      this.fx.shake(14, 0.8);
      this.fx.flash('#ff3a1a', 0.4, 1.5);
      A.play('bigBoom');
    }

    this.buildGrid();
    this.updateEnemies(dt);
    this.updateSkills(dt);
    this.updateProjs(dt);
    this.updateGems(dt);

    if (h.hp <= 0) {
      h.hp = 0;
      this.state = 'dead';
      this.stick = null;
      A.play('wipe');
      this.fx.shake(10, 0.5);
    }
    if (this.pendingLevels > 0 && this.state === 'play') this.openLevelUp();
  };

  Run.prototype.updateEnemies = function (dt) {
    var h = this.hero;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (e.dead) { this.enemies.splice(i, 1); continue; }
      e.hurt = Math.max(0, e.hurt - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      e.atkT = Math.max(0, e.atkT - dt);
      e.orbHit = Math.max(0, e.orbHit - dt);
      var dx = h.x - e.x, dy = h.y - e.y;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      var sp = e.speed * (e.slowT > 0 ? 0.5 : 1);
      var vx = (dx / l) * sp, vy = (dy / l) * sp;
      if (e.type === 'bat') { var w = Math.sin(this.t * 6 + e.phase) * 70; vx += (-dy / l) * w; vy += (dx / l) * w; }
      // 分离
      var near = this.query(e.x, e.y, e.r * 2, tmp);
      for (var j = 0; j < near.length; j++) {
        var o = near[j];
        if (o === e) continue;
        var ox = e.x - o.x, oy = e.y - o.y;
        var dd = ox * ox + oy * oy;
        var rr = e.r + o.r;
        if (dd < rr * rr && dd > 0.01) {
          var dl = Math.sqrt(dd);
          var push = ((rr - dl) / rr) * 120;
          vx += (ox / dl) * push; vy += (oy / dl) * push;
        }
      }
      e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
      e.kx *= Math.exp(-8 * dt); e.ky *= Math.exp(-8 * dt);
      // 远离太多则传送回附近（保持密度）
      if (l > 900 && !e.D.boss) {
        var a = Math.random() * Math.PI * 2;
        e.x = h.x + Math.cos(a) * 600; e.y = h.y + Math.sin(a) * 600;
      }
      // 接触伤害
      if (l < e.r + h.r && e.atkT <= 0) {
        e.atkT = 0.7;
        h.hp -= e.D.dmg;
        h.hurtT = 0.2;
        this.fx.text(h.x, h.y - 30, '-' + e.D.dmg, { color: '#ff5a5a', size: 18 });
        A.play('hitSoft', 0.1);
        P.vibrate(10);
      }
    }
  };

  Run.prototype.damage = function (e, dmg, color, kb) {
    if (e.dead) return;
    dmg = Math.round(dmg * this.dmgMul() * U.rand(0.9, 1.1));
    var crit = Math.random() < 0.1;
    if (crit) dmg *= 2;
    e.hp -= dmg;
    e.hurt = 0.08;
    if (kb && !e.D.boss) { e.kx += kb.x; e.ky += kb.y; }
    if (crit || e.D.elite || e.D.boss || Math.random() < 0.35) {
      this.fx.text(e.x + U.rand(-6, 6), e.y - e.r - 6, String(dmg), { color: crit ? '#ffe14a' : '#fff', size: crit ? 22 : 15, crit: crit, life: 0.55 });
    }
    if (e.hp <= 0) this.kill(e, color);
  };

  Run.prototype.kill = function (e, color) {
    e.dead = true;
    this.kills++;
    this.fx.burst(e.x, e.y, { n: e.D.boss ? 120 : e.D.elite ? 40 : 7, colors: [e.D.color, color || '#fff'], speed: e.D.boss ? 600 : 200, life: e.D.boss ? 1.4 : 0.4, size: e.D.elite ? 6 : 3.5 });
    A.play('hit', 0.04);
    if (e.D.xp) this.gems.push({ x: e.x, y: e.y, v: e.D.xp, big: e.D.xp >= 3, kind: 'xp' });
    if (Math.random() < 0.08) this.gems.push({ x: e.x + U.rand(-10, 10), y: e.y + U.rand(-10, 10), v: 1, kind: 'ember' });
    if (Math.random() < 0.012 || e.D.elite) this.gems.push({ x: e.x + 14, y: e.y, v: 30, kind: 'heal' });
    if (e.D.elite) this.hitStop = 0.09;
    if (this.gems.length > 320) {
      var g0 = this.gems.shift();
      this.gems[this.gems.length - 1].v += g0.v;
    }
    if (e.D.elite) {
      this.chests.push({ x: e.x, y: e.y, t: 0 });
      this.fx.shake(6, 0.3);
      A.play('boom');
    }
    if (e.D.boss) {
      this.state = 'win';
      this.fx.flash('#ffffff', 0.9, 1);
      this.fx.shake(24, 1.2);
      A.play('bigBoom');
      setTimeout(function () { A.play('victory'); }, 500);
      P.vibrate(80);
    }
  };

  Run.prototype.updateSkills = function (dt) {
    var self = this, h = this.hero, sk = this.skills, T = this.timers;
    function ready(k, base) {
      T[k] = (T[k] || 0) - dt;
      if (T[k] <= 0) { T[k] = self.cd(base); return true; }
      return false;
    }
    var L;
    if ((L = sk.cleave)) {
      var CR = 100 + 10 * L;
      var ct = this.nearest(h.x, h.y, CR + 20);
      if (ct && ready('cleave', Math.max(0.32, 0.62 - L * 0.05))) {
        var ca = Math.atan2(ct.y - h.y, ct.x - h.x);
        h.face = Math.cos(ca) >= 0 ? 1 : -1;
        h.atk = 1;
        var arc = 1.15;
        this.query(h.x, h.y, CR + 30, tmp);
        var cl = tmp.slice();
        for (var ci = 0; ci < cl.length; ci++) {
          var ce = cl[ci];
          var cdx = ce.x - h.x, cdy = ce.y - h.y;
          var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cdist > CR + ce.r) continue;
          var da = Math.atan2(Math.sin(Math.atan2(cdy, cdx) - ca), Math.cos(Math.atan2(cdy, cdx) - ca));
          if (Math.abs(da) > arc && cdist > ce.r + h.r) continue;
          this.damage(ce, 20 + 9 * L, '#dfe8ff', { x: (cdx / (cdist || 1)) * 420, y: (cdy / (cdist || 1)) * 420 });
        }
        this.bolts.push({ kind: 'cleave', x: h.x, y: h.y, a: ca, r: CR, arc: arc, t: 0, dur: 0.18 });
        A.play('slash', 0.05);
      }
    }
    if ((L = sk.missile)) {
      if (ready('missile', Math.max(0.28, 0.6 - L * 0.06))) {
        var n = 1 + Math.floor(L / 2);
        var used = [];
        for (var i = 0; i < n; i++) {
          var tg = this.nearest(h.x, h.y, 520, used);
          if (!tg) break;
          used.push(tg);
          var a = Math.atan2(tg.y - h.y, tg.x - h.x) + U.rand(-0.3, 0.3);
          this.projs.push({ kind: 'missile', x: h.x, y: h.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, target: tg, dmg: 14 + 7 * L, life: 1.6, r: 8 });
        }
        if (used.length) { A.play('fire', 0.08); h.atk = 1; h.face = used[0].x >= h.x ? 1 : -1; }
      }
    }
    if ((L = sk.whirl)) {
      if (ready('whirl', Math.max(1.0, 2.1 - L * 0.2))) {
        var R = 80 + 16 * L;
        this.query(h.x, h.y, R, tmp);
        var hitList = tmp.slice();
        for (var j = 0; j < hitList.length; j++) {
          var e = hitList[j];
          var d = U.dist(e.x, e.y, h.x, h.y);
          if (d < R + e.r) {
            var nx = (e.x - h.x) / (d || 1), ny = (e.y - h.y) / (d || 1);
            this.damage(e, 22 + 9 * L, '#9ab8ff', { x: nx * 380, y: ny * 380 });
          }
        }
        this.fx.ring(h.x, h.y, 20, R, '#9ab8ff', 0.3, 14);
        this.whirlT = 0.3;
        this.whirlR = R;
        A.play('slash');
      }
    }
    if ((L = sk.beam)) {
      if (ready('beam', Math.max(0.5, 1.05 - L * 0.1))) {
        var bt = this.nearest(h.x, h.y, 500);
        if (bt) {
          var ang = Math.atan2(bt.y - h.y, bt.x - h.x);
          var cnt = L >= 4 ? 2 : 1;
          for (var b = 0; b < cnt; b++) {
            var aa = ang + (b === 1 ? Math.PI : 0);
            var cx = Math.cos(aa), cy = Math.sin(aa);
            var len = 460, wdt = 20 + L * 3;
            for (var k = 0; k < this.enemies.length; k++) {
              var en = this.enemies[k];
              var rx = en.x - h.x, ry = en.y - h.y;
              var proj = rx * cx + ry * cy;
              if (proj < 0 || proj > len) continue;
              var perp = Math.abs(rx * cy - ry * cx);
              if (perp < wdt / 2 + en.r) this.damage(en, 26 + 11 * L, '#fff2a0');
            }
            this.bolts.push({ kind: 'beam', x: h.x, y: h.y, a: aa, len: len, w: wdt, t: 0, dur: 0.25 });
          }
          A.play('heal', 0.1);
          h.atk = 1; h.face = Math.cos(ang) >= 0 ? 1 : -1;
        }
      }
    }
    if ((L = sk.orbit)) {
      this.orbAngle += dt * 3.2;
      var no = 1 + L, orR = 78;
      for (var o = 0; o < no; o++) {
        var oa = this.orbAngle + (o / no) * Math.PI * 2;
        var ox = h.x + Math.cos(oa) * orR, oy = h.y + Math.sin(oa) * orR;
        this.query(ox, oy, 30, tmp);
        for (var q = 0; q < tmp.length; q++) {
          var eo = tmp[q];
          if (eo.orbHit > 0) continue;
          if (U.dist2(eo.x, eo.y, ox, oy) < (eo.r + 12) * (eo.r + 12)) {
            eo.orbHit = 0.45;
            this.damage(eo, 10 + 5 * L, '#ffb347', { x: Math.cos(oa) * 200, y: Math.sin(oa) * 200 });
          }
        }
      }
    }
    if ((L = sk.chain)) {
      if (ready('chain', Math.max(0.8, 1.8 - L * 0.15))) {
        var first = this.nearest(h.x, h.y, 420);
        if (first) {
          var chainList = [first], px = h.x, py = h.y, pts = [[h.x, h.y]];
          var cur = first;
          for (var c = 0; c < 2 + L && cur; c++) {
            pts.push([cur.x, cur.y]);
            this.damage(cur, 20 + 9 * L, '#9af0ff');
            px = cur.x; py = cur.y;
            cur = this.nearest(px, py, 150, chainList);
            if (cur) chainList.push(cur);
          }
          this.bolts.push({ kind: 'chain', pts: pts, t: 0, dur: 0.2 });
          A.play('crit', 0.1);
        }
      }
    }
    if ((L = sk.frost)) {
      if (ready('frost', Math.max(2, 4.2 - L * 0.4))) {
        var FR = 130 + 16 * L;
        for (var f = 0; f < this.enemies.length; f++) {
          var ef = this.enemies[f];
          if (U.dist2(ef.x, ef.y, h.x, h.y) < FR * FR) { ef.slowT = 2.2; this.damage(ef, 12 + 6 * L, '#bfe8ff'); }
        }
        this.fx.ring(h.x, h.y, 10, FR, '#bfe8ff', 0.5, 10);
        this.fx.burst(h.x, h.y, { n: 30, color: '#dff4ff', speed: FR * 2.5, life: 0.4, shape: 'spark' });
        A.play('boom', 0.2);
      }
    }
    if (this.whirlT) this.whirlT = Math.max(0, this.whirlT - dt);
  };

  Run.prototype.updateProjs = function (dt) {
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var p = this.projs[i];
      p.life -= dt;
      if (p.target && !p.target.dead) {
        var a = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        var cur = Math.atan2(p.vy, p.vx);
        var diff = Math.atan2(Math.sin(a - cur), Math.cos(a - cur));
        cur += U.clamp(diff, -8 * dt, 8 * dt);
        p.vx = Math.cos(cur) * 440; p.vy = Math.sin(cur) * 440;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.random() < 0.6) this.fx.burst(p.x, p.y, { n: 1, color: '#ff6a1a', speed: 30, life: 0.25, size: 4 });
      var hit = false;
      this.query(p.x, p.y, 40, tmp);
      for (var j = 0; j < tmp.length; j++) {
        var e = tmp[j];
        if (e.dead) continue;
        if (U.dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
          this.damage(e, p.dmg, '#ff8a3a', { x: p.vx * 0.4, y: p.vy * 0.4 });
          this.fx.burst(p.x, p.y, { n: 6, color: '#ffb347', speed: 160, life: 0.3 });
          hit = true;
          break;
        }
      }
      if (hit || p.life <= 0) this.projs.splice(i, 1);
    }
    for (var b = this.bolts.length - 1; b >= 0; b--) {
      this.bolts[b].t += dt;
      if (this.bolts[b].t >= this.bolts[b].dur) this.bolts.splice(b, 1);
    }
  };

  Run.prototype.updateGems = function (dt) {
    var h = this.hero, R = this.magnetR();
    for (var i = this.gems.length - 1; i >= 0; i--) {
      var g = this.gems[i];
      var d = U.dist(g.x, g.y, h.x, h.y);
      if (g.pull || d < R) {
        g.pull = true;
        var sp = 520 * dt;
        g.x += ((h.x - g.x) / (d || 1)) * Math.min(d, sp);
        g.y += ((h.y - g.y) / (d || 1)) * Math.min(d, sp);
      }
      if (d < h.r + 6) {
        this.gems.splice(i, 1);
        if (g.kind === 'heal') {
          h.hp = Math.min(h.maxHp, h.hp + g.v);
          this.fx.text(h.x, h.y - 50, '+' + g.v + ' 生命', { color: '#7dff9a', size: 20, crit: true });
          A.play('heal');
        } else if (g.kind === 'ember') {
          this.runEmbers += g.v;
          this.fx.text(h.x, h.y - 50, '余烬 +1', { color: '#ffb347', size: 17 });
          A.play('coin', 0.05);
        } else {
          this.gainXp(g.v);
          A.play('pickup', 0.03);
        }
      }
    }
    for (var c = this.chests.length - 1; c >= 0; c--) {
      var ch = this.chests[c];
      ch.t += dt;
      if (U.dist(ch.x, ch.y, h.x, h.y) < h.r + 24) {
        this.chests.splice(c, 1);
        this.openChest();
      }
    }
  };

  Run.prototype.gainXp = function (v) {
    this.xp += v * this.mods.xp;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = Math.round(5 + this.level * 4 + Math.pow(this.level, 1.6));
      this.pendingLevels++;
    }
  };

  Run.prototype.upgradable = function () {
    var self = this, list = [];
    var active = Object.keys(SKILLS).filter(function (k) { return !SKILLS[k].passive && self.skills[k]; }).length;
    for (var k in SKILLS) {
      var lv = this.skills[k] || 0;
      if (lv >= MAX_LV) continue;
      if (!lv && !SKILLS[k].passive && active >= 4) continue; // 最多 4 个主动技能
      list.push(k);
    }
    return list;
  };

  Run.prototype.rollChoices = function () {
    var list = U.shuffle(this.upgradable());
    // 偏向已有技能，构筑更容易成型
    var self = this;
    list.sort(function (a, b) { return (self.skills[b] ? 1 : 0) * Math.random() - (self.skills[a] ? 1 : 0) * Math.random(); });
    return list.slice(0, 3);
  };

  Run.prototype.openLevelUp = function () {
    this.pendingLevels--;
    var ch = this.rollChoices();
    if (!ch.length) { this.hero.hp = this.hero.maxHp; return; }
    this.levelChoices = ch;
    this.state = 'level';
    this.levelT = 0;
    this.stick = null;
    A.play('levelup');
  };

  Run.prototype.applySkill = function (k) {
    this.skills[k] = (this.skills[k] || 0) + 1;
    if (k === 'vigor') { this.hero.maxHp = Math.round(this.hero.maxHp * 1.2); this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.3); }
  };

  Run.prototype.pickChoice = function (k) {
    if (!this.save.tutSurv) { this.save.tutSurv = true; writeSave(this.save); }
    this.applySkill(k);
    this.levelChoices = null;
    this.state = 'play';
    this.fx.ring(this.hero.x, this.hero.y, 10, 120, SKILLS[k].color, 0.5, 8);
  };

  Run.prototype.openChest = function () {
    var got = [];
    var n = U.chance(0.25) ? 3 : 1;
    for (var i = 0; i < n; i++) {
      var list = this.upgradable();
      if (!list.length) break;
      var k = U.pick(list);
      this.applySkill(k);
      got.push(SKILLS[k].name);
    }
    A.play(n === 3 ? 'loot3' : 'loot2');
    this.fx.flash('#ffd27a', 0.4, 2);
    this.banner = { s: '宝箱：' + (got.length ? got.join('、') + ' 升级！' : '生命回满'), t: 2.5, c: '#ffd27a' };
    if (!got.length) this.hero.hp = this.hero.maxHp;
  };

  Run.prototype.revive = function () {
    var self = this;
    ER.ads.show('原地复活并震退周围敌人').then(function (ok) {
      if (!ok) return;
      self.revived = true;
      var h = self.hero;
      h.hp = h.maxHp;
      self.state = 'play';
      for (var i = 0; i < self.enemies.length; i++) {
        var e = self.enemies[i];
        if (U.dist2(e.x, e.y, h.x, h.y) < 260 * 260) {
          if (e.D.boss || e.D.elite) e.hp -= e.max * 0.1; else self.kill(e, '#bfefff');
        }
      }
      self.fx.ring(h.x, h.y, 10, 300, '#bfefff', 0.8, 16);
      self.fx.flash('#bfefff', 0.6, 1.5);
      A.play('ult');
    });
  };

  Run.prototype.rewards = function () {
    var win = this.state === 'win';
    return Math.floor(this.kills / 8 + this.t / 5 + (win ? 60 : 0) + this.runEmbers);
  };

  Run.prototype.finish = function (mult) {
    var s = this.save;
    var gain = this.rewards() * mult;
    s.embers += gain;
    if (this.t > s.best.time) s.best.time = Math.floor(this.t);
    if (this.kills > s.best.kills) s.best.kills = this.kills;
    if (this.state === 'win') s.wins = (s.wins || 0) + 1;
    writeSave(s);
    var hub = new SurvHub();
    hub.toast = '获得 ' + gain + ' 余烬';
    this.app.goto(hub);
  };

  // ---------------- 绘制 ----------------
  Run.prototype.render = function (ctx) {
    var self = this, h = this.hero;
    var camX = h.x - 270, camY = h.y - 520;
    // 地面
    ctx.fillStyle = '#0f0c14';
    ctx.fillRect(0, 0, 540, 960);
    var TS = 80;
    var tx0 = Math.floor(camX / TS), ty0 = Math.floor(camY / TS);
    for (var tx = tx0; tx <= tx0 + 7; tx++) {
      for (var ty = ty0; ty <= ty0 + 13; ty++) {
        var hv = U.hash2(tx, ty);
        var sx = tx * TS - camX, sy = ty * TS - camY;
        ctx.fillStyle = hv < 0.5 ? '#16121c' : '#1a1520';
        ctx.fillRect(sx + 1, sy + 1, TS - 2, TS - 2);
        if (hv > 0.82) {
          ctx.strokeStyle = 'rgba(255,120,40,0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx + 10, sy + 20 + hv * 30); ctx.lineTo(sx + 40, sy + 40); ctx.lineTo(sx + 70, sy + 30 + hv * 20); ctx.stroke();
        }
        if (hv > 0.93) {
          G.glow(ctx, sx + 40, sy + 40, 14, '#ff6a1a', 0.35 + Math.sin(this.t * 3 + hv * 20) * 0.15);
        }
      }
    }
    ctx.save();
    ctx.translate(-camX + this.fx.sx, -camY + this.fx.sy);
    var i;
    // 宝石
    for (i = 0; i < this.gems.length; i++) {
      var g = this.gems[i];
      if (Math.abs(g.x - h.x) > 320 || Math.abs(g.y - h.y) > 560) continue;
      var gy = g.y + Math.sin(this.t * 4 + g.x) * 2;
      if (g.kind === 'heal') {
        G.glow(ctx, g.x, gy, 26, '#ff6a6a', 0.5);
        ctx.fillStyle = '#c8553a'; ctx.strokeStyle = '#1b1222'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(g.x, gy, 10, 7, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f2e6d0'; ctx.fillRect(g.x + 6, gy - 9, 4, 8);
        continue;
      }
      if (g.kind === 'ember') {
        G.glow(ctx, g.x, gy, 20, '#ffb347', 0.7);
        ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#7a3a00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, gy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        continue;
      }
      var gc = g.big ? '#5ae0ff' : '#7dff9a';
      G.glow(ctx, g.x, gy, g.big ? 22 : 16, gc, 0.55);
      ctx.fillStyle = gc; ctx.strokeStyle = '#0a2a1a'; ctx.lineWidth = 1.5;
      var gs = g.big ? 10 : 7;
      ctx.beginPath(); ctx.moveTo(g.x, gy - gs); ctx.lineTo(g.x + gs * 0.7, gy); ctx.lineTo(g.x, gy + gs); ctx.lineTo(g.x - gs * 0.7, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(g.x - 1.5, gy - gs * 0.6, 2, gs * 0.5);
    }
    // 宝箱
    for (i = 0; i < this.chests.length; i++) {
      var c = this.chests[i];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var cpg = ctx.createLinearGradient(0, c.y - 300, 0, c.y);
      cpg.addColorStop(0, 'rgba(255,210,122,0)');
      cpg.addColorStop(1, 'rgba(255,210,122,0.5)');
      ctx.fillStyle = cpg;
      ctx.fillRect(c.x - 30, c.y - 300, 60, 300);
      ctx.restore();
      G.glow(ctx, c.x, c.y, 70, '#ffd27a', 0.5 + Math.sin(this.t * 5) * 0.2);
      ER.drawChest(ctx, c.x, c.y + Math.sin(this.t * 4) * 3, 0.42, 0, '#ffd27a', 0);
      G.text(ctx, '宝箱', c.x, c.y - 48, { size: 16, weight: 'bold', align: 'center', color: '#ffd27a', stroke: '#000', strokeWidth: 4 });
    }
    // 敌人
    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (Math.abs(e.x - h.x) > 340 || Math.abs(e.y - h.y) > 580) continue;
      this.drawEnemy(ctx, e);
    }
    // 旋风斩
    if (this.whirlT > 0) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(this.t * 25);
      ctx.strokeStyle = 'rgba(170,200,255,' + this.whirlT * 2.5 + ')';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, this.whirlR * 0.8, 0, Math.PI * 1.3); ctx.stroke();
      ctx.restore();
    }
    // 英雄
    this.drawHero(ctx);
    // 环绕火球
    if (this.skills.orbit) {
      var no = 1 + this.skills.orbit;
      for (var o = 0; o < no; o++) {
        var oa = this.orbAngle + (o / no) * Math.PI * 2;
        var ox = h.x + Math.cos(oa) * 78, oy = h.y + Math.sin(oa) * 78;
        G.glow(ctx, ox, oy, 24, '#ff8a1f', 0.9);
        ctx.fillStyle = '#fff2c0';
        ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 投射物
    for (i = 0; i < this.projs.length; i++) {
      var p = this.projs[i];
      G.glow(ctx, p.x, p.y, 18, '#ff8a3a', 0.9);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i];
      var k = 1 - b.t / b.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (b.kind === 'cleave') {
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        var sweep = (1 - k);
        ctx.fillStyle = 'rgba(220,232,255,' + 0.45 * k + ')';
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, b.r, -b.arc, -b.arc + b.arc * 2 * Math.min(1, sweep * 2 + 0.2)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + k + ')';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.92, -b.arc, -b.arc + b.arc * 2 * Math.min(1, sweep * 2 + 0.2)); ctx.stroke();
      } else if (b.kind === 'beam') {
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.fillStyle = 'rgba(255,242,160,' + 0.5 * k + ')';
        ctx.fillRect(0, -b.w / 2, b.len, b.w);
        ctx.fillStyle = 'rgba(255,255,255,' + 0.9 * k + ')';
        ctx.fillRect(0, -b.w / 6, b.len, b.w / 3);
      } else {
        ctx.strokeStyle = 'rgba(160,240,255,' + k + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (var q = 0; q < b.pts.length; q++) {
          var pt = b.pts[q];
          if (q === 0) ctx.moveTo(pt[0], pt[1]);
          else {
            var pr = b.pts[q - 1];
            ctx.lineTo((pr[0] + pt[0]) / 2 + U.rand(-12, 12), (pr[1] + pt[1]) / 2 + U.rand(-12, 12));
            ctx.lineTo(pt[0], pt[1]);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    this.fx.renderParticles(ctx);
    this.fx.renderTexts(ctx);
    ctx.restore();

    if (h.hp / h.maxHp < 0.3) G.vignette(ctx, '#ff0000', 0.35 + Math.sin(this.t * 6) * 0.08);
    else G.vignette(ctx, '#000000', 0.55);

    // 摇杆
    if (this.stick) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(this.stick.ox, this.stick.oy, 60, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2; ctx.stroke();
      var sdx = this.stick.x - this.stick.ox, sdy = this.stick.y - this.stick.oy;
      var sl = Math.min(55, Math.sqrt(sdx * sdx + sdy * sdy)) / (Math.sqrt(sdx * sdx + sdy * sdy) || 1);
      ctx.fillStyle = 'rgba(255,200,140,0.6)';
      ctx.beginPath(); ctx.arc(this.stick.ox + sdx * sl, this.stick.oy + sdy * sl, 26, 0, Math.PI * 2); ctx.fill();
    }

    this.renderHud(ctx);
    this.fx.renderFlash(ctx);
    if (this.state === 'level') this.renderLevelUp(ctx);
    if (this.state === 'dead' || this.state === 'win') this.renderEnd(ctx);
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, 540, 960);
      G.text(ctx, '暂停', 270, 340, { size: 44, weight: 'bold', align: 'center', color: '#fff' });
      this.ui.button(ctx, 150, 420, 240, 70, '继续', function () { self.paused = false; }, { color: '#c8602a', id: 'resume' });
      this.ui.button(ctx, 150, 510, 240, 64, '放弃本局', function () { self.paused = false; self.state = 'dead'; self.revived = true; }, { color: '#4a4452', id: 'quit' });
    }
  };

  var MON_OF = { imp: 'imp', bat: 'bat', ghoul: 'ghoul', elite: 'brute', boss: 'king' };
  Run.prototype.drawEnemy = function (ctx, e) {
    var D = e.D;
    var type = MON_OF[e.type];
    var size = D.boss ? 170 : D.elite ? 100 : e.r * 2.9;
    if (D.elite || D.boss) G.glow(ctx, e.x, e.y - size * 0.4, size * 0.9, D.color, 0.35);
    var face = this.hero.x >= e.x ? 1 : -1;
    var lift = e.type === 'bat' ? 8 : 0;
    var tint = e.slowT > 0 ? '#9ad0ff' : null;
    ER.Sprites.blitMonster(ctx, type, e.x, e.y + e.r * 0.8 - lift, size, this.t * (e.speed / 70) + e.phase, face, tint, e.hurt > 0);
    if ((D.elite || D.boss) && e.hp < e.max) {
      G.bar(ctx, e.x - 40, e.y - size * 0.95, 80, 8, e.hp / e.max, '#d8362a', { border: false });
    }
  };

  Run.prototype.drawHero = function (ctx) {
    var h = this.hero, C = this.C;
    G.glow(ctx, h.x, h.y, 70, C.color, 0.22);
    ER.Sprites.drawHero(ctx, h.x, h.y + 16, { kind: C.kind, face: h.face, walk: h.walk, moving: h.moving, atk: h.atk, hurt: h.hurtT, s: 1.15 });
    G.bar(ctx, h.x - 24, h.y + 24, 48, 7, h.hp / h.maxHp, h.hp / h.maxHp < 0.3 ? '#ff4a4a' : '#5ae05a', { border: false });
  };

  Run.prototype.renderHud = function (ctx) {
    var self = this;
    G.bar(ctx, 0, 0, 540, 14, this.xp / this.xpNeed, '#5ac8ff', { border: false, bg: 'rgba(0,0,0,0.7)' });
    G.text(ctx, 'Lv.' + this.level, 270, 7, { size: 11, weight: 'bold', align: 'center', color: '#fff', shadow: false });
    this.ui.button(ctx, 12, 24, 52, 44, 'Ⅱ', function () { if (self.state === 'play') self.paused = true; }, { color: '#3a3346', size: 20, id: 'pause' });
    var left = RUN_GOAL - this.t;
    G.text(ctx, left > 0 ? U.fmtTime(left) : '击败烬王！', 270, 46, { size: 28, weight: 'bold', align: 'center', color: left > 0 ? '#fff' : '#ff6a4a', stroke: '#000' });
    G.text(ctx, '击杀 ' + this.kills, 524, 40, { size: 17, weight: 'bold', align: 'right', color: '#ffd27a' });
    // 技能栏
    var keys = Object.keys(this.skills);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], S = SKILLS[k];
      var x = 24 + (i % 10) * 50, y = 900 - Math.floor(i / 10) * 50;
      G.roundRect(ctx, x, y, 44, 44, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
      ctx.strokeStyle = S.color; ctx.lineWidth = 2; ctx.stroke();
      G.text(ctx, S.name[0], x + 22, y + 20, { size: 18, weight: 'bold', align: 'center', color: S.color });
      G.text(ctx, '' + this.skills[k], x + 38, y + 36, { size: 12, weight: 'bold', align: 'center', color: '#fff' });
    }
    if (this.boss && !this.boss.dead) {
      G.text(ctx, '烬王·末焰', 270, 86, { size: 16, weight: 'bold', align: 'center', color: '#ff8a5a' });
      G.bar(ctx, 70, 98, 400, 14, this.boss.hp / this.boss.max, '#d8362a');
    }
    if (this.banner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.banner.t * 2);
      G.text(ctx, this.banner.s, 270, 150, { size: 22, weight: 'bold', align: 'center', color: this.banner.c, stroke: '#000', strokeWidth: 5 });
      ctx.restore();
    }
    if (this.runEmbers) G.text(ctx, '余烬 +' + this.runEmbers, 524, 64, { size: 14, align: 'right', color: '#ffb347' });
    if (!this.bossSpawned) G.text(ctx, '目标：存活到倒计时结束', 270, 76, { size: 14, align: 'center', color: 'rgba(255,220,170,0.8)' });
    var h = this.hero;
    for (var ci = 0; ci < this.chests.length; ci++) {
      var c = this.chests[ci];
      if (Math.abs(c.x - h.x) > 250 || Math.abs(c.y - h.y) > 440) G.edgeArrow(ctx, c.x - h.x + 270, c.y - h.y + 520, '#ffd27a', '宝箱');
    }
    if (this.boss && !this.boss.dead && (Math.abs(this.boss.x - h.x) > 260 || Math.abs(this.boss.y - h.y) > 450)) {
      G.edgeArrow(ctx, this.boss.x - h.x + 270, this.boss.y - h.y + 520, '#ff5a3a', '烬王');
    }
    if (!this.save.tutSurv && this.state === 'play') {
      if (this.t < 7) {
        G.tip(ctx, '按住屏幕任意位置拖动来移动，攻击是自动的！', 270, 700, 440);
        G.hand(ctx, 270 + Math.sin(this.t * 2.5) * 60, 640, 0.1);
      } else if (this.level === 1) {
        G.tip(ctx, '怪物死后掉绿色宝石，走过去捡起来就能升级！', 270, 700, 440, { border: '#7dff9a' });
        var ng = null, nd = 1e9;
        for (var gi = 0; gi < this.gems.length; gi++) {
          var gg = this.gems[gi];
          if (gg.kind !== 'xp') continue;
          var gd = U.dist2(gg.x, gg.y, h.x, h.y);
          if (gd < nd) { nd = gd; ng = gg; }
        }
        if (ng) {
          var sx = ng.x - h.x + 270, sy = ng.y - h.y + 520;
          if (sx > 20 && sx < 520 && sy > 90 && sy < 900) G.hand(ctx, sx, sy, this.t);
          else G.edgeArrow(ctx, sx, sy, '#7dff9a', '宝石');
        }
      }
    }
  };

  Run.prototype.renderLevelUp = function (ctx) {
    var self = this;
    this.levelT += 1 / 60;
    ctx.fillStyle = 'rgba(6,4,10,0.8)';
    ctx.fillRect(0, 0, 540, 960);
    G.rays(ctx, 270, 200, 300, '#ffd27a', this.levelT * 0.6, 14, 0.25);
    G.text(ctx, '升级！', 270, 170, { size: 50, weight: 'bold', align: 'center', color: '#ffd27a', stroke: '#4a1a00', strokeWidth: 7 });
    G.text(ctx, this.save.tutSurv ? '选择一项强化' : '点一张卡片选择技能，同一技能越叠越强！', 270, 222, { size: 18, align: 'center', color: this.save.tutSurv ? '#ddd' : '#ffd27a' });
    for (var i = 0; i < this.levelChoices.length; i++) {
      var k = this.levelChoices[i], S = SKILLS[k];
      var lv = this.skills[k] || 0;
      var y = 262 + i * 150;
      var appear = U.easeOutBack(U.clamp(this.levelT * 4 - i * 0.4, 0, 1));
      ctx.save();
      ctx.translate(270, y + 66);
      ctx.scale(appear, appear);
      ctx.translate(-270, -(y + 66));
      var pressed = this.ui.hotspot('choice' + i + k, 40, y, 460, 132, (function (kk) { return function () { self.pickChoice(kk); }; })(k));
      G.panel(ctx, 40, y + (pressed ? 3 : 0), 460, 132, { border: S.color, glow: lv === 0 ? S.color : null, glowBlur: 12, lineWidth: 3 });
      ctx.save();
      ctx.translate(100, y + 66);
      G.glow(ctx, 0, 0, 46, S.color, 0.4);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = S.color; ctx.lineWidth = 3; ctx.stroke();
      G.text(ctx, S.name[0], 0, 0, { size: 32, weight: 'bold', align: 'center', color: S.color });
      ctx.restore();
      G.text(ctx, S.name, 156, y + 34, { size: 24, weight: 'bold', color: S.color });
      G.text(ctx, lv === 0 ? '新技能！' : 'Lv.' + lv + ' → ' + (lv + 1), 484, y + 34, { size: 16, weight: 'bold', align: 'right', color: lv === 0 ? '#ffd27a' : '#bbb' });
      G.paragraph(ctx, S.desc(lv + 1), 156, y + 74, 320, { size: 16, color: '#ddd' });
      ctx.restore();
    }
    if (this.rerolls > 0) {
      this.ui.button(ctx, 130, 730, 280, 70, '刷新选项', function () {
        ER.ads.show('刷新升级选项').then(function (ok) {
          if (!ok) return;
          self.rerolls--;
          self.levelChoices = self.rollChoices();
          self.levelT = 0;
        });
      }, { color: '#7a3fd0', size: 24, ad: true, sub: '本局剩余 ' + this.rerolls + ' 次', id: 'reroll' });
    }
  };

  Run.prototype.renderEnd = function (ctx) {
    var self = this;
    var win = this.state === 'win';
    ctx.fillStyle = 'rgba(6,4,10,0.82)';
    ctx.fillRect(0, 0, 540, 960);
    if (win) G.rays(ctx, 270, 250, 340, '#ffd27a', this.t * 0.4, 16, 0.3);
    G.text(ctx, win ? '烬王陨落！' : '你倒下了……', 270, 230, { size: 48, weight: 'bold', align: 'center', color: win ? '#ffd27a' : '#ff6a6a', stroke: '#000', strokeWidth: 6 });
    G.text(ctx, '存活 ' + U.fmtTime(this.t) + '  ·  击杀 ' + this.kills + '  ·  等级 ' + this.level, 270, 290, { size: 18, align: 'center', color: '#ddd' });
    var r = this.rewards();
    G.text(ctx, '获得余烬 ' + r, 270, 340, { size: 28, weight: 'bold', align: 'center', color: '#ffb347' });
    var y = 400;
    if (!win && !this.revived) {
      this.ui.button(ctx, 90, y, 360, 90, '原地复活', function () { self.revive(); }, { color: '#2f7fd6', size: 28, ad: true, sub: '满血复活并震退周围敌人', pulse: true, id: 'revive' });
      y += 110;
    }
    this.ui.button(ctx, 90, y, 360, 84, '双倍领取', function () {
      ER.ads.show('双倍余烬').then(function (ok) { if (ok) self.finish(2); });
    }, { color: '#7a3fd0', size: 26, ad: true, sub: '余烬 ×2 → ' + r * 2, id: 'double' });
    this.ui.button(ctx, 150, y + 104, 240, 60, '领取', function () { self.finish(1); }, { color: '#4a4452', size: 20, id: 'claim' });
  };

  // ================================================================== 局外大厅
  function SurvHub() {
    this.save = loadSave();
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.toast = null;
  }
  SurvHub.prototype.update = function (dt) {
    this.t += dt;
    this.fx.update(dt);
    if (Math.random() < dt * 10) this.fx.burst(U.rand(0, 540), 960, { n: 1, color: '#ff7a2a', speed: 100, angle: -Math.PI / 2, spread: 0.4, life: 4, size: 2.5, drag: 0.1 });
  };
  SurvHub.prototype.render = function (ctx) {
    var self = this, s = this.save;
    var bg = ctx.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, '#160e16');
    bg.addColorStop(1, '#06050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 540, 960);
    this.fx.renderParticles(ctx);
    this.ui.button(ctx, 12, 14, 80, 44, '返回', function () { self.app.goto(new ER.MenuScene()); }, { color: '#3a3346', size: 18 });
    G.text(ctx, '灰烬独行者', 270, 36, { size: 28, weight: 'bold', align: 'center', color: '#ff8a4a', stroke: '#3a1200', strokeWidth: 5 });
    G.text(ctx, '余烬 ' + s.embers, 524, 36, { size: 17, align: 'right', color: '#ffb347' });
    G.text(ctx, '最佳：存活 ' + U.fmtTime(s.best.time) + ' · 击杀 ' + s.best.kills + ' · 通关 ' + (s.wins || 0) + ' 次', 270, 80, { size: 15, align: 'center', color: '#aaa' });

    G.text(ctx, '选择职业', 24, 116, { size: 18, weight: 'bold', color: '#ddd' });
    for (var i = 0; i < CLASS_ORDER.length; i++) {
      var key = CLASS_ORDER[i], C = CLASSES[key];
      var x = 16 + i * 172, y = 136;
      var sel = s.cls === key;
      var pressed = this.ui.hotspot('cls' + key, x, y, 164, 190, (function (k) { return function () { s.cls = k; writeSave(s); A.play('click'); }; })(key));
      G.panel(ctx, x, y + (pressed ? 2 : 0), 164, 190, { border: sel ? C.color : 'rgba(255,255,255,0.15)', glow: sel ? C.color : null, glowBlur: 14, lineWidth: sel ? 3 : 1.5 });
      ctx.save();
      ctx.translate(x + 82, y + 62);
      var bob = sel ? Math.sin(this.t * 4) * 3 : 0;
      ctx.translate(0, bob);
      G.glow(ctx, 0, 0, 56, C.color, sel ? 0.5 : 0.2);
      ER.Sprites.drawHero(ctx, 0, 34, { kind: C.kind, s: 1.35, face: 1, walk: this.t * (sel ? 3 : 1), atk: sel ? Math.max(0, Math.sin(this.t * 2.5)) * 0 : 0 });
      ctx.restore();
      G.text(ctx, C.name, x + 82, y + 118, { size: 19, weight: 'bold', align: 'center', color: sel ? C.color : '#fff' });
      G.paragraph(ctx, C.desc, x + 82, y + 148, 140, { size: 13, color: '#bbb', align: 'center' });
    }

    G.text(ctx, '余烬天赋（永久成长）', 24, 356, { size: 18, weight: 'bold', color: '#ddd' });
    for (var m = 0; m < META.length; m++) {
      var M = META[m];
      var lv = s.meta[M.key] || 0;
      var my = 376 + m * 78;
      G.panel(ctx, 16, my, 508, 70, { radius: 10, lineWidth: 1.5 });
      G.text(ctx, M.name, 34, my + 24, { size: 18, weight: 'bold', color: '#ffcf8a' });
      G.text(ctx, M.desc + ' / 级', 34, my + 50, { size: 14, color: '#aaa' });
      for (var d = 0; d < M.max; d++) {
        ctx.fillStyle = d < lv ? '#ff9a3a' : 'rgba(255,255,255,0.12)';
        ctx.fillRect(200 + d * 15, my + 44, 11, 10);
      }
      G.text(ctx, 'Lv.' + lv, 200, my + 24, { size: 15, color: '#fff' });
      var cost = metaCost(lv);
      var maxed = lv >= M.max;
      this.ui.button(ctx, 380, my + 10, 130, 50, maxed ? '已满级' : cost + ' 余烬', (function (MM, c) {
        return function () {
          if (s.embers < c) return;
          s.embers -= c;
          s.meta[MM.key] = (s.meta[MM.key] || 0) + 1;
          writeSave(s);
          A.play('levelup');
          self.fx.burst(445, 376 + META.indexOf(MM) * 78 + 35, { n: 24, colors: ['#ffb347', '#fff'], speed: 220, life: 0.6 });
        };
      })(M, cost), { color: '#8a5a2a', size: 18, disabled: maxed || s.embers < cost, id: 'meta' + M.key });
    }
    this.ui.button(ctx, 16, 790, 508, 100, '开始冒险', function () {
      self.app.goto(new Run(self.save));
    }, { color: '#c8602a', size: 34, sub: CLASSES[s.cls].name + ' · 坚持 3 分钟击败烬王', pulse: true, id: 'start' });
    G.text(ctx, '每局 3 分钟左右 · 死亡也能带走余烬', 270, 920, { size: 14, align: 'center', color: '#777' });
    if (this.toast) {
      this.toastT = (this.toastT || 0) + 1 / 60;
      var a = Math.min(1, (2.5 - this.toastT) * 2);
      if (a <= 0) this.toast = null;
      else {
        ctx.save();
        ctx.globalAlpha = a;
        G.panel(ctx, 110, 720, 320, 52, { radius: 26, border: '#ffb347' });
        G.text(ctx, this.toast, 270, 746, { size: 18, weight: 'bold', align: 'center', color: '#ffd27a' });
        ctx.restore();
      }
    }
  };

  ER.Games = ER.Games || {};
  ER.Games.survivor = { title: '灰烬独行者', create: function () { return new SurvHub(); }, _internals: { Run: Run } };
})();
