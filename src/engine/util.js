(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var U = {};

  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.chance = function (p) { return Math.random() < p; };
  U.dist = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
  U.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.approach = function (v, target, step) {
    return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
  };
  /** 帧率无关的指数逼近 */
  U.damp = function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); };

  U.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  U.easeInCubic = function (t) { return t * t * t; };
  U.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  U.easeOutElastic = function (t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  };

  /** 按权重抽取：entries = [{w, ...}] */
  U.weighted = function (entries) {
    var total = 0, i;
    for (i = 0; i < entries.length; i++) total += entries[i].w;
    var r = Math.random() * total;
    for (i = 0; i < entries.length; i++) {
      r -= entries[i].w;
      if (r <= 0) return entries[i];
    }
    return entries[entries.length - 1];
  };

  U.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  /** 大数格式化：12345 -> 1.23万 */
  U.fmt = function (n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1e8) return (n / 1e4).toFixed(n < 1e5 ? 2 : 1) + '万';
    if (n < 1e12) return (n / 1e8).toFixed(2) + '亿';
    return (n / 1e12).toFixed(2) + '兆';
  };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  U.fmtDuration = function (sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + '小时' + m + '分';
    if (m > 0) return m + '分' + (sec % 60) + '秒';
    return sec + '秒';
  };

  /** '#rrggbb' -> 'rgba(r,g,b,a)' */
  var rgbCache = {};
  U.hexToRgb = function (hex) {
    var c = rgbCache[hex];
    if (c) return c;
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache[hex] = c;
    return c;
  };
  U.rgba = function (hex, a) {
    var c = U.hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };
  /** 颜色混合，t=0 为 a，t=1 为 b */
  U.mix = function (a, b, t) {
    var ca = U.hexToRgb(a), cb = U.hexToRgb(b);
    var r = Math.round(U.lerp(ca[0], cb[0], t));
    var g = Math.round(U.lerp(ca[1], cb[1], t));
    var bl = Math.round(U.lerp(ca[2], cb[2], t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };

  /** 确定性哈希（用于程序化背景） */
  U.hash2 = function (x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  };

  U.uid = (function () {
    var n = 0;
    return function () { n++; return Date.now().toString(36) + n.toString(36); };
  })();

  ER.U = U;
})();
