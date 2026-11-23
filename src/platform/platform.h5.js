/**
 * 平台适配层（H5 浏览器实现）
 * ------------------------------------------------------------
 * 业务代码只允许通过 ER.platform 访问底层能力（含 loadImage 图片加载）：
 *   画布 / 尺寸 / 触控 / 存档 / 音频上下文 / 震动 / 激励视频 / 前后台切换 / 帧循环
 * 迁移微信小游戏时，只需新写一个 platform.wx.js 实现同样的接口：
 *   getCanvas        -> wx.createCanvas()
 *   getSystemInfo    -> wx.getSystemInfoSync()
 *   onPointer        -> wx.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel
 *   storage          -> wx.getStorageSync / wx.setStorageSync
 *   createAudioContext -> wx.createWebAudioContext()
 *   vibrate          -> wx.vibrateShort()
 *   showRewardedAd   -> wx.createRewardedVideoAd({ adUnitId }) + onClose(res.isEnded)
 *   onHide / onShow  -> wx.onHide / wx.onShow
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var P = {};
  P.name = 'h5';

  var canvas = null;
  P.getCanvas = function () {
    if (!canvas) {
      canvas = document.getElementById('game') || document.createElement('canvas');
      if (!canvas.parentNode) document.body.appendChild(canvas);
      canvas.style.touchAction = 'none';
      canvas.style.display = 'block';
    }
    return canvas;
  };

  P.getSystemInfo = function () {
    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
    };
  };

  /** 按 CSS 尺寸 + DPR 设置画布后备缓冲区 */
  P.resizeCanvas = function (cssW, cssH, dpr) {
    var c = P.getCanvas();
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
  };

  /** 离屏画布（用于缓存静态背景）；微信下对应 wx.createCanvas() */
  P.createOffscreenCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  /** 加载图片资源（美术素材）；微信下对应 wx.createImage() */
  P.loadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败：' + src)); };
      img.src = src;
    });
  };

  P.onResize = function (cb) {
    window.addEventListener('resize', cb);
    window.addEventListener('orientationchange', cb);
  };

  /** 统一指针事件：handlers.down/move/up(id, clientX, clientY) */
  P.onPointer = function (handlers) {
    var c = P.getCanvas();
    c.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      handlers.down(e.pointerId, e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', function (e) {
      e.preventDefault();
      handlers.move(e.pointerId, e.clientX, e.clientY);
    });
    var up = function (e) {
      e.preventDefault();
      handlers.up(e.pointerId, e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  // ---------------- 存档 ----------------
  var memStore = {};
  P.storage = {
    get: function (key, def) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch (e) {
        return key in memStore ? memStore[key] : def;
      }
    },
    set: function (key, value) {
      memStore[key] = value;
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
    remove: function (key) {
      delete memStore[key];
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  // ---------------- 音频 ----------------
  P.createAudioContext = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      return AC ? new AC() : null;
    } catch (e) {
      return null;
    }
  };

  P.vibrate = function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) { /* ignore */ }
  };

  // ---------------- 激励视频 ----------------
  // H5 没有真实广告，由引擎注入一个 Canvas 绘制的“模拟广告”呈现器。
  var adPresenter = null;
  P.setAdMockPresenter = function (fn) { adPresenter = fn; };
  /** @returns Promise<boolean> 是否完整观看（可发奖励） */
  P.showRewardedAd = function (placement) {
    if (adPresenter) return adPresenter(placement);
    return Promise.resolve(true);
  };

  // ---------------- 前后台 ----------------
  P.onHide = function (cb) {
    document.addEventListener('visibilitychange', function () { if (document.hidden) cb(); });
    window.addEventListener('pagehide', cb);
  };
  P.onShow = function (cb) {
    document.addEventListener('visibilitychange', function () { if (!document.hidden) cb(); });
  };

  P.now = function () { return Date.now(); };
  P.raf = function (cb) { return window.requestAnimationFrame(cb); };

  ER.platform = P;
})();
