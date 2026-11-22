/**
 * 程序化 Q 版角色与怪物（纯 Canvas 绘制，可缓存为离屏帧）。
 * 坐标原点 = 脚底中心，向上为负；s = 缩放；face = 1 朝右 / -1 朝左。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, P = ER.platform;
  var OUT = '#1b1222';
  var SKIN = '#f2cfa8';

  function limb(ctx, x1, y1, x2, y2, w, color) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function blob(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw || 2.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  function shade(ctx, x, y, w, h, color) {
    // 简单的高光块，增加体积感
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // ------------------------------------------------------------------ 英雄
  var HERO = {
    warrior: { armor: '#6f86b8', trim: '#c9d4ea', cape: '#b8322a', accent: '#ffd24a' },
    rogue: { armor: '#4a3a5a', trim: '#7a6a8a', cape: null, accent: '#ffd24a' },
    mage: { armor: '#c2412c', trim: '#ffb347', cape: null, accent: '#ff8a3a' },
    hunter: { armor: '#2f7a6a', trim: '#8ad0b0', cape: '#3a5a2a', accent: '#4ae0ff' },
    priest: { armor: '#e8e4d8', trim: '#7dffb0', cape: '#cfd8c8', accent: '#7dffb0' },
  };

  /**
   * opt: kind, face, walk(相位), moving, atk(0~1 攻击进度,0=无), hurt, s, alpha, glow
   */
  function drawHero(ctx, x, y, opt) {
    var kind = opt.kind || 'warrior';
    var C = HERO[kind];
    var s = opt.s || 1;
    var face = opt.face || 1;
    var walk = opt.walk || 0;
    var mv = opt.moving ? 1 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    if (opt.glow) G.glow(ctx, 0, -24, 46, opt.glow, 0.45);
    ctx.scale(face, 1);
    var bob = mv ? Math.abs(Math.sin(walk)) * -2.5 : Math.sin(walk * 0.5) * 0.8;
    var sw = mv ? Math.sin(walk) : 0;
    // 腿
    var robe = kind === 'mage' || kind === 'priest';
    if (!robe) {
      limb(ctx, -3.5, -13 + bob, -3.5 + sw * 5, -2 - Math.max(0, sw) * 2, 5, U.mix(C.armor, '#000000', 0.35));
      limb(ctx, 3.5, -13 + bob, 3.5 - sw * 5, -2 - Math.max(0, -sw) * 2, 5, U.mix(C.armor, '#000000', 0.2));
    } else {
      limb(ctx, -3, -8 + bob, -3 + sw * 4, -1.5, 4.5, '#3a2a2a');
      limb(ctx, 3, -8 + bob, 3 - sw * 4, -1.5, 4.5, '#3a2a2a');
    }
    ctx.translate(0, bob);
    // 披风
    if (C.cape) {
      var wave = Math.sin(walk * (mv ? 1 : 0.4)) * 2;
      ctx.beginPath();
      ctx.moveTo(-6, -29); ctx.lineTo(6, -29);
      ctx.quadraticCurveTo(-4 + wave, -14, -12 + wave, -5);
      ctx.lineTo(-15 + wave * 1.5, -8);
      ctx.quadraticCurveTo(-11, -20, -6, -29);
      ctx.closePath();
      blob(ctx, C.cape, 2);
    }
    // 后手（猎手箭袋 / 战士盾牌）
    var atk = opt.atk || 0;
    if (kind === 'hunter') {
      ctx.save(); ctx.translate(-6, -26); ctx.rotate(-0.4);
      ctx.beginPath(); G.roundRect(ctx, -3, -6, 6, 16, 2); blob(ctx, '#7a4a22', 2);
      ctx.fillStyle = '#e8e2d6'; ctx.fillRect(-2, -10, 1.5, 5); ctx.fillRect(0.5, -11, 1.5, 6);
      ctx.restore();
    }
    limb(ctx, -6, -26, -9 - sw * 2, -17, 4.5, U.mix(C.armor, '#000000', 0.25));
    if (kind === 'warrior') {
      ctx.beginPath(); ctx.arc(-9, -19, 8, 0, Math.PI * 2); blob(ctx, '#3d5a9a', 2.5);
      ctx.beginPath(); ctx.arc(-9, -19, 5, 0, Math.PI * 2); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(-9, -19, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // 躯干
    ctx.beginPath();
    if (robe) {
      ctx.moveTo(-8, -30); ctx.lineTo(8, -30); ctx.lineTo(11, -6); ctx.quadraticCurveTo(0, -3, -11, -6); ctx.closePath();
    } else {
      G.roundRect(ctx, -8.5, -31, 17, 19, 5);
    }
    blob(ctx, C.armor);
    shade(ctx, -6, -28, 4, robe ? 18 : 12, 'rgba(255,255,255,0.18)');
    ctx.fillStyle = C.trim;
    if (robe) { ctx.fillRect(-1.5, -29, 3, 22); ctx.fillRect(-10, -9, 20, 2.5); }
    else { ctx.fillRect(-8, -17, 16, 3); ctx.fillStyle = C.accent; ctx.fillRect(-1.5, -17, 3, 3); }
    if (kind === 'warrior') { // 护肩
      ctx.beginPath(); ctx.ellipse(6, -29, 6, 4, 0.3, 0, Math.PI * 2); blob(ctx, C.trim, 2);
    }
    if (kind === 'rogue') { // 围巾
      ctx.beginPath(); ctx.moveTo(-8, -31); ctx.lineTo(8, -31); ctx.lineTo(7, -27); ctx.lineTo(-7, -27); ctx.closePath(); blob(ctx, C.accent, 2);
      ctx.beginPath(); ctx.moveTo(-7, -29); ctx.lineTo(-14, -24 + Math.sin(walk) * 2); ctx.lineTo(-11, -22); ctx.closePath(); blob(ctx, C.accent, 1.5);
    }
    // 头
    var hy = -42;
    if (kind === 'rogue') {
      ctx.beginPath(); ctx.arc(0, hy, 11.5, 0, Math.PI * 2); blob(ctx, '#3a2a4a');
      ctx.beginPath(); ctx.ellipse(3, hy + 1, 7.5, 6.5, 0, 0, Math.PI * 2); ctx.fillStyle = SKIN; ctx.fill();
      ctx.fillStyle = '#2a1a3a'; ctx.fillRect(-4, hy + 3, 15, 5); // 面罩
      ctx.beginPath(); ctx.moveTo(-10, hy - 6); ctx.quadraticCurveTo(0, hy - 18, 10, hy - 6); ctx.lineTo(0, hy - 10); ctx.closePath(); blob(ctx, '#3a2a4a', 1.5);
    } else {
      ctx.beginPath(); ctx.arc(0, hy, 11, 0, Math.PI * 2); blob(ctx, SKIN);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-4, hy - 4, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = OUT;
    ctx.beginPath(); ctx.ellipse(2.5, hy, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.ellipse(7.5, hy, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(2.6, hy - 1.6, 1, 1); ctx.fillRect(7.6, hy - 1.6, 1, 1);
    if (kind !== 'rogue') {
      ctx.fillStyle = 'rgba(230,110,110,0.5)';
      ctx.beginPath(); ctx.ellipse(1, hy + 4, 2, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 头饰
    if (kind === 'warrior') {
      ctx.beginPath(); ctx.arc(0, hy - 1, 12, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(12, hy - 2); ctx.lineTo(-12, hy - 2); ctx.closePath();
      blob(ctx, '#aab4c8');
      ctx.fillStyle = '#8890a8'; ctx.fillRect(-12, hy - 4, 24, 3);
      ctx.beginPath(); ctx.moveTo(-2, hy - 12); ctx.quadraticCurveTo(-10, hy - 22, -16, hy - 14); ctx.quadraticCurveTo(-8, hy - 16, -2, hy - 9); ctx.closePath();
      blob(ctx, C.cape, 1.5);
    } else if (kind === 'mage') {
      ctx.beginPath(); ctx.moveTo(-14, hy - 4); ctx.lineTo(14, hy - 4); ctx.lineTo(6, hy - 8);
      ctx.quadraticCurveTo(2, hy - 24, -8, hy - 30 + Math.sin(walk) * 1.5); ctx.quadraticCurveTo(-4, hy - 18, -6, hy - 8); ctx.closePath();
      blob(ctx, '#7a2a8a');
      ctx.fillStyle = C.trim; ctx.fillRect(-9, hy - 8, 16, 3);
      ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(-8, hy - 30 + Math.sin(walk) * 1.5, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'hunter') {
      ctx.beginPath(); ctx.moveTo(-12, hy - 3); ctx.quadraticCurveTo(0, hy - 18, 13, hy - 4); ctx.lineTo(-12, hy - 3); ctx.closePath();
      blob(ctx, '#3a5a2a');
      ctx.beginPath(); ctx.moveTo(-6, hy - 10); ctx.quadraticCurveTo(-14, hy - 24, -20, hy - 22); ctx.quadraticCurveTo(-12, hy - 16, -8, hy - 8); ctx.closePath();
      blob(ctx, '#e8463a', 1.5);
    } else if (kind === 'priest') {
      ctx.beginPath(); ctx.arc(0, hy - 1, 12.5, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(9, hy + 6); ctx.lineTo(-12, hy + 6); ctx.closePath();
      ctx.fillStyle = C.armor; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(3, hy + 1, 8, 7, 0, 0, Math.PI * 2); ctx.fillStyle = SKIN; ctx.fill();
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.ellipse(2.5, hy, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.ellipse(7.5, hy, 1.6, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,170,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, hy - 17, 9, 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // 前手 + 武器（攻击挥动）
    var swing = 0;
    if (atk > 0) {
      var k = 1 - atk;
      swing = k < 0.3 ? -k / 0.3 * 1.2 : -1.2 + ((k - 0.3) / 0.7) * 2.8;
    }
    var robeHold = kind === 'mage' || kind === 'priest';
    var ang = (kind === 'hunter' ? 0.1 : robeHold ? -0.9 : -0.35) + swing + sw * 0.25;
    ctx.save();
    ctx.translate(6, -26);
    ctx.rotate(ang);
    // 手臂
    limb(ctx, 0, 0, 0, 10, 4.5, C.armor);
    ctx.translate(0, 11);
    // 武器相对手臂的握持角度：剑刃朝前上方，法杖保持竖直
    if (kind === 'warrior' || kind === 'rogue') ctx.rotate(1.15);
    else if (robeHold) ctx.rotate(-ang * (atk > 0 ? 0.4 : 1));
    if (kind === 'warrior') {
      ctx.fillStyle = '#e8e2d6'; ctx.beginPath(); ctx.moveTo(-2.5, -2); ctx.lineTo(2.5, -2); ctx.lineTo(2.5, -26); ctx.lineTo(0, -31); ctx.lineTo(-2.5, -26); ctx.closePath(); blob(ctx, '#e8e2d6', 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-0.6, -27, 1.2, 22);
      ctx.beginPath(); ctx.rect(-6, -3, 12, 3.5); blob(ctx, C.accent, 1.5);
    } else if (kind === 'rogue') {
      ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(2, -1); ctx.lineTo(1, -16); ctx.lineTo(-1, -18); ctx.closePath(); blob(ctx, '#d8dce8', 1.8);
    } else if (kind === 'hunter') {
      ctx.rotate(-ang + 0.05);
      ctx.beginPath(); ctx.arc(-2, 0, 14, -1.3, 1.3); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#a0662a'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
      var pull = atk > 0 ? Math.sin(atk * Math.PI) * 6 : 0;
      ctx.beginPath(); ctx.moveTo(-2 + Math.cos(-1.3) * 14, Math.sin(-1.3) * 14); ctx.lineTo(-6 - pull, 0); ctx.lineTo(-2 + Math.cos(1.3) * 14, Math.sin(1.3) * 14); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.rect(-1.8, -26, 3.6, 34); blob(ctx, '#7a4a22', 1.8);
      var orb = kind === 'mage' ? '#ff8a3a' : '#bfffd8';
      G.glow(ctx, 0, -29, 14 + (atk > 0 ? 8 : 0), orb, 0.9);
      ctx.beginPath(); ctx.arc(0, -29, 4.5, 0, Math.PI * 2); blob(ctx, kind === 'mage' ? '#ffd27a' : '#eafff0', 1.8);
    }
    ctx.restore();
    ctx.restore();
    if (opt.hurt > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, opt.hurt * 4);
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath(); ctx.ellipse(x, y - 24 * s, 14 * s, 26 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawTomb(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s || 1, s || 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-9, -16); ctx.arc(0, -16, 9, Math.PI, 0); ctx.lineTo(9, 0); ctx.closePath();
    blob(ctx, '#6a6672');
    ctx.fillStyle = '#4a4652'; ctx.fillRect(-1.5, -20, 3, 12); ctx.fillRect(-5, -16, 10, 3);
    ctx.restore();
  }

  // ------------------------------------------------------------------ 怪物
  var MON = {
    imp: { body: '#e0463a', belly: '#ffb08a', h: 30 },
    bat: { body: '#8a4ad0', belly: '#c89aff', h: 26 },
    ghoul: { body: '#6ab04a', belly: '#a8d88a', h: 40 },
    brute: { body: '#d0782a', belly: '#f0c08a', h: 56 },
    king: { body: '#4a1a1a', belly: '#ff6a1a', h: 90 },
    slime: { body: '#5ad07a', belly: '#c8ffd8', h: 34 },
    wisp: { body: '#ff9a3a', belly: '#fff2a0', h: 40 },
  };

  /** 绘制怪物；f = 动画相位(0~1)，tint 可替换主色 */
  function drawMonster(ctx, type, f, tint) {
    var M = MON[type];
    var body = tint || M.body;
    var belly = tint ? U.mix(tint, '#ffffff', 0.45) : M.belly;
    var t = f * Math.PI * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(0, 0, M.h * 0.45, M.h * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    var i;
    if (type === 'imp') {
      var hop = Math.abs(Math.sin(t)) * -4;
      limb(ctx, -5, -10 + hop, -6 + Math.sin(t) * 3, -1, 4, U.mix(body, '#000', 0.3));
      limb(ctx, 5, -10 + hop, 6 - Math.sin(t) * 3, -1, 4, U.mix(body, '#000', 0.3));
      ctx.save(); ctx.translate(0, hop);
      // 尾巴
      ctx.beginPath(); ctx.moveTo(-8, -12); ctx.quadraticCurveTo(-20, -10 + Math.sin(t) * 4, -18, -22); ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = body; ctx.lineWidth = 2; ctx.stroke();
      // 小翅膀
      var fl = Math.sin(t * 2) * 3;
      ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(-18, -30 - fl); ctx.lineTo(-14, -20); ctx.lineTo(-18, -16 - fl * 0.5); ctx.closePath(); blob(ctx, U.mix(body, '#000', 0.35), 1.5);
      ctx.beginPath(); ctx.ellipse(0, -18, 11, 12, 0, 0, Math.PI * 2); blob(ctx, body);
      ctx.beginPath(); ctx.ellipse(2, -14, 6, 6, 0, 0, Math.PI * 2); ctx.fillStyle = belly; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, -27); ctx.lineTo(-10, -36); ctx.lineTo(-3, -29); ctx.closePath(); blob(ctx, '#f0e0c0', 1.5);
      ctx.beginPath(); ctx.moveTo(5, -28); ctx.lineTo(7, -37); ctx.lineTo(9, -26); ctx.closePath(); blob(ctx, '#f0e0c0', 1.5);
      ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(1, -21, 2.6, 2, 0, 0, Math.PI * 2); ctx.ellipse(7, -21, 2.6, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = OUT; ctx.fillRect(1.5, -22, 1.4, 2.5); ctx.fillRect(7.5, -22, 1.4, 2.5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(3, -13); ctx.lineTo(6, -15); ctx.lineTo(9, -13); ctx.stroke();
      ctx.restore();
    } else if (type === 'bat') {
      var flap = Math.sin(t * 2);
      ctx.save(); ctx.translate(0, -16 + Math.sin(t) * 3);
      for (var sd = -1; sd <= 1; sd += 2) {
        ctx.beginPath();
        ctx.moveTo(sd * 5, -2);
        ctx.quadraticCurveTo(sd * 16, -14 - flap * 8, sd * 26, -6 - flap * 10);
        ctx.lineTo(sd * 22, 2 - flap * 4); ctx.lineTo(sd * 16, -1 - flap * 3); ctx.lineTo(sd * 11, 5 - flap * 2); ctx.closePath();
        blob(ctx, U.mix(body, '#000', 0.25), 2);
      }
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 9, 0, 0, Math.PI * 2); blob(ctx, body);
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-7, -14); ctx.lineTo(-2, -8); ctx.closePath(); blob(ctx, body, 1.5);
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(7, -14); ctx.lineTo(2, -8); ctx.closePath(); blob(ctx, body, 1.5);
      ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.arc(-3, -1, 2, 0, Math.PI * 2); ctx.arc(3, -1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-2, 4, 1.5, 2.5); ctx.fillRect(1, 4, 1.5, 2.5);
      ctx.restore();
    } else if (type === 'ghoul') {
      var sh = Math.sin(t);
      limb(ctx, -5, -14, -7 + sh * 5, -1, 5, U.mix(body, '#000', 0.35));
      limb(ctx, 5, -14, 6 - sh * 5, -1, 5, U.mix(body, '#000', 0.25));
      ctx.save(); ctx.translate(0, Math.abs(sh) * -2); ctx.rotate(0.15);
      limb(ctx, -4, -28, 10, -24 + sh * 2, 5, U.mix(body, '#000', 0.3));
      ctx.beginPath(); G.roundRect(ctx, -10, -34, 20, 22, 7); blob(ctx, body);
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-10, -18, 20, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-4, -30, 2, 8); ctx.fillRect(3, -32, 2, 6);
      ctx.beginPath(); ctx.arc(3, -40, 10, 0, Math.PI * 2); blob(ctx, belly);
      ctx.fillStyle = '#d0ff5a'; G.glow(ctx, 6, -42, 9, '#d0ff5a', 0.7);
      ctx.beginPath(); ctx.arc(1, -41, 2.2, 0, Math.PI * 2); ctx.arc(8, -41, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(1, -35); ctx.lineTo(9, -35); ctx.stroke();
      limb(ctx, 4, -28, 18, -24 - sh * 2, 5, body);
      ctx.restore();
    } else if (type === 'brute') {
      var st = Math.sin(t);
      limb(ctx, -9, -18, -10 + st * 5, -2, 8, U.mix(body, '#000', 0.35));
      limb(ctx, 9, -18, 10 - st * 5, -2, 8, U.mix(body, '#000', 0.25));
      ctx.save(); ctx.translate(0, Math.abs(st) * -2);
      limb(ctx, -14, -38, -20, -20 + st * 2, 8, U.mix(body, '#000', 0.3));
      ctx.beginPath(); ctx.ellipse(0, -32, 20, 18, 0, 0, Math.PI * 2); blob(ctx, body, 3);
      ctx.beginPath(); ctx.ellipse(3, -27, 11, 10, 0, 0, Math.PI * 2); ctx.fillStyle = belly; ctx.fill();
      // 肩甲尖刺
      ctx.beginPath(); ctx.ellipse(-14, -44, 9, 6, -0.3, 0, Math.PI * 2); blob(ctx, '#5a5a6a', 2);
      for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-20 + i * 5, -46); ctx.lineTo(-19 + i * 5, -55); ctx.lineTo(-16 + i * 5, -47); ctx.closePath(); blob(ctx, '#d8d8e0', 1.2); }
      ctx.beginPath(); ctx.arc(6, -50, 11, 0, Math.PI * 2); blob(ctx, body, 3);
      ctx.beginPath(); ctx.moveTo(-2, -57); ctx.lineTo(-8, -68); ctx.lineTo(2, -59); ctx.closePath(); blob(ctx, '#f0e0c0', 1.5);
      ctx.beginPath(); ctx.moveTo(12, -57); ctx.lineTo(18, -68); ctx.lineTo(14, -55); ctx.closePath(); blob(ctx, '#f0e0c0', 1.5);
      ctx.fillStyle = '#fff2a0'; ctx.beginPath(); ctx.ellipse(5, -51, 2.5, 2, 0, 0, Math.PI * 2); ctx.ellipse(12, -51, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0e0c0'; ctx.beginPath(); ctx.moveTo(4, -44); ctx.lineTo(6, -40); ctx.lineTo(8, -44); ctx.moveTo(11, -44); ctx.lineTo(13, -40); ctx.lineTo(14, -44); ctx.fill();
      // 狼牙棒
      ctx.save(); ctx.translate(16, -34); ctx.rotate(-0.6 + st * 0.2);
      ctx.beginPath(); ctx.rect(-2.5, -4, 5, 26); blob(ctx, '#6a4a2a', 2);
      ctx.beginPath(); ctx.ellipse(0, -10, 7, 10, 0, 0, Math.PI * 2); blob(ctx, '#7a5a3a', 2);
      ctx.restore();
      limb(ctx, 14, -38, 18, -24, 8, body);
      ctx.restore();
    } else if (type === 'slime') {
      // 史莱姆：弹跳挤压
      var sq = Math.sin(t);
      var sw2 = 1 + sq * 0.12, sh2 = 1 - sq * 0.12;
      var hop2 = Math.max(0, -Math.sin(t)) * -8;
      ctx.save(); ctx.translate(0, hop2); ctx.scale(sw2, sh2);
      ctx.beginPath();
      ctx.moveTo(-17, 0); ctx.quadraticCurveTo(-19, -26, 0, -28); ctx.quadraticCurveTo(19, -26, 17, 0); ctx.quadraticCurveTo(0, 3, -17, 0);
      ctx.closePath();
      ctx.globalAlpha = 0.92;
      blob(ctx, body);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-7, -19, 5, 3.5, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = U.mix(body, '#000', 0.25);
      ctx.beginPath(); ctx.arc(6, -8, 2.5, 0, Math.PI * 2); ctx.arc(-4, -5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.ellipse(-4, -15, 2.4, 3.4, 0, 0, Math.PI * 2); ctx.ellipse(5, -15, 2.4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-4.5, -17, 1.3, 1.3); ctx.fillRect(4.5, -17, 1.3, 1.3);
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0.5, -10, 2.5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.restore();
    } else if (type === 'wisp') {
      // 火灵：漂浮的火焰
      var fy = -24 + Math.sin(t) * 4;
      ctx.save(); ctx.translate(0, fy);
      ctx.globalCompositeOperation = 'lighter';
      G.glow(ctx, 0, 0, 36, body, 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.quadraticCurveTo(-15, 10, -13, -4);
      ctx.quadraticCurveTo(-11, -14, -4 + Math.sin(t * 2) * 3, -26);
      ctx.quadraticCurveTo(-2, -16, 2, -18);
      ctx.quadraticCurveTo(6 + Math.sin(t * 2 + 1) * 3, -30, 8, -20);
      ctx.quadraticCurveTo(15, -8, 13, 2);
      ctx.quadraticCurveTo(10, 12, 0, 14);
      ctx.closePath();
      blob(ctx, body, 2);
      ctx.beginPath(); ctx.ellipse(0, 3, 8, 9, 0, 0, Math.PI * 2); ctx.fillStyle = belly; ctx.fill();
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.ellipse(-3.5, 0, 2, 3, 0, 0, Math.PI * 2); ctx.ellipse(4, 0, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (type === 'king') {
      var br = Math.sin(t);
      G.glow(ctx, 0, -50, 90, '#ff4a1a', 0.5);
      limb(ctx, -14, -24, -16 + br * 6, -2, 12, '#2a0a0a');
      limb(ctx, 14, -24, 16 - br * 6, -2, 12, '#2a0a0a');
      ctx.save(); ctx.translate(0, Math.abs(br) * -3);
      // 火焰披风
      ctx.beginPath(); ctx.moveTo(-26, -70);
      for (i = 0; i <= 8; i++) ctx.lineTo(-34 + i * 8.5, -14 - (i % 2 ? 10 : 0) - Math.sin(t * 2 + i) * 4);
      ctx.lineTo(26, -70); ctx.closePath(); blob(ctx, '#c2410c', 2.5);
      limb(ctx, -24, -66, -34, -36 + br * 3, 12, '#3a1010');
      ctx.beginPath(); G.roundRect(ctx, -24, -78, 48, 52, 14); blob(ctx, body, 3);
      // 胸口裂纹
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,140,40,' + (0.7 + br * 0.2) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-8, -70); ctx.lineTo(0, -58); ctx.lineTo(-6, -46); ctx.lineTo(4, -34); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(4, -90, 17, 0, Math.PI * 2); blob(ctx, '#3a1010', 3);
      // 王冠火焰
      for (i = 0; i < 5; i++) {
        var fx = -10 + i * 6.5, fh = 12 + (i % 2) * 6 + Math.sin(t * 3 + i) * 3;
        ctx.beginPath(); ctx.moveTo(fx - 4, -102); ctx.quadraticCurveTo(fx, -102 - fh, fx + 4, -102); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ffd24a' : '#ff6a1a'; ctx.fill();
      }
      ctx.beginPath(); ctx.rect(-12, -106, 32, 6); blob(ctx, '#e8b84a', 2);
      ctx.fillStyle = '#fff2a0'; G.glow(ctx, 9, -92, 14, '#ffb347', 0.9);
      ctx.beginPath(); ctx.ellipse(2, -92, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.ellipse(12, -92, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      limb(ctx, 24, -66, 36, -40 - br * 3, 12, '#3a1010');
      ctx.beginPath(); ctx.arc(36, -40 - br * 3, 8, 0, Math.PI * 2); blob(ctx, '#ff6a1a', 2);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ 帧缓存
  var cache = {};
  var CACHE_SCALE = 2;
  /** 返回缓存帧 {c, w, h, ax, ay}：ax/ay 为脚底锚点在画布中的位置（逻辑像素） */
  function monsterFrame(type, frame, frames, face, tint, white) {
    var key = type + '|' + frame + '|' + face + '|' + (tint || '') + '|' + (white ? 1 : 0);
    var e = cache[key];
    if (e) return e;
    var M = MON[type];
    var w = M.h * 2.2, h = M.h * 1.6;
    var c = P.createOffscreenCanvas(Math.ceil(w * CACHE_SCALE), Math.ceil(h * CACHE_SCALE));
    var g = c.getContext('2d');
    g.scale(CACHE_SCALE, CACHE_SCALE);
    g.translate(w / 2, h * 0.92);
    g.scale(face, 1);
    drawMonster(g, type, frame / frames, tint);
    if (white) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(0, 0, c.width, c.height);
    }
    e = { c: c, w: w, h: h, ax: w / 2, ay: h * 0.92 };
    cache[key] = e;
    return e;
  }

  /** 绘制缓存帧怪物：size = 期望身高（逻辑像素） */
  function blitMonster(ctx, type, x, y, size, phase, face, tint, hurt) {
    var frames = 8;
    var fr = Math.floor(((phase % 1) + 1) % 1 * frames);
    var e = monsterFrame(type, fr, frames, face < 0 ? -1 : 1, tint, hurt);
    var k = size / MON[type].h;
    ctx.drawImage(e.c, x - e.ax * k, y - e.ay * k, e.w * k, e.h * k);
  }

  ER.Sprites = {
    HERO: HERO,
    drawHero: drawHero,
    drawTomb: drawTomb,
    drawMonster: drawMonster,
    blitMonster: blitMonster,
    MON: MON,
  };
})();
