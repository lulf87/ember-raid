/**
 * 应用核心：画布适配（9:16 逻辑分辨率 + DPR 高清）、主循环、场景栈、输入分发。
 * 逻辑坐标固定为 540 x 960，所有游戏代码只关心逻辑坐标。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var P = ER.platform;

  var W = 540, H = 960;

  function App() {
    this.W = W; this.H = H;
    this.canvas = P.getCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.scenes = [];
    this.time = 0;
    this.dpr = 1; this.scale = 1; this.ox = 0; this.oy = 0;
    this.cssW = 0; this.cssH = 0;
    this.pointerId = null;
    this.pointer = { x: 0, y: 0, down: false };
    this._last = 0;
    var self = this;
    this.resize();
    P.onResize(function () { self.resize(); });
    P.onPointer({
      down: function (id, x, y) { self._down(id, x, y); },
      move: function (id, x, y) { self._move(id, x, y); },
      up: function (id, x, y) { self._up(id, x, y); },
    });
    P.onHide(function () { self._broadcast('onHide'); });
    P.onShow(function () { self._broadcast('onShow'); });
  }

  App.prototype.resize = function () {
    var info = P.getSystemInfo();
    this.dpr = info.pixelRatio;
    this.cssW = info.windowWidth;
    this.cssH = info.windowHeight;
    P.resizeCanvas(this.cssW, this.cssH, this.dpr);
    this.scale = Math.min(this.cssW / W, this.cssH / H);
    this.ox = (this.cssW - W * this.scale) / 2;
    this.oy = (this.cssH - H * this.scale) / 2;
  };

  App.prototype.toLogical = function (x, y) {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  };

  App.prototype.top = function () { return this.scenes[this.scenes.length - 1]; };

  App.prototype.push = function (scene) {
    scene.app = this;
    this.scenes.push(scene);
    if (scene.enter) scene.enter();
    return scene;
  };
  App.prototype.pop = function () {
    var s = this.scenes.pop();
    if (s && s.exit) s.exit();
    return s;
  };
  App.prototype.remove = function (scene) {
    var i = this.scenes.indexOf(scene);
    if (i >= 0) { this.scenes.splice(i, 1); if (scene.exit) scene.exit(); }
  };
  /** 清空场景栈并切换到新场景 */
  App.prototype.goto = function (scene) {
    while (this.scenes.length) this.pop();
    this.pointerId = null;
    return this.push(scene);
  };

  App.prototype._broadcast = function (fn) {
    for (var i = 0; i < this.scenes.length; i++) if (this.scenes[i][fn]) this.scenes[i][fn]();
  };

  App.prototype._down = function (id, x, y) {
    ER.audio.unlock();
    if (this.pointerId !== null) return; // 单指操作：只跟踪第一根手指
    this.pointerId = id;
    var p = this.toLogical(x, y);
    this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.down = true;
    var s = this.top();
    if (!s) return;
    if (s.ui && s.ui.down(p)) { s._uiCaptured = true; return; }
    s._uiCaptured = false;
    if (s.onDown) s.onDown(p);
  };
  App.prototype._move = function (id, x, y) {
    var p = this.toLogical(x, y);
    this.pointer.x = p.x; this.pointer.y = p.y;
    if (id !== this.pointerId) return;
    var s = this.top();
    if (!s) return;
    if (s._uiCaptured) { if (s.ui) s.ui.move(p); return; }
    if (s.onMove) s.onMove(p);
  };
  App.prototype._up = function (id, x, y) {
    if (id !== this.pointerId) return;
    this.pointerId = null;
    this.pointer.down = false;
    var p = this.toLogical(x, y);
    var s = this.top();
    if (!s) return;
    if (s._uiCaptured) { s._uiCaptured = false; if (s.ui) s.ui.up(p); return; }
    if (s.onUp) s.onUp(p);
  };

  App.prototype.start = function () {
    var self = this;
    var loop = function (t) {
      var dt = self._last ? (t - self._last) / 1000 : 1 / 60;
      self._last = t;
      if (dt > 0.05) dt = 0.05; // 切后台回来不暴走
      self.time += dt;
      self.frame(dt);
      P.raf(loop);
    };
    P.raf(loop);
  };

  App.prototype.frame = function (dt) {
    var s = this.top();
    // 只更新栈顶；下层场景若声明 updateBelow 则继续更新（例如浮层下的挂机）
    for (var i = 0; i < this.scenes.length; i++) {
      var sc = this.scenes[i];
      if (sc === s || sc.alwaysUpdate) { if (sc.update) sc.update(dt); }
    }
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    var k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    // 从最后一个不透明场景开始绘制
    var start = 0;
    for (var j = this.scenes.length - 1; j >= 0; j--) { if (!this.scenes[j].overlay) { start = j; break; } }
    for (var m = start; m < this.scenes.length; m++) {
      var scn = this.scenes[m];
      if (scn.ui) scn.ui.begin();
      ctx.save();
      scn.render(ctx);
      ctx.restore();
    }
    ctx.restore();
  };

  ER.App = App;
  ER.W = W;
  ER.H = H;
})();
