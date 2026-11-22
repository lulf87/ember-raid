/**
 * 共享“开箱揭晓”浮层：宝箱抖动 -> 光柱炸开 -> 装备卡片弹出 -> 操作按钮。
 * opts:
 *   item, title, ownerName, compare(当前装备|null|undefined), fast,
 *   actions(scene) -> [{label, color, ad, sub, onClick}]
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var U = ER.U, G = ER.G, Loot = ER.Loot;

  function drawChest(ctx, x, y, s, lidOpen, color, glowA) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (glowA > 0) G.glow(ctx, 0, -10, 140, color, glowA);
    // 箱体
    ctx.fillStyle = '#5a3418';
    ctx.strokeStyle = '#1a0d05';
    ctx.lineWidth = 4;
    G.roundRect(ctx, -70, -20, 140, 70, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(-64, -14, 128, 10);
    // 金属箍
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-48, -20, 12, 70); ctx.fillRect(36, -20, 12, 70);
    ctx.strokeRect(-48, -20, 12, 70); ctx.strokeRect(36, -20, 12, 70);
    // 锁
    ctx.fillStyle = '#e8c55a';
    G.roundRect(ctx, -11, -8, 22, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1a08';
    ctx.beginPath(); ctx.arc(0, 2, 3.5, 0, Math.PI * 2); ctx.fill();
    // 箱盖（打开时向上弹飞并淡出）
    ctx.save();
    ctx.translate(lidOpen * 30, -20 - lidOpen * 90);
    ctx.rotate(lidOpen * 0.5);
    ctx.globalAlpha = 1 - lidOpen * 0.75;
    ctx.fillStyle = '#6a3d1c';
    ctx.beginPath();
    ctx.moveTo(-70, 0); ctx.lineTo(-70, -22); ctx.quadraticCurveTo(0, -58, 70, -22); ctx.lineTo(70, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-48, -40, 12, 40); ctx.fillRect(36, -40, 12, 40);
    ctx.restore();
    ctx.restore();
  }

  function LootReveal(opts) {
    this.overlay = true;
    this.opts = opts;
    this.ui = new ER.UI();
    this.fx = new ER.FX();
    this.item = opts.item;
    this.t = 0;
    this.phase = 'shake';
    this.shakeDur = opts.fast ? 0.45 : 1.25;
    this.showT = 0;
    this.lid = 0;
    this.tickAcc = 0;
    this.closed = false;
  }

  LootReveal.prototype.enter = function () {
    ER.audio.play('shake');
  };

  /** 替换物品并重新播放“炸开”（用于再摇一次） */
  LootReveal.prototype.setItem = function (item, compare) {
    this.item = item;
    if (compare !== undefined) this.opts.compare = compare;
    this.phase = 'shake';
    this.t = 0;
    this.shakeDur = 0.8;
    this.showT = 0;
    this.lid = 0;
  };

  LootReveal.prototype.close = function () {
    if (this.closed) return;
    this.closed = true;
    this.app.remove(this);
  };

  LootReveal.prototype._burst = function () {
    var r = this.item.rarity;
    var R = Loot.RARITY[r];
    ER.audio.play('chestOpen');
    ER.audio.play('loot' + r);
    this.fx.burst(270, 560, { n: 40 + r * 30, colors: [R.color, '#ffffff', U.mix(R.color, '#ffffff', 0.5)], speed: 520 + r * 120, life: 1.1, size: 5, gravity: 300, shape: 'spark' });
    this.fx.ring(270, 560, 20, 300 + r * 40, R.color, 0.8, 10);
    if (r >= 3) {
      this.fx.flash(R.color, 0.45 + (r - 3) * 0.35, 1.6);
      this.fx.shake(10 + (r - 3) * 10, 0.6);
      ER.platform.vibrate(r === 4 ? 60 : 30);
    }
  };

  LootReveal.prototype.update = function (dt) {
    this.t += dt;
    this.fx.update(dt);
    if (this.phase === 'shake') {
      this.tickAcc += dt;
      var rate = 0.18 - (this.t / this.shakeDur) * 0.12;
      if (this.tickAcc > rate) { this.tickAcc = 0; ER.audio.play('tick', 0.02); }
      if (this.t >= this.shakeDur) {
        this.phase = 'show';
        this.showT = 0;
        this._burst();
      }
    } else {
      this.showT += dt;
      this.lid = Math.min(1, this.lid + dt * 6);
      if (Math.random() < dt * 30) {
        var R = Loot.RARITY[this.item.rarity];
        this.fx.burst(U.rand(200, 340), 560, { n: 1, color: R.color, speed: 120, angle: -Math.PI / 2, spread: 0.4, life: 1.4, size: 3, drag: 0.5 });
      }
    }
  };

  LootReveal.prototype.render = function (ctx) {
    var self = this;
    var item = this.item;
    var R = Loot.RARITY[item.rarity];
    ctx.fillStyle = 'rgba(6,4,10,0.95)';
    ctx.fillRect(0, 0, 540, 960);
    ctx.save();
    ctx.translate(this.fx.sx, this.fx.sy);
    G.text(ctx, this.opts.title || '战利品', 270, 70, { size: 30, weight: 'bold', align: 'center', color: '#ffd9a0' });

    if (this.phase === 'shake') {
      var k = this.t / this.shakeDur;
      // 悬念：光芒颜色逐级攀升到最终品质
      var shown = Math.min(item.rarity, Math.floor(k * (item.rarity + 1.2)));
      var col = Loot.RARITY[shown].color;
      var amp = 2 + k * 10;
      var ang = Math.sin(this.t * 40) * 0.05 * (0.4 + k);
      ctx.save();
      ctx.translate(270 + U.rand(-amp, amp) * 0.4, 600 + U.rand(-amp, amp) * 0.3);
      ctx.rotate(ang);
      drawChest(ctx, 0, 0, 1.4 + k * 0.1, 0, col, 0.25 + k * 0.5);
      ctx.restore();
      G.text(ctx, '……', 270, 780, { size: 26, align: 'center', color: '#aaa' });
    } else {
      var st = this.showT;
      // 光柱
      var pillarA = Math.max(0.25, 1 - st * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var pg = ctx.createLinearGradient(0, 0, 0, 600);
      pg.addColorStop(0, U.rgba(R.color, 0));
      pg.addColorStop(1, U.rgba(R.color, 0.5 * pillarA));
      ctx.fillStyle = pg;
      var pw = 60 + item.rarity * 25;
      ctx.fillRect(270 - pw / 2, 0, pw, 600);
      ctx.restore();
      if (item.rarity >= 2) G.rays(ctx, 270, 560, 360 + item.rarity * 40, R.color, this.t * 0.5, 10 + item.rarity * 2, 0.35);
      drawChest(ctx, 270, 620, 1.2, this.lid, R.color, 0.6);

      // 卡片
      var ct = U.clamp(st / 0.45, 0, 1);
      var sc = U.easeOutBack(ct);
      ctx.save();
      ctx.translate(270, 330);
      ctx.scale(sc, sc);
      ctx.globalAlpha = ct;
      ctx.translate(-270, -330);
      if (item.rarity === 4) {
        G.text(ctx, '传说！', 270, 150, { size: 54, weight: 'bold', align: 'center', color: '#ffb347', stroke: '#5a2a00', strokeWidth: 8 });
      } else if (item.rarity === 3) {
        G.text(ctx, '史诗！', 270, 150, { size: 44, weight: 'bold', align: 'center', color: '#d49bff', stroke: '#2a0a4a', strokeWidth: 7 });
      }
      Loot.drawCard(ctx, item, 70, 190, 400, this.opts.compare, { ownerName: this.opts.ownerName });
      ctx.restore();

      if (st > 0.4 && this.opts.actions) {
        var acts = this.opts.actions(this);
        // 排版：full 按钮独占一行，其余按钮每行最多 3 个
        var rows = [], cur = null;
        for (var i = 0; i < acts.length; i++) {
          if (acts[i].full) { rows.push([acts[i]]); cur = null; }
          else { if (!cur || cur.length >= 3) { cur = []; rows.push(cur); } cur.push(acts[i]); }
        }
        var by = 900 - rows.length * 84;
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var full = row.length === 1 && row[0].full;
          var bw = full ? 420 : row.length >= 3 ? 150 : 200, gap = 14;
          var rw = row.length * bw + (row.length - 1) * gap;
          for (var c = 0; c < row.length; c++) {
            var a = row[c];
            this.ui.button(ctx, 270 - rw / 2 + c * (bw + gap), by + r * 84, bw, 68, a.label, a.onClick, {
              color: a.color, ad: a.ad, sub: a.sub, size: 22, disabled: a.disabled, id: 'act' + r + c + a.label, pulse: a.ad,
            });
          }
        }
      }
    }
    this.fx.renderParticles(ctx);
    ctx.restore();
    this.fx.renderFlash(ctx);
  };

  ER.LootReveal = LootReveal;
  ER.drawChest = drawChest;
})();
