/**
 * Canvas 即时模式 UI：按钮、面板、文字排版等全部在 Canvas 上绘制。
 * 用法：在 render 中调用 ui.button(...) 注册并绘制，输入由 App 分发到 ui.down/up。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var U = ER.U;

  var FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif';
  var G = {};

  G.font = function (size, weight) {
    return (weight || 'normal') + ' ' + size + 'px ' + FONT_STACK;
  };

  G.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  G.text = function (ctx, str, x, y, opt) {
    opt = opt || {};
    ctx.font = G.font(opt.size || 20, opt.weight || 'normal');
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'middle';
    if (opt.shadow !== false) {
      ctx.fillStyle = opt.shadowColor || 'rgba(0,0,0,0.6)';
      ctx.fillText(str, x + (opt.shadowOff || 1.5), y + (opt.shadowOff || 2));
    }
    if (opt.stroke) {
      ctx.lineWidth = opt.strokeWidth || 4;
      ctx.strokeStyle = opt.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opt.color || '#fff';
    ctx.fillText(str, x, y);
  };

  /** 自动换行（逐字，兼容中文），返回行数组 */
  G.wrap = function (ctx, str, maxW, size, weight) {
    ctx.font = G.font(size, weight);
    var lines = [], line = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      var test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  G.paragraph = function (ctx, str, x, y, maxW, opt) {
    opt = opt || {};
    var size = opt.size || 18;
    var lh = opt.lineHeight || size * 1.45;
    var lines = G.wrap(ctx, str, maxW, size, opt.weight);
    for (var i = 0; i < lines.length; i++) {
      G.text(ctx, lines[i], x, y + i * lh, { size: size, color: opt.color, align: opt.align, weight: opt.weight, shadow: opt.shadow });
    }
    return lines.length * lh;
  };

  G.panel = function (ctx, x, y, w, h, opt) {
    opt = opt || {};
    var r = opt.radius == null ? 14 : opt.radius;
    ctx.save();
    if (opt.glow) { ctx.shadowColor = opt.glow; ctx.shadowBlur = opt.glowBlur || 24; }
    G.roundRect(ctx, x, y, w, h, r);
    var grd = ctx.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, opt.top || 'rgba(40,34,52,0.96)');
    grd.addColorStop(1, opt.bottom || 'rgba(20,16,28,0.96)');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();
    G.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.lineWidth = opt.lineWidth || 2;
    ctx.strokeStyle = opt.border || 'rgba(255,190,120,0.35)';
    ctx.stroke();
  };

  G.bar = function (ctx, x, y, w, h, t, color, opt) {
    opt = opt || {};
    t = U.clamp(t, 0, 1);
    G.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = opt.bg || 'rgba(0,0,0,0.55)';
    ctx.fill();
    if (opt.ghost != null && opt.ghost > t) {
      G.roundRect(ctx, x, y, Math.max(h, w * U.clamp(opt.ghost, 0, 1)), h, h / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    }
    if (t > 0) {
      G.roundRect(ctx, x, y, Math.max(h, w * t), h, h / 2);
      var grd = ctx.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, U.mix(color, '#ffffff', 0.35));
      grd.addColorStop(1, color);
      ctx.fillStyle = grd;
      ctx.fill();
    }
    if (opt.border !== false) {
      G.roundRect(ctx, x, y, w, h, h / 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = opt.border || 'rgba(255,255,255,0.25)';
      ctx.stroke();
    }
  };

  /** 视频图标（激励视频按钮的统一标识） */
  G.adIcon = function (ctx, x, y, s, color) {
    G.roundRect(ctx, x - s, y - s * 0.72, s * 2, s * 1.44, s * 0.35);
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.32, y - s * 0.42);
    ctx.lineTo(x + s * 0.5, y);
    ctx.lineTo(x - s * 0.32, y + s * 0.42);
    ctx.closePath();
    ctx.fillStyle = '#2b1a07';
    ctx.fill();
  };

  /** 光芒射线（掉落、升级等高光时刻） */
  G.rays = function (ctx, x, y, r, color, t, n, alpha) {
    n = n || 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t);
    ctx.globalCompositeOperation = 'lighter';
    var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, U.rgba(color, alpha == null ? 0.55 : alpha));
    grd.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = grd;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a - 0.09, a + 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  G.glow = function (ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, U.rgba(color, alpha == null ? 0.6 : alpha));
    grd.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  };

  G.vignette = function (ctx, color, alpha) {
    var grd = ctx.createRadialGradient(270, 480, 250, 270, 480, 620);
    grd.addColorStop(0, U.rgba(color || '#000000', 0));
    grd.addColorStop(1, U.rgba(color || '#000000', alpha == null ? 0.7 : alpha));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 540, 960);
  };

  /** 新手引导：会点击动画的手指（指尖位于 x,y） */
  G.hand = function (ctx, x, y, t) {
    var k = (t * 1.6) % 1;
    var press = k < 0.25 ? k / 0.25 : k < 0.45 ? 1 - (k - 0.25) / 0.2 : 0;
    ctx.save();
    // 点击波纹
    if (k > 0.2 && k < 0.8) {
      var rk = (k - 0.2) / 0.6;
      ctx.strokeStyle = 'rgba(255,230,160,' + (1 - rk) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 8 + rk * 26, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.translate(x + 6 - press * 4, y + 8 - press * 4);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1b1222';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(-5, 22); ctx.lineTo(-12, 18); ctx.lineTo(-15, 22); ctx.lineTo(-6, 38);
    ctx.lineTo(14, 38); ctx.lineTo(18, 24); ctx.lineTo(18, 16); ctx.lineTo(13, 14); ctx.lineTo(13, 18);
    ctx.lineTo(13, 13); ctx.lineTo(8, 11); ctx.lineTo(8, 17); ctx.lineTo(8, 11); ctx.lineTo(3, 10); ctx.lineTo(3, 0);
    ctx.quadraticCurveTo(-1, -5, -5, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  /** 新手引导：提示气泡（居中于 x），返回高度 */
  G.tip = function (ctx, str, x, y, w, opt) {
    opt = opt || {};
    w = w || 400;
    var size = opt.size || 19;
    var lines = G.wrap(ctx, str, w - 36, size, 'bold');
    var h = lines.length * size * 1.4 + 26;
    var bx = U.clamp(x - w / 2, 10, 530 - w);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    G.roundRect(ctx, bx, y, w, h, 14);
    ctx.fillStyle = opt.bg || 'rgba(255,246,228,0.97)';
    ctx.fill();
    ctx.restore();
    G.roundRect(ctx, bx, y, w, h, 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = opt.border || '#ff9a3a';
    ctx.stroke();
    for (var i = 0; i < lines.length; i++) {
      G.text(ctx, lines[i], bx + w / 2, y + 13 + size * 0.7 + i * size * 1.4, { size: size, weight: 'bold', align: 'center', color: opt.color || '#3a1a08', shadow: false });
    }
    if (opt.sub) G.text(ctx, opt.sub, bx + w - 14, y + h - 10, { size: 12, align: 'right', color: '#a07050', shadow: false });
    return h;
  };

  /** 屏幕边缘方向箭头（指向屏幕外目标） */
  G.edgeArrow = function (ctx, tx, ty, color, label) {
    var cx = 270, cy = 480;
    var a = Math.atan2(ty - cy, tx - cx);
    var mx = 240, my = 410;
    var k = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
    var x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    ctx.save();
    ctx.translate(x, y);
    G.glow(ctx, 0, 0, 34, color, 0.6);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1b1222';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    if (label) G.text(ctx, label, U.clamp(x, 50, 490), y + (y > 480 ? -26 : 28), { size: 14, weight: 'bold', align: 'center', color: color, stroke: '#000', strokeWidth: 3 });
  };

  // ------------------------------------------------------------------
  function UI() {
    this.items = [];
    this.pressed = null;
    this.hover = null;
  }
  UI.prototype.begin = function () { this.items.length = 0; };
  UI.prototype._hit = function (p) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h) return it;
    }
    return null;
  };
  UI.prototype.down = function (p) {
    var it = this._hit(p);
    if (!it) return false;
    this.pressed = it.id;
    return true;
  };
  UI.prototype.move = function (p) {
    var it = this._hit(p);
    if (!it || it.id !== this.pressed) this.pressedOut = true; else this.pressedOut = false;
  };
  UI.prototype.up = function (p) {
    var it = this._hit(p);
    var pid = this.pressed;
    this.pressed = null;
    this.pressedOut = false;
    if (it && it.id === pid) {
      if (it.disabled) { ER.audio.play('error'); return true; }
      ER.audio.play('click');
      it.onClick();
      return true;
    }
    return false;
  };
  /** 注册一个可点击区域（不绘制） */
  UI.prototype.hotspot = function (id, x, y, w, h, onClick, disabled) {
    this.items.push({ id: id, x: x, y: y, w: w, h: h, onClick: onClick, disabled: !!disabled });
    return this.pressed === id && !this.pressedOut;
  };

  /**
   * 绘制并注册按钮
   * opt: color, textColor, size, sub(副标题), ad(激励视频标识), disabled, id, radius, pulse
   */
  UI.prototype.button = function (ctx, x, y, w, h, label, onClick, opt) {
    opt = opt || {};
    var id = opt.id || label;
    var pressed = this.hotspot(id, x, y, w, h, onClick, opt.disabled);
    var color = opt.disabled ? '#4a4452' : (opt.color || '#c8602a');
    var s = pressed ? 0.95 : 1;
    if (opt.pulse && !opt.disabled) s *= 1 + Math.sin(ER.app.time * 6) * 0.025;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(s, s);
    var r = opt.radius == null ? Math.min(14, h / 2) : opt.radius;
    // 底部厚度
    G.roundRect(ctx, -w / 2, -h / 2 + 4, w, h, r);
    ctx.fillStyle = U.mix(color, '#000000', 0.55);
    ctx.fill();
    G.roundRect(ctx, -w / 2, -h / 2 + (pressed ? 3 : 0), w, h, r);
    var grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, U.mix(color, '#ffffff', 0.28));
    grd.addColorStop(1, color);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = U.mix(color, '#ffffff', 0.5);
    ctx.stroke();
    var oy = pressed ? 3 : 0;
    var size = opt.size || Math.min(26, h * 0.42);
    var tx = 0;
    if (opt.ad) {
      ctx.font = G.font(size, 'bold');
      var tw = ctx.measureText(label).width;
      var icon = size * 0.55;
      tx = icon + 4;
      G.adIcon(ctx, -tw / 2 - tx / 2 + 2, oy - (opt.sub ? size * 0.35 : 0), icon, '#fff3d6');
    }
    G.text(ctx, label, tx / 2, oy - (opt.sub ? size * 0.35 : 0), {
      size: size, weight: 'bold', align: 'center', color: opt.textColor || '#fff', shadowColor: 'rgba(0,0,0,0.45)',
    });
    if (opt.sub) {
      G.text(ctx, opt.sub, 0, oy + size * 0.62, { size: size * 0.58, align: 'center', color: opt.subColor || 'rgba(255,255,255,0.85)', shadow: false });
    }
    ctx.restore();
  };

  ER.G = G;
  ER.UI = UI;
})();
