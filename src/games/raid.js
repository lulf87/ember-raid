/**
 * 原型 A：《余烬团本》—— 单指带团副本
 * 单指拖动带领 5 人小队躲技能，队员自动输出/坦克/治疗；击杀首领后看伤害统计、开箱分装备。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, Loot = ER.Loot, A = ER.audio, P = ER.platform;
  var SAVE_KEY = 'er_raid_v1';

  var ARENA_TOP = 92, ARENA_BOTTOM = 752;
  var BOSS_X = 270, BOSS_Y = 215, BOSS_R = 74;

  var MEMBERS = [
    { id: 'tank', kind: 'warrior', name: '铁砧', role: '坦克', color: '#5b8cff', glyph: 'shield', baseDps: 30, hp: 1700, range: 110, interval: 1.0, ox: 0, oy: -62 },
    { id: 'rogue', kind: 'rogue', name: '影七', role: '盗贼', color: '#ffd24a', glyph: 'dagger', baseDps: 64, hp: 1000, range: 110, interval: 0.45, ox: 46, oy: -44 },
    { id: 'mage', kind: 'mage', name: '焰歌', role: '法师', color: '#ff6b4a', glyph: 'flame', baseDps: 74, hp: 850, range: 640, interval: 1.1, ox: -84, oy: 34, caster: true },
    { id: 'hunter', kind: 'hunter', name: '青羽', role: '猎手', color: '#4ae0ff', glyph: 'bow', baseDps: 60, hp: 950, range: 640, interval: 0.75, ox: 84, oy: 34, caster: true },
    { id: 'heal', kind: 'priest', name: '晨露', role: '治疗', color: '#7dffb0', glyph: 'cross', baseDps: 12, hp: 900, range: 700, interval: 1.2, heal: 150, ox: 0, oy: 86, caster: true },
  ];
  var MEMBER_BY_ID = {};
  MEMBERS.forEach(function (m) { MEMBER_BY_ID[m.id] = m; });

  var BOSSES = [
    {
      name: '熔岩巨像·焚炉', title: '熔炉深处的看门者', shape: 'golem', c1: '#ff7a2a', c2: '#4a1206', eye: '#fff2a0', burn: '#ff5a1a',
      mechs: { pools: { w: 3, name: '熔岩飞溅' }, sweep: { w: 2, name: '炎流横扫' }, nova: { w: 2, name: '熔火新星' }, soak: { w: 1, name: '陨火坠落' } },
    },
    {
      name: '腐沼蛛母·薇丝', title: '沼泽下的低语', shape: 'spider', c1: '#9be04a', c2: '#2a0a3a', eye: '#e8ff5a', burn: '#86d42a',
      mechs: { pools: { w: 3, name: '腐毒喷吐' }, sweep: { w: 2, name: '蛛丝绞索' }, nova: { w: 1, name: '毒雾爆发' }, soak: { w: 2, name: '卵囊破裂' } },
    },
    {
      name: '霜牙督军·寒獠', title: '冻原上的断牙之王', shape: 'frost', c1: '#7ad8ff', c2: '#0a1a4a', eye: '#ffffff', burn: '#5ac8ff',
      mechs: { pools: { w: 2, name: '冰锥坠落' }, sweep: { w: 2, name: '寒风横扫' }, nova: { w: 3, name: '霜冻新星' }, soak: { w: 2, name: '冰川重击' } },
    },
  ];

  function bossFor(tier) {
    var B = BOSSES[(tier - 1) % BOSSES.length];
    return {
      def: B, tier: tier,
      maxHp: Math.round(8000 * Math.pow(1.28, tier - 1)),
      ds: Math.pow(1.17, tier - 1),
      ilvl: 8 + tier * 6,
      recommend: Math.round(14 * 5 * Math.pow(1.28, tier - 1) * 0.9),
    };
  }

  var QUIPS = {
    pull: ['[铁砧]：我开怪了，都别抢仇恨！', '[铁砧]：倒数三二一……冲！', '[影七]：这次我绝对不站火里。'],
    death: {
      tank: '[铁砧]：坦克倒了！快跑！', rogue: '[影七]：我又贪刀了……', mage: '[焰歌]：读条读到一半就没了。',
      hunter: '[青羽]：我的宠物会替我报仇的。', heal: '[晨露]：我先躺会儿，你们加油。',
    },
    soak: ['[晨露]：集合分摊！都过来！', '[铁砧]：黄圈！全部站进来！'],
    enrage: ['[焰歌]：它急了它急了！', '[青羽]：最后一段了，爆发！'],
    ult: ['[铁砧]：战旗插下！全力输出！', '[影七]：开大了开大了！'],
    fire: ['[晨露]：谁又站在火里了？', '[铁砧]：脚下！看脚下！'],
  };

  // ------------------------------------------------------------------ 存档
  function defaultSave() {
    var gear = {};
    MEMBERS.forEach(function (m) {
      gear[m.id] = {
        weapon: Loot.makeItem({ slot: 'weapon', ilvl: 6, rarity: 0, owner: m.id }),
        chest: Loot.makeItem({ slot: 'chest', ilvl: 6, rarity: 0, owner: m.id }),
      };
    });
    return { tier: 1, kills: 0, shards: 0, gear: gear, legendUntil: 0, temper: 0, bestDps: 0 };
  }
  function loadSave() {
    var s = P.storage.get(SAVE_KEY, null);
    if (!s || !s.gear) s = defaultSave();
    return s;
  }
  function writeSave(s) { P.storage.set(SAVE_KEY, s); }

  function memberStats(save, id) {
    var g = save.gear[id];
    var power = 0, crit = 0, haste = 0;
    ['weapon', 'chest'].forEach(function (k) {
      var it = g[k];
      if (it) { power += it.power; crit += it.crit || 0; haste += it.haste || 0; }
    });
    power += (save.temper || 0) * 3;
    return { power: power, crit: crit, haste: haste, mult: 1 + power / 60 };
  }
  function partyPower(save) {
    var p = 0;
    MEMBERS.forEach(function (m) { p += memberStats(save, m.id).power; });
    return p;
  }

  // ------------------------------------------------------------------ 绘制：职业符号
  function drawGlyph(ctx, glyph, s, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (glyph) {
      case 'shield':
        ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.45, -s * 0.35); ctx.lineTo(s * 0.38, s * 0.2);
        ctx.lineTo(0, s * 0.55); ctx.lineTo(-s * 0.38, s * 0.2); ctx.lineTo(-s * 0.45, -s * 0.35); ctx.closePath(); ctx.fill();
        break;
      case 'cross':
        ctx.fillRect(-s * 0.14, -s * 0.5, s * 0.28, s); ctx.fillRect(-s * 0.5, -s * 0.14, s, s * 0.28);
        break;
      case 'dagger':
        ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.4, -s * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.4); ctx.lineTo(-s * 0.4, -s * 0.4); ctx.stroke();
        break;
      case 'flame':
        ctx.moveTo(0, -s * 0.6); ctx.quadraticCurveTo(s * 0.5, 0, s * 0.3, s * 0.4); ctx.quadraticCurveTo(0, s * 0.6, -s * 0.3, s * 0.4);
        ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.6); ctx.fill();
        break;
      case 'bow':
        ctx.arc(-s * 0.1, 0, s * 0.5, -1.2, 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.5, 0); ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function drawMember(ctx, m, t, opt) {
    opt = opt || {};
    var x = m.x, y = m.y + 14;
    if (m.dead) { ER.Sprites.drawTomb(ctx, x, y, 1); return; }
    // 脚下职业色光圈，方便一眼认出谁是谁
    ctx.save();
    ctx.strokeStyle = U.rgba(m.def.color, 0.85);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ER.Sprites.drawHero(ctx, x, y, {
      kind: m.def.kind, face: m.face || 1, walk: m.walk || 0, moving: m.moving, atk: m.atkAnim || 0,
      hurt: m.hitFlash, s: 1.0, glow: opt.ult ? '#ffb347' : null,
    });
    if (m.hp < m.maxHp) {
      G.bar(ctx, x - 18, y - 64, 36, 6, m.hp / m.maxHp, m.hp / m.maxHp < 0.35 ? '#ff4a4a' : '#5ae05a', { border: false });
    }
  }

  /** 小头像：用于团队框体与大厅列表 */
  function drawPortrait(ctx, d, x, y, size, dead) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = dead ? '#2a2630' : U.mix(d.color, '#000000', 0.55);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = dead ? '#555' : d.color; ctx.stroke();
    ctx.clip();
    if (dead) ER.Sprites.drawTomb(ctx, x, y + size * 0.7, size / 20);
    else ER.Sprites.drawHero(ctx, x - size * 0.12, y + size * 1.75, { kind: d.kind, s: size / 19, face: 1, walk: 0 });
    ctx.restore();
  }

  // ------------------------------------------------------------------ 绘制：首领
  function drawBoss(ctx, B, x, y, r, t, hurt, enraged, slam) {
    ctx.save();
    ctx.translate(x, y);
    var br = 1 + Math.sin(t * 2.2) * 0.03;
    ctx.scale(br, br);
    G.glow(ctx, 0, 0, r * 2.4, B.c1, enraged ? 0.55 : 0.32);
    var i;
    if (B.shape === 'spider') {
      ctx.strokeStyle = U.mix(B.c2, '#000000', 0.2);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (i = 0; i < 8; i++) {
        var side = i < 4 ? -1 : 1;
        var k = i % 4;
        var base = side < 0 ? Math.PI - (-0.7 + k * 0.45) : -0.7 + k * 0.45;
        var wig = Math.sin(t * 6 + i * 1.3) * 0.12;
        var a1 = base + wig * side;
        var jx = Math.cos(a1) * r * 1.35, jy = Math.sin(a1) * r * 1.35 - r * 0.35;
        var ex = Math.cos(a1) * r * 1.9, ey = Math.sin(a1) * r * 1.6 + r * 0.45;
        ctx.beginPath(); ctx.moveTo(Math.cos(a1) * r * 0.6, Math.sin(a1) * r * 0.6); ctx.lineTo(jx, jy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = B.c1;
      for (i = 0; i < 8; i++) {
        var s2 = i < 4 ? -1 : 1, k2 = i % 4;
        var b2 = s2 < 0 ? Math.PI - (-0.7 + k2 * 0.45) : -0.7 + k2 * 0.45;
        var a2 = b2 + Math.sin(t * 6 + i * 1.3) * 0.12 * s2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a2) * r * 1.35, Math.sin(a2) * r * 1.35 - r * 0.35);
        ctx.lineTo(Math.cos(a2) * r * 1.9, Math.sin(a2) * r * 1.6 + r * 0.45); ctx.stroke();
      }
    } else if (B.shape === 'golem') {
      for (i = 0; i < 7; i++) {
        var a = t * 0.6 + (i / 7) * Math.PI * 2;
        var rx = Math.cos(a) * r * 1.32, ry = Math.sin(a) * r * 1.32;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(a * 2);
        ctx.fillStyle = '#3a2418';
        ctx.strokeStyle = B.c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-12, -8); ctx.lineTo(4, -14); ctx.lineTo(14, -2); ctx.lineTo(8, 12); ctx.lineTo(-10, 10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else {
      for (i = 0; i < 11; i++) {
        var fa = -Math.PI / 2 + (i - 5) * 0.28 + Math.sin(t + i) * 0.02;
        var len = r * (0.55 + (i % 2 ? 0.25 : 0.55) + (i === 5 ? 0.3 : 0));
        ctx.save();
        ctx.rotate(fa + Math.PI / 2);
        ctx.fillStyle = U.mix(B.c1, '#ffffff', 0.4);
        ctx.strokeStyle = '#0a1430';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-9, -r * 0.8); ctx.lineTo(0, -r * 0.8 - len); ctx.lineTo(9, -r * 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    // 身体
    var grd = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    grd.addColorStop(0, U.mix(B.c1, '#ffffff', 0.15));
    grd.addColorStop(0.45, U.mix(B.c1, B.c2, 0.55));
    grd.addColorStop(1, B.c2);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = U.mix(B.c2, '#000000', 0.4);
    ctx.stroke();
    // 裂纹 / 纹路
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = U.rgba(B.c1, 0.55 + Math.sin(t * 4) * 0.2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, r * 0.2); ctx.lineTo(-r * 0.35, r * 0.35); ctx.lineTo(-r * 0.2, r * 0.7);
    ctx.moveTo(r * 0.75, r * 0.1); ctx.lineTo(r * 0.4, r * 0.3); ctx.lineTo(r * 0.45, r * 0.65);
    ctx.moveTo(-r * 0.2, -r * 0.85); ctx.lineTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.8);
    ctx.stroke();
    ctx.restore();
    // 双臂与巨拳（巨像/督军）；slam 0~1 为砸地动作
    if (B.shape !== 'spider') {
      slam = slam || 0;
      var sk = Math.sin(slam * Math.PI);
      for (var side = -1; side <= 1; side += 2) {
        var sx = side * r * 0.82, sy = -r * 0.05;
        var fx = side * (r * 1.32 - sk * r * 0.25), fy = r * (0.5 + sk * 0.55) + Math.sin(t * 2 + side) * 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#140808';
        ctx.lineWidth = r * 0.36;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(side * r * 1.45, r * 0.05, fx, fy); ctx.stroke();
        ctx.strokeStyle = U.mix(B.c2, B.c1, 0.35);
        ctx.lineWidth = r * 0.28;
        ctx.stroke();
        // 拳头
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(side * 0.3);
        ctx.fillStyle = U.mix(B.c2, B.c1, 0.25);
        ctx.strokeStyle = '#140808';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (B.shape === 'golem') {
          ctx.moveTo(-r * 0.24, -r * 0.18); ctx.lineTo(r * 0.12, -r * 0.26); ctx.lineTo(r * 0.28, 0);
          ctx.lineTo(r * 0.16, r * 0.24); ctx.lineTo(-r * 0.2, r * 0.22); ctx.lineTo(-r * 0.3, 0);
        } else {
          ctx.moveTo(0, -r * 0.3); ctx.lineTo(r * 0.24, -r * 0.05); ctx.lineTo(r * 0.12, r * 0.26);
          ctx.lineTo(-r * 0.14, r * 0.26); ctx.lineTo(-r * 0.24, -r * 0.05);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba(B.c1, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.08); ctx.lineTo(r * 0.04, r * 0.06); ctx.lineTo(r * 0.14, -r * 0.1); ctx.stroke();
        ctx.restore();
      }
    }
    // 眼睛
    var eyes = B.shape === 'spider'
      ? [[-0.3, -0.25, 0.1], [0.3, -0.25, 0.1], [-0.15, -0.42, 0.07], [0.15, -0.42, 0.07], [-0.45, -0.05, 0.06], [0.45, -0.05, 0.06]]
      : [[-0.33, -0.15, 0.13], [0.33, -0.15, 0.13]];
    for (i = 0; i < eyes.length; i++) {
      var e = eyes[i];
      G.glow(ctx, e[0] * r, e[1] * r, e[2] * r * 3, B.eye, 0.7);
      ctx.fillStyle = enraged ? '#ff3a3a' : B.eye;
      ctx.beginPath(); ctx.ellipse(e[0] * r, e[1] * r, e[2] * r, e[2] * r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 嘴 / 核心
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = U.rgba(B.c1, 0.75);
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, r * 0.25); ctx.quadraticCurveTo(0, r * (0.5 + Math.sin(t * 3) * 0.06), r * 0.35, r * 0.25);
    ctx.quadraticCurveTo(0, r * 0.36, -r * 0.35, r * 0.25);
    ctx.fill();
    ctx.restore();
    if (hurt > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, hurt * 6) + ')';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ 场地背景（离屏缓存）
  var floorCache = {};
  function getFloor(B) {
    if (floorCache[B.name]) return floorCache[B.name];
    var c = P.createOffscreenCanvas(540, 960);
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, U.mix(B.c2, '#000000', 0.55));
    bg.addColorStop(1, '#07060b');
    g.fillStyle = bg;
    g.fillRect(0, 0, 540, 960);
    // 石板
    for (var yy = ARENA_TOP; yy < ARENA_BOTTOM; yy += 48) {
      var off = ((yy / 48) | 0) % 2 ? 0 : 30;
      for (var xx = -60 + off; xx < 600; xx += 60) {
        var h = U.hash2(xx, yy);
        g.fillStyle = U.rgba(U.mix('#2a2430', B.c2, 0.3), 0.55 + h * 0.35);
        g.fillRect(xx + 2, yy + 2, 56, 44);
      }
    }
    // 符文法阵
    g.save();
    g.translate(BOSS_X, BOSS_Y + 40);
    g.strokeStyle = U.rgba(B.c1, 0.16);
    g.lineWidth = 3;
    for (var r = 140; r <= 420; r += 140) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 140, Math.sin(a) * 140); g.lineTo(Math.cos(a) * 420, Math.sin(a) * 420); g.stroke();
    }
    g.restore();
    // 暗角
    var vg = g.createRadialGradient(270, 420, 200, 270, 420, 560);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 540, 960);
    floorCache[B.name] = c;
    return c;
  }

  // ================================================================== 首领战
  function RaidBattle(save, tier, farm) {
    this.save = save;
    this.boss = bossFor(tier);
    this.B = this.boss.def;
    this.farm = !!farm;
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.fightTime = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.bossHp = this.boss.maxHp;
    this.bossGhost = 1;
    this.bossHurt = 0;
    this.bossAtkT = 1.5;
    this.mechT = 4;
    this.hazards = [];
    this.burns = [];
    this.projs = [];
    this.chat = [];
    this.cast = null;
    this.enraged = false;
    this.phase2 = false;
    this.ultCd = 6;
    this.ultT = 0;
    this.revived = false;
    this.perfect = 0;
    this.avoidable = 0;
    this.dragging = false;
    this.hintT = 7;
    this.paused = false;
    this.rally = { x: 270, y: 390 };
    this.goal = { x: 270, y: 390 };
    var self = this;
    this.party = MEMBERS.map(function (d, i) {
      var st = memberStats(save, d.id);
      var maxHp = Math.round(d.hp * (1 + st.power / 120));
      return {
        def: d, x: 270 + d.ox, y: 420 + d.oy + 160, maxHp: maxHp, hp: maxHp, dead: false,
        mult: st.mult, crit: 0.12 + st.crit / 100, haste: st.haste / 100,
        atkT: U.rand(0, d.interval), dmg: 0, heal: 0, taken: 0, avoid: 0, moving: false, phase: i * 1.7,
        hitFlash: 0, inside: {}, walk: 0, atkAnim: 0, face: 1,
      };
    });
    this.say(U.pick(QUIPS.pull));
    // 新手教学：第一次打第 1 层时开启
    if (!save.tutRaid && tier === 1 && !this.farm) { this.tut = { step: 0, t: 0, dragged: 0, result: null }; this.hintT = 0; }
    this.drops = [];
    self.ENRAGE = 180;
  }

  RaidBattle.prototype.enter = function () { A.play('warn'); };

  RaidBattle.prototype.say = function (s) {
    this.chat.push({ s: s, t: 6 });
    if (this.chat.length > 3) this.chat.shift();
  };

  RaidBattle.prototype.alive = function () { return this.party.filter(function (m) { return !m.dead; }); };

  RaidBattle.prototype.onDown = function (p) {
    if (this.state !== 'fight' && this.state !== 'intro') return;
    if (p.y > ARENA_BOTTOM + 10) return;
    this.dragging = true;
    this.last = { x: p.x, y: p.y };
    this.downAt = { x: p.x, y: p.y, t: this.t };
    this.dragDist = 0;
  };
  RaidBattle.prototype.onMove = function (p) {
    if (!this.dragging) return;
    var dx = (p.x - this.last.x) * 1.15, dy = (p.y - this.last.y) * 1.15;
    this.dragDist += Math.abs(dx) + Math.abs(dy);
    if (this.tut) this.tut.dragged += Math.abs(dx) + Math.abs(dy);
    this.rally.x = U.clamp(this.rally.x + dx, 70, 470);
    this.rally.y = U.clamp(this.rally.y + dy, 330, 690);
    this.goal.x = this.rally.x; this.goal.y = this.rally.y;
    this.last = { x: p.x, y: p.y };
    this.hintT = Math.min(this.hintT, 0.6);
  };
  RaidBattle.prototype.onUp = function (p) {
    if (this.tut && this.tut.step === 0 && this.tut.t > 0.6) { this.tutNext(); this.dragging = false; return; }
    if (!this.dragging) return;
    this.dragging = false;
    // 轻点 = 把小队派到该位置
    if (this.dragDist < 10 && p.y < ARENA_BOTTOM) {
      this.goal.x = U.clamp(p.x, 70, 470);
      this.goal.y = U.clamp(p.y, 330, 690);
      this.fx.ring(this.goal.x, this.goal.y, 4, 26, '#ffd27a', 0.4, 3);
    }
  };

  RaidBattle.prototype.slowmo = function (scale, dur) {
    this.timeScale = scale;
    this.slowT = dur;
  };

  RaidBattle.prototype.update = function (dt) {
    if (this.paused) return;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowT = 0; }
    else this.timeScale = U.damp(this.timeScale, 1, 6, dt);
    var d = dt * this.timeScale;
    this.t += d;
    this.stateT += dt;
    this.fx.update(d);
    this.bossHurt = Math.max(0, this.bossHurt - d);
    this.bossSlam = Math.max(0, (this.bossSlam || 0) - d * 3);
    this.bossGhost = U.damp(this.bossGhost, this.bossHp / this.boss.maxHp, 3, d);
    this.hintT -= dt;
    for (var c = this.chat.length - 1; c >= 0; c--) { this.chat[c].t -= dt; if (this.chat[c].t <= 0) this.chat.splice(c, 1); }

    this.updateParty(d);
    this.updateProjs(d);

    if (this.state === 'intro') {
      if (this.stateT > 1.6) { this.state = 'fight'; this.stateT = 0; }
      return;
    }
    if (this.state === 'fight' && this.tut && this.tut.step < 5) {
      this.ultCd = this.tut.step === 4 ? 0 : 99;
      this.ultT = Math.max(0, this.ultT - d);
      this.updateTutorial(dt);
      this.updateHazards(d);
      this.updateAttacks(d);
      if (this.bossHp < this.boss.maxHp * 0.85) this.bossHp = this.boss.maxHp * 0.85;
      return;
    }
    if (this.state === 'fight') {
      this.fightTime += d;
      this.ultCd = Math.max(0, this.ultCd - d);
      this.ultT = Math.max(0, this.ultT - d);
      this.updateBoss(d);
      this.updateHazards(d);
      this.updateAttacks(d);
      this.checkEnd();
    } else if (this.state === 'victory') {
      if (Math.random() < d * 25) {
        this.fx.burst(BOSS_X + U.rand(-60, 60), BOSS_Y + U.rand(-60, 60), { n: 8, colors: [this.B.c1, '#fff', '#ffd27a'], speed: 300, life: 0.8 });
      }
      this.updateDrops(d);
      if (this.stateT > 3.4 && !this.resultShown) {
        this.resultShown = true;
        this.app.goto(new RaidResult(this));
      }
    } else if (this.state === 'wipe') {
      this.updateHazards(d);
    }
  };

  RaidBattle.prototype.updateParty = function (d) {
    // 集合点平滑移动到目标
    var gdx = this.goal.x - this.rally.x, gdy = this.goal.y - this.rally.y;
    var gl = Math.sqrt(gdx * gdx + gdy * gdy);
    if (gl > 1) {
      var step = Math.min(gl, 520 * d);
      this.rally.x += (gdx / gl) * step; this.rally.y += (gdy / gl) * step;
    }
    for (var i = 0; i < this.party.length; i++) {
      var m = this.party[i];
      m.hitFlash = Math.max(0, m.hitFlash - d);
      m.atkAnim = Math.max(0, (m.atkAnim || 0) - d * 3.5);
      if (m.dead) continue;
      var tx = U.clamp(this.rally.x + m.def.ox, 22, 518);
      var ty = U.clamp(this.rally.y + m.def.oy, ARENA_TOP + 20, ARENA_BOTTOM - 16);
      var dx = tx - m.x, dy = ty - m.y;
      var l = Math.sqrt(dx * dx + dy * dy);
      var sp = 430 * d;
      if (l > 0.5) {
        var mv = Math.min(l, sp);
        m.x += (dx / l) * mv; m.y += (dy / l) * mv;
      }
      m.moving = l > 6;
      if (m.moving) m.walk += d * 14; else m.walk += d * 2;
      if (Math.abs(m.x - BOSS_X) > 10) m.face = m.x < BOSS_X ? 1 : -1;
      // 不能穿过首领
      var bd = U.dist(m.x, m.y, BOSS_X, BOSS_Y);
      var minD = BOSS_R + 18;
      if (bd < minD) {
        var nx = (m.x - BOSS_X) / (bd || 1), ny = (m.y - BOSS_Y) / (bd || 1);
        m.x = BOSS_X + nx * minD; m.y = BOSS_Y + ny * minD;
      }
    }
  };

  RaidBattle.prototype.damageMember = function (m, dmg, avoidable, color) {
    if (m.dead || dmg <= 0) return;
    dmg = Math.round(dmg);
    m.hp -= dmg;
    m.taken += dmg;
    m.hitFlash = 0.15;
    if (avoidable) { m.avoid += dmg; this.avoidable += dmg; }
    if (dmg > 60) this.fx.text(m.x + U.rand(-8, 8), m.y - 26, '-' + dmg, { color: color || '#ff5a5a', size: 17, vy: -50 });
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      A.play('death');
      this.fx.burst(m.x, m.y, { n: 18, color: m.def.color, speed: 200, life: 0.7 });
      this.say(QUIPS.death[m.def.id]);
    }
  };

  RaidBattle.prototype.updateBoss = function (d) {
    var B = this.B, ds = this.boss.ds * (this.enraged ? 4 : 1);
    var pct = this.bossHp / this.boss.maxHp;
    if (!this.phase2 && pct < 0.35) {
      this.phase2 = true;
      this.fx.shake(10, 0.6);
      this.fx.flash(B.c1, 0.35, 2);
      A.play('boom');
      this.banner = { s: '首领进入二阶段！技能更快了', t: 2.2, c: '#ff8a4a' };
      this.say(U.pick(QUIPS.enrage));
    }
    if (!this.enraged && this.fightTime > this.ENRAGE) {
      this.enraged = true;
      this.banner = { s: '首领狂暴了！伤害大幅提升', t: 2.5, c: '#ff3a3a' };
      A.play('warn');
    }
    // 普攻坦克
    this.bossAtkT -= d;
    if (this.bossAtkT <= 0) {
      this.bossAtkT = 1.4;
      this.bossSlam = 1;
      var alive = this.alive();
      if (alive.length) {
        var tank = this.party[0];
        var target = !tank.dead ? tank : alive.reduce(function (a, b) {
          return U.dist2(a.x, a.y, BOSS_X, BOSS_Y) < U.dist2(b.x, b.y, BOSS_X, BOSS_Y) ? a : b;
        });
        var dmg = 105 * ds * (target === tank ? 1 : 2.4);
        this.damageMember(target, dmg, false, '#ff8a6a');
        this.fx.burst(target.x, target.y - 6, { n: 6, color: B.c1, speed: 160, life: 0.35 });
        A.play('hitSoft');
      }
    }
    // 机制
    this.mechT -= d;
    var busy = this.hazards.some(function (h) { return h.big; });
    if (this.mechT <= 0 && !busy) {
      var base = Math.max(3.4, 5.4 - this.boss.tier * 0.12);
      this.mechT = base * (this.phase2 ? 0.7 : 1) * U.rand(0.85, 1.15);
      this.castMechanic();
    }
    if (this.cast) {
      this.cast.t += d;
      if (this.cast.t >= this.cast.dur) this.cast = null;
    }
  };

  RaidBattle.prototype.castMechanic = function () {
    var B = this.B, ds = this.boss.ds * (this.enraged ? 4 : 1);
    var list = [];
    for (var k in B.mechs) list.push({ w: B.mechs[k].w, k: k });
    var pick = U.weighted(list).k;
    var alive = this.alive();
    if (!alive.length) return;
    var name = B.mechs[pick].name;
    var cen = { x: 0, y: 0 };
    alive.forEach(function (m) { cen.x += m.x; cen.y += m.y; });
    cen.x /= alive.length; cen.y /= alive.length;
    var dur;
    if (pick === 'pools') {
      dur = 1.5;
      var n = Math.min(alive.length, 2 + Math.floor(this.boss.tier / 3) + (this.phase2 ? 1 : 0));
      var targets = U.shuffle(alive.slice()).slice(0, n);
      for (var i = 0; i < targets.length; i++) {
        this.hazards.push({ type: 'circle', x: targets[i].x, y: targets[i].y, r: 58, t: 0, dur: dur + i * 0.12, dmg: 380 * ds, burn: true, color: B.burn });
      }
      A.play('fire');
    } else if (pick === 'sweep') {
      dur = 1.8;
      if (Math.random() < 0.5) {
        this.hazards.push({ type: 'hband', y: U.clamp(cen.y, ARENA_TOP + 60, ARENA_BOTTOM - 60), h: 124, t: 0, dur: dur, dmg: 520 * ds, color: B.burn });
      } else {
        this.hazards.push({ type: 'vband', x: U.clamp(cen.x, 70, 470), w: 150, t: 0, dur: dur, dmg: 520 * ds, color: B.burn });
      }
      A.play('warn');
    } else if (pick === 'nova') {
      dur = 2.3;
      this.hazards.push({ type: 'circle', x: BOSS_X, y: BOSS_Y, r: 300, t: 0, dur: dur, dmg: 640 * ds, color: B.burn, big: true, nova: true });
      A.play('warn');
    } else {
      dur = 2.9;
      var sx = U.rand(110, 430), sy = U.rand(450, 650);
      this.hazards.push({ type: 'soak', x: sx, y: sy, r: 80, t: 0, dur: dur, dmg: 420 * ds, color: '#ffd84a', big: true });
      this.say(U.pick(QUIPS.soak));
      A.play('warn');
    }
    this.cast = { name: name, t: 0, dur: dur };
  };

  RaidBattle.prototype.inHazard = function (h, m) {
    if (h.type === 'circle' || h.type === 'soak') return U.dist(m.x, m.y, h.x, h.y) <= h.r + 6;
    if (h.type === 'hband') return Math.abs(m.y - h.y) <= h.h / 2 + 6;
    if (h.type === 'vband') return Math.abs(m.x - h.x) <= h.w / 2 + 6;
    return false;
  };

  RaidBattle.prototype.updateHazards = function (d) {
    var i, j, m;
    for (i = this.hazards.length - 1; i >= 0; i--) {
      var h = this.hazards[i];
      if (!h.id) h.id = U.uid();
      h.t += d;
      // 记录“曾在圈里”的时间，用于判定完美闪避
      for (j = 0; j < this.party.length; j++) {
        m = this.party[j];
        if (!m.dead && this.inHazard(h, m)) m.inside[h.id] = this.t;
      }
      if (h.t >= h.dur) {
        this.hazards.splice(i, 1);
        this.resolveHazard(h);
      }
    }
    for (i = this.burns.length - 1; i >= 0; i--) {
      var b = this.burns[i];
      b.life -= d;
      if (b.life <= 0) { this.burns.splice(i, 1); continue; }
      if (Math.random() < d * 14) {
        this.fx.burst(b.x + U.rand(-b.r, b.r) * 0.7, b.y + U.rand(-b.r, b.r) * 0.5, { n: 1, color: b.color, speed: 60, angle: -Math.PI / 2, spread: 0.5, life: 0.7, size: 4, drag: 1 });
      }
      for (j = 0; j < this.party.length; j++) {
        m = this.party[j];
        if (m.dead) continue;
        if (U.dist(m.x, m.y, b.x, b.y) < b.r) {
          this.damageMember(m, b.dps * d, true);
          m.hitFlash = 0.1;
          if (!this.fireQuipT || this.t - this.fireQuipT > 8) { this.fireQuipT = this.t; this.say(U.pick(QUIPS.fire)); }
        }
      }
    }
  };

  RaidBattle.prototype.resolveHazard = function (h) {
    var self = this;
    var alive = this.alive();
    var hit = alive.filter(function (m) { return self.inHazard(h, m); });
    if (h.tut && this.tut) this.tut.result = h.type === 'soak' ? (hit.length >= alive.length ? 'ok' : 'hit') : (hit.length ? 'hit' : 'ok');
    var key = h.id;
    this.fx.shake(h.big ? 12 : 6, 0.3);
    if (h.type === 'soak') {
      if (hit.length < alive.length) {
        alive.forEach(function (m) { self.damageMember(m, h.dmg, true, '#ffd84a'); });
        this.fx.flash('#ffd84a', 0.35, 2.5);
        this.banner = { s: '分摊失败！全团受到重创', t: 1.6, c: '#ffd84a' };
      } else {
        hit.forEach(function (m) { self.damageMember(m, h.dmg * 0.22, false, '#ffd84a'); });
        this.banner = { s: '完美分摊！', t: 1.2, c: '#7dff9a' };
        this.perfect++;
        this.slowmo(0.35, 0.35);
      }
      this.fx.burst(h.x, h.y, { n: 50, colors: ['#ffd84a', '#fff'], speed: 380, life: 0.8, shape: 'spark' });
      this.fx.ring(h.x, h.y, h.r * 0.5, h.r * 1.6, '#ffd84a', 0.6, 8);
      A.play('boom');
      return;
    }
    hit.forEach(function (m) { self.damageMember(m, h.dmg, true, '#ff5a5a'); });
    // 完美闪避：0.45 秒内还在圈里，现在已经出来
    var dodged = alive.filter(function (m) {
      var tIn = m.inside[key];
      return hit.indexOf(m) < 0 && tIn != null && self.t - tIn < 0.45;
    });
    if (dodged.length) {
      this.perfect++;
      this.fx.text(dodged[0].x, dodged[0].y - 40, '完美闪避！', { color: '#7dffef', size: 26, crit: true, life: 1.1 });
      this.slowmo(0.3, 0.3);
      A.play('levelup', 0.3);
    }
    for (var j = 0; j < this.party.length; j++) delete this.party[j].inside[key];
    // 爆炸表现
    if (h.type === 'circle') {
      var n = h.nova ? 90 : 26;
      this.fx.burst(h.x, h.y, { n: n, colors: [h.color, '#fff2c0'], speed: h.nova ? 700 : 300, life: 0.7, size: 5, shape: 'spark' });
      this.fx.ring(h.x, h.y, h.r * 0.3, h.r * 1.1, h.color, 0.5, 10);
      if (h.burn) this.burns.push({ x: h.x, y: h.y, r: h.r * 0.92, life: 7, max: 7, dps: 160 * this.boss.ds, color: h.color });
      A.play(h.nova ? 'boom' : 'hit');
    } else if (h.type === 'hband') {
      for (var x = 0; x <= 540; x += 40) this.fx.burst(x, h.y, { n: 3, color: h.color, speed: 260, life: 0.5, shape: 'spark' });
      A.play('boom');
    } else if (h.type === 'vband') {
      for (var y = ARENA_TOP; y <= ARENA_BOTTOM; y += 40) this.fx.burst(h.x, y, { n: 3, color: h.color, speed: 260, life: 0.5, shape: 'spark' });
      A.play('boom');
    }
  };

  RaidBattle.prototype.hitBoss = function (m, dmg, crit) {
    if (this.state !== 'fight') return;
    dmg = Math.round(dmg);
    this.bossHp -= dmg;
    m.dmg += dmg;
    this.bossHurt = 0.06;
    var a = Math.random() * Math.PI * 2;
    var tx = BOSS_X + Math.cos(a) * BOSS_R * 0.7, ty = BOSS_Y + Math.sin(a) * BOSS_R * 0.5;
    if (crit) {
      this.fx.text(tx, ty - 10, dmg + '!', { color: '#ffe14a', size: 30, crit: true, life: 1.0, vy: -90 });
      if (dmg > 400) this.fx.shake(3, 0.1);
      A.play('crit');
    } else {
      this.fx.text(tx, ty, String(dmg), { color: '#ffffff', size: 19, life: 0.7 });
      A.play('hitSoft', 0.06);
    }
  };

  RaidBattle.prototype.updateAttacks = function (d) {
    var self = this;
    var ult = this.ultT > 0;
    for (var i = 0; i < this.party.length; i++) {
      var m = this.party[i];
      if (m.dead) continue;
      var def = m.def;
      m.atkT -= d * (1 + m.haste) * (ult ? 1.3 : 1);
      if (m.atkT > 0) continue;
      m.atkT = def.interval;
      m.atkAnim = 1;
      var bd = U.dist(m.x, m.y, BOSS_X, BOSS_Y) - BOSS_R;
      if (def.id === 'heal') {
        // 治疗：优先治疗血量比例最低的队友
        var low = null;
        for (var j = 0; j < this.party.length; j++) {
          var o = this.party[j];
          if (o.dead) continue;
          if (o.hp / o.maxHp < 0.97 && (!low || o.hp / o.maxHp < low.hp / low.maxHp)) low = o;
        }
        if (low) {
          m.atkT = 0.85;
          var amt = def.heal * m.mult * (ult ? 1.3 : 1) * (Math.random() < m.crit ? 1.8 : 1);
          var real = Math.min(amt, low.maxHp - low.hp);
          low.hp += real;
          m.heal += real;
          this.projs.push({ kind: 'heal', sx: m.x, sy: m.y, tx: low.x, ty: low.y, t: 0, dur: 0.18, color: '#7dffb0' });
          this.fx.text(low.x, low.y - 30, '+' + Math.round(amt), { color: '#7dffb0', size: 16, vy: -50 });
          this.fx.burst(low.x, low.y, { n: 6, color: '#7dffb0', speed: 80, life: 0.5, angle: -Math.PI / 2, spread: 1 });
          A.play('heal', 0.25);
          continue;
        }
      }
      if (bd > def.range) { m.outOfRange = true; continue; }
      m.outOfRange = false;
      var moveMul = def.caster && m.moving ? 0.5 : 1;
      var crit = Math.random() < m.crit;
      var dmg = def.baseDps * def.interval * m.mult * (ult ? 1.6 : 1) * moveMul * (crit ? 2 : 1) * U.rand(0.9, 1.1);
      if (def.id === 'mage') {
        this.projs.push({ kind: 'fireball', sx: m.x, sy: m.y, tx: BOSS_X + U.rand(-30, 30), ty: BOSS_Y + U.rand(-20, 30), t: 0, dur: 0.38, color: '#ff8a3a', m: m, dmg: dmg, crit: crit });
      } else if (def.id === 'hunter') {
        this.projs.push({ kind: 'arrow', sx: m.x, sy: m.y, tx: BOSS_X + U.rand(-30, 30), ty: BOSS_Y + U.rand(-20, 30), t: 0, dur: 0.2, color: '#9ff0ff', m: m, dmg: dmg, crit: crit });
      } else if (def.id === 'heal') {
        this.projs.push({ kind: 'holy', sx: m.x, sy: m.y, tx: BOSS_X, ty: BOSS_Y, t: 0, dur: 0.3, color: '#d8ffe0', m: m, dmg: dmg, crit: crit });
      } else {
        // 近战：刀光
        var ang = Math.atan2(BOSS_Y - m.y, BOSS_X - m.x);
        this.fx.burst(m.x + Math.cos(ang) * 26, m.y + Math.sin(ang) * 26, { n: 5, color: def.color, speed: 220, angle: ang, spread: 0.6, life: 0.25, shape: 'spark' });
        this.projs.push({ kind: 'slash', x: m.x + Math.cos(ang) * 22, y: m.y + Math.sin(ang) * 22, ang: ang, t: 0, dur: 0.16, color: def.color });
        A.play('slash', 0.08);
        self.hitBoss(m, dmg, crit);
      }
    }
  };

  RaidBattle.prototype.updateProjs = function (d) {
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var p = this.projs[i];
      p.t += d;
      if (p.kind === 'fireball' && Math.random() < 0.7) {
        var k = p.t / p.dur;
        this.fx.burst(U.lerp(p.sx, p.tx, k), U.lerp(p.sy, p.ty, k), { n: 1, color: '#ff6a1a', speed: 30, life: 0.3, size: 5 });
      }
      if (p.t >= p.dur) {
        this.projs.splice(i, 1);
        if (p.m) {
          this.hitBoss(p.m, p.dmg, p.crit);
          this.fx.burst(p.tx, p.ty, { n: p.kind === 'fireball' ? 10 : 4, color: p.color, speed: 180, life: 0.35 });
        }
      }
    }
  };

  RaidBattle.prototype.useUlt = function () {
    if (this.ultCd > 0 || this.state !== 'fight') return;
    this.ultCd = 25;
    this.ultT = 8;
    if (this.tut && this.tut.step === 4) this.tutNext();
    A.play('ult');
    this.fx.flash('#ff9a3a', 0.4, 1.5);
    this.fx.shake(8, 0.4);
    this.fx.ring(this.rally.x, this.rally.y, 10, 260, '#ffb347', 0.8, 12);
    this.fx.burst(this.rally.x, this.rally.y, { n: 60, colors: ['#ffb347', '#fff', '#ff6a1a'], speed: 400, life: 0.9, shape: 'spark' });
    this.banner = { s: '焚心战旗！全队伤害 +60%', t: 1.6, c: '#ffb347' };
    this.say(U.pick(QUIPS.ult));
    P.vibrate(20);
  };

  // ---------------- 新手教学 ----------------
  RaidBattle.prototype.tutNext = function () {
    var tu = this.tut;
    tu.step++;
    tu.t = 0;
    tu.result = null;
    tu.spawned = false;
    A.play('click');
    if (tu.step === 5) {
      this.save.tutRaid = true;
      writeSave(this.save);
      this.mechT = 3;
      this.ultCd = 0;
      this.banner = { s: '开打！击败首领就能开箱拿装备', t: 2.4, c: '#ffd27a' };
    }
  };

  RaidBattle.prototype.updateTutorial = function (dt) {
    var tu = this.tut;
    tu.t += dt;
    var alive = this.alive();
    var cen = { x: this.rally.x, y: this.rally.y };
    if (tu.step === 1 && tu.dragged > 160 && tu.t > 0.8) this.tutNext();
    else if (tu.step === 2) {
      if (!tu.spawned && tu.t > 0.4) {
        tu.spawned = true;
        this.hazards.push({ type: 'circle', x: cen.x, y: cen.y + 10, r: 95, t: 0, dur: 3.2, dmg: 120, color: this.B.burn, tut: true });
        this.cast = { name: this.B.mechs.pools.name, t: 0, dur: 3.2 };
        A.play('warn');
      }
      if (tu.result && !tu.doneT) tu.doneT = tu.t;
      if (tu.doneT && tu.t - tu.doneT > 1.6) { tu.doneT = 0; this.tutNext(); }
    } else if (tu.step === 3) {
      if (!tu.spawned && tu.t > 0.4) {
        tu.spawned = true;
        var sx = cen.x > 270 ? cen.x - 150 : cen.x + 150;
        this.hazards.push({ type: 'soak', x: sx, y: U.clamp(cen.y + 40, 430, 640), r: 85, t: 0, dur: 4.2, dmg: 60, color: '#ffd84a', big: true, tut: true });
        this.cast = { name: this.B.mechs.soak.name, t: 0, dur: 4.2 };
        A.play('warn');
      }
      if (tu.result && !tu.doneT) tu.doneT = tu.t;
      if (tu.doneT && tu.t - tu.doneT > 1.6) { tu.doneT = 0; this.tutNext(); }
    }
    if (this.cast) { this.cast.t += dt; if (this.cast.t >= this.cast.dur) this.cast = null; }
    void alive;
  };

  RaidBattle.prototype.renderTutorial = function (ctx) {
    var tu = this.tut;
    if (!tu || tu.step >= 5 || this.state !== 'fight') return;
    var t = this.t;
    var cx = this.rally.x, cy = this.rally.y;
    var a = Math.min(1, tu.t * 4);
    ctx.save();
    ctx.globalAlpha = a;
    G.text(ctx, '新手教学 ' + (tu.step + 1) + '/5', 270, 104, { size: 15, weight: 'bold', align: 'center', color: '#ffd27a', stroke: '#000', strokeWidth: 4 });
    if (tu.step === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ARENA_TOP, 540, ARENA_BOTTOM - ARENA_TOP);
      G.glow(ctx, cx, cy, 120, '#ffd27a', 0.25);
      G.tip(ctx, '这是你的 5 人小队：坦克扛怪、治疗加血、3 个输出打首领。他们会自动战斗！', 270, 560, 460, { sub: '点击屏幕继续' });
      G.hand(ctx, cx + 20, cy - 10, t);
    } else if (tu.step === 1) {
      G.tip(ctx, '你只需要做一件事：按住屏幕拖动，整个小队会跟着你走', 270, 676, 460);
      var hx = 270 + Math.sin(t * 2.2) * 110;
      ctx.strokeStyle = 'rgba(255,230,160,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.moveTo(160, 600); ctx.lineTo(380, 600); ctx.stroke(); ctx.setLineDash([]);
      G.hand(ctx, hx, 588, 0.1);
      G.bar(ctx, 170, 650, 200, 10, Math.min(1, tu.dragged / 160), '#ffb347', { border: false });
    } else if (tu.step === 2) {
      if (tu.result === 'ok') G.tip(ctx, '漂亮！躲开红圈就不会掉血', 270, 676, 380, { border: '#4ad04a' });
      else if (tu.result === 'hit') G.tip(ctx, '被烫到了！下次看到红圈早点拖走', 270, 676, 400, { border: '#ff5a5a' });
      else G.tip(ctx, '红圈马上要爆炸！拖动小队，全部离开红圈！', 270, 676, 440, { border: '#ff5a5a' });
      if (!tu.result) G.hand(ctx, cx + (cx > 270 ? -130 : 130), cy + 20, t);
    } else if (tu.step === 3) {
      var h = this.hazards[0];
      if (tu.result === 'ok') G.tip(ctx, '完美分摊！黄圈 = 大家站一起', 270, 676, 400, { border: '#4ad04a' });
      else if (tu.result === 'hit') G.tip(ctx, '有人没站进去，全团都受伤了！', 270, 676, 400, { border: '#ff5a5a' });
      else G.tip(ctx, '黄圈正好相反：把全员拖进黄圈，一起分摊伤害！', 270, 676, 460, { border: '#ffd84a' });
      if (!tu.result && h) G.hand(ctx, h.x, h.y, t);
    } else if (tu.step === 4) {
      G.tip(ctx, '大招充能好了！点右下角按钮，全队伤害暴增 8 秒', 270, 676, 440);
      G.hand(ctx, 462, 862, t);
    }
    ctx.restore();
  };

  RaidBattle.prototype.updateDrops = function (d) {
    for (var i = 0; i < this.drops.length; i++) {
      var c = this.drops[i];
      c.t += d;
      if (c.landed) continue;
      c.vy += 1400 * d;
      c.x += c.vx * d; c.y += c.vy * d;
      if (c.y >= c.gy) {
        c.y = c.gy;
        if (Math.abs(c.vy) > 220) { c.vy *= -0.4; c.vx *= 0.6; A.play('shake', 0.05); }
        else { c.landed = true; this.fx.burst(c.x, c.y, { n: 26, colors: ['#ffd27a', '#fff'], speed: 260, life: 0.6, shape: 'spark' }); A.play('loot1'); }
      }
    }
  };

  RaidBattle.prototype.checkEnd = function () {
    if (this.bossHp <= 0) {
      this.bossHp = 0;
      this.state = 'victory';
      this.stateT = 0;
      this.hazards.length = 0;
      this.cast = null;
      A.play('bigBoom');
      setTimeout(function () { A.play('victory'); }, 500);
      this.fx.flash('#ffffff', 0.9, 1.2);
      this.fx.shake(22, 1.0);
      this.fx.burst(BOSS_X, BOSS_Y, { n: 160, colors: [this.B.c1, '#fff', '#ffd27a', this.B.eye], speed: 800, life: 1.6, size: 6, shape: 'spark' });
      this.fx.ring(BOSS_X, BOSS_Y, 20, 600, this.B.c1, 1.2, 16);
      this.slowmo(0.2, 1.2);
      P.vibrate(80);
      this.drops = [{ x: BOSS_X, y: BOSS_Y, vx: U.rand(-80, 80), vy: -520, gy: 520, t: 0 }];
      return;
    }
    if (!this.alive().length) {
      this.state = 'wipe';
      this.stateT = 0;
      this.cast = null;
      A.play('wipe');
      this.slowmo(0.3, 1);
    }
  };

  RaidBattle.prototype.revive = function () {
    var self = this;
    ER.ads.show('引魂复活：全员满血，首领血量保留').then(function (ok) {
      if (!ok) return;
      self.revived = true;
      self.party.forEach(function (m) {
        m.dead = false; m.hp = m.maxHp;
        self.fx.burst(m.x, m.y, { n: 20, colors: ['#bfefff', '#fff'], speed: 220, life: 0.9, angle: -Math.PI / 2, spread: 0.8 });
      });
      self.hazards.length = 0;
      self.burns.length = 0;
      self.state = 'fight';
      self.stateT = 0;
      self.mechT = 4;
      self.ultCd = 0;
      self.fx.flash('#bfefff', 0.6, 1.5);
      self.banner = { s: '引魂祭司：起来，再打一次！', t: 2, c: '#bfefff' };
      A.play('levelup');
    });
  };

  RaidBattle.prototype.retreat = function () {
    var gain = 5 + Math.round((1 - this.bossHp / this.boss.maxHp) * 20);
    this.save.shards += gain;
    writeSave(this.save);
    var hub = new RaidHub();
    hub.toast = '撤退了，拾到 ' + gain + ' 余烬碎片';
    this.app.goto(hub);
  };

  // ---------------- 绘制 ----------------
  RaidBattle.prototype.render = function (ctx) {
    var self = this, B = this.B;
    ctx.drawImage(getFloor(B), 0, 0);
    ctx.save();
    ctx.translate(this.fx.sx, this.fx.sy);
    var i;
    // 燃烧地面
    for (i = 0; i < this.burns.length; i++) {
      var b = this.burns[i];
      var fade = Math.min(1, b.life / 1, (b.max - b.life) * 4);
      var g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r);
      g.addColorStop(0, U.rgba(b.color, 0.55 * fade));
      g.addColorStop(0.75, U.rgba(b.color, 0.35 * fade));
      g.addColorStop(1, U.rgba(b.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    // 技能预警
    for (i = 0; i < this.hazards.length; i++) this.drawHazard(ctx, this.hazards[i]);
    // 集合点
    if (this.state === 'fight' || this.state === 'intro') {
      var pulse = 1 + Math.sin(this.t * 6) * 0.1;
      ctx.strokeStyle = this.dragging ? 'rgba(255,215,122,0.8)' : 'rgba(255,215,122,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(this.rally.x, this.rally.y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 首领
    if (this.state !== 'victory' || this.stateT < 0.25) {
      drawBoss(ctx, B, BOSS_X, BOSS_Y, BOSS_R, this.t, this.bossHurt, this.enraged || this.phase2, this.bossSlam);
    }
    // 小队
    var ult = this.ultT > 0;
    for (i = 0; i < this.party.length; i++) drawMember(ctx, this.party[i], this.t, { ult: ult });
    // 投射物
    for (i = 0; i < this.projs.length; i++) {
      var p = this.projs[i];
      var k = U.clamp(p.t / p.dur, 0, 1);
      if (p.kind === 'slash') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.strokeStyle = U.rgba(p.color, 1 - k);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 20, -1 + k, 1 - k * 0.5); ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'heal') {
        ctx.strokeStyle = U.rgba('#7dffb0', 0.8 * (1 - k));
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.tx, p.ty); ctx.stroke();
      } else {
        var x = U.lerp(p.sx, p.tx, k), y = U.lerp(p.sy, p.ty, k);
        if (p.kind === 'arrow') {
          var ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * 16, y - Math.sin(ang) * 16); ctx.lineTo(x, y); ctx.stroke();
        } else {
          G.glow(ctx, x, y, p.kind === 'fireball' ? 20 : 12, p.color, 0.9);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, y, p.kind === 'fireball' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    this.fx.renderParticles(ctx);
    this.fx.renderTexts(ctx);
    ctx.restore();

    if (ult) G.vignette(ctx, '#ff7a1a', 0.35 + Math.sin(this.t * 8) * 0.05);
    if (this.party.some(function (m) { return !m.dead && m.hp / m.maxHp < 0.3; })) G.vignette(ctx, '#ff0000', 0.18);

    // 掉落的宝箱
    for (var dI = 0; dI < this.drops.length; dI++) {
      var dc = this.drops[dI];
      if (dc.landed) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var pg = ctx.createLinearGradient(0, dc.y - 380, 0, dc.y);
        pg.addColorStop(0, 'rgba(255,210,122,0)');
        pg.addColorStop(1, 'rgba(255,210,122,0.55)');
        ctx.fillStyle = pg;
        ctx.fillRect(dc.x - 45, dc.y - 380, 90, 380);
        ctx.restore();
        G.rays(ctx, dc.x, dc.y - 20, 150, '#ffd27a', this.t, 12, 0.35);
      }
      ER.drawChest(ctx, dc.x, dc.y, 0.55, 0, '#ffd27a', 0.6);
      if (dc.landed) G.text(ctx, '宝箱掉落！', dc.x, dc.y + 50, { size: 24, weight: 'bold', align: 'center', color: '#ffd27a', stroke: '#000', strokeWidth: 5 });
    }
    if (this.state === 'fight' && !this.tut || (this.tut && this.tut.step >= 5 && this.state === 'fight')) {
      G.text(ctx, '目标：击败首领  ·  躲开红色  ·  黄圈集合', 270, ARENA_BOTTOM - 12, { size: 14, align: 'center', color: 'rgba(255,220,170,0.75)' });
    }
    this.renderHud(ctx);
    this.renderTutorial(ctx);
    this.fx.renderFlash(ctx);

    if (this.state === 'intro') {
      var a = Math.min(1, this.stateT * 3) * Math.min(1, (1.6 - this.stateT) * 3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 380, 540, 120);
      G.text(ctx, '第 ' + this.boss.tier + ' 层' + (this.farm ? '（刷装备）' : ''), 270, 415, { size: 22, align: 'center', color: '#ffd9a0' });
      G.text(ctx, B.name, 270, 455, { size: 34, weight: 'bold', align: 'center', color: B.c1, stroke: '#000', strokeWidth: 5 });
      ctx.restore();
    }
    if (this.hintT > 0 && this.state !== 'wipe') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.hintT);
      G.panel(ctx, 70, 640, 400, 74, { radius: 16 });
      G.text(ctx, '按住屏幕拖动，带领全队躲开红圈', 270, 666, { size: 19, align: 'center', color: '#fff' });
      G.text(ctx, '轻点地面也能直接走位 · 黄圈要全员站进去', 270, 694, { size: 15, align: 'center', color: '#ffd27a' });
      // 手指动画
      var fx = 270 + Math.sin(this.t * 2.4) * 80;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(fx, 610, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.banner && this.banner.t > 0) {
      this.banner.t -= 1 / 60;
      var bk = Math.min(1, this.banner.t * 3);
      ctx.save();
      ctx.globalAlpha = bk;
      G.text(ctx, this.banner.s, 270, 340, { size: 26, weight: 'bold', align: 'center', color: this.banner.c, stroke: '#000', strokeWidth: 5 });
      ctx.restore();
    }
    if (this.state === 'wipe' && this.stateT > 1.2) this.renderWipe(ctx);
    if (this.paused) this.renderPause(ctx);
    if (this.state === 'victory') {
      var vk = U.clamp((this.stateT - 0.6) * 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = vk;
      ctx.translate(270, 330);
      ctx.scale(0.8 + U.easeOutBack(vk) * 0.2, 0.8 + U.easeOutBack(vk) * 0.2);
      G.text(ctx, '首领击杀！', 0, 0, { size: 56, weight: 'bold', align: 'center', color: '#ffd27a', stroke: '#4a1a00', strokeWidth: 8 });
      G.text(ctx, '用时 ' + U.fmtTime(this.fightTime), 0, 54, { size: 22, align: 'center', color: '#fff' });
      ctx.restore();
    }
    void self;
  };

  RaidBattle.prototype.drawHazard = function (ctx, h) {
    var k = U.clamp(h.t / h.dur, 0, 1);
    var col = h.color;
    var blink = 0.55 + Math.sin(this.t * (10 + k * 20)) * 0.2;
    ctx.save();
    if (h.type === 'circle' || h.type === 'soak') {
      ctx.fillStyle = U.rgba(col, 0.16);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = U.rgba(col, 0.32);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = U.rgba(col, blink);
      ctx.lineWidth = h.type === 'soak' ? 5 : 3;
      if (h.type === 'soak') ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (h.type === 'soak') {
        var inCount = this.alive().filter(function (m) { return U.dist(m.x, m.y, h.x, h.y) <= h.r + 6; }).length;
        G.text(ctx, '集合分摊 ' + inCount + '/' + this.alive().length, h.x, h.y - h.r - 16, { size: 18, weight: 'bold', align: 'center', color: '#ffd84a', stroke: '#000' });
        // 下落的陨石
        var my = U.lerp(h.y - 500, h.y, U.easeInCubic(k));
        G.glow(ctx, h.x, my, 40, '#ffd84a', 0.9);
      }
      if (h.nova) {
        G.text(ctx, '远离首领！', BOSS_X, BOSS_Y + BOSS_R + 62, { size: 22, weight: 'bold', align: 'center', color: '#ff8a4a', stroke: '#000' });
      }
    } else if (h.type === 'hband') {
      ctx.fillStyle = U.rgba(col, 0.16);
      ctx.fillRect(0, h.y - h.h / 2, 540, h.h);
      ctx.fillStyle = U.rgba(col, 0.3);
      ctx.fillRect(0, h.y - h.h / 2, 540 * k, h.h);
      ctx.strokeStyle = U.rgba(col, blink);
      ctx.lineWidth = 3;
      ctx.strokeRect(-4, h.y - h.h / 2, 548, h.h);
    } else if (h.type === 'vband') {
      ctx.fillStyle = U.rgba(col, 0.16);
      ctx.fillRect(h.x - h.w / 2, ARENA_TOP, h.w, ARENA_BOTTOM - ARENA_TOP);
      ctx.fillStyle = U.rgba(col, 0.3);
      ctx.fillRect(h.x - h.w / 2, ARENA_TOP, h.w, (ARENA_BOTTOM - ARENA_TOP) * k);
      ctx.strokeStyle = U.rgba(col, blink);
      ctx.lineWidth = 3;
      ctx.strokeRect(h.x - h.w / 2, ARENA_TOP, h.w, ARENA_BOTTOM - ARENA_TOP);
    }
    ctx.restore();
  };

  RaidBattle.prototype.renderHud = function (ctx) {
    var self = this, B = this.B;
    // 顶部
    var tg = ctx.createLinearGradient(0, 0, 0, 92);
    tg.addColorStop(0, 'rgba(0,0,0,0.85)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, 540, 92);
    this.ui.button(ctx, 12, 14, 56, 44, 'Ⅱ', function () { if (self.state === 'fight' || self.state === 'intro') self.paused = true; }, { color: '#3a3346', size: 20, id: 'pause' });
    G.text(ctx, B.name, 84, 24, { size: 18, weight: 'bold', color: B.c1 });
    G.text(ctx, '第' + this.boss.tier + '层', 520, 24, { size: 15, align: 'right', color: '#ccc' });
    var pct = this.bossHp / this.boss.maxHp;
    G.bar(ctx, 84, 40, 436, 20, pct, this.enraged ? '#ff2a2a' : '#d8362a', { ghost: this.bossGhost });
    G.text(ctx, U.fmt(Math.max(0, this.bossHp)) + '  ' + (pct * 100).toFixed(1) + '%', 302, 50, { size: 14, weight: 'bold', align: 'center', color: '#fff' });
    var left = this.ENRAGE - this.fightTime;
    G.text(ctx, left > 0 ? '狂暴倒计时 ' + U.fmtTime(left) : '已狂暴', 84, 74, { size: 14, color: left < 30 ? '#ff6a6a' : '#aaa' });
    var dps = this.fightTime > 1 ? this.party.reduce(function (a, m) { return a + m.dmg; }, 0) / this.fightTime : 0;
    G.text(ctx, '团队DPS ' + U.fmt(dps), 520, 74, { size: 14, align: 'right', color: '#ffd27a' });
    // 读条
    if (this.cast) {
      var ck = this.cast.t / this.cast.dur;
      G.bar(ctx, 170, BOSS_Y + BOSS_R + 14, 200, 14, ck, '#ffb347', { bg: 'rgba(0,0,0,0.7)' });
      G.text(ctx, this.cast.name, 270, BOSS_Y + BOSS_R + 21, { size: 12, weight: 'bold', align: 'center', color: '#fff', shadow: false });
    }
    // 底部面板
    var by = ARENA_BOTTOM;
    var bg = ctx.createLinearGradient(0, by, 0, 960);
    bg.addColorStop(0, 'rgba(18,14,24,0.92)');
    bg.addColorStop(1, 'rgba(8,6,12,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, by, 540, 960 - by);
    ctx.fillStyle = 'rgba(255,180,100,0.25)';
    ctx.fillRect(0, by, 540, 2);
    // 团队聊天
    for (var c = 0; c < this.chat.length; c++) {
      var ch = this.chat[c];
      ctx.save();
      ctx.globalAlpha = Math.min(1, ch.t);
      G.text(ctx, ch.s, 16, by + 20 + c * 24, { size: 15, color: '#ffcf8a' });
      ctx.restore();
    }
    // 团队框体
    for (var i = 0; i < this.party.length; i++) {
      var m = this.party[i];
      var fx = 12 + i * 76, fy = by + 92;
      G.panel(ctx, fx, fy, 72, 96, { radius: 10, border: m.dead ? '#555' : U.rgba(m.def.color, 0.6), lineWidth: 2 });
      drawPortrait(ctx, m.def, fx + 36, fy + 26, 20, m.dead);
      G.text(ctx, m.def.name, fx + 36, fy + 54, { size: 15, weight: 'bold', align: 'center', color: m.dead ? '#777' : '#fff' });
      G.bar(ctx, fx + 6, fy + 70, 60, 10, m.hp / m.maxHp, m.hp / m.maxHp < 0.35 ? '#ff4a4a' : '#4ad04a', { border: false });
      var tag = m.dead ? '阵亡' : m.outOfRange ? '够不着' : (m.def.caster && m.moving ? '移动中' : '');
      if (tag) G.text(ctx, tag, fx + 36, fy + 88, { size: 12, align: 'center', color: m.dead ? '#888' : '#ffb347' });
    }
    // 大招按钮
    var ux = 462, uy = by + 110, ur = 58;
    var ready = this.ultCd <= 0 && this.state === 'fight';
    var pressed = this.ui.hotspot('ult', ux - ur, uy - ur, ur * 2, ur * 2, function () { self.useUlt(); }, !ready);
    ctx.save();
    ctx.translate(ux, uy);
    if (pressed) ctx.scale(0.94, 0.94);
    if (ready) G.glow(ctx, 0, 0, ur * 1.6, '#ff9a3a', 0.4 + Math.sin(this.t * 5) * 0.15);
    var ug = ctx.createRadialGradient(-12, -14, 6, 0, 0, ur);
    ug.addColorStop(0, ready ? '#ffcf7a' : '#6a6070');
    ug.addColorStop(1, ready ? '#c2410c' : '#2a2430');
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(0, 0, ur, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ready ? '#ffe2b0' : '#777';
    ctx.stroke();
    if (!ready && this.ultCd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, ur, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.ultCd / 25)); ctx.closePath(); ctx.fill();
      G.text(ctx, Math.ceil(this.ultCd) + '', 0, 0, { size: 30, weight: 'bold', align: 'center', color: '#fff' });
    } else {
      // 战旗图标
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(-14, -26, 4, 46);
      ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(20, -18); ctx.lineTo(-10, -6); ctx.closePath(); ctx.fill();
      G.text(ctx, '焚心战旗', 0, 32, { size: 14, weight: 'bold', align: 'center', color: '#fff' });
    }
    ctx.restore();
  };

  RaidBattle.prototype.renderWipe = function (ctx) {
    var self = this;
    ctx.fillStyle = 'rgba(10,8,14,0.78)';
    ctx.fillRect(0, 0, 540, 960);
    G.text(ctx, '团灭了……', 270, 300, { size: 48, weight: 'bold', align: 'center', color: '#ff6a6a', stroke: '#000', strokeWidth: 6 });
    var pct = this.bossHp / this.boss.maxHp;
    G.text(ctx, '首领剩余血量 ' + (pct * 100).toFixed(1) + '%', 270, 360, { size: 22, align: 'center', color: '#fff' });
    G.text(ctx, pct < 0.2 ? '[影七]：就差一点！再来一次绝对能过！' : '[铁砧]：大家注意躲红圈，黄圈记得集合。', 270, 400, { size: 17, align: 'center', color: '#ffcf8a' });
    if (!this.revived) {
      this.ui.button(ctx, 90, 470, 360, 92, '引魂复活', function () { self.revive(); }, {
        color: '#2f7fd6', ad: true, sub: '全员满血原地复活 · 首领血量保留', size: 28, pulse: true, id: 'revive',
      });
    } else {
      G.text(ctx, '本场已使用过引魂复活', 270, 515, { size: 18, align: 'center', color: '#999' });
    }
    this.ui.button(ctx, 150, 600, 240, 64, '撤退', function () { self.retreat(); }, { color: '#4a4452', size: 22, sub: null, id: 'retreat' });
  };

  RaidBattle.prototype.renderPause = function (ctx) {
    var self = this;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 540, 960);
    G.text(ctx, '暂停', 270, 340, { size: 44, weight: 'bold', align: 'center', color: '#fff' });
    this.ui.button(ctx, 150, 420, 240, 70, '继续战斗', function () { self.paused = false; }, { color: '#c8602a', id: 'resume' });
    this.ui.button(ctx, 150, 510, 240, 64, '撤退', function () { self.paused = false; self.retreat(); }, { color: '#4a4452', id: 'p-retreat' });
  };

  // ================================================================== 战斗统计
  function RaidResult(battle) {
    this.b = battle;
    this.save = battle.save;
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.bonusChest = false;
    var total = 0, maxDmg = 1;
    battle.party.forEach(function (m) { total += m.dmg; if (m.dmg > maxDmg) maxDmg = m.dmg; });
    this.total = total;
    this.maxDmg = maxDmg;
    this.dps = total / Math.max(1, battle.fightTime);
    var aps = battle.avoidable / Math.max(1, battle.fightTime);
    this.grade = aps < 8 ? 'S' : aps < 25 ? 'A' : aps < 55 ? 'B' : 'C';
    this.firstKill = !battle.farm && battle.boss.tier === this.save.tier;
    var sorted = battle.party.slice().sort(function (a, b) { return b.dmg - a.dmg; });
    this.rows = sorted;
    var top = sorted[0];
    var worst = battle.party.slice().sort(function (a, b) { return b.avoid - a.avoid; })[0];
    this.quips = [];
    this.quips.push('[' + top.def.name + ']：伤害第一，我不说是谁。');
    if (worst.avoid > 300) this.quips.push('[晨露]：' + worst.def.name + '，你今天在火里待了很久。');
    else this.quips.push('[晨露]：今天没人站火里，奶得好轻松。');
    // 结算进度
    var save = this.save;
    save.kills++;
    if (this.firstKill) save.tier++;
    this.newRecord = this.dps > (save.bestDps || 0);
    if (this.newRecord) save.bestDps = Math.round(this.dps);
    writeSave(save);
  }

  RaidResult.prototype.enter = function () { A.play('victory'); };

  RaidResult.prototype.update = function (dt) {
    this.t += dt;
    this.fx.update(dt);
    if (Math.random() < dt * 6) {
      this.fx.burst(U.rand(0, 540), 960, { n: 1, color: '#ffb347', speed: 120, angle: -Math.PI / 2, spread: 0.3, life: 3, size: 3, drag: 0.2 });
    }
  };

  RaidResult.prototype.render = function (ctx) {
    var self = this, b = this.b;
    var bg = ctx.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, '#1a1018');
    bg.addColorStop(1, '#07060b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 540, 960);
    this.fx.renderParticles(ctx);
    G.text(ctx, this.firstKill ? '首杀！' + b.B.name : '击杀：' + b.B.name, 270, 60, { size: 26, weight: 'bold', align: 'center', color: '#ffd27a' });
    G.text(ctx, '战斗时长 ' + U.fmtTime(b.fightTime) + '   完美操作 ×' + b.perfect, 270, 96, { size: 17, align: 'center', color: '#ccc' });

    G.panel(ctx, 20, 124, 500, 420, {});
    G.text(ctx, '伤害统计', 40, 152, { size: 20, weight: 'bold', color: '#fff' });
    G.text(ctx, '团队DPS ' + U.fmt(this.dps) + (this.newRecord ? '  新纪录！' : ''), 500, 152, { size: 16, align: 'right', color: this.newRecord ? '#7dff9a' : '#ffd27a' });
    var grow = U.easeOutCubic(U.clamp(this.t / 1.4, 0, 1));
    for (var i = 0; i < this.rows.length; i++) {
      var m = this.rows[i];
      var y = 182 + i * 70;
      var w = 440 * (m.dmg / this.maxDmg) * grow;
      G.roundRect(ctx, 40, y, 460, 52, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      if (w > 4) {
        G.roundRect(ctx, 40, y, Math.max(12, w + 20), 52, 8);
        var g = ctx.createLinearGradient(40, 0, 500, 0);
        g.addColorStop(0, U.rgba(m.def.color, 0.85));
        g.addColorStop(1, U.rgba(m.def.color, 0.45));
        ctx.fillStyle = g;
        ctx.fill();
      }
      G.text(ctx, (i + 1) + '. ' + m.def.name, 54, y + 18, { size: 18, weight: 'bold', color: '#fff' });
      G.text(ctx, m.def.role, 54, y + 40, { size: 13, color: 'rgba(255,255,255,0.8)' });
      G.text(ctx, U.fmt(m.dmg * grow) + '  (' + U.fmt((m.dmg / Math.max(1, b.fightTime)) * grow) + '/秒)', 488, y + 18, { size: 16, weight: 'bold', align: 'right', color: '#fff' });
      var extra = m.def.id === 'heal' ? '治疗 ' + U.fmt(m.heal) : m.def.id === 'tank' ? '承伤 ' + U.fmt(m.taken) : '站火伤害 ' + U.fmt(m.avoid);
      G.text(ctx, extra, 488, y + 40, { size: 13, align: 'right', color: 'rgba(255,255,255,0.75)' });
    }
    // 走位评分
    var gk = U.clamp((this.t - 1.2) * 3, 0, 1);
    if (gk > 0) {
      ctx.save();
      ctx.globalAlpha = gk;
      G.text(ctx, '走位评分', 120, 580, { size: 18, align: 'center', color: '#ccc' });
      var gs = 1 + (1 - U.easeOutBack(gk)) * 1.5;
      ctx.translate(120, 630);
      ctx.scale(gs, gs);
      var gc = { S: '#ffb347', A: '#b35cff', B: '#3d8bff', C: '#aaaaaa' }[this.grade];
      G.text(ctx, this.grade, 0, 0, { size: 64, weight: 'bold', align: 'center', color: gc, stroke: '#000', strokeWidth: 6 });
      ctx.restore();
      G.paragraph(ctx, this.quips[0], 210, 590, 300, { size: 15, color: '#ffcf8a' });
      G.paragraph(ctx, this.quips[1], 210, 640, 300, { size: 15, color: '#ffcf8a' });
    }
    if (this.t > 1.5) {
      var chests = 1 + (this.bonusChest ? 1 : 0);
      if (!this.bonusChest) {
        this.ui.button(ctx, 40, 700, 460, 84, '团长私房宝箱', function () {
          ER.ads.show('额外一个宝箱（精良品质起）').then(function (ok) { if (ok) { self.bonusChest = true; A.play('coin'); } });
        }, { color: '#7a3fd0', ad: true, sub: '额外开 1 箱 · 精良品质起步', size: 26, pulse: true, id: 'bonus' });
      } else {
        G.text(ctx, '已获得团长私房宝箱！', 270, 742, { size: 20, weight: 'bold', align: 'center', color: '#d49bff' });
      }
      this.ui.button(ctx, 40, 806, 460, 88, '开箱分装备（' + chests + '箱）', function () { self.startLoot(); }, { color: '#c8602a', size: 28, id: 'loot' });
    }
  };

  RaidResult.prototype.startLoot = function () {
    var save = this.save, b = this.b;
    var luck = P.now() < (save.legendUntil || 0) ? 0.9 : 0;
    var queue = [];
    var floors = [this.firstKill ? 1 : 0];
    if (this.bonusChest) floors.push(2);
    floors.forEach(function (floor) {
      var owner = U.pick(MEMBERS).id;
      var slot = U.pick(['weapon', 'chest']);
      queue.push(Loot.makeItem({ slot: slot, ilvl: b.boss.ilvl, rarity: Loot.rollRarity(luck, floor), owner: owner }));
    });
    runLootQueue(this.app, save, queue, luck);
  };

  function runLootQueue(app, save, queue, luck) {
    if (!queue.length) {
      writeSave(save);
      app.goto(new RaidHub());
      return;
    }
    var item = queue.shift();
    var rerolled = false;
    var owner = MEMBER_BY_ID[item.owner];
    var next = function (scene) { scene.close(); runLootQueue(app, save, queue, luck); };
    var shardVal = function (it) { return 3 + it.rarity * it.rarity * 4; };
    var reveal = new ER.LootReveal({
      item: item,
      title: owner.name + '（' + owner.role + '）想要这件装备！',
      ownerName: owner.name + ' · ' + owner.role,
      compare: save.gear[item.owner][item.slot] || null,
      actions: function (scene) {
        var it = scene.item;
        var cur = save.gear[it.owner][it.slot];
        var acts = [];
        if (!rerolled && it.rarity < 4) {
          acts.push({
            label: '再摇一次', ad: true, color: '#7a3fd0', sub: '品质只升不降', full: true,
            onClick: function () {
              ER.ads.show('再摇一次：品质只升不降').then(function (ok) {
                if (!ok) return;
                rerolled = true;
                var r = Math.max(it.rarity, Loot.rollRarity(0.6 + luck, Math.min(4, it.rarity + (Math.random() < 0.55 ? 1 : 0))));
                scene.setItem(Loot.reforge(it, r));
              });
            },
          });
        }
        acts.push({
          label: '装备', color: '#2f9e4a', sub: cur ? '旧装备自动分解' : null,
          onClick: function () {
            if (cur) save.shards += shardVal(cur);
            save.gear[it.owner][it.slot] = it;
            writeSave(save);
            next(scene);
          },
        });
        acts.push({
          label: '分解', color: '#5a4a6a', sub: '+' + shardVal(it) + ' 余烬碎片',
          onClick: function () { save.shards += shardVal(it); writeSave(save); next(scene); },
        });
        return acts;
      },
    });
    app.push(reveal);
  }

  // ================================================================== 团队大厅
  function RaidHub() {
    this.save = loadSave();
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.toast = null;
    this.detail = null;
  }
  RaidHub.prototype.update = function (dt) {
    this.t += dt;
    this.fx.update(dt);
    if (Math.random() < dt * 8) {
      this.fx.burst(U.rand(0, 540), 960, { n: 1, color: '#ff8a3a', speed: 90, angle: -Math.PI / 2, spread: 0.4, life: 4, size: 2.5, drag: 0.1 });
    }
  };
  RaidHub.prototype.temperCost = function () { return 20 + (this.save.temper || 0) * 12; };

  RaidHub.prototype.render = function (ctx) {
    var self = this, save = this.save;
    var bg = ctx.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, '#1c1016');
    bg.addColorStop(1, '#07060b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 540, 960);
    this.fx.renderParticles(ctx);

    this.ui.button(ctx, 12, 14, 80, 44, '返回', function () { self.app.goto(new ER.MenuScene()); }, { color: '#3a3346', size: 18 });
    G.text(ctx, '余烬团本', 270, 36, { size: 28, weight: 'bold', align: 'center', color: '#ffb347', stroke: '#3a1200', strokeWidth: 5 });
    G.text(ctx, '碎片 ' + save.shards, 524, 36, { size: 16, align: 'right', color: '#ffcf8a' });

    // 首领卡片
    var boss = bossFor(save.tier);
    var B = boss.def;
    G.panel(ctx, 16, 70, 508, 250, { border: U.rgba(B.c1, 0.6) });
    drawBoss(ctx, B, 110, 190, 52, this.t, 0, false);
    G.text(ctx, '下一个首领 · 第 ' + save.tier + ' 层', 200, 100, { size: 15, color: '#bbb' });
    G.text(ctx, B.name, 200, 132, { size: 24, weight: 'bold', color: B.c1 });
    G.text(ctx, B.title, 200, 162, { size: 15, color: '#999' });
    var mechNames = Object.keys(B.mechs).map(function (k) { return B.mechs[k].name; }).join(' · ');
    G.paragraph(ctx, '机制：' + mechNames, 200, 192, 310, { size: 14, color: '#ddd' });
    var pp = partyPower(save);
    var ok = pp >= boss.recommend;
    G.text(ctx, '团队战力 ' + pp + ' / 推荐 ' + boss.recommend, 200, 248, { size: 16, weight: 'bold', color: ok ? '#7dff9a' : '#ffb347' });
    G.text(ctx, '首领血量 ' + U.fmt(boss.maxHp) + ' · 掉落装等 ' + boss.ilvl, 200, 276, { size: 14, color: '#aaa' });
    if (save.bestDps) G.text(ctx, '历史最高团队DPS ' + U.fmt(save.bestDps), 200, 300, { size: 13, color: '#ffd27a' });

    // 队伍
    G.text(ctx, '我的小队（点装备看详情）', 24, 344, { size: 16, color: '#ccc' });
    for (var i = 0; i < MEMBERS.length; i++) {
      var d = MEMBERS[i];
      var st = memberStats(save, d.id);
      var y = 362 + i * 70;
      G.panel(ctx, 16, y, 508, 62, { radius: 10, border: U.rgba(d.color, 0.4), lineWidth: 1.5 });
      drawPortrait(ctx, d, 46, y + 31, 24, false);
      G.text(ctx, d.name, 76, y + 22, { size: 18, weight: 'bold', color: '#fff' });
      G.text(ctx, d.role + ' · 战力 ' + st.power, 76, y + 44, { size: 13, color: '#bbb' });
      ['weapon', 'chest'].forEach(function (slot, si) {
        var it = save.gear[d.id][slot];
        var ix = 340 + si * 64, iy = y + 31;
        if (it) {
          Loot.drawIcon(ctx, slot, ix, iy, 50, it.rarity);
          self.ui.hotspot('item-' + d.id + slot, ix - 25, iy - 25, 50, 50, function () { self.detail = { item: it, owner: d }; });
        }
      });
      G.text(ctx, d.id === 'heal' ? '治疗' : d.id === 'tank' ? '承伤' : '输出', 500, y + 31, { size: 13, align: 'right', color: '#888' });
    }

    // 按钮
    this.ui.button(ctx, 16, 724, 508, 84, '开 战', function () {
      self.app.goto(new RaidBattle(self.save, self.save.tier, false));
    }, { color: '#c8602a', size: 34, sub: '第 ' + save.tier + ' 层 · ' + B.name, pulse: true, id: 'fight' });

    var by = 822;
    if (save.tier > 1) {
      this.ui.button(ctx, 16, by, 160, 62, '刷上一层', function () {
        self.app.goto(new RaidBattle(self.save, self.save.tier - 1, true));
      }, { color: '#4a5a7a', size: 20, sub: '装等 ' + bossFor(save.tier - 1).ilvl, id: 'farm' });
    } else {
      this.ui.button(ctx, 16, by, 160, 62, '刷上一层', function () {}, { color: '#4a5a7a', size: 20, sub: '击杀后解锁', disabled: true, id: 'farm' });
    }
    var cost = this.temperCost();
    this.ui.button(ctx, 190, by, 160, 62, '余烬淬炼', function () {
      if (save.shards < cost) return;
      save.shards -= cost;
      save.temper = (save.temper || 0) + 1;
      writeSave(save);
      A.play('levelup');
      self.toast = '全队战力 +3（淬炼 ' + save.temper + ' 级）';
      self.fx.burst(270, 500, { n: 40, colors: ['#ffb347', '#fff'], speed: 300, life: 0.8 });
    }, { color: '#8a5a2a', size: 20, sub: '消耗 ' + cost + ' 碎片', disabled: save.shards < cost, id: 'temper' });
    var now = P.now();
    if (now < (save.legendUntil || 0)) {
      this.ui.button(ctx, 364, by, 160, 62, '传说之夜', function () {}, { color: '#c86a1a', size: 20, sub: '剩余 ' + U.fmtTime((save.legendUntil - now) / 1000), id: 'night', disabled: false });
    } else {
      this.ui.button(ctx, 364, by, 160, 62, '传说之夜', function () {
        ER.ads.show('传说之夜：30分钟内高品质掉率大幅提升').then(function (ok2) {
          if (!ok2) return;
          save.legendUntil = P.now() + 30 * 60 * 1000;
          writeSave(save);
          A.play('loot3');
          self.toast = '传说之夜开启！30 分钟内更容易出史诗/传说';
        });
      }, { color: '#c86a1a', size: 19, sub: '高品质掉率↑', ad: true, id: 'night' });
    }
    G.text(ctx, '提示：先打不过就“刷上一层”攒装备，或用碎片淬炼', 270, 912, { size: 14, align: 'center', color: '#777' });

    if (this.toast) {
      this.toastT = (this.toastT || 0) + 1 / 60;
      var a = Math.min(1, (3 - this.toastT) * 2);
      if (a <= 0) { this.toast = null; this.toastT = 0; } else {
        ctx.save();
        ctx.globalAlpha = a;
        G.panel(ctx, 60, 650, 420, 56, { radius: 28, border: '#ffb347' });
        G.text(ctx, this.toast, 270, 678, { size: 17, align: 'center', color: '#ffd27a' });
        ctx.restore();
      }
    }
    if (this.detail) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, 540, 960);
      this.ui.hotspot('detail-bg', 0, 0, 540, 960, function () { self.detail = null; });
      Loot.drawCard(ctx, this.detail.item, 70, 300, 400, undefined, { ownerName: this.detail.owner.name + ' · ' + this.detail.owner.role });
      G.text(ctx, '点击任意处关闭', 270, 700, { size: 16, align: 'center', color: '#aaa' });
    }
  };

  ER.Games = ER.Games || {};
  ER.Games.raid = {
    title: '余烬团本',
    create: function () { return new RaidHub(); },
    _internals: { RaidBattle: RaidBattle, loadSave: loadSave, writeSave: writeSave, bossFor: bossFor },
  };
})();
