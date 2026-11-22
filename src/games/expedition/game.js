/**
 * 原型 B（重做）：《余烬远征》—— 2D 横版挂机过关
 * 小队自动向右推进，遇敌自动战斗；必杀技带切入特写；首领有登场演出；
 * 章节通关后转场到新地域。点屏幕可以亲手补刀。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, A = ER.audio, P = ER.platform, Loot = ER.Loot, S = ER.Sprites;
  var World = ER.ExpWorld;
  var GROUND = World.GROUND, VIEW_H = World.VIEW_H;
  var SAVE_KEY = 'er_exp_v1';
  var LEAD_SCREEN_X = 300;
  var WALK_SPEED = 115;
  var OFFLINE_CAP = 8 * 3600;

  var HEROES = [
    { id: 'warrior', name: '铁誓', title: '守护骑士', kind: 'warrior', color: '#5b8cff', base: 9, hp: 260, range: 100, cd: 0.85, cost: 8, unlock: 1, ult: '裂天斩', off: 0, dy: 8 },
    { id: 'rogue', name: '影七', title: '影刃', kind: 'rogue', color: '#ffd24a', base: 16, hp: 170, range: 95, cd: 0.55, cost: 160, unlock: 8, ult: '影舞·瞬杀', off: -50, dy: -12 },
    { id: 'hunter', name: '青羽', title: '游侠', kind: 'hunter', color: '#4ae0ff', base: 12, hp: 150, range: 480, cd: 0.75, cost: 45, unlock: 4, ult: '千羽箭雨', off: -104, dy: 12 },
    { id: 'mage', name: '焰歌', title: '炎术师', kind: 'mage', color: '#ff6b4a', base: 13, hp: 130, range: 470, cd: 1.2, cost: 12, unlock: 1, ult: '陨星火雨', off: -156, dy: -6 },
    { id: 'priest', name: '晨露', title: '祈光者', kind: 'priest', color: '#7dffb0', base: 5, hp: 150, range: 450, cd: 1.5, cost: 18, unlock: 1, ult: '圣辉降临', off: -206, dy: 10 },
  ];
  var HERO_BY_ID = {};
  HEROES.forEach(function (h) { HERO_BY_ID[h.id] = h; });

  var MOB = {
    slime: { size: 44, speed: 55, reach: 34, fly: 0 },
    imp: { size: 46, speed: 70, reach: 36, fly: 0 },
    wisp: { size: 50, speed: 60, reach: 40, fly: 1 },
    bat: { size: 50, speed: 85, reach: 36, fly: 1 },
    ghoul: { size: 64, speed: 45, reach: 40, fly: 0 },
    brute: { size: 86, speed: 40, reach: 52, fly: 0 },
    king: { size: 150, speed: 36, reach: 70, fly: 0 },
  };
  var BAR_COLORS = ['#d8362a', '#ff8a1f', '#ffd24a', '#5ad04a', '#4ac8ff', '#b35cff'];

  // ------------------------------------------------------------------ 数值
  function gIndex(ch, st) { return (ch - 1) * 10 + st; }
  function heroDps(def, h) { return def.base * h.lvl * Math.pow(1.06, h.lvl - 1) * (1 + (h.item ? h.item.power : 0) / 40); }
  function heroMaxHp(def, h) { return Math.round(def.hp * (1 + (h.lvl - 1) * 0.25) * Math.pow(1.04, h.lvl - 1)); }
  function upCost(def, lvl) { return Math.round(def.cost * Math.pow(1.13, lvl - 1)); }
  function mobHp(gi) { return 22 * Math.pow(1.19, gi - 1); }
  function mobDmg(gi) { return 7 * Math.pow(1.15, gi - 1); }
  function goldPer(gi) { return Math.max(1, Math.round(2 * Math.pow(1.16, gi - 1))); }

  function defaultSave() {
    return {
      ch: 1, st: 1, gold: 0, chests: [], auto: true, farm: false, best: 1, last: P.now(), speedUntil: 0, tut: {},
      heroes: { warrior: { lvl: 1 }, mage: { lvl: 1 }, priest: { lvl: 1 } },
    };
  }
  function loadSave() {
    var s = P.storage.get(SAVE_KEY, null);
    if (!s || !s.heroes) s = defaultSave();
    if (!s.tut) s.tut = {};
    return s;
  }

  // ================================================================== 场景
  function Expedition() {
    this.save = loadSave();
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.world = new World(this.save.ch - 1);
    this.t = 0;          // 游戏时间（受时间缩放）
    this.rt = 0;         // 真实时间
    this.timeScale = 1;
    this.hitStop = 0;
    this.zoom = 1;
    this.zoomFocus = { x: 270, y: 400 };
    this.camX = 0;
    this.leadX = LEAD_SCREEN_X;
    this.enemies = [];
    this.projs = [];
    this.vfx = [];
    this.coins = [];
    this.drops = [];
    this.events = [];
    this.afterimages = [];
    this.cutin = null;
    this.banner = null;
    this.letterbox = 0;
    this.iris = null;
    this.combo = 0;
    this.comboT = 0;
    this.goldShown = this.save.gold;
    this.party = [];
    this.buildParty();
    this.state = 'walk';
    this.waveIdx = 0;
    this.nextWaveX = this.leadX + 200;
    this.offline = this.computeOffline();
    this.startStage();
  }

  Expedition.prototype.persist = function () {
    this.save.last = P.now();
    P.storage.set(SAVE_KEY, this.save);
  };
  Expedition.prototype.onHide = function () { this.persist(); };
  Expedition.prototype.exit = function () { this.persist(); };

  Expedition.prototype.gi = function () { return gIndex(this.save.ch, this.save.st); };
  Expedition.prototype.speedMul = function () { return P.now() < (this.save.speedUntil || 0) ? 2 : 1; };

  Expedition.prototype.buildParty = function () {
    var self = this, old = {};
    this.party.forEach(function (h) { old[h.def.id] = h; });
    this.party = [];
    HEROES.forEach(function (def) {
      var hs = self.save.heroes[def.id];
      if (!hs) return;
      var prev = old[def.id];
      var maxHp = heroMaxHp(def, hs);
      self.party.push({
        def: def, s: hs, x: prev ? prev.x : self.leadX + def.off, y: GROUND + def.dy,
        hp: prev ? Math.min(maxHp, prev.hp + (maxHp - prev.maxHp)) : maxHp, maxHp: maxHp,
        cdT: U.rand(0, def.cd), energy: prev ? prev.energy : 0, atk: 0, walk: Math.random() * 6, dead: prev ? prev.dead : false,
        hurt: 0, lunge: 0, leap: 0, dash: null, dps: heroDps(def, hs),
      });
    });
  };
  Expedition.prototype.teamDps = function () {
    var d = 0;
    for (var i = 0; i < this.party.length; i++) d += this.party[i].dps;
    return d;
  };
  Expedition.prototype.front = function () {
    var f = null;
    for (var i = 0; i < this.party.length; i++) {
      var h = this.party[i];
      if (!h.dead && (!f || h.x > f.x)) f = h;
    }
    return f;
  };

  // ---------------- 关卡流程 ----------------
  Expedition.prototype.isBossStage = function () { return !this.save.farm && (this.save.st === 5 || this.save.st === 10); };

  Expedition.prototype.startStage = function () {
    this.waveIdx = 0;
    this.waves = this.isBossStage() ? 1 : 3;
    this.nextWaveX = this.leadX + 160;
    this.bossT = 0;
    this.boss = null;
  };

  Expedition.prototype.spawnWave = function () {
    var gi = this.gi(), B = this.world.B;
    var baseX = this.camX + 600;
    var i;
    if (this.isBossStage()) {
      var big = this.save.st === 10;
      var type = big ? B.bossType : 'brute';
      var e = this.makeEnemy(type, big ? this.camX + 450 : baseX + 40, mobHp(gi) * (big ? 16 : 8), big ? 1.0 : 0.85);
      e.boss = true;
      e.big = big;
      e.tint = big ? B.bossTint : (B.tint || '#c86a3a');
      e.name = big ? B.boss : '精英·' + ['裂石蛮兽', '赤角蛮兽', '冰甲蛮兽', '潮鳞蛮兽', '虚影蛮兽'][this.world.bi];
      e.slamT = 5;
      this.boss = e;
      this.bossT = big ? 45 : 35;
      if (big) this.bossIntro(e);
      else {
        this.banner = { s: '精英来袭！', sub: e.name, t: 1.8, c: '#ffb347' };
        A.play('warn');
      }
      return;
    }
    var n = Math.min(7, 3 + Math.floor(this.save.st / 3) + (this.waveIdx === 2 ? 1 : 0));
    for (i = 0; i < n; i++) {
      var t2 = U.pick(B.mobs);
      this.makeEnemy(t2, baseX + i * U.rand(46, 70), mobHp(gi) * (t2 === 'ghoul' ? 1.6 : 1), 1);
    }
  };

  Expedition.prototype.makeEnemy = function (type, x, hp, scale) {
    var M = MOB[type];
    var e = {
      type: type, M: M, x: x, y: GROUND + U.rand(-6, 10), hp: hp, max: hp, size: M.size * (scale || 1),
      atkT: U.rand(0.5, 1.2), hurt: 0, kx: 0, phase: Math.random(), dying: 0, lunge: 0, tint: this.world.B.tint,
      marked: false, frozen: 0,
    };
    this.enemies.push(e);
    return e;
  };

  Expedition.prototype.bossIntro = function (e) {
    var self = this;
    this.state = 'intro';
    this.introT = 0;
    e.introY = -380;
    e.y0 = e.y;
    e.y = e.y0 - 380;
    A.play('warn');
    this.at(0.9, function () {
      e.y = e.y0;
      e.introY = 0;
      A.play('bigBoom');
      self.fx.shake(26, 0.8);
      self.fx.flash('#ffffff', 0.5, 2);
      var sx = e.x - self.camX;
      self.fx.ring(sx, GROUND, 20, 420, self.world.B.accent, 0.8, 14);
      self.fx.burst(sx, GROUND, { n: 60, colors: ['#8a7a6a', '#c8b8a0', self.world.B.accent], speed: 520, angle: -Math.PI / 2, spread: 1.4, life: 1.1, gravity: 900, size: 6 });
      self.zoom = 1.18;
      self.zoomFocus = { x: sx, y: GROUND - 80 };
      P.vibrate(60);
    });
    this.at(1.3, function () {
      self.banner = { s: e.name, sub: '第 ' + self.save.ch + ' 章首领', t: 2.2, c: '#ff6a4a', big: true };
      A.play('ult');
    });
  };

  Expedition.prototype.at = function (delay, fn) { this.events.push({ t: this.t + delay, fn: fn }); };

  Expedition.prototype.stageClear = function () {
    var s = this.save;
    var wasBoss = this.isBossStage();
    var bigBoss = wasBoss && s.st === 10;
    if (s.farm) {
      this.banner = { s: '刷怪完成', sub: '变强后点「挑战首领」', t: 1.4, c: '#9fd0ff' };
      this.startStage();
      return;
    }
    if (bigBoss) {
      this.chapterClear();
      return;
    }
    s.st++;
    if (gIndex(s.ch, s.st) > s.best) s.best = gIndex(s.ch, s.st);
    this.banner = { s: '关卡突破', sub: s.ch + '-' + (s.st - 1) + ' → ' + s.ch + '-' + s.st, t: 1.6, c: '#ffd27a', shine: true };
    A.play('levelup');
    this.checkUnlocks();
    this.persist();
    this.startStage();
  };

  Expedition.prototype.chapterClear = function () {
    var self = this, s = this.save;
    this.state = 'celebrate';
    this.banner = { s: '第 ' + s.ch + ' 章 通关！', sub: this.world.B.name + ' 已被征服', t: 3.4, c: '#ffd27a', big: true, shine: true };
    A.play('victory');
    for (var i = 0; i < 14; i++) {
      (function (k) {
        self.at(k * 0.22, function () {
          var x = U.rand(60, 480), y = U.rand(90, 320);
          var col = U.pick(['#ff5a5a', '#ffd24a', '#7dff9a', '#4ac8ff', '#d49bff', '#ffffff']);
          self.fx.burst(x, y, { n: 70, colors: [col, '#ffffff'], speed: 380, life: 1.4, gravity: 160, drag: 1.6, size: 3.5 });
          self.fx.ring(x, y, 4, 120, col, 0.6, 4);
          self.world.addLight(x, y, 260, col, 1.2);
          A.play('boom', 0.1);
        });
      })(i);
    }
    this.at(3.4, function () {
      self.iris = { t: 0, dur: 1.4, mid: false };
      A.play('ult');
    });
  };

  Expedition.prototype.afterIrisMid = function () {
    var s = this.save;
    s.ch++;
    s.st = 1;
    if (gIndex(s.ch, s.st) > s.best) s.best = gIndex(s.ch, s.st);
    this.world.setBiome(s.ch - 1);
    this.enemies.length = 0;
    this.coins.length = 0;
    this.drops.length = 0;
    this.party.forEach(function (h) { h.dead = false; h.hp = h.maxHp; });
    this.state = 'walk';
    this.checkUnlocks();
    this.persist();
    this.startStage();
    this.banner = { s: this.world.B.name, sub: '第 ' + s.ch + ' 章', t: 2.4, c: this.world.B.accent, big: true };
  };

  Expedition.prototype.checkUnlocks = function () {
    var s = this.save, self = this;
    HEROES.forEach(function (def) {
      if (!s.heroes[def.id] && s.best >= def.unlock) {
        s.heroes[def.id] = { lvl: Math.max(1, Math.floor(s.best * 0.8)) };
        self.buildParty();
        self.newHero = { def: def, t: self.banner ? -2.4 : 0 };
        A.play('loot3');
      }
    });
  };

  Expedition.prototype.wipe = function () {
    var s = this.save;
    if (this.state === 'wiped') return;
    this.state = 'wiped';
    this.wipeT = 0;
    A.play('wipe');
    if (this.isBossStage()) {
      s.farm = true;
      if (s.st > 1) s.st--;
    }
    this.persist();
  };

  Expedition.prototype.recover = function () {
    this.enemies.length = 0;
    this.party.forEach(function (h) { h.dead = false; h.hp = h.maxHp; });
    this.state = 'walk';
    this.boss = null;
    this.startStage();
    this.banner = { s: '重整旗鼓', sub: this.save.farm ? '先刷怪变强，再挑战首领' : '', t: 1.8, c: '#9fd0ff' };
  };

  Expedition.prototype.challengeBoss = function () {
    var s = this.save;
    s.farm = false;
    s.st++;
    this.enemies.length = 0;
    this.persist();
    this.startStage();
    this.state = 'walk';
  };

  // ---------------- 离线收益 ----------------
  Expedition.prototype.computeOffline = function () {
    var s = this.save;
    var el = Math.min(OFFLINE_CAP, (P.now() - (s.last || P.now())) / 1000);
    if (el < 60) return null;
    var gi = gIndex(s.ch, s.st);
    var kills = Math.floor(el / 3.2);
    return { sec: el, kills: kills, gold: kills * goldPer(gi), chests: Math.min(20, Math.max(1, Math.floor(kills / 120))) };
  };
  Expedition.prototype.claimOffline = function (mult) {
    var o = this.offline;
    if (!o) return;
    this.save.gold += o.gold * mult;
    for (var i = 0; i < o.chests * mult; i++) this.save.chests.push(Loot.rollRarity(0.1));
    this.offline = null;
    for (var c = 0; c < 30; c++) this.spawnCoin(this.camX + 270 + U.rand(-120, 120), GROUND - U.rand(100, 300), 0);
    A.play('loot2');
    this.persist();
  };

  // ---------------- 输入 ----------------
  Expedition.prototype.onDown = function (p) {
    if (this.offline || this.cutin || this.iris) return;
    if (p.y > VIEW_H) return;
    this.tapAttack(p);
  };

  Expedition.prototype.tapAttack = function (p) {
    if (this.state === 'wiped') return;
    var wx = p.x / this.zoomK(p) + this.camX;
    var target = null, bd = 1e9;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dying || e.introY) continue;
      var d = Math.abs(e.x - wx) + Math.abs((e.y - e.size * 0.4) - p.y) * 0.5;
      if (d < bd) { bd = d; target = e; }
    }
    this.combo = this.rt - this.comboT < 0.8 ? this.combo + 1 : 1;
    this.comboT = this.rt;
    var dmg = Math.max(1, this.teamDps() * 0.22 * (1 + Math.min(this.combo, 50) * 0.02));
    if (target) {
      var crit = Math.random() < 0.18;
      this.hitEnemy(target, dmg * (crit ? 2.5 : 1), crit, '#ffe9a0', 120);
      this.vfx.push({ type: 'tapslash', x: target.x, y: target.y - target.size * 0.45, t: 0, dur: 0.22, a: U.rand(-0.8, 0.8), c: crit ? '#ffd24a' : '#ffffff' });
    } else {
      this.fx.burst(p.x, p.y, { n: 8, color: '#ffe9a0', speed: 200, life: 0.3, shape: 'spark' });
    }
    for (var j = 0; j < this.party.length; j++) this.party[j].energy = Math.min(100, this.party[j].energy + 1.2);
    A.play('slash', 0.03);
    if (!this.save.tut.tap) { this.save.tut.tap = 1; }
  };
  Expedition.prototype.zoomK = function () { return 1; };

  // ---------------- 主更新 ----------------
  Expedition.prototype.update = function (dt) {
    this.rt += dt;
    if (this.offline) { this.world.update(dt * 0.3, this.camX, 0); return; }
    // 切入特写：世界几乎静止
    if (this.cutin) {
      this.cutin.t += dt;
      this.fx.update(dt * 0.05);
      if (this.cutin.t >= this.cutin.dur) {
        var c = this.cutin;
        this.cutin = null;
        this.doUlt(c.hero);
      }
      return;
    }
    if (this.iris) {
      this.iris.t += dt;
      if (!this.iris.mid && this.iris.t >= this.iris.dur / 2) { this.iris.mid = true; this.afterIrisMid(); }
      if (this.iris.t >= this.iris.dur) this.iris = null;
    }
    if (this.hitStop > 0) { this.hitStop -= dt; this.fx.update(dt * 0.1); return; }
    var sp = this.speedMul();
    this.timeScale = U.damp(this.timeScale, 1, 5, dt);
    var d = dt * this.timeScale * sp;
    this.t += d;
    this.zoom = U.damp(this.zoom, 1, 3, dt);
    // 事件调度
    for (var i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].t <= this.t) { var ev = this.events[i]; this.events.splice(i, 1); ev.fn(); }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.newHero) { this.newHero.t += dt; if (this.newHero.t > 3.2) this.newHero = null; }
    var walking = this.state === 'walk' || (this.state === 'fight' && !this.isEngaged());
    var moveSpeed = walking ? WALK_SPEED : 0;
    this.letterbox = U.damp(this.letterbox, this.state === 'intro' ? 1 : 0, 6, dt);
    this.updateFlow(d);
    this.leadX += moveSpeed * d;
    var targetCam = this.leadX - LEAD_SCREEN_X;
    this.camX = U.damp(this.camX, targetCam, 4, d);
    this.world.update(d, this.camX, walking ? moveSpeed : 0);
    this.updateParty(d, walking);
    this.updateEnemies(d);
    this.updateProjs(d);
    this.updateVfx(d);
    this.updateCoins(d);
    this.fx.update(d);
    this.goldShown = U.damp(this.goldShown, this.save.gold, 5, dt);
  };

  /** 是否已经和敌人接战（未接战时小队边走边打） */
  Expedition.prototype.isEngaged = function () {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.dying && e.x - this.leadX < 190) return true;
    }
    return false;
  };

  Expedition.prototype.updateFlow = function (d) {
    var self = this;
    var alive = this.enemies.filter(function (e) { return !e.dying; });
    if (this.state === 'walk') {
      if (this.waveIdx < this.waves && this.leadX >= this.nextWaveX) {
        this.spawnWave();
        this.waveIdx++;
        if (this.state === 'walk') this.state = 'fight';
      }
    } else if (this.state === 'intro') {
      this.introT += d;
      var bs = this.boss;
      if (bs && bs.introY) {
        var fk = Math.min(1, this.introT / 0.9);
        bs.y = bs.y0 - 380 * (1 - fk * fk);
      }
      if (this.introT > 3.0) this.state = 'fight';
    } else if (this.state === 'fight') {
      // 敌人靠近前排后停下战斗；敌人清空后继续前进
      if (!alive.length) {
        this.state = 'walk';
        this.party.forEach(function (h) { if (h.dead) { h.dead = false; h.hp = h.maxHp * 0.5; self.fx.burst(h.x - self.camX, h.y - 30, { n: 20, colors: ['#bfefff', '#fff'], speed: 160, life: 0.7 }); } });
        if (this.waveIdx >= this.waves) this.stageClear();
        else this.nextWaveX = this.leadX + 220;
      }
      if (this.boss && !this.boss.dying) {
        this.bossT -= d;
        if (this.bossT <= 0) this.wipe();
      }
      if (!this.party.some(function (h) { return !h.dead; })) this.wipe();
    } else if (this.state === 'wiped') {
      this.wipeT += d;
    }
  };

  Expedition.prototype.updateParty = function (d, walking) {
    var front = this.front();
    for (var i = 0; i < this.party.length; i++) {
      var h = this.party[i], def = h.def;
      h.atk = Math.max(0, h.atk - d * 3.5);
      h.hurt = Math.max(0, h.hurt - d);
      h.lunge = Math.max(0, h.lunge - d * 5);
      h.walk += d * (walking ? 12 : 2);
      var tx = this.leadX + def.off;
      h.x = U.damp(h.x, tx, 6, d);
      if (h.leap > 0) h.leap = Math.max(0, h.leap - d * 1.6);
      if (h.dead) continue;
      if (h.def.id === 'mage' || h.def.id === 'priest') {
        this.world.addLight(h.x - this.camX + 18, h.y - 62, 70, def.color, 0.55);
      }
      if (this.state !== 'fight' || this.cutin) continue;
      // 必杀
      if (h.energy >= 100 && this.save.auto && !this.events.some(function (e) { return e.ult; })) {
        this.castUlt(h);
        return;
      }
      h.cdT -= d;
      if (h.cdT > 0) continue;
      this.heroAttack(h, front);
    }
  };

  Expedition.prototype.targetsInRange = function (h, range) {
    var list = [];
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dying || e.introY) continue;
      var dx = e.x - h.x;
      if (dx > -30 && dx < range) list.push(e);
    }
    list.sort(function (a, b) { return a.x - b.x; });
    return list;
  };

  Expedition.prototype.heroAttack = function (h, front) {
    var def = h.def, self = this;
    var tg = this.targetsInRange(h, def.range);
    var crit = Math.random() < 0.12;
    var dmg = h.dps * def.cd * (crit ? 2.2 : 1);
    if (def.id === 'priest') {
      var low = null;
      for (var i = 0; i < this.party.length; i++) {
        var o = this.party[i];
        if (!o.dead && o.hp / o.maxHp < 0.8 && (!low || o.hp / o.maxHp < low.hp / low.maxHp)) low = o;
      }
      if (low) {
        h.cdT = def.cd;
        h.atk = 1;
        var amt = Math.round(low.maxHp * 0.22 + h.dps * 2);
        low.hp = Math.min(low.maxHp, low.hp + amt);
        this.vfx.push({ type: 'pillar', x: low.x, t: 0, dur: 0.6, c: '#bfffd8', w: 34 });
        this.fx.text(low.x - this.camX, low.y - 80, '+' + U.fmt(amt), { color: '#7dff9a', size: 20 });
        A.play('heal', 0.2);
        h.energy = Math.min(100, h.energy + 10);
        return;
      }
    }
    if (!tg.length) { h.cdT = 0.15; return; }
    h.cdT = def.cd;
    h.atk = 1;
    h.energy = Math.min(100, h.energy + 8 + (crit ? 4 : 0));
    var t0 = tg[0];
    if (def.id === 'warrior') {
      h.lunge = 1;
      var hitAny = false;
      for (var k = 0; k < tg.length; k++) {
        if (tg[k].x - h.x < def.range) { this.hitEnemy(tg[k], dmg, crit, '#dfe8ff', 220); hitAny = true; }
      }
      this.vfx.push({ type: 'arc', x: h.x + 34, y: h.y - 40, r: 62, t: 0, dur: 0.2, c: crit ? '#ffd24a' : '#dfe8ff', dir: 1 });
      A.play(hitAny ? 'slash' : 'hitSoft', 0.05);
    } else if (def.id === 'rogue') {
      h.dash = { t: 0, dur: 0.28, tx: t0.x - 34 };
      this.pushAfterimages(h, 4);
      self.hitEnemy(t0, dmg * 0.55, crit, '#ffd24a', 60);
      this.at(0.1, function () { if (!t0.dying) self.hitEnemy(t0, dmg * 0.55, Math.random() < 0.2, '#ffd24a', 60); });
      this.vfx.push({ type: 'xslash', x: t0.x, y: t0.y - t0.size * 0.45, t: 0, dur: 0.25, c: '#ffe14a' });
      A.play('slash', 0.05);
    } else if (def.id === 'hunter') {
      this.projs.push({ kind: 'arrow', x: h.x + 16, y: h.y - 42, vx: 980, vy: 0, dmg: dmg, crit: crit, pierce: crit ? 99 : 1, life: 0.8, hit: [] });
      A.play('slash', 0.05);
    } else if (def.id === 'mage') {
      var ty = t0.y - t0.size * 0.4;
      var dx = t0.x - (h.x + 18), dy = ty - (h.y - 64);
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      this.projs.push({ kind: 'fireball', x: h.x + 18, y: h.y - 64, vx: (dx / l) * 560, vy: (dy / l) * 560, dmg: dmg, crit: crit, target: t0, life: 1.5, aoe: 70 });
      A.play('fire', 0.08);
    } else if (def.id === 'priest') {
      this.projs.push({ kind: 'holy', x: h.x + 18, y: h.y - 62, vx: 620, vy: 0, dmg: dmg, crit: crit, target: t0, life: 1.2 });
    }
    void front;
  };

  Expedition.prototype.pushAfterimages = function (h, n) {
    for (var i = 0; i < n; i++) this.afterimages.push({ kind: h.def.kind, x: h.x - i * 14, y: h.y, t: 0, dur: 0.25 + i * 0.05, c: h.def.color, walk: h.walk });
  };

  Expedition.prototype.hitEnemy = function (e, dmg, crit, color, kb) {
    if (e.dying) return;
    dmg = Math.max(1, Math.round(dmg * U.rand(0.92, 1.08)));
    e.hp -= dmg;
    e.hurt = 0.1;
    if (!e.boss) e.kx += kb || 60;
    var sx = e.x - this.camX, sy = e.y - e.size * 0.5;
    if (crit) {
      this.fx.text(sx + U.rand(-10, 10), sy - 20, U.fmt(dmg), { color: '#ffb347', size: 34, crit: true, life: 1.0, vy: -110, stroke: '#4a1400' });
      this.fx.burst(sx, sy, { n: 14, colors: ['#ffd24a', '#ffffff'], speed: 380, life: 0.35, shape: 'spark' });
      this.world.addLight(sx, sy, 120, '#ffd27a', 1);
      this.fx.shake(4, 0.1);
      A.play('crit', 0.05);
    } else {
      this.fx.text(sx + U.rand(-14, 14), sy, U.fmt(dmg), { color: '#ffffff', size: 20, life: 0.65 });
      this.fx.burst(sx, sy, { n: 5, color: color || '#fff', speed: 220, life: 0.25, shape: 'spark' });
      A.play('hitSoft', 0.05);
    }
    if (e.hp <= 0) this.killEnemy(e);
  };

  Expedition.prototype.killEnemy = function (e) {
    e.hp = 0;
    e.dying = 0.5;
    var gi = this.gi();
    var sx = e.x - this.camX, sy = e.y - e.size * 0.45;
    var gold = goldPer(gi) * (e.boss ? (e.big ? 30 : 12) : 1);
    this.save.gold += gold;
    var nc = e.boss ? 24 : U.randi(2, 4);
    for (var i = 0; i < nc; i++) this.spawnCoin(e.x, sy, i * 0.02);
    var col = this.world.B.accent;
    this.fx.burst(sx, sy, { n: e.boss ? 120 : 22, colors: [col, '#ffffff', e.tint || '#ffb347'], speed: e.boss ? 620 : 300, life: e.boss ? 1.3 : 0.55, size: e.boss ? 6 : 4 });
    this.world.addLight(sx, sy, e.boss ? 400 : 140, col, 1);
    A.play(e.boss ? 'bigBoom' : 'hit', 0.04);
    var chestP = e.boss ? 1 : 0.05;
    if (Math.random() < chestP) {
      var rar = Loot.rollRarity(e.boss ? 0.6 : 0.1, e.boss ? (e.big ? 2 : 1) : 0);
      this.drops.push({ x: e.x, y: sy, vx: U.rand(60, 160), vy: -520, rar: rar, t: 0, landed: false, gone: false });
      A.play('loot1');
    }
    if (e.boss) {
      this.hitStop = 0.18;
      this.timeScale = 0.25;
      this.zoom = 1.25;
      this.zoomFocus = { x: sx, y: sy };
      this.fx.flash('#ffffff', 0.8, 1.5);
      this.fx.shake(24, 1);
      P.vibrate(80);
      this.boss = null;
      setTimeout(function () { A.play('victory'); }, 400);
    }
    this.persist();
  };

  Expedition.prototype.spawnCoin = function (wx, y, delay) {
    this.coins.push({ x: wx, y: y, vx: U.rand(-140, 220), vy: U.rand(-460, -220), t: -delay, phase: 0, sx: 0, sy: 0 });
  };

  Expedition.prototype.updateEnemies = function (d) {
    var front = this.front();
    var B = this.world.B;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      e.hurt = Math.max(0, e.hurt - d);
      e.lunge = Math.max(0, e.lunge - d * 4);
      e.phase += d * 1.2;
      if (e.dying) {
        e.dying -= d;
        e.x += 160 * d;
        if (e.dying <= 0) this.enemies.splice(i, 1);
        continue;
      }
      if (e.introY) continue;
      e.x += e.kx * d;
      e.kx *= Math.exp(-10 * d);
      if (e.type === 'wisp') this.world.addLight(e.x - this.camX, e.y - 60, 110, '#ff9a3a', 0.8);
      if (this.state !== 'fight' || !front) continue;
      var reach = e.M.reach * (e.size / e.M.size);
      var gap = e.x - front.x;
      if (gap > reach + 20) {
        // 互相避让，排成一列
        var blocked = false;
        for (var j = 0; j < this.enemies.length; j++) {
          var o = this.enemies[j];
          if (o !== e && !o.dying && o.x < e.x && e.x - o.x < (e.size + o.size) * 0.32 && !(o.M.fly ^ e.M.fly)) { blocked = true; break; }
        }
        if (!blocked) e.x -= e.M.speed * d;
      } else {
        e.atkT -= d;
        if (e.atkT <= 0) {
          e.atkT = e.boss ? 1.6 : 1.4;
          e.lunge = 1;
          var dmg = mobDmg(this.gi()) * (e.boss ? (e.big ? 3.2 : 2.2) : 1);
          this.damageHero(front, dmg);
        }
      }
      // 首领技能：地裂冲击波
      if (e.boss) {
        e.slamT -= d;
        if (e.slamT <= 0) {
          e.slamT = 7;
          this.bossSlam(e);
        }
      }
    }
  };

  Expedition.prototype.bossSlam = function (e) {
    var self = this;
    this.vfx.push({ type: 'warnline', x0: e.x - 40, t: 0, dur: 1.0 });
    A.play('warn');
    this.at(1.0, function () {
      if (e.dying) return;
      e.lunge = 1;
      self.fx.shake(14, 0.4);
      A.play('boom');
      self.vfx.push({ type: 'shockwave', x: e.x - 40, t: 0, dur: 1.2, hit: [] , dmg: mobDmg(self.gi()) * 3 });
    });
  };

  Expedition.prototype.damageHero = function (h, dmg) {
    if (!h || h.dead) return;
    dmg = Math.round(dmg);
    h.hp -= dmg;
    h.hurt = 0.15;
    this.fx.text(h.x - this.camX, h.y - 70, '-' + U.fmt(dmg), { color: '#ff5a5a', size: 17, vy: -50 });
    this.fx.burst(h.x - this.camX + 10, h.y - 40, { n: 6, color: '#ff6a6a', speed: 160, life: 0.3 });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      A.play('death');
      this.fx.burst(h.x - this.camX, h.y - 30, { n: 24, color: h.def.color, speed: 220, life: 0.7 });
    }
  };

  Expedition.prototype.updateProjs = function (d) {
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var p = this.projs[i];
      p.life -= d;
      if (p.target && !p.target.dying && p.kind !== 'arrow') {
        var ty = p.target.y - p.target.size * 0.4;
        var dx = p.target.x - p.x, dy = ty - p.y;
        var l = Math.sqrt(dx * dx + dy * dy) || 1;
        var spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = U.damp(p.vx, (dx / l) * spd, 10, d);
        p.vy = U.damp(p.vy, (dy / l) * spd, 10, d);
      }
      p.x += p.vx * d; p.y += p.vy * d;
      var sx = p.x - this.camX;
      if (p.kind === 'fireball') {
        this.fx.burst(sx, p.y, { n: 2, colors: ['#ff6a1a', '#ffd24a'], speed: 50, life: 0.35, size: 6 });
        this.world.addLight(sx, p.y, 130, '#ff8a3a', 1);
      } else if (p.kind === 'holy') {
        this.fx.burst(sx, p.y, { n: 1, color: '#d8ffe0', speed: 30, life: 0.3, size: 4 });
        this.world.addLight(sx, p.y, 80, '#bfffd8', 0.7);
      }
      var done = p.life <= 0;
      for (var j = 0; j < this.enemies.length && !done; j++) {
        var e = this.enemies[j];
        if (e.dying || e.introY || (p.hit && p.hit.indexOf(e) >= 0)) continue;
        var ey = e.y - e.size * 0.45;
        if (Math.abs(e.x - p.x) < e.size * 0.42 && Math.abs(ey - p.y) < e.size * 0.6) {
          if (p.kind === 'fireball') {
            this.explode(p.x, p.y, p.aoe, p.dmg, p.crit);
            done = true;
          } else if (p.kind === 'arrow') {
            this.hitEnemy(e, p.dmg, p.crit, '#9ff0ff', 90);
            p.hit.push(e);
            if (p.hit.length >= p.pierce) done = true;
          } else {
            this.hitEnemy(e, p.dmg, p.crit, '#d8ffe0', 50);
            this.fx.ring(e.x - this.camX, ey, 4, 40, '#bfffd8', 0.3, 4);
            done = true;
          }
        }
      }
      if (done) this.projs.splice(i, 1);
    }
  };

  Expedition.prototype.explode = function (wx, y, r, dmg, crit) {
    var sx = wx - this.camX;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dying || e.introY) continue;
      if (Math.abs(e.x - wx) < r + e.size * 0.3) this.hitEnemy(e, dmg, crit, '#ff8a3a', 120);
    }
    this.fx.burst(sx, y, { n: 26, colors: ['#ff6a1a', '#ffd24a', '#ffffff'], speed: 300, life: 0.5, size: 5 });
    this.fx.ring(sx, y, 10, r * 1.2, '#ffb347', 0.35, 8);
    this.world.addLight(sx, y, r * 3.5, '#ff7a2a', 1.3);
    A.play('boom', 0.08);
  };

  Expedition.prototype.updateVfx = function (d) {
    for (var i = this.vfx.length - 1; i >= 0; i--) {
      var v = this.vfx[i];
      v.t += d;
      if (v.type === 'shockwave') {
        v.x -= 560 * d;
        var sx = v.x - this.camX;
        this.world.addLight(sx, GROUND - 20, 160, '#ff6a3a', 1);
        if (Math.random() < 0.8) this.fx.burst(sx, GROUND, { n: 3, colors: ['#8a7a6a', '#ff8a4a'], speed: 260, angle: -Math.PI / 2, spread: 0.6, life: 0.5, gravity: 900 });
        for (var j = 0; j < this.party.length; j++) {
          var h = this.party[j];
          if (!h.dead && v.hit.indexOf(h) < 0 && Math.abs(h.x - v.x) < 26) { v.hit.push(h); this.damageHero(h, v.dmg); }
        }
      } else if (v.type === 'meteor') {
        var k = v.t / v.dur;
        var mx = U.lerp(v.sx, v.tx, k), my = U.lerp(v.sy, v.ty, k * k);
        this.fx.burst(mx - this.camX, my, { n: 3, colors: ['#ff6a1a', '#ffd24a'], speed: 60, life: 0.4, size: 7 });
        this.world.addLight(mx - this.camX, my, 160, '#ff7a2a', 1);
        if (v.t >= v.dur && !v.done) {
          v.done = true;
          this.explode(v.tx, v.ty, 90, v.dmg, true);
          this.fx.shake(8, 0.2);
        }
      } else if (v.type === 'rainarrow') {
        if (v.t >= v.dur && !v.done) {
          v.done = true;
          for (var q = 0; q < this.enemies.length; q++) {
            var e = this.enemies[q];
            if (!e.dying && !e.introY && Math.abs(e.x - v.tx) < e.size * 0.5 + 16) { this.hitEnemy(e, v.dmg, Math.random() < 0.3, '#9ff0ff', 40); break; }
          }
          this.fx.burst(v.tx - this.camX, v.ty, { n: 4, color: '#9ff0ff', speed: 160, life: 0.3, shape: 'spark' });
        }
      } else if (v.type === 'pillar' || v.type === 'bigpillar') {
        this.world.addLight(v.x - this.camX, GROUND - 120, v.type === 'bigpillar' ? 260 : 150, '#fff2c0', 1.2 * (1 - v.t / v.dur));
      }
      if (v.t >= v.dur + (v.type === 'meteor' ? 0.05 : 0)) this.vfx.splice(i, 1);
    }
    for (var a = this.afterimages.length - 1; a >= 0; a--) {
      this.afterimages[a].t += d;
      if (this.afterimages[a].t >= this.afterimages[a].dur) this.afterimages.splice(a, 1);
    }
  };

  Expedition.prototype.updateCoins = function (d) {
    for (var i = this.coins.length - 1; i >= 0; i--) {
      var c = this.coins[i];
      c.t += d;
      if (c.t < 0) continue;
      if (c.t < 0.9) {
        c.vy += 1500 * d;
        c.x += c.vx * d;
        c.y += c.vy * d;
        if (c.y > GROUND + 8) { c.y = GROUND + 8; c.vy *= -0.45; c.vx *= 0.7; }
        c.sx = c.x - this.camX; c.sy = c.y;
      } else {
        var k = Math.min(1, (c.t - 0.9) * 2.4);
        c.sx = U.lerp(c.sx, 450, k * 0.3);
        c.sy = U.lerp(c.sy, 26, k * 0.3);
        if (k >= 1 || (Math.abs(c.sx - 450) < 12 && Math.abs(c.sy - 26) < 12)) { this.coins.splice(i, 1); A.play('coin', 0.06); this.goldBump = 1; }
      }
    }
    this.goldBump = Math.max(0, (this.goldBump || 0) - d * 4);
    // 宝箱掉落
    for (var j = this.drops.length - 1; j >= 0; j--) {
      var dr = this.drops[j];
      dr.t += d;
      if (!dr.landed) {
        dr.vy += 1500 * d;
        dr.x += dr.vx * d;
        dr.y += dr.vy * d;
        if (dr.y >= GROUND) {
          dr.y = GROUND;
          if (Math.abs(dr.vy) > 200) { dr.vy *= -0.35; dr.vx *= 0.5; A.play('shake', 0.05); }
          else { dr.landed = true; dr.vy = 0; this.fx.burst(dr.x - this.camX, GROUND - 10, { n: 30, colors: [Loot.RARITY[dr.rar].color, '#fff'], speed: 280, life: 0.6, shape: 'spark' }); }
        }
      } else if (!dr.gone && this.leadX > dr.x - 10) {
        dr.gone = true;
        dr.ft = 0;
        dr.fsx = dr.x - this.camX; dr.fsy = GROUND - 20;
      }
      if (dr.gone) {
        dr.ft += d;
        if (dr.ft > 0.7) {
          this.drops.splice(j, 1);
          this.save.chests.push(dr.rar);
          this.chestBump = 1;
          A.play('coin');
          this.persist();
        }
      }
      if (dr.landed && !dr.gone) {
        var R = Loot.RARITY[dr.rar];
        this.world.addLight(dr.x - this.camX, GROUND - 40, 120 + dr.rar * 30, R.color, 1);
      }
    }
    this.chestBump = Math.max(0, (this.chestBump || 0) - d * 3);
  };

  // ---------------- 必杀技 ----------------
  Expedition.prototype.castUlt = function (h) {
    if (h.energy < 100 || h.dead || this.cutin || this.state !== 'fight') return;
    h.energy = 0;
    this.cutin = { hero: h, t: 0, dur: 1.05 };
    A.play('ult');
    P.vibrate(25);
    if (!this.save.tut.ult) this.save.tut.ult = 1;
  };

  Expedition.prototype.doUlt = function (h) {
    var self = this, id = h.def.id;
    var foes = function () { return self.enemies.filter(function (e) { return !e.dying && !e.introY; }); };
    var cam = this.camX;
    if (id === 'warrior') {
      h.leap = 1;
      A.play('slash');
      this.at(0.32, function () {
        self.vfx.push({ type: 'skyslash', t: 0, dur: 0.6 });
        self.hitStop = 0.14;
        self.fx.shake(22, 0.6);
        self.fx.flash('#ffffff', 0.55, 3);
        self.zoom = 1.15;
        self.zoomFocus = { x: 330, y: GROUND - 80 };
        A.play('bigBoom');
        foes().forEach(function (e) { self.hitEnemy(e, h.dps * 12, true, '#ffffff', 300); });
      });
    } else if (id === 'mage') {
      var list = foes();
      for (var i = 0; i < 9; i++) {
        (function (k) {
          self.at(k * 0.13, function () {
            var tgts = foes();
            var tx = tgts.length ? U.pick(tgts).x + U.rand(-30, 30) : self.camX + U.rand(300, 520);
            self.vfx.push({ type: 'meteor', sx: tx + 260, sy: -80, tx: tx, ty: GROUND - 20, t: 0, dur: 0.5, dmg: h.dps * 2.4 });
            A.play('fire', 0.02);
          });
        })(i);
      }
      void list;
    } else if (id === 'priest') {
      this.vfx.push({ type: 'bigpillar', x: cam + 300, t: 0, dur: 1.2, c: '#fff2c0', w: 520 });
      A.play('loot4');
      this.fx.flash('#fff6d0', 0.6, 1.5);
      foes().forEach(function (e, k) {
        self.at(0.15 + k * 0.08, function () {
          self.vfx.push({ type: 'pillar', x: e.x, t: 0, dur: 0.8, c: '#fff2c0', w: 60 });
          self.hitEnemy(e, h.dps * 10, true, '#fff2c0', 80);
        });
      });
      this.party.forEach(function (o) {
        if (o.dead) { o.dead = false; o.hp = 0; }
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.6);
        self.vfx.push({ type: 'pillar', x: o.x, t: 0, dur: 0.9, c: '#bfffd8', w: 40 });
        self.fx.text(o.x - self.camX, o.y - 90, '复苏', { color: '#7dff9a', size: 18 });
      });
    } else if (id === 'hunter') {
      var fs = foes();
      var cx = fs.length ? fs[0].x + 80 : cam + 420;
      for (var a = 0; a < 40; a++) {
        (function (k) {
          self.at(k * 0.025, function () {
            var tx = cx + U.rand(-120, 140);
            self.vfx.push({ type: 'rainarrow', sx: h.x + 10, sy: h.y - 50, tx: tx, ty: GROUND - U.rand(0, 30), t: 0, dur: U.rand(0.45, 0.65), dmg: h.dps * 0.9 });
            if (k % 4 === 0) A.play('slash', 0.02);
          });
        })(a);
      }
    } else if (id === 'rogue') {
      var targets = foes().slice(0, 8);
      if (!targets.length) return;
      targets.forEach(function (e, k) {
        self.at(k * 0.1, function () {
          if (e.dying) return;
          self.pushAfterimages(h, 3);
          h.x = e.x - 30;
          e.marked = true;
          self.vfx.push({ type: 'xslash', x: e.x, y: e.y - e.size * 0.45, t: 0, dur: 0.6, c: '#d49bff', big: true });
          A.play('slash', 0.02);
        });
      });
      this.at(targets.length * 0.1 + 0.35, function () {
        self.hitStop = 0.12;
        self.fx.flash('#d49bff', 0.6, 2.5);
        self.fx.shake(16, 0.4);
        A.play('bigBoom');
        targets.forEach(function (e) {
          if (!e.dying) self.hitEnemy(e, h.dps * 14 / Math.max(1, targets.length) * 3, true, '#d49bff', 200);
          e.marked = false;
        });
      });
    }
  };

  // ================================================================== 绘制
  Expedition.prototype.render = function (ctx) {
    var self = this, cam = this.camX, t = this.rt;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 540, VIEW_H); ctx.clip();
    // 镜头冲击缩放 + 震屏
    ctx.save();
    if (this.zoom > 1.001) {
      ctx.translate(this.zoomFocus.x, this.zoomFocus.y);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.zoomFocus.x, -this.zoomFocus.y);
    }
    ctx.translate(this.fx.sx, this.fx.sy);
    this.world.renderBack(ctx, cam, t);
    this.renderGroundVfx(ctx);
    // 掉落宝箱
    for (var di = 0; di < this.drops.length; di++) this.renderDrop(ctx, this.drops[di]);
    // 敌人与英雄按 y 排序绘制
    var list = [];
    var i;
    for (i = 0; i < this.enemies.length; i++) list.push({ y: this.enemies[i].y, e: this.enemies[i] });
    for (i = 0; i < this.party.length; i++) list.push({ y: this.party[i].y, h: this.party[i] });
    list.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < this.afterimages.length; i++) this.renderAfterimage(ctx, this.afterimages[i]);
    for (i = 0; i < list.length; i++) {
      if (list[i].e) this.renderEnemy(ctx, list[i].e);
      else this.renderHero(ctx, list[i].h);
    }
    this.renderProjs(ctx);
    this.renderAirVfx(ctx);
    // 金币
    for (i = 0; i < this.coins.length; i++) {
      var c = this.coins[i];
      if (c.t < 0) continue;
      var w = Math.abs(Math.cos(c.t * 12)) * 7 + 1.5;
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = '#8a5a00';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(c.sx, c.sy, w, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    this.fx.renderParticles(ctx);
    this.world.renderFront(ctx, cam, t);
    this.world.renderLighting(ctx, this.cutin ? 0.2 : 0);
    this.fx.renderTexts(ctx);
    ctx.restore();
    G.vignette(ctx, '#000000', 0.45);
    // 首领登场黑边
    if (this.letterbox > 0.01) {
      var lb = this.letterbox * 70;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 540, lb);
      ctx.fillRect(0, VIEW_H - lb, 540, lb);
    }
    this.renderHud(ctx);
    this.renderBanner(ctx);
    if (this.cutin) this.renderCutin(ctx);
    this.fx.renderFlash(ctx);
    if (this.state === 'wiped') this.renderWipe(ctx);
    ctx.restore();
    this.renderPanel(ctx);
    if (this.iris) this.renderIris(ctx);
    if (this.offline) this.renderOffline(ctx);
    this.renderTutorial(ctx);
    void self;
  };

  Expedition.prototype.renderHero = function (ctx, h) {
    var sx = h.x - this.camX;
    if (h.dead) { S.drawTomb(ctx, sx, h.y, 1.2); return; }
    var lungeX = Math.sin(h.lunge * Math.PI) * 16;
    var leapY = h.leap > 0 ? -Math.sin((1 - h.leap) * Math.PI) * 140 : 0;
    var dashX = 0;
    if (h.dash) {
      h.dash.t += 1 / 60;
      var k = h.dash.t / h.dash.dur;
      dashX = Math.sin(Math.min(1, k) * Math.PI) * (h.dash.tx - h.x);
      if (k >= 1) h.dash = null;
    }
    if (h.energy >= 100) G.glow(ctx, sx, h.y - 30, 60, h.def.color, 0.35 + Math.sin(this.rt * 6) * 0.15);
    S.drawHero(ctx, sx + lungeX + dashX, h.y + leapY, {
      kind: h.def.kind, s: 1.3, face: 1, walk: h.walk, moving: this.state === 'walk', atk: h.atk, hurt: h.hurt,
    });
    if (h.hp < h.maxHp) G.bar(ctx, sx - 20, h.y - 84, 40, 5, h.hp / h.maxHp, h.hp / h.maxHp < 0.3 ? '#ff4a4a' : '#5ae05a', { border: false });
  };

  Expedition.prototype.renderAfterimage = function (ctx, a) {
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - a.t / a.dur);
    S.drawHero(ctx, a.x - this.camX, a.y, { kind: a.kind, s: 1.3, face: 1, walk: a.walk, moving: true, hurt: 0 });
    ctx.restore();
  };

  Expedition.prototype.renderEnemy = function (ctx, e) {
    var sx = e.x - this.camX;
    if (sx < -120 || sx > 680) return;
    var lift = e.M.fly ? 46 + Math.sin(e.phase * 4) * 6 : 0;
    var lungeX = -Math.sin(e.lunge * Math.PI) * 14;
    ctx.save();
    var y = e.y - lift;
    if (e.dying) {
      var k = e.dying / 0.5;
      ctx.globalAlpha = k;
      ctx.translate(sx, y);
      ctx.rotate((1 - k) * 0.6);
      ctx.translate(-sx, -y);
    }
    if (e.boss) G.glow(ctx, sx, y - e.size * 0.45, e.size * 1.1, e.tint || '#ff5a3a', 0.35 + Math.sin(this.rt * 3) * 0.1);
    if (e.M.fly) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, e.y, e.size * 0.3, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    S.blitMonster(ctx, e.type, sx + lungeX, y, e.size, e.phase, -1, e.tint, e.hurt > 0);
    if (e.marked) {
      G.text(ctx, '✕', sx, y - e.size * 0.5, { size: 40, weight: 'bold', align: 'center', color: '#d49bff', stroke: '#2a0a4a', strokeWidth: 5 });
    }
    ctx.restore();
    if (!e.dying && !e.boss && e.hp < e.max) {
      G.bar(ctx, sx - 22, y - e.size - 8, 44, 5, e.hp / e.max, '#e0402a', { border: false });
    }
  };

  Expedition.prototype.renderDrop = function (ctx, dr) {
    var R = Loot.RARITY[dr.rar];
    var sx, sy, sc = 0.42;
    if (dr.gone) {
      var k = U.easeInCubic(Math.min(1, dr.ft / 0.7));
      sx = U.lerp(dr.fsx, 202, k); sy = U.lerp(dr.fsy, VIEW_H + 254, k) - Math.sin(k * Math.PI) * 120;
      sc = 0.42 - k * 0.2;
    } else {
      sx = dr.x - this.camX; sy = dr.y;
      if (dr.landed) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var h = 260 + dr.rar * 60;
        var pg = ctx.createLinearGradient(0, GROUND - h, 0, GROUND);
        pg.addColorStop(0, U.rgba(R.color, 0));
        pg.addColorStop(1, U.rgba(R.color, 0.6));
        ctx.fillStyle = pg;
        var pw = 30 + dr.rar * 10 + Math.sin(this.rt * 5) * 4;
        ctx.fillRect(sx - pw / 2, GROUND - h, pw, h);
        ctx.restore();
        if (dr.rar >= 2) G.rays(ctx, sx, GROUND - 24, 110 + dr.rar * 20, R.color, this.rt, 10, 0.3);
      }
    }
    ER.drawChest(ctx, sx, sy, sc, 0, R.color, 0.6);
  };

  Expedition.prototype.renderGroundVfx = function (ctx) {
    for (var i = 0; i < this.vfx.length; i++) {
      var v = this.vfx[i];
      if (v.type === 'warnline') {
        var x0 = v.x0 - this.camX;
        var a = 0.35 + Math.sin(this.rt * 30) * 0.2;
        var grd = ctx.createLinearGradient(0, GROUND - 10, 0, GROUND + 30);
        grd.addColorStop(0, 'rgba(255,40,30,0)');
        grd.addColorStop(0.5, 'rgba(255,40,30,' + a + ')');
        grd.addColorStop(1, 'rgba(255,40,30,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, GROUND - 10, Math.max(0, x0), 40);
        G.text(ctx, '！地裂冲击', Math.max(80, x0 - 120), GROUND - 120, { size: 20, weight: 'bold', align: 'center', color: '#ff5a4a', stroke: '#000', strokeWidth: 4 });
      } else if (v.type === 'shockwave') {
        var sx = v.x - this.camX;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var g2 = ctx.createRadialGradient(sx, GROUND, 4, sx, GROUND, 70);
        g2.addColorStop(0, 'rgba(255,200,120,0.9)');
        g2.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.ellipse(sx, GROUND, 40, 70, 0, Math.PI, 0); ctx.fill();
        ctx.restore();
      }
    }
  };

  Expedition.prototype.renderAirVfx = function (ctx) {
    var cam = this.camX;
    for (var i = 0; i < this.vfx.length; i++) {
      var v = this.vfx[i];
      var k = Math.min(1, v.t / v.dur);
      ctx.save();
      if (v.type === 'arc') {
        ctx.globalCompositeOperation = 'lighter';
        var sx = v.x - cam;
        var a0 = -1.6 + k * 0.3, a1 = a0 + 2.6 * Math.min(1, k * 2.5);
        ctx.strokeStyle = U.rgba(v.c, 1 - k);
        ctx.lineWidth = 14 * (1 - k) + 2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(sx, v.y, v.r, a0, a1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, v.y, v.r + 4, a0, a1); ctx.stroke();
      } else if (v.type === 'xslash' || v.type === 'tapslash') {
        ctx.globalCompositeOperation = 'lighter';
        var x = v.x - cam, y = v.y;
        var L = (v.big ? 70 : v.type === 'tapslash' ? 46 : 36) * Math.min(1, k * 4);
        ctx.strokeStyle = U.rgba(v.c, 1 - k);
        ctx.lineCap = 'round';
        ctx.lineWidth = (v.big ? 8 : 5) * (1 - k) + 1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(v.a || 0);
        ctx.beginPath(); ctx.moveTo(-L, -L); ctx.lineTo(L, L);
        if (v.type !== 'tapslash') { ctx.moveTo(L, -L); ctx.lineTo(-L, L); }
        ctx.stroke();
        ctx.restore();
      } else if (v.type === 'pillar' || v.type === 'bigpillar') {
        ctx.globalCompositeOperation = 'lighter';
        var px = v.type === 'bigpillar' ? 270 : v.x - cam;
        var w = v.w * (v.type === 'bigpillar' ? 1 : (0.6 + Math.sin(k * Math.PI) * 0.4));
        var a = Math.sin(k * Math.PI);
        var g = ctx.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
        g.addColorStop(0, U.rgba(v.c, 0));
        g.addColorStop(0.5, U.rgba(v.c, 0.75 * a));
        g.addColorStop(1, U.rgba(v.c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(px - w / 2, 0, w, GROUND + 20);
        if (v.type === 'pillar' && Math.random() < 0.5) this.fx.burst(px + U.rand(-w / 3, w / 3), GROUND - U.rand(0, 200), { n: 1, color: '#fff2c0', speed: 60, angle: -Math.PI / 2, spread: 0.3, life: 0.6, size: 3 });
      } else if (v.type === 'meteor') {
        ctx.globalCompositeOperation = 'lighter';
        var mk = k;
        var mx = U.lerp(v.sx, v.tx, mk) - cam, my = U.lerp(v.sy, v.ty, mk * mk);
        var tail = ctx.createLinearGradient(mx, my, mx + 90, my - 120);
        tail.addColorStop(0, 'rgba(255,200,100,0.9)');
        tail.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.strokeStyle = tail;
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 90, my - 120); ctx.stroke();
        G.glow(ctx, mx, my, 40, '#ffb347', 1);
        ctx.fillStyle = '#fff6dc';
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill();
      } else if (v.type === 'rainarrow') {
        var ak = k;
        var ax = U.lerp(v.sx, v.tx, ak) - cam;
        var ay = U.lerp(v.sy, v.ty, ak) - Math.sin(ak * Math.PI) * 220;
        var nx = U.lerp(v.sx, v.tx, Math.min(1, ak + 0.03)) - cam, ny = U.lerp(v.sy, v.ty, Math.min(1, ak + 0.03)) - Math.sin(Math.min(1, ak + 0.03) * Math.PI) * 220;
        var ang = Math.atan2(ny - ay, nx - ax);
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.strokeStyle = '#e8f8ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(4, 0); ctx.stroke();
        ctx.fillStyle = '#9ff0ff';
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(1, -3.5); ctx.lineTo(1, 3.5); ctx.closePath(); ctx.fill();
      } else if (v.type === 'skyslash') {
        ctx.globalCompositeOperation = 'lighter';
        var sk = k;
        var cx = 330;
        ctx.translate(cx, GROUND - 120);
        ctx.rotate(-0.35);
        var len = 700 * Math.min(1, sk * 4);
        var th = 60 * (1 - sk);
        var sg = ctx.createLinearGradient(0, -th, 0, th);
        sg.addColorStop(0, 'rgba(160,200,255,0)');
        sg.addColorStop(0.5, 'rgba(255,255,255,' + (1 - sk) + ')');
        sg.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -th * 2, len / 2, 0); ctx.quadraticCurveTo(0, th * 0.6, -len / 2, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (1 - sk) + ')';
        ctx.fillRect(-len / 2, -2, len, 4);
      }
      ctx.restore();
    }
  };

  Expedition.prototype.renderProjs = function (ctx) {
    var cam = this.camX;
    for (var i = 0; i < this.projs.length; i++) {
      var p = this.projs[i];
      var sx = p.x - cam;
      ctx.save();
      if (p.kind === 'arrow') {
        ctx.strokeStyle = 'rgba(160,240,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx - 60, p.y); ctx.lineTo(sx, p.y); ctx.stroke();
        ctx.strokeStyle = '#e8f8ff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx - 20, p.y); ctx.lineTo(sx, p.y); ctx.stroke();
        ctx.fillStyle = p.crit ? '#ffd24a' : '#9ff0ff';
        ctx.beginPath(); ctx.moveTo(sx + 8, p.y); ctx.lineTo(sx, p.y - 4); ctx.lineTo(sx, p.y + 4); ctx.closePath(); ctx.fill();
      } else if (p.kind === 'fireball') {
        G.glow(ctx, sx, p.y, 34, '#ff7a2a', 1);
        ctx.fillStyle = '#fff2c0';
        ctx.beginPath(); ctx.arc(sx, p.y, 7, 0, Math.PI * 2); ctx.fill();
      } else {
        G.glow(ctx, sx, p.y, 22, '#bfffd8', 1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };

  Expedition.prototype.renderHud = function (ctx) {
    var self = this, s = this.save, B = this.world.B;
    var tg = ctx.createLinearGradient(0, 0, 0, 90);
    tg.addColorStop(0, 'rgba(0,0,0,0.7)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, 540, 90);
    this.ui.button(ctx, 10, 10, 46, 40, '‹', function () { self.persist(); self.app.goto(new ER.MenuScene()); }, { color: '#3a3346', size: 26, id: 'back' });
    G.text(ctx, s.ch + '-' + s.st, 68, 24, { size: 22, weight: 'bold', color: '#fff', stroke: '#000', strokeWidth: 4 });
    G.text(ctx, B.name + (s.farm ? ' · 刷怪中' : ''), 118, 24, { size: 15, color: s.farm ? '#9fd0ff' : B.accent, stroke: '#000', strokeWidth: 3 });
    // 关卡进度：10 关节点
    for (var i = 1; i <= 10; i++) {
      var x = 70 + (i - 1) * 26, y = 48;
      var boss = i === 5 || i === 10;
      var done = i < s.st, cur = i === s.st;
      ctx.beginPath();
      if (boss) { ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); }
      else ctx.arc(x, y, cur ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = done ? B.accent : cur ? '#ffffff' : 'rgba(255,255,255,0.25)';
      ctx.fill();
      if (cur) { ctx.strokeStyle = B.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10 + Math.sin(this.rt * 5) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
      if (i < 10) { ctx.fillStyle = done ? U.rgba(B.accent, 0.6) : 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 7, y - 1, 12, 2); }
    }
    // 金币
    var gb = 1 + (this.goldBump || 0) * 0.25;
    ctx.save();
    ctx.translate(450, 26);
    ctx.scale(gb, gb);
    G.glow(ctx, 0, 0, 22, '#ffd24a', 0.5);
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    G.text(ctx, U.fmt(this.goldShown), 466, 27, { size: 20, weight: 'bold', color: '#ffe9a0', stroke: '#000', strokeWidth: 4 });
    G.text(ctx, '团队DPS ' + U.fmt(this.teamDps()), 530, 52, { size: 13, align: 'right', color: '#ddd', stroke: '#000', strokeWidth: 3 });
    if (this.speedMul() > 1) G.text(ctx, '2倍速 ' + U.fmtTime((s.speedUntil - P.now()) / 1000), 530, 70, { size: 13, weight: 'bold', align: 'right', color: '#7dffef', stroke: '#000', strokeWidth: 3 });
    // 首领血条
    var b = this.boss;
    if (b && !b.dying && this.state !== 'intro') {
      var bars = b.big ? 5 : 3;
      var per = b.max / bars;
      var idx = Math.ceil(b.hp / per) - 1;
      var frac = (b.hp - idx * per) / per;
      var y0 = 90;
      G.text(ctx, b.name, 270, y0, { size: 18, weight: 'bold', align: 'center', color: '#ff8a6a', stroke: '#000', strokeWidth: 4 });
      G.roundRect(ctx, 50, y0 + 14, 440, 18, 9);
      ctx.fillStyle = idx > 0 ? BAR_COLORS[(idx - 1) % BAR_COLORS.length] : 'rgba(0,0,0,0.6)';
      ctx.fill();
      if (frac > 0) {
        G.roundRect(ctx, 50, y0 + 14, Math.max(18, 440 * frac), 18, 9);
        ctx.fillStyle = BAR_COLORS[idx % BAR_COLORS.length];
        ctx.fill();
      }
      G.roundRect(ctx, 50, y0 + 14, 440, 18, 9);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      if (idx > 0) G.text(ctx, '×' + (idx + 1), 498, y0 + 23, { size: 16, weight: 'bold', color: '#fff', stroke: '#000', strokeWidth: 3 });
      G.text(ctx, '限时 ' + Math.ceil(Math.max(0, this.bossT)) + 's', 270, y0 + 46, { size: 14, weight: 'bold', align: 'center', color: this.bossT < 10 ? '#ff5a5a' : '#ffd27a', stroke: '#000', strokeWidth: 3 });
    }
    // 连击
    if (this.combo >= 3 && this.rt - this.comboT < 1.2) {
      var ck = 1 + Math.max(0, 0.3 - (this.rt - this.comboT) * 2);
      ctx.save();
      ctx.translate(470, 170);
      ctx.scale(ck, ck);
      ctx.rotate(-0.08);
      G.text(ctx, this.combo + '', 0, 0, { size: 44, weight: 'bold', align: 'center', color: '#ffd24a', stroke: '#5a2000', strokeWidth: 6 });
      G.text(ctx, '连击', 0, 32, { size: 18, weight: 'bold', align: 'center', color: '#fff', stroke: '#000', strokeWidth: 4 });
      ctx.restore();
    }
    // 新英雄加入
    if (this.newHero && this.newHero.t > 0) {
      var nk = this.newHero.t;
      var a = Math.min(1, nk * 3, (3.2 - nk) * 2);
      ctx.save();
      ctx.globalAlpha = a;
      G.panel(ctx, 70, 180, 400, 150, { border: this.newHero.def.color, glow: this.newHero.def.color });
      S.drawHero(ctx, 140, 310, { kind: this.newHero.def.kind, s: 2.2, face: 1, walk: this.rt * 3 });
      G.text(ctx, '新英雄加入！', 330, 222, { size: 22, weight: 'bold', align: 'center', color: '#ffd27a' });
      G.text(ctx, this.newHero.def.name, 330, 262, { size: 32, weight: 'bold', align: 'center', color: this.newHero.def.color, stroke: '#000', strokeWidth: 5 });
      G.text(ctx, this.newHero.def.title + ' · 必杀「' + this.newHero.def.ult + '」', 330, 298, { size: 15, align: 'center', color: '#ddd' });
      ctx.restore();
    }
  };

  Expedition.prototype.renderBanner = function (ctx) {
    var b = this.banner;
    if (!b) return;
    var life = b.t;
    var a = Math.min(1, life * 3);
    if (!b.max) b.max = life;
    var inK = U.easeOutBack(Math.min(1, (b.max - life) * 4));
    ctx.save();
    ctx.globalAlpha = a;
    var y = b.big ? 300 : 250;
    var h = b.big ? 110 : 76;
    var bg = ctx.createLinearGradient(0, 0, 540, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.2, 'rgba(0,0,0,0.7)');
    bg.addColorStop(0.8, 'rgba(0,0,0,0.7)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, y - h / 2, 540, h * Math.min(1, inK));
    ctx.fillStyle = U.rgba(b.c, 0.8);
    ctx.fillRect(0, y - h / 2, 540 * inK, 2);
    ctx.fillRect(540 * (1 - inK), y + h / 2 - 2, 540, 2);
    var sc = 0.6 + inK * 0.4;
    ctx.translate(270, y - (b.sub ? 10 : 0));
    ctx.scale(sc, sc);
    G.text(ctx, b.s, 0, 0, { size: b.big ? 46 : 34, weight: 'bold', align: 'center', color: b.c, stroke: '#000', strokeWidth: 7 });
    if (b.shine) {
      // 扫光
      var sk = ((b.max - life) * 1.2) % 1.4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sx = -260 + sk * 400;
      var sg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 30, -30, 60, 60);
      ctx.restore();
    }
    if (b.sub) G.text(ctx, b.sub, 0, b.big ? 44 : 34, { size: 18, align: 'center', color: '#fff', stroke: '#000', strokeWidth: 4 });
    ctx.restore();
  };

  Expedition.prototype.renderCutin = function (ctx) {
    var c = this.cutin, h = c.hero, def = h.def;
    var t = c.t, dur = c.dur;
    var inK = U.easeOutCubic(Math.min(1, t / 0.16));
    var outK = t > dur - 0.18 ? U.easeInCubic((t - (dur - 0.18)) / 0.18) : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + 0.6 * (1 - outK) + ')';
    ctx.fillRect(0, 0, 540, VIEW_H);
    var off = (1 - inK) * -620 + outK * 620;
    ctx.translate(off, 0);
    // 斜切色带
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-40, 250); ctx.lineTo(600, 170); ctx.lineTo(600, 380); ctx.lineTo(-40, 470); ctx.closePath();
    var bg = ctx.createLinearGradient(0, 170, 0, 470);
    bg.addColorStop(0, U.mix(def.color, '#000000', 0.2));
    bg.addColorStop(0.5, U.mix(def.color, '#000000', 0.55));
    bg.addColorStop(1, U.mix(def.color, '#000000', 0.8));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();
    // 速度线
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (var i = 0; i < 26; i++) {
      var ly = 160 + U.hash2(i, 9) * 320;
      var lx = ((U.hash2(9, i) * 900 - t * 2400) % 900 + 900) % 900 - 200;
      ctx.lineWidth = 1 + U.hash2(i, 2) * 3;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 120 + U.hash2(i, 5) * 160, ly - 20); ctx.stroke();
    }
    // 英雄大立绘
    G.glow(ctx, 150, 330, 220, def.color, 0.5);
    S.drawHero(ctx, 150 + t * 20, 470, { kind: def.kind, s: 3.6, face: 1, walk: 0, atk: Math.max(0, 1 - t * 1.5) });
    ctx.restore();
    // 边线
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-40, 250); ctx.lineTo(600, 170); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-40, 470); ctx.lineTo(600, 380); ctx.stroke();
    // 技能名
    var tk = U.easeOutBack(U.clamp((t - 0.12) / 0.25, 0, 1));
    ctx.save();
    ctx.translate(380, 300);
    ctx.rotate(-0.12);
    ctx.scale(tk, tk);
    G.text(ctx, '必杀技', -10, -52, { size: 20, weight: 'bold', align: 'center', color: '#fff', stroke: '#000', strokeWidth: 4 });
    G.text(ctx, def.ult, 0, 0, { size: 46, weight: 'bold', align: 'center', color: '#fff6dc', stroke: U.mix(def.color, '#000000', 0.5), strokeWidth: 9 });
    G.text(ctx, def.name + ' · ' + def.title, 20, 44, { size: 17, align: 'center', color: '#fff', stroke: '#000', strokeWidth: 3 });
    ctx.restore();
    ctx.restore();
  };

  Expedition.prototype.renderIris = function (ctx) {
    var k = this.iris.t / this.iris.dur;
    var r = k < 0.5 ? U.lerp(700, 0, U.easeInCubic(k * 2)) : U.lerp(0, 700, U.easeOutCubic((k - 0.5) * 2));
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, 540, 960);
    ctx.arc(300, 420, Math.max(0.1, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  };

  Expedition.prototype.renderWipe = function (ctx) {
    var self = this;
    var a = Math.min(1, this.wipeT * 2);
    ctx.fillStyle = 'rgba(10,6,14,' + 0.75 * a + ')';
    ctx.fillRect(0, 0, 540, VIEW_H);
    G.text(ctx, '小队败退……', 270, 250, { size: 42, weight: 'bold', align: 'center', color: '#ff7a6a', stroke: '#000', strokeWidth: 6 });
    G.text(ctx, this.save.farm ? '首领太强了，先回上一关刷怪升级' : '升级英雄后再来', 270, 300, { size: 18, align: 'center', color: '#ddd' });
    if (this.wipeT > 0.6) {
      this.ui.button(ctx, 150, 350, 240, 70, '重整旗鼓', function () { self.recover(); }, { color: '#c8602a', size: 26, id: 'recover' });
    }
  };

  // ---------------- 底部面板 ----------------
  Expedition.prototype.renderPanel = function (ctx) {
    var self = this, s = this.save;
    var top = VIEW_H;
    var bg = ctx.createLinearGradient(0, top, 0, 960);
    bg.addColorStop(0, '#2a2030');
    bg.addColorStop(1, '#0e0a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, 540, 960 - top);
    // 装饰边
    var eg = ctx.createLinearGradient(0, 0, 540, 0);
    eg.addColorStop(0, 'rgba(255,190,110,0)');
    eg.addColorStop(0.5, 'rgba(255,190,110,0.9)');
    eg.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, top, 540, 3);
    ctx.save();
    ctx.translate(270, top + 1);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();

    // 英雄卡片
    for (var i = 0; i < HEROES.length; i++) {
      var def = HEROES[i];
      var hs = s.heroes[def.id];
      var x = 8 + i * 106, y = top + 14, w = 100, h = 196;
      var hero = null;
      for (var k = 0; k < this.party.length; k++) if (this.party[k].def === def) hero = this.party[k];
      G.panel(ctx, x, y, w, h, { radius: 12, border: hs ? U.rgba(def.color, 0.6) : 'rgba(255,255,255,0.1)', lineWidth: 2 });
      if (!hs) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        S.drawHero(ctx, x + 50, y + 100, { kind: def.kind, s: 1.3, face: 1 });
        ctx.restore();
        ctx.fillStyle = '#8a8296'; ctx.strokeStyle = '#8a8296'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x + 50, y + 112, 9, Math.PI, 0); ctx.stroke();
        G.roundRect(ctx, x + 37, y + 112, 26, 20, 4); ctx.fill();
        G.text(ctx, def.name, x + 50, y + 152, { size: 15, weight: 'bold', align: 'center', color: '#777' });
        G.text(ctx, '第 ' + Math.ceil(def.unlock / 10) + '-' + (((def.unlock - 1) % 10) + 1) + ' 关解锁', x + 50, y + 174, { size: 12, align: 'center', color: '#666' });
        continue;
      }
      // 头像 + 必杀能量环（点头像释放必杀）
      var cx = x + 50, cy = y + 52, r = 38;
      var ready = hero && hero.energy >= 100 && !hero.dead;
      var pressed = this.ui.hotspot('ult-' + def.id, cx - r, cy - r, r * 2, r * 2, (function (hh) { return function () { if (hh) self.castUlt(hh); }; })(hero), !ready || this.state !== 'fight');
      ctx.save();
      if (pressed) { ctx.translate(cx, cy); ctx.scale(0.94, 0.94); ctx.translate(-cx, -cy); }
      if (ready) G.glow(ctx, cx, cy, 64, def.color, 0.55 + Math.sin(this.rt * 8) * 0.2);
      ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fillStyle = U.mix(def.color, '#000000', 0.6);
      ctx.fill();
      ctx.save();
      ctx.clip();
      S.drawHero(ctx, cx - 4, cy + 62, { kind: def.kind, s: 1.75, face: 1, walk: 0, hurt: hero ? hero.hurt : 0 });
      if (hero && hero.dead) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
      ctx.restore();
      var en = hero ? hero.energy / 100 : 0;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ready ? '#fff6dc' : def.color;
      ctx.beginPath(); ctx.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * en); ctx.stroke();
      ctx.restore();
      if (ready) G.text(ctx, '必杀', cx, cy - r + 8, { size: 14, weight: 'bold', align: 'center', color: '#fff', stroke: def.color, strokeWidth: 4 });
      G.text(ctx, def.name, cx, y + 106, { size: 16, weight: 'bold', align: 'center', color: def.color });
      G.text(ctx, 'Lv.' + hs.lvl, cx, y + 126, { size: 13, align: 'center', color: '#fff' });
      G.text(ctx, '秒伤 ' + U.fmt(hero ? hero.dps : 0), cx, y + 144, { size: 12, align: 'center', color: '#bbb' });
      var cost = upCost(def, hs.lvl);
      var can = s.gold >= cost;
      this.ui.button(ctx, x + 6, y + 154, w - 12, 36, '升级', (function (d2, c2) {
        return function () { self.levelUp(d2, c2); };
      })(def, cost), { color: can ? '#2f9e4a' : '#3a3346', size: 15, sub: U.fmt(cost), disabled: !can, id: 'up-' + def.id, radius: 8 });
    }
    // 功能按钮
    var by = top + 224;
    this.ui.button(ctx, 8, by, 124, 60, s.auto ? '自动必杀' : '手动必杀', function () { s.auto = !s.auto; self.persist(); }, {
      color: s.auto ? '#c8602a' : '#3a3346', size: 18, sub: s.auto ? '已开启' : '点头像释放', id: 'auto',
    });
    var nc = s.chests.length;
    if (this.chestBump > 0 || nc) G.glow(ctx, 202, by + 30, 80 + this.chestBump * 40, '#ffd24a', 0.2 + this.chestBump * 0.5);
    this.ui.button(ctx, 140, by, 124, 60, '宝箱 ×' + nc, function () { self.openChest(); }, { color: '#a0501e', size: 18, sub: nc ? '点击开启' : '击败首领必掉', disabled: !nc, id: 'chest', pulse: nc > 0 });
    if (this.speedMul() > 1) {
      this.ui.button(ctx, 272, by, 124, 60, '2倍速中', function () {}, { color: '#2a6a7a', size: 18, sub: U.fmtTime((s.speedUntil - P.now()) / 1000), id: 'speed' });
    } else {
      this.ui.button(ctx, 272, by, 124, 60, '2倍速', function () {
        ER.ads.show('10 分钟 2 倍速推图').then(function (ok) { if (ok) { s.speedUntil = P.now() + 10 * 60 * 1000; self.persist(); A.play('ult'); } });
      }, { color: '#2a6a7a', size: 18, ad: true, sub: '10 分钟', id: 'speed' });
    }
    if (s.farm) {
      this.ui.button(ctx, 404, by, 128, 60, '挑战首领', function () { self.challengeBoss(); }, { color: '#b8322a', size: 18, sub: '再试一次', pulse: true, id: 'boss' });
    } else {
      this.ui.button(ctx, 404, by, 128, 60, '金币礼包', function () {
        ER.ads.show('立即获得 5 分钟挂机金币').then(function (ok) {
          if (!ok) return;
          var g = goldPer(self.gi()) * 90;
          s.gold += g;
          for (var c = 0; c < 30; c++) self.spawnCoin(self.camX + U.rand(150, 450), GROUND - U.rand(100, 300), c * 0.01);
          self.persist();
        });
      }, { color: '#8a6a1a', size: 18, ad: true, sub: '5 分钟收益', id: 'goldpack' });
    }
    G.text(ctx, '点击战场可以亲手补刀 · 连击越高伤害越高', 270, 944, { size: 13, align: 'center', color: '#6a5a60' });
  };

  Expedition.prototype.levelUp = function (def, cost) {
    var s = this.save;
    if (s.gold < cost) return;
    s.gold -= cost;
    s.heroes[def.id].lvl++;
    this.buildParty();
    var h = null;
    for (var i = 0; i < this.party.length; i++) if (this.party[i].def === def) h = this.party[i];
    if (h) {
      var sx = h.x - this.camX;
      this.fx.burst(sx, h.y - 30, { n: 30, colors: [def.color, '#ffffff', '#ffd24a'], speed: 260, angle: -Math.PI / 2, spread: 1, life: 0.7 });
      this.fx.ring(sx, h.y - 30, 6, 70, def.color, 0.4, 5);
      this.fx.text(sx, h.y - 100, '升级！', { color: '#ffd24a', size: 22, crit: true });
      this.world.addLight(sx, h.y - 40, 160, def.color, 1);
    }
    A.play('levelup', 0.06);
    if (!s.tut.up) s.tut.up = 1;
    this.persist();
  };

  Expedition.prototype.openChest = function () {
    var self = this, s = this.save;
    if (!s.chests.length) return;
    var rar = s.chests.shift();
    var ids = Object.keys(s.heroes);
    var owner = U.pick(ids);
    var def = HERO_BY_ID[owner];
    var item = Loot.makeItem({ slot: 'weapon', ilvl: 4 + this.gi() * 2, rarity: rar, owner: owner });
    var cur = s.heroes[owner].item || null;
    var rv = new ER.LootReveal({
      item: item, title: def.name + ' 的新武器！', ownerName: def.name + ' · ' + def.title, compare: cur,
      actions: function (scene) {
        var it = scene.item;
        var sell = Math.round(goldPer(self.gi()) * (4 + it.rarity * 8));
        return [
          { label: '装备', color: '#2f9e4a', sub: '秒伤提升', onClick: function () { s.heroes[owner].item = it; self.buildParty(); self.persist(); scene.close(); } },
          { label: '卖出', color: '#5a4a6a', sub: '+' + U.fmt(sell) + ' 金币', onClick: function () { s.gold += sell; self.persist(); scene.close(); } },
        ];
      },
    });
    this.app.push(rv);
    this.persist();
  };

  Expedition.prototype.renderOffline = function (ctx) {
    var self = this, o = this.offline;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, 540, 960);
    G.panel(ctx, 40, 240, 460, 440, { border: '#ffb347', glow: '#ff8a1f' });
    S.drawHero(ctx, 120, 400, { kind: 'warrior', s: 1.8, face: 1, walk: this.rt * 8, moving: true });
    S.drawHero(ctx, 420, 400, { kind: 'mage', s: 1.8, face: -1, walk: this.rt * 8, moving: true });
    G.text(ctx, '远征归来！', 270, 290, { size: 30, weight: 'bold', align: 'center', color: '#ffd27a' });
    G.text(ctx, '离开 ' + U.fmtDuration(o.sec) + '，小队一直在战斗', 270, 330, { size: 16, align: 'center', color: '#ddd' });
    G.text(ctx, '击败 ' + U.fmt(o.kills), 270, 380, { size: 20, align: 'center', color: '#fff' });
    G.text(ctx, '金币 +' + U.fmt(o.gold), 270, 420, { size: 26, weight: 'bold', align: 'center', color: '#ffe14a' });
    G.text(ctx, '宝箱 +' + o.chests, 270, 460, { size: 22, weight: 'bold', align: 'center', color: '#ffb347' });
    this.ui.button(ctx, 70, 510, 400, 84, '翻倍领取', function () {
      ER.ads.show('离线收益翻倍').then(function (ok) { self.claimOffline(ok ? 2 : 1); });
    }, { color: '#7a3fd0', size: 28, ad: true, sub: '金币和宝箱 ×2', pulse: true, id: 'off2' });
    this.ui.button(ctx, 170, 610, 200, 52, '直接领取', function () { self.claimOffline(1); }, { color: '#4a4452', size: 18, id: 'off1' });
  };

  Expedition.prototype.renderTutorial = function (ctx) {
    var s = this.save;
    if (this.offline || this.cutin || this.iris) return;
    if (!s.tut.tap && this.state === 'fight' && this.t > 1) {
      var e = this.enemies.filter(function (x) { return !x.dying && !x.introY; })[0];
      if (e) {
        G.tip(ctx, '英雄会自动战斗。点击怪物可以亲手补刀！', 270, 140, 420);
        G.hand(ctx, e.x - this.camX, e.y - e.size * 0.5, this.rt);
      }
      return;
    }
    if (s.tut.tap && !s.tut.up) {
      var cheapest = null;
      for (var i = 0; i < HEROES.length; i++) {
        var def = HEROES[i];
        if (s.heroes[def.id] && s.gold >= upCost(def, s.heroes[def.id].lvl)) { cheapest = i; break; }
      }
      if (cheapest != null) {
        G.tip(ctx, '金币够了！升级英雄，秒伤大幅提升', 270, 560, 400);
        G.hand(ctx, 8 + cheapest * 106 + 50, VIEW_H + 14 + 172, this.rt);
      }
    }
  };

  ER.Games = ER.Games || {};
  ER.Games.idle = { title: '余烬远征', create: function () { return new Expedition(); } };
  ER.Games.expedition = ER.Games.idle;
})();
