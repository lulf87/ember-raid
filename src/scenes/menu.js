/**
 * 首页：三个玩法原型的入口（纯 Canvas 绘制）。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, A = ER.audio, P = ER.platform;

  var CARDS = [
    { key: 'raid', tag: 'A', title: '余烬团本', sub: '单指带团 · 躲技能 · 开箱分装备', color: '#ff8a3a', rec: true },
    { key: 'idle', tag: 'B', title: '酒馆挂机录', sub: '放置刷宝 · 开箱配装 · 离线收益', color: '#ffd24a' },
    { key: 'survivor', tag: 'C', title: '灰烬独行者', sub: '竖屏割草 · 战法牧 · 肉鸽构筑', color: '#ff5a5a' },
  ];

  function MenuScene() {
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.t = 0;
    this.confirmReset = 0;
    var st = P.storage.get('er_settings', { sound: true });
    this.settings = st;
    A.setEnabled(st.sound);
  }

  MenuScene.prototype.update = function (dt) {
    this.t += dt;
    this.fx.update(dt);
    this.confirmReset = Math.max(0, this.confirmReset - dt);
    if (Math.random() < dt * 18) {
      this.fx.burst(U.rand(0, 540), U.rand(900, 980), {
        n: 1, colors: ['#ff8a3a', '#ffb347', '#ff5a1a'], speed: U.rand(60, 140), angle: -Math.PI / 2 + U.rand(-0.3, 0.3), spread: 0.2, life: U.rand(3, 6), size: U.rand(1.5, 3.5), drag: 0.05,
      });
    }
  };

  MenuScene.prototype.drawPreview = function (ctx, key, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    if (key === 'raid') {
      G.glow(ctx, 0, -14, 50, '#ff7a2a', 0.5);
      ctx.fillStyle = '#c2410c';
      ctx.beginPath(); ctx.arc(0, -16, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2a0';
      ctx.beginPath(); ctx.arc(-7, -20, 3.5, 0, Math.PI * 2); ctx.arc(7, -20, 3.5, 0, Math.PI * 2); ctx.fill();
      var r = 18 + (t * 30) % 22;
      ctx.strokeStyle = U.rgba('#ff5a1a', 1 - (r - 18) / 22);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-24, 26, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      var cols = ['#5b8cff', '#ffd24a', '#ff6b4a', '#4ae0ff', '#7dffb0'];
      var sx = Math.sin(t * 1.6) * 16;
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.arc(sx - 24 + i * 12, 30 + (i % 2) * 6, 5, 0, Math.PI * 2); ctx.fill();
      }
    } else if (key === 'idle') {
      var k = (t % 2.2) / 2.2;
      var shake = k < 0.5 ? Math.sin(t * 50) * 2 * k : 0;
      var col = ER.Loot.RARITY[Math.floor(t / 2.2) % 5].color;
      if (k > 0.5) G.rays(ctx, 0, 0, 56, col, t, 10, 0.5);
      ER.drawChest(ctx, shake, 14, 0.42, k > 0.5 ? Math.min(1, (k - 0.5) * 6) : 0, col, k > 0.5 ? 0.6 : 0.2);
    } else {
      G.glow(ctx, 0, 0, 40, '#ff6b4a', 0.4);
      for (var j = 0; j < 9; j++) {
        var a = t * 0.8 + (j / 9) * Math.PI * 2;
        var rr = 34 + Math.sin(t * 3 + j) * 4;
        ctx.fillStyle = j % 3 === 0 ? '#7ad04a' : '#ff5a4a';
        ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 5, 0, Math.PI * 2); ctx.fill();
      }
      var oa = t * 4;
      G.glow(ctx, Math.cos(oa) * 18, Math.sin(oa) * 18, 12, '#ffb347', 0.9);
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  };

  MenuScene.prototype.render = function (ctx) {
    var self = this;
    var bg = ctx.createLinearGradient(0, 0, 0, 960);
    bg.addColorStop(0, '#120a10');
    bg.addColorStop(0.6, '#1c0e0c');
    bg.addColorStop(1, '#2a1208');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 540, 960);
    G.glow(ctx, 270, 1000, 520, '#ff5a1a', 0.35 + Math.sin(this.t * 1.3) * 0.05);
    this.fx.renderParticles(ctx);

    // 标题
    var ty = 140 + Math.sin(this.t * 1.5) * 4;
    G.glow(ctx, 270, ty, 160, '#ff8a3a', 0.25);
    G.text(ctx, '余 烬', 270, ty, { size: 84, weight: 'bold', align: 'center', color: '#ffb347', stroke: '#3a1200', strokeWidth: 10 });
    G.text(ctx, '三个玩法原型 · 挑一个最上头的', 270, ty + 70, { size: 19, align: 'center', color: '#e8c8a0' });

    for (var i = 0; i < CARDS.length; i++) {
      var c = CARDS[i];
      var y = 290 + i * 172;
      var appear = U.easeOutBack(U.clamp(this.t * 3 - i * 0.25, 0, 1));
      ctx.save();
      ctx.translate(270, y + 76);
      ctx.scale(appear, appear);
      ctx.translate(-270, -(y + 76));
      var pressed = this.ui.hotspot('card-' + c.key, 24, y, 492, 152, (function (key) {
        return function () { self.app.goto(ER.Games[key].create()); };
      })(c.key));
      var oy = pressed ? 3 : 0;
      G.panel(ctx, 24, y + oy, 492, 152, { border: U.rgba(c.color, 0.7), glow: U.rgba(c.color, 0.5), glowBlur: 18, lineWidth: 2.5, radius: 18 });
      ctx.save();
      G.roundRect(ctx, 24, y + oy, 492, 152, 18);
      ctx.clip();
      G.glow(ctx, 110, y + 76 + oy, 110, c.color, 0.18);
      ctx.restore();
      this.drawPreview(ctx, c.key, 104, y + 76 + oy, this.t + i);
      G.text(ctx, c.tag, 198, y + 42 + oy, { size: 22, weight: 'bold', color: c.color });
      G.text(ctx, c.title, 228, y + 42 + oy, { size: 30, weight: 'bold', color: '#fff' });
      G.text(ctx, c.sub, 198, y + 88 + oy, { size: 16, color: '#d8c0a8' });
      G.text(ctx, '点击进入 ›', 496, y + 126 + oy, { size: 15, align: 'right', color: c.color });
      if (c.rec) {
        G.roundRect(ctx, 400, y + 18 + oy, 100, 30, 15);
        ctx.fillStyle = '#ff8a3a';
        ctx.fill();
        G.text(ctx, '主策推荐', 450, y + 33 + oy, { size: 15, weight: 'bold', align: 'center', color: '#2a0e00', shadow: false });
      }
      ctx.restore();
    }

    var st = this.settings;
    this.ui.button(ctx, 24, 830, 150, 54, st.sound ? '音效：开' : '音效：关', function () {
      st.sound = !st.sound;
      A.setEnabled(st.sound);
      P.storage.set('er_settings', st);
    }, { color: '#3a3346', size: 18, id: 'sound' });
    this.ui.button(ctx, 366, 830, 150, 54, this.confirmReset > 0 ? '再点一次确认' : '重置存档', function () {
      if (self.confirmReset > 0) {
        ['er_raid_v1', 'er_idle_v1', 'er_surv_v1'].forEach(function (k) { P.storage.remove(k); });
        self.confirmReset = 0;
        self.resetDone = 2;
        A.play('boom');
      } else self.confirmReset = 3;
    }, { color: this.confirmReset > 0 ? '#a02a2a' : '#3a3346', size: 17, id: 'reset' });
    if (this.resetDone > 0) {
      this.resetDone -= 1 / 60;
      G.text(ctx, '存档已清空', 270, 857, { size: 16, align: 'center', color: '#ff9a7a' });
    }
    G.text(ctx, '全部画面与音效均为代码实时生成 · 原创西幻世界观', 270, 920, { size: 13, align: 'center', color: '#6a5a50' });
  };

  ER.MenuScene = MenuScene;
})();
