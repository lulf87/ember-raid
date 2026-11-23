/**
 * 特效系统：粒子、飘字、震屏、闪屏、慢动作。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var U = ER.U, G = ER.G;

  var MAX_PARTICLES = 900;
  var MAX_TEXTS = 70;

  function FX() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.flashColor = '#ffffff';
    this.flashA = 0;
    this.flashDecay = 3;
    this.sx = 0; this.sy = 0;
  }

  /** 粒子爆发 opt: n,color,colors,speed,life,size,gravity,drag,glow,spread,angle,shape */
  FX.prototype.burst = function (x, y, opt) {
    opt = opt || {};
    var n = opt.n || 12;
    for (var i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      var ang = opt.angle != null ? opt.angle + U.rand(-1, 1) * (opt.spread || Math.PI) : Math.random() * Math.PI * 2;
      var sp = (opt.speed || 200) * U.rand(0.3, 1);
      var life = (opt.life || 0.6) * U.rand(0.6, 1.2);
      this.particles.push({
        x: x + U.rand(-1, 1) * (opt.jitter || 0), y: y + U.rand(-1, 1) * (opt.jitter || 0),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: life, max: life,
        size: (opt.size || 4) * U.rand(0.6, 1.3),
        color: opt.colors ? U.pick(opt.colors) : (opt.color || '#ffb347'),
        g: opt.gravity || 0, drag: opt.drag == null ? 2.5 : opt.drag,
        glow: opt.glow !== false, shape: opt.shape || 'circle',
        rot: Math.random() * 6, vr: U.rand(-8, 8),
      });
    }
  };

  /** 飘字 opt: color,size,life,vy,crit,stroke */
  FX.prototype.text = function (x, y, str, opt) {
    opt = opt || {};
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({
      x: x, y: y, str: str, color: opt.color || '#fff', size: opt.size || 22,
      life: opt.life || 0.9, max: opt.life || 0.9, vy: opt.vy == null ? -70 : opt.vy,
      vx: opt.vx || 0, crit: !!opt.crit, stroke: opt.stroke || 'rgba(0,0,0,0.75)', weight: opt.weight || 'bold',
    });
  };

  /** 冲击波圆环 */
  FX.prototype.ring = function (x, y, r0, r1, color, life, width) {
    this.rings.push({ x: x, y: y, r0: r0, r1: r1, color: color, life: life || 0.5, max: life || 0.5, w: width || 6 });
  };

  FX.prototype.shake = function (amt, dur) {
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeT = Math.max(this.shakeT, dur || 0.25);
  };
  FX.prototype.flash = function (color, alpha, decay) {
    this.flashColor = color || '#fff';
    this.flashA = Math.max(this.flashA, alpha == null ? 0.6 : alpha);
    this.flashDecay = decay || 3;
  };

  FX.prototype.update = function (dt) {
    var ps = this.particles, i, p;
    for (i = ps.length - 1; i >= 0; i--) {
      p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      var d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    var ts = this.texts;
    for (i = ts.length - 1; i >= 0; i--) {
      var t = ts[i];
      t.life -= dt;
      if (t.life <= 0) { ts.splice(i, 1); continue; }
      t.y += t.vy * dt; t.x += t.vx * dt;
      t.vy *= Math.exp(-2.2 * dt);
    }
    var rs = this.rings;
    for (i = rs.length - 1; i >= 0; i--) {
      rs[i].life -= dt;
      if (rs[i].life <= 0) rs.splice(i, 1);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      var a = this.shakeAmt * Math.min(1, this.shakeT * 4);
      this.sx = U.rand(-a, a); this.sy = U.rand(-a, a);
      if (this.shakeT <= 0) { this.shakeAmt = 0; this.sx = this.sy = 0; }
    }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * this.flashDecay);
  };

  FX.prototype.renderParticles = function (ctx) {
    var ps = this.particles;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      var s = p.size * (0.4 + 0.6 * k);
      if (p.shape === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-s * 2, -s * 0.3, s * 4, s * 0.6);
        ctx.restore();
      } else if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    var rs = this.rings;
    for (var j = 0; j < rs.length; j++) {
      var r = rs[j];
      var t = 1 - r.life / r.max;
      ctx.beginPath();
      ctx.arc(r.x, r.y, U.lerp(r.r0, r.r1, U.easeOutCubic(t)), 0, Math.PI * 2);
      ctx.strokeStyle = U.rgba(r.color, 1 - t);
      ctx.lineWidth = r.w * (1 - t) + 1;
      ctx.stroke();
    }
  };

  FX.prototype.renderTexts = function (ctx) {
    var ts = this.texts;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      var age = t.max - t.life;
      var k = t.life / t.max;
      var pop = t.crit ? 1 + Math.max(0, 0.6 - age * 4) : 1 + Math.max(0, 0.25 - age * 2);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      G.text(ctx, t.str, 0, 0, {
        size: t.size, weight: t.weight, align: 'center', color: t.color, stroke: t.stroke,
        strokeWidth: t.crit ? 5 : 4, shadow: false,
      });
      ctx.restore();
    }
  };

  FX.prototype.renderFlash = function (ctx) {
    if (this.flashA > 0) {
      ctx.fillStyle = U.rgba(this.flashColor, this.flashA);
      ctx.fillRect(0, 0, 540, 960);
    }
  };

  FX.prototype.clear = function () {
    this.particles.length = 0; this.texts.length = 0; this.rings.length = 0;
    this.shakeT = 0; this.flashA = 0; this.sx = this.sy = 0;
  };

  ER.FX = FX;
})();
