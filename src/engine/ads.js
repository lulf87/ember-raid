/**
 * 激励视频封装：业务只调用 ER.ads.show(placement) -> Promise<boolean>。
 * H5 原型下注入一个 Canvas 绘制的模拟广告浮层（倒计时后发奖励，可中途关闭放弃）。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var G = ER.G, U = ER.U;

  var AD_SECONDS = 2.5;

  function AdMockScene(placement, resolve) {
    this.overlay = true;
    this.placement = placement;
    this.resolve = resolve;
    this.t = 0;
    this.done = false;
    this.ui = new ER.UI();
  }
  AdMockScene.prototype.update = function (dt) {
    this.t += dt;
    if (!this.done && this.t >= AD_SECONDS) {
      this.done = true;
      ER.audio.play('coin');
    }
    if (this.done && this.t >= AD_SECONDS + 0.6) this.finish(true);
  };
  AdMockScene.prototype.finish = function (ok) {
    if (this.closed) return;
    this.closed = true;
    this.app.remove(this);
    this.resolve(ok);
  };
  AdMockScene.prototype.render = function (ctx) {
    var self = this;
    var a = Math.min(1, this.t * 5);
    ctx.fillStyle = 'rgba(0,0,0,' + 0.88 * a + ')';
    ctx.fillRect(0, 0, 540, 960);
    var t = this.t;
    // 模拟“广告画面”：流动的彩色光带
    ctx.save();
    ctx.globalAlpha = a;
    for (var i = 0; i < 6; i++) {
      var y = 300 + i * 60 + Math.sin(t * 2 + i) * 20;
      ctx.fillStyle = U.rgba(['#ff8a1f', '#b35cff', '#3d8bff', '#3fd65a', '#ffd24a', '#ff5470'][i], 0.18);
      ctx.fillRect(0, y, 540, 40);
    }
    G.text(ctx, '激励视频广告', 270, 380, { size: 40, weight: 'bold', align: 'center', color: '#fff' });
    G.text(ctx, '（H5 原型模拟 · 正式版接入微信广告组件）', 270, 430, { size: 18, align: 'center', color: '#bbb' });
    G.text(ctx, '奖励：' + (this.placement || ''), 270, 490, { size: 22, align: 'center', color: '#ffd27a' });
    var prog = Math.min(1, t / AD_SECONDS);
    G.bar(ctx, 120, 540, 300, 16, prog, '#ffb347');
    G.text(ctx, this.done ? '奖励已发放！' : Math.ceil(AD_SECONDS - t) + ' 秒后可领取奖励', 270, 585, {
      size: 20, align: 'center', color: this.done ? '#7dff9a' : '#ddd',
    });
    if (!this.done) {
      this.ui.button(ctx, 400, 60, 110, 44, '关闭', function () { self.finish(false); }, {
        color: '#444', size: 18, sub: null,
      });
      G.text(ctx, '提前关闭无奖励', 455, 122, { size: 13, align: 'center', color: '#888' });
    }
    ctx.restore();
  };

  var busy = false;
  ER.ads = {
    /** @returns Promise<boolean> */
    show: function (placement) {
      if (busy) return Promise.resolve(false);
      busy = true;
      return ER.platform.showRewardedAd(placement).then(function (ok) {
        busy = false;
        return ok;
      }, function () { busy = false; return false; });
    },
    install: function (app) {
      ER.platform.setAdMockPresenter(function (placement) {
        return new Promise(function (resolve) { app.push(new AdMockScene(placement, resolve)); });
      });
    },
  };
})();
