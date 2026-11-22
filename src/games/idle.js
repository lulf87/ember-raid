/**
 * 原型 B：《酒馆挂机录》—— 放置刷宝 + 开箱配装
 * 小队自动推图，掉落宝箱与金币；开箱自动换上更强装备，战力飙升；离线也在刷。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, Loot = ER.Loot, A = ER.audio, P = ER.platform;
  var SAVE_KEY = 'er_idle_v1';
  var SLOT_ORDER = ['weapon', 'helm', 'chest', 'hands', 'ring', 'trinket'];
  var LANE_TOP = 80, GROUND = 372, LANE_BOTTOM = 430;
  var KILLS_PER_ZONE = 8;
  var BOSS_TIME = 30;
  var OFFLINE_CAP = 8 * 3600;

  var ZONES = [
    { name: '灰石矿坑', sky: ['#2a2238', '#4a3a4a'], hill: '#1e1826', ground: '#3a2e2a', mob: '#9a8a6a' },
    { name: '低语林地', sky: ['#12263a', '#2a4a4a'], hill: '#0e1e22', ground: '#1e3020', mob: '#6ad06a' },
    { name: '沉锚海湾', sky: ['#0e2a4a', '#3a6a8a'], hill: '#0a1a2a', ground: '#3a3a2a', mob: '#4ac0d0' },
    { name: '焦土裂谷', sky: ['#3a1208', '#8a3a1a'], hill: '#2a0a04', ground: '#3a1a10', mob: '#ff7a3a' },
    { name: '霜息冻原', sky: ['#1a2a4a', '#8aa8c8'], hill: '#2a3a5a', ground: '#c8d8e8', mob: '#a8e0ff' },
    { name: '星坠高地', sky: ['#0a0a2a', '#3a2a6a'], hill: '#14102a', ground: '#2a2440', mob: '#c08aff' },
  ];

  function zoneDef(z) { return ZONES[(z - 1) % ZONES.length]; }

  function defaultSave() {
    var gear = {};
    gear.weapon = Loot.makeItem({ slot: 'weapon', ilvl: 3, rarity: 0 });
    return { zone: 1, kill: 0, lvl: 1, gold: 0, chests: 3, gear: gear, last: P.now(), speedUntil: 0, totalKills: 0, farming: false, opened: 0 };
  }
  function loadSave() {
    var s = P.storage.get(SAVE_KEY, null);
    if (!s || !s.gear) s = defaultSave();
    if (s.tut == null) s.tut = 0;
    return s;
  }

  function gearPower(save) {
    var p = 0;
    for (var k in save.gear) if (save.gear[k]) p += save.gear[k].power;
    return p;
  }
  function dpsOf(save) { return (10 + save.lvl * 5) * (1 + gearPower(save) / 40); }
  function powerOf(save) { return Math.round(dpsOf(save) * 10); }
  function mobHp(zone, boss) { return Math.round(24 * Math.pow(1.22, zone - 1) * (boss ? 6 : 1)); }
  function goldPer(zone) { return Math.round(4 * Math.pow(1.18, zone - 1)); }
  function upCost(lvl) { return Math.round(15 * Math.pow(1.21, lvl - 1)); }
  function ilvlFor(zone) { return 4 + zone * 3; }

  // ------------------------------------------------------------------ 绘制
  var HERO_KINDS = ['warrior', 'mage', 'priest'];
  var MOB_TYPES = ['imp', 'ghoul', 'bat'];
  function drawHero(ctx, x, y, kind, t, atk, walking) {
    ER.Sprites.drawHero(ctx, x, y, { kind: HERO_KINDS[kind], s: 1.25, face: 1, walk: t * (walking ? 10 : 2) + x, moving: walking, atk: atk });
  }
  function drawMob(ctx, x, y, col, s, t, boss, hurt, seed) {
    var type = boss ? 'brute' : MOB_TYPES[seed % MOB_TYPES.length];
    var size = boss ? 120 : (type === 'bat' ? 50 : 62);
    var lift = type === 'bat' ? 10 : 0;
    if (boss) G.glow(ctx, x, y - 60, 110, col, 0.45);
    ctx.save();
    ctx.translate(x, y - lift);
    ctx.scale(s, s);
    ER.Sprites.blitMonster(ctx, type, 0, 0, size, t * 1.2 + seed * 0.13, -1, col, hurt > 0);
    if (boss) {
      ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#1b1222'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-22, -112); ctx.lineTo(-18, -130); ctx.lineTo(-9, -118); ctx.lineTo(-2, -134); ctx.lineTo(5, -118); ctx.lineTo(14, -130); ctx.lineTo(16, -112);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================== 主场景
  function IdleScene() {
    this.save = loadSave();
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.scroll = 0;
    this.mob = null;
    this.atkAnim = [0, 0, 0];
    this.hitT = 0;
    this.saveT = 0;
    this.coins = [];
    this.goldShown = this.save.gold;
    this.powerShown = powerOf(this.save);
    this.openQueue = 0;
    this.openT = 0;
    this.rolling = null;
    this.recent = [];
    this.toast = null;
    this.bossT = 0;
    this.offline = this.computeOffline();
    this.flyers = [];
    this.slotFlash = {};
    this.chestBump = 0;
    this.spawnMob();
  }

  IdleScene.prototype.computeOffline = function () {
    var s = this.save;
    var elapsed = Math.min(OFFLINE_CAP, (P.now() - (s.last || P.now())) / 1000);
    if (elapsed < 60) return null;
    // 估算：每次击杀 = 走路 1.6 秒 + 战斗时间，离线效率 60%
    var killTime = 1.6 + mobHp(s.zone, false) / dpsOf(s);
    var kills = Math.floor((elapsed / killTime) * 0.6);
    if (kills <= 0) return null;
    return { sec: elapsed, kills: kills, gold: kills * goldPer(s.zone), chests: Math.min(40, Math.max(1, Math.floor(kills * 0.02))) };
  };

  IdleScene.prototype.claimOffline = function (mult) {
    var o = this.offline;
    if (!o) return;
    this.save.gold += o.gold * mult;
    this.save.chests += o.chests * mult;
    this.save.totalKills += o.kills;
    this.offline = null;
    A.play('coin');
    A.play('loot2');
    for (var i = 0; i < 24; i++) this.coins.push(this.makeCoin(270 + U.rand(-80, 80), 480 + U.rand(-40, 40)));
    this.persist();
  };

  IdleScene.prototype.persist = function () {
    this.save.last = P.now();
    P.storage.set(SAVE_KEY, this.save);
  };
  IdleScene.prototype.onHide = function () { this.persist(); };
  IdleScene.prototype.exit = function () { this.persist(); };

  IdleScene.prototype.isBossWave = function () { return !this.save.farming && this.save.kill >= KILLS_PER_ZONE; };

  IdleScene.prototype.spawnMob = function () {
    var boss = this.isBossWave();
    var hp = mobHp(this.save.zone, boss);
    this.mob = { x: 600, hp: hp, max: hp, boss: boss, hurt: 0, seed: U.randi(0, 99), dying: 0 };
    if (boss) this.bossT = BOSS_TIME;
  };

  IdleScene.prototype.speed = function () { return P.now() < (this.save.speedUntil || 0) ? 2 : 1; };

  IdleScene.prototype.makeCoin = function (x, y) {
    return { x: x, y: y, vx: U.rand(-120, 120), vy: U.rand(-320, -160), t: 0, sx: x, sy: y, phase: 0 };
  };

  IdleScene.prototype.update = function (dt) {
    if (this.offline) { this.t += dt; return; }
    var sp = this.speed();
    var d = dt * sp;
    this.t += dt;
    this.fx.update(dt);
    this.saveT += dt;
    if (this.saveT > 5) { this.saveT = 0; this.persist(); }
    var s = this.save;
    var m = this.mob;
    for (var i = 0; i < 3; i++) this.atkAnim[i] = Math.max(0, this.atkAnim[i] - d * 3);
    if (m.dying > 0) {
      m.dying -= d;
      if (m.dying <= 0) this.spawnMob();
    } else if (m.x > 300) {
      m.x -= 230 * d;
      this.scroll += 90 * d;
    } else {
      // 战斗：每 0.25 秒结算一次伤害
      this.hitT -= d;
      if (this.hitT <= 0) {
        this.hitT = 0.25;
        var who = U.randi(0, 2);
        this.atkAnim[who] = 1;
        var crit = Math.random() < 0.15;
        var dmg = Math.round(dpsOf(s) * 0.25 * (crit ? 2.2 : 1) * U.rand(0.85, 1.15));
        m.hp -= dmg;
        m.hurt = 0.08;
        this.fx.text(m.x + U.rand(-20, 20), GROUND - 70 - (m.boss ? 40 : 0), (crit ? '暴击 ' : '') + U.fmt(dmg), {
          color: crit ? '#ffe14a' : '#fff', size: crit ? 24 : 17, crit: crit, life: 0.7,
        });
        this.fx.burst(m.x - 10, GROUND - 30, { n: crit ? 10 : 4, color: who === 1 ? '#ff8a3a' : who === 2 ? '#bfffcf' : '#ffffff', speed: 200, life: 0.3 });
        A.play(crit ? 'crit' : 'hitSoft', 0.08);
        if (m.hp <= 0) this.killMob();
      }
      m.hurt = Math.max(0, m.hurt - d);
      if (m.boss) {
        this.bossT -= d;
        if (this.bossT <= 0 && m.hp > 0) {
          // 首领战失败：进入刷怪模式
          s.farming = true;
          s.kill = 0;
          this.toast = { s: '首领太强了！先刷怪变强，再来挑战', t: 2.5, c: '#ff8a6a' };
          A.play('error');
          this.spawnMob();
        }
      }
    }
    // 金币飞向顶部金币栏
    for (var c = this.coins.length - 1; c >= 0; c--) {
      var co = this.coins[c];
      co.t += dt;
      if (co.t < 0.45) {
        co.vy += 900 * dt;
        co.x += co.vx * dt; co.y += co.vy * dt;
      } else {
        var k = Math.min(1, (co.t - 0.45) * 2.6);
        co.x = U.lerp(co.x, 120, k * 0.35);
        co.y = U.lerp(co.y, 36, k * 0.35);
        if (k >= 1 || U.dist(co.x, co.y, 120, 36) < 10) { this.coins.splice(c, 1); A.play('coin', 0.05); }
      }
    }
    this.goldShown = U.damp(this.goldShown, s.gold, 6, dt);
    this.powerShown = U.damp(this.powerShown, powerOf(s), 5, dt);
    this.updateOpening(dt);
    this.updateFlyers(dt);
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
  };

  var OPEN_BTN = { x: 166, y: LANE_BOTTOM + 346 };
  IdleScene.prototype.slotPos = function (slot) {
    var i = SLOT_ORDER.indexOf(slot);
    return { x: 16 + (i % 3) * 172 + 38, y: LANE_BOTTOM + 96 + Math.floor(i / 3) * 98 + 44 };
  };
  IdleScene.prototype.updateFlyers = function (dt) {
    this.chestBump = Math.max(0, this.chestBump - dt * 4);
    for (var k in this.slotFlash) { this.slotFlash[k] -= dt; if (this.slotFlash[k] <= 0) delete this.slotFlash[k]; }
    for (var i = this.flyers.length - 1; i >= 0; i--) {
      var f = this.flyers[i];
      f.t += dt;
      if (f.t < 0) continue;
      if (f.kind === 'chest') {
        // 先在地上弹一下（亮光柱），再飞向开箱按钮
        if (f.t < 0.6) {
          f.x = f.sx; f.y = f.sy - Math.sin((f.t / 0.6) * Math.PI) * 50;
        } else {
          var k2 = U.easeInCubic(Math.min(1, (f.t - 0.6) / (f.dur - 0.6)));
          f.x = U.lerp(f.sx, OPEN_BTN.x, k2);
          f.y = U.lerp(f.sy, OPEN_BTN.y, k2) - Math.sin(k2 * Math.PI) * 120;
          if (Math.random() < 0.6) this.fx.burst(f.x, f.y, { n: 1, color: '#ffd24a', speed: 40, life: 0.4, size: 4 });
        }
        if (f.t >= f.dur) {
          this.flyers.splice(i, 1);
          this.save.chests++;
          this.chestBump = 1;
          this.fx.text(OPEN_BTN.x + 90, OPEN_BTN.y - 40, '+1', { color: '#ffd24a', size: 30, crit: true });
          this.fx.burst(OPEN_BTN.x, OPEN_BTN.y, { n: 16, colors: ['#ffd24a', '#fff'], speed: 220, life: 0.5 });
          A.play('coin');
          this.persist();
        }
      } else if (f.kind === 'item') {
        var k3 = U.easeOutCubic(Math.min(1, f.t / f.dur));
        f.x = U.lerp(f.sx, f.tx, k3);
        f.y = U.lerp(f.sy, f.ty, k3) - Math.sin(k3 * Math.PI) * 60;
        if (f.t >= f.dur) {
          this.flyers.splice(i, 1);
          this.slotFlash[f.item.slot] = 0.8;
          var R = Loot.RARITY[f.item.rarity];
          this.fx.burst(f.tx, f.ty, { n: 20, colors: [R.color, '#fff'], speed: 200, life: 0.5, shape: 'spark' });
          if (f.gain > 0) this.fx.text(f.tx + 40, f.ty - 30, '战力+' + U.fmt(f.gain), { color: '#7dff9a', size: 20, crit: true, life: 1.2 });
        }
      }
    }
  };

  IdleScene.prototype.killMob = function () {
    var s = this.save, m = this.mob;
    m.dying = 0.35;
    s.totalKills++;
    var gold = goldPer(s.zone) * (m.boss ? 12 : 1);
    s.gold += gold;
    for (var i = 0; i < (m.boss ? 14 : 3); i++) this.coins.push(this.makeCoin(m.x, GROUND - 30));
    this.fx.burst(m.x, GROUND - 30, { n: m.boss ? 60 : 18, colors: [zoneDef(s.zone).mob, '#fff'], speed: 320, life: 0.6 });
    A.play(m.boss ? 'boom' : 'hit');
    var chest = m.boss ? 2 : (Math.random() < 0.22 ? 1 : 0);
    if (chest) {
      for (var ci = 0; ci < chest; ci++) {
        this.flyers.push({ kind: 'chest', x: m.x + ci * 20, y: GROUND - 40, sx: m.x + ci * 20, sy: GROUND - 40, t: -ci * 0.25, dur: 1.5 });
      }
      this.fx.text(m.x, GROUND - 110, '掉落宝箱！', { color: '#ffd24a', size: 26, crit: true, life: 1.3 });
      A.play('loot1');
    }
    if (m.boss) {
      s.zone++;
      s.kill = 0;
      this.toast = { s: '击败区域首领！进入 第' + s.zone + '区 · ' + zoneDef(s.zone).name, t: 2.6, c: '#ffd27a' };
      this.fx.flash('#ffd27a', 0.4, 2);
      A.play('victory');
    } else if (!s.farming) {
      s.kill++;
    }
  };

  // ---------------- 开箱 ----------------
  IdleScene.prototype.openChests = function (n, free) {
    var s = this.save;
    if (!free) {
      n = Math.min(n, s.chests);
      if (n <= 0) return;
      s.chests -= n;
    }
    this.openQueue += n;
    this.batch = { n: this.openQueue, results: [], gain: 0 };
  };

  IdleScene.prototype.updateOpening = function (dt) {
    if (this.rolling) {
      this.rolling.t += dt;
      var dur = this.rolling.fast ? 0.22 : 0.55;
      if (this.rolling.t >= dur && !this.rolling.done) {
        this.rolling.done = true;
        this.resolveOpen(this.rolling.item);
      }
      if (this.rolling.t >= dur + (this.rolling.fast ? 0.08 : 0.5)) this.rolling = null;
      return;
    }
    if (this.openQueue > 0 && !this.legendPending) {
      this.openQueue--;
      var s = this.save;
      var item = Loot.makeItem({ slot: U.pick(SLOT_ORDER), ilvl: ilvlFor(s.zone) + U.randi(-1, 2), rarity: Loot.rollRarity(0.1) });
      this.rolling = { item: item, t: 0, fast: this.batch && this.batch.n > 1 };
      A.play('shake', 0.05);
    }
  };

  IdleScene.prototype.resolveOpen = function (item) {
    var s = this.save;
    var cur = s.gear[item.slot];
    var better = !cur || item.power > cur.power;
    var sell = Math.round(goldPer(s.zone) * (1 + item.rarity * 2));
    var before = powerOf(s);
    if (better) {
      if (cur) s.gold += Math.round(goldPer(s.zone) * (1 + cur.rarity * 2));
      s.gear[item.slot] = item;
    } else {
      s.gold += sell;
    }
    s.opened++;
    var gain = powerOf(s) - before;
    var res = { item: item, better: better, gain: gain, sell: sell };
    this.recent.unshift(res);
    if (this.recent.length > 6) this.recent.pop();
    if (this.batch) { this.batch.results.push(res); this.batch.gain += gain; }
    A.play('loot' + item.rarity);
    var R = Loot.RARITY[item.rarity];
    this.fx.burst(270, 250, { n: 14 + item.rarity * 16, colors: [R.color, '#fff'], speed: 260 + item.rarity * 80, life: 0.7, shape: 'spark' });
    if (better) {
      var sp = this.slotPos(item.slot);
      this.flyers.push({ kind: 'item', item: item, sx: 270, sy: 250, x: 270, y: 250, tx: sp.x, ty: sp.y, t: -0.15, dur: 0.6, gain: gain });
    } else {
      this.fx.text(270, 330, '不如当前，卖出 +' + U.fmt(sell) + ' 金币', { color: '#ffe14a', size: 18, life: 1.1 });
    }
    if (this.save.tut === 0) { this.save.tut = 1; this.tutT = 0; }
    if (item.rarity >= 3) {
      this.fx.flash(R.color, 0.3, 2);
      this.fx.shake(6, 0.3);
    }
    if (item.rarity === 4) {
      // 传说：弹出完整开箱演出
      var self = this;
      this.legendPending = true;
      var rv = new ER.LootReveal({
        item: item, title: '传说装备！', compare: undefined,
        actions: function (scene) {
          return [{ label: better ? '已自动装备 · 太棒了' : '已分解（不如当前）', color: '#c8602a', full: true, onClick: function () { scene.close(); self.legendPending = false; } }];
        },
      });
      rv.shakeDur = 0.6;
      this.app.push(rv);
    }
    this.persist();
  };

  IdleScene.prototype.challengeBoss = function () {
    this.save.farming = false;
    this.save.kill = KILLS_PER_ZONE;
    this.spawnMob();
  };

  // ---------------- 绘制 ----------------
  IdleScene.prototype.render = function (ctx) {
    var self = this, s = this.save;
    var Z = zoneDef(s.zone);
    // 天空
    var sky = ctx.createLinearGradient(0, LANE_TOP, 0, GROUND);
    sky.addColorStop(0, Z.sky[0]);
    sky.addColorStop(1, Z.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 540, LANE_BOTTOM);
    ctx.save();
    ctx.translate(this.fx.sx, this.fx.sy);
    // 远山
    this.drawHills(ctx, this.scroll * 0.2, 250, 70, U.mix(Z.hill, Z.sky[1], 0.4), 1);
    this.drawHills(ctx, this.scroll * 0.5, 300, 60, Z.hill, 2);
    // 地面
    ctx.fillStyle = Z.ground;
    ctx.fillRect(0, GROUND, 540, LANE_BOTTOM - GROUND);
    ctx.fillStyle = U.mix(Z.ground, '#000000', 0.3);
    for (var gx = -((this.scroll) % 60); gx < 540; gx += 60) ctx.fillRect(gx, GROUND + 14, 30, 4);
    // 小队
    for (var i = 0; i < 3; i++) drawHero(ctx, 196 - i * 56, GROUND, i, this.t, this.atkAnim[i], this.mob.x > 300 && this.mob.dying <= 0);
    // 怪物
    var m = this.mob;
    var Zm = Z.mob;
    if (m.dying <= 0 || m.dying > 0.2) {
      var sc = (m.boss ? 1.7 : 1) * (m.dying > 0 ? m.dying / 0.35 : 1);
      drawMob(ctx, m.x, GROUND, Zm, sc, this.t, m.boss, m.hurt, m.seed);
    }
    if (m.dying <= 0) {
      var bw = m.boss ? 140 : 80;
      G.bar(ctx, m.x - bw / 2, GROUND - (m.boss ? 150 : 84), bw, 10, m.hp / m.max, '#d8362a', { border: false });
    }
    // 金币
    for (var c = 0; c < this.coins.length; c++) {
      var co = this.coins[c];
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.ellipse(co.x, co.y, 7 * Math.abs(Math.cos(co.t * 10)) + 1.5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    this.fx.renderParticles(ctx);
    this.fx.renderTexts(ctx);
    ctx.restore();

    // 顶部 HUD
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 540, LANE_TOP - 6);
    this.ui.button(ctx, 12, 14, 80, 44, '返回', function () { self.persist(); self.app.goto(new ER.MenuScene()); }, { color: '#3a3346', size: 18 });
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(120, 36, 10, 0, Math.PI * 2); ctx.fill();
    G.text(ctx, U.fmt(this.goldShown), 138, 36, { size: 20, weight: 'bold', color: '#ffe9a0' });
    G.text(ctx, '第' + s.zone + '区 · ' + Z.name, 524, 26, { size: 17, weight: 'bold', align: 'right', color: '#fff' });
    var prog = s.farming ? '刷怪中（首领未击败）' : (s.kill >= KILLS_PER_ZONE ? '区域首领！' : '进度 ' + s.kill + '/' + KILLS_PER_ZONE);
    G.text(ctx, prog, 524, 52, { size: 14, align: 'right', color: s.farming ? '#ff9a7a' : '#ccc' });
    if (this.speed() > 1) {
      G.text(ctx, '2倍速 ' + U.fmtTime((s.speedUntil - P.now()) / 1000), 270, 100, { size: 16, weight: 'bold', align: 'center', color: '#7dffef' });
    }
    if (m.boss && m.dying <= 0) {
      G.text(ctx, '首领限时 ' + Math.ceil(this.bossT) + ' 秒', 270, 124, { size: 20, weight: 'bold', align: 'center', color: this.bossT < 8 ? '#ff5a5a' : '#ffd27a', stroke: '#000' });
    }
    // 开箱滚动
    if (this.rolling) this.renderRolling(ctx);
    if (this.toast) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toast.t * 2);
      G.text(ctx, this.toast.s, 270, 160, { size: 20, weight: 'bold', align: 'center', color: this.toast.c, stroke: '#000', strokeWidth: 5 });
      ctx.restore();
    }

    this.renderPanel(ctx);
    this.renderFlyers(ctx);
    this.renderTutorial(ctx);
    if (this.offline) this.renderOffline(ctx);
    this.fx.renderFlash(ctx);
  };

  IdleScene.prototype.drawHills = function (ctx, off, baseY, amp, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    var step = 40;
    var start = Math.floor(off / step);
    for (var i = 0; i <= 540 / step + 2; i++) {
      var idx = start + i;
      var h = U.hash2(idx, seed) * amp;
      ctx.lineTo(i * step - (off % step), baseY - h);
    }
    ctx.lineTo(560, GROUND);
    ctx.closePath();
    ctx.fill();
  };

  IdleScene.prototype.renderRolling = function (ctx) {
    var r = this.rolling;
    var dur = r.fast ? 0.22 : 0.55;
    var k = Math.min(1, r.t / dur);
    var shown = r.done ? r.item.rarity : Math.floor(U.rand(0, 5));
    var R = Loot.RARITY[shown];
    ctx.save();
    ctx.globalAlpha = r.done ? Math.min(1, (dur + (r.fast ? 0.08 : 0.5) - r.t) * 4) : 1;
    if (r.done && r.item.rarity >= 2) G.rays(ctx, 270, 250, 160, R.color, this.t, 12, 0.4);
    var s = r.done ? 1 + (1 - Math.min(1, (r.t - dur) * 6)) * 0.3 : 0.9 + k * 0.1;
    ctx.translate(270, 250);
    ctx.scale(s, s);
    Loot.drawIcon(ctx, r.item.slot, 0, 0, 96, shown);
    if (r.done) {
      G.text(ctx, r.item.name, 0, 72, { size: 20, weight: 'bold', align: 'center', color: R.color, stroke: '#000' });
    }
    ctx.restore();
  };

  IdleScene.prototype.renderFlyers = function (ctx) {
    for (var i = 0; i < this.flyers.length; i++) {
      var f = this.flyers[i];
      if (f.t < 0) continue;
      if (f.kind === 'chest') {
        if (f.t < 0.6) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          var pg = ctx.createLinearGradient(0, f.sy - 220, 0, f.sy);
          pg.addColorStop(0, 'rgba(255,210,74,0)');
          pg.addColorStop(1, 'rgba(255,210,74,0.6)');
          ctx.fillStyle = pg;
          ctx.fillRect(f.sx - 26, f.sy - 220, 52, 220);
          ctx.restore();
        }
        ER.drawChest(ctx, f.x, f.y, 0.34, 0, '#ffd24a', 0.7);
      } else {
        Loot.drawIcon(ctx, f.item.slot, f.x, f.y, 52, f.item.rarity);
      }
    }
  };

  IdleScene.prototype.renderTutorial = function (ctx) {
    var s = this.save;
    if (this.offline || this.rolling) return;
    if (s.tut === 0) {
      if (s.chests <= 0 && !this.flyers.length) return;
      G.tip(ctx, '小队在自动打怪，怪物会掉宝箱。点「开箱」看看能开出什么！', 270, LANE_BOTTOM + 200, 440);
      G.hand(ctx, 200, LANE_BOTTOM + 350, this.t);
    } else if (s.tut === 1) {
      this.tutT = (this.tutT || 0) + 1 / 60;
      if (this.tutT > 6.5) { s.tut = 2; this.persist(); return; }
      ctx.save();
      ctx.globalAlpha = Math.min(1, (6.5 - this.tutT) * 2, this.tutT * 3);
      G.tip(ctx, '更好的装备会自动穿上，战力就涨了！金币可以点「训练」变强，打满 ' + KILLS_PER_ZONE + ' 只怪后挑战区域首领。', 270, 96, 470, { size: 17 });
      ctx.restore();
    }
  };

  IdleScene.prototype.renderPanel = function (ctx) {
    var self = this, s = this.save;
    var top = LANE_BOTTOM;
    var bg = ctx.createLinearGradient(0, top, 0, 960);
    bg.addColorStop(0, '#221a2a');
    bg.addColorStop(1, '#0c0a12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, top, 540, 960 - top);
    ctx.fillStyle = 'rgba(255,190,120,0.3)';
    ctx.fillRect(0, top, 540, 2);
    G.text(ctx, '小队战力', 24, top + 30, { size: 16, color: '#bbb' });
    G.text(ctx, U.fmt(this.powerShown), 24, top + 64, { size: 36, weight: 'bold', color: '#ffd27a', stroke: '#3a1a00', strokeWidth: 5 });
    G.text(ctx, '训练等级 Lv.' + s.lvl + '  ·  累计击杀 ' + U.fmt(s.totalKills), 516, top + 30, { size: 14, align: 'right', color: '#aaa' });
    // 最近掉落
    for (var r = 0; r < this.recent.length; r++) {
      var it = this.recent[r].item;
      Loot.drawIcon(ctx, it.slot, 516 - 22 - r * 46, top + 64, 40, it.rarity, { noGlow: true });
    }
    // 装备格
    for (var i = 0; i < SLOT_ORDER.length; i++) {
      var slot = SLOT_ORDER[i];
      var col = i % 3, row = Math.floor(i / 3);
      var x = 16 + col * 172, y = top + 96 + row * 98;
      var item = s.gear[slot];
      G.panel(ctx, x, y, 164, 88, { radius: 10, border: item ? U.rgba(Loot.RARITY[item.rarity].color, 0.7) : 'rgba(255,255,255,0.12)', lineWidth: 2 });
      if (item) {
        if (this.slotFlash[slot]) G.glow(ctx, x + 82, y + 44, 110, Loot.RARITY[item.rarity].color, this.slotFlash[slot] * 0.8);
        Loot.drawIcon(ctx, slot, x + 38, y + 44, 56, item.rarity);
        var nm = G.wrap(ctx, item.name, 92, 14, 'bold');
        G.text(ctx, nm[0], x + 72, y + 26, { size: 14, weight: 'bold', color: Loot.RARITY[item.rarity].color });
        if (nm[1]) G.text(ctx, nm[1], x + 72, y + 44, { size: 13, color: Loot.RARITY[item.rarity].color });
        G.text(ctx, '战力 ' + item.power, x + 72, y + 66, { size: 14, color: '#fff' });
      } else {
        G.text(ctx, Loot.SLOTS[slot].name, x + 82, y + 36, { size: 16, align: 'center', color: '#666' });
        G.text(ctx, '空', x + 82, y + 60, { size: 14, align: 'center', color: '#555' });
      }
    }
    // 开箱
    var by = top + 300;
    var busy = this.openQueue > 0 || !!this.rolling;
    if (this.chestBump > 0 || s.chests > 0) G.glow(ctx, 166, by + 46, 170, '#ffb347', 0.25 + this.chestBump * 0.5);
    this.ui.button(ctx, 16, by, 300, 92, '开箱', function () { self.openChests(1); }, {
      color: '#c8602a', size: 32, sub: '库存 ' + s.chests + ' 个' + (s.chests >= 10 ? ' · 长期攒着更爽' : ''), disabled: s.chests <= 0, pulse: s.chests > 0 && !busy, id: 'open1',
    });
    this.ui.button(ctx, 328, by, 196, 92, '免费10连', function () {
      ER.ads.show('免费开 10 个宝箱').then(function (ok) { if (ok) self.openChests(10, true); });
    }, { color: '#7a3fd0', size: 24, ad: true, sub: '不消耗库存', id: 'ad10' });
    if (s.chests >= 5) {
      this.ui.button(ctx, 16, by + 104, 150, 62, '全部开启', function () { self.openChests(Math.min(30, s.chests)); }, { color: '#a0501e', size: 20, sub: Math.min(30, s.chests) + ' 个', id: 'openAll' });
    } else {
      this.ui.button(ctx, 16, by + 104, 150, 62, '全部开启', function () {}, { color: '#a0501e', size: 20, sub: '至少 5 个', disabled: true, id: 'openAll' });
    }
    var cost = upCost(s.lvl);
    this.ui.button(ctx, 178, by + 104, 170, 62, '训练 Lv.' + (s.lvl + 1), function () {
      if (s.gold < cost) return;
      s.gold -= cost;
      s.lvl++;
      A.play('levelup');
      self.fx.burst(140, GROUND - 40, { n: 30, colors: ['#7dff9a', '#fff'], speed: 260, life: 0.7 });
      self.persist();
    }, { color: '#2f9e4a', size: 20, sub: U.fmt(cost) + ' 金币', disabled: s.gold < cost, id: 'train' });
    if (this.speed() > 1) {
      this.ui.button(ctx, 360, by + 104, 164, 62, '2倍速中', function () {}, { color: '#2a6a7a', size: 20, sub: U.fmtTime((s.speedUntil - P.now()) / 1000), id: 'speed' });
    } else {
      this.ui.button(ctx, 360, by + 104, 164, 62, '2倍速', function () {
        ER.ads.show('5分钟挂机 2 倍速').then(function (ok) { if (ok) { s.speedUntil = P.now() + 5 * 60 * 1000; self.persist(); A.play('ult'); } });
      }, { color: '#2a6a7a', size: 20, ad: true, sub: '持续 5 分钟', id: 'speed' });
    }
    if (s.farming) {
      this.ui.button(ctx, 16, by + 180, 508, 56, '挑战区域首领', function () { self.challengeBoss(); }, { color: '#b8322a', size: 22, sub: null, pulse: true, id: 'boss' });
    } else {
      G.text(ctx, '更强的装备自动穿上，更弱的自动卖成金币', 270, by + 206, { size: 15, align: 'center', color: '#777' });
    }
    if (this.batch && this.batch.n > 1 && this.openQueue === 0 && !this.rolling && this.batch.results.length) {
      // 批量开箱汇总
      var res = this.batch.results;
      G.panel(ctx, 20, 96, 500, 270, { border: '#ffb347', glow: '#ff8a1f', glowBlur: 16 });
      G.text(ctx, res.length + ' 连开箱结果', 270, 124, { size: 20, weight: 'bold', align: 'center', color: '#ffd27a' });
      for (var j = 0; j < Math.min(res.length, 20); j++) {
        var cx = 60 + (j % 5) * 105, cy = 180 + Math.floor(j / 5) * 70;
        if (Math.floor(j / 5) > 2) break;
        Loot.drawIcon(ctx, res[j].item.slot, cx, cy, 54, res[j].item.rarity);
        if (res[j].better) G.text(ctx, '↑', cx + 24, cy - 22, { size: 20, weight: 'bold', color: '#7dff9a' });
      }
      G.text(ctx, '战力 +' + U.fmt(this.batch.gain) + '   （点击关闭）', 270, 346, { size: 17, weight: 'bold', align: 'center', color: '#7dff9a' });
      this.ui.hotspot('batch-close', 20, 96, 500, 270, function () { self.batch = null; });
    }
  };

  IdleScene.prototype.renderOffline = function (ctx) {
    var self = this, o = this.offline;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, 540, 960);
    G.panel(ctx, 40, 250, 460, 440, { border: '#ffb347', glow: '#ff8a1f' });
    G.text(ctx, '欢迎回来，团长！', 270, 296, { size: 28, weight: 'bold', align: 'center', color: '#ffd27a' });
    G.text(ctx, '你离开了 ' + U.fmtDuration(o.sec) + '，小队一直在刷怪……', 270, 340, { size: 17, align: 'center', color: '#ddd' });
    G.text(ctx, '击杀 ' + U.fmt(o.kills), 270, 400, { size: 22, align: 'center', color: '#fff' });
    G.text(ctx, '金币 +' + U.fmt(o.gold), 270, 440, { size: 26, weight: 'bold', align: 'center', color: '#ffe14a' });
    G.text(ctx, '宝箱 +' + o.chests, 270, 480, { size: 26, weight: 'bold', align: 'center', color: '#ffb347' });
    this.ui.button(ctx, 70, 520, 400, 84, '翻倍领取', function () {
      ER.ads.show('离线收益翻倍').then(function (ok) { self.claimOffline(ok ? 2 : 1); });
    }, { color: '#7a3fd0', size: 28, ad: true, sub: '金币和宝箱 ×2', pulse: true, id: 'off2' });
    this.ui.button(ctx, 170, 620, 200, 52, '直接领取', function () { self.claimOffline(1); }, { color: '#4a4452', size: 18, id: 'off1' });
  };

  ER.Games = ER.Games || {};
  ER.Games.idle = { title: '酒馆挂机录', create: function () { return new IdleScene(); } };
})();
