/**
 * 《余烬团本》专用美术层（仅 A 使用）。
 * 素材来自 ImageGen 参考图：01 五人小队、02 三位 Boss、03 三个战场，抠图后存放在 assets/raid/。
 * 危险圈、血条、按钮等仍由 raid.js 实时绘制；本模块只负责战场、角色、头像与 Boss。
 * 素材未加载完成前 ready=false，raid.js 自动回退到程序化绘制。
 */
(function () {
  'use strict';
  var ER = window.ER, U = ER.U, G = ER.G, P = ER.platform;
  var BASE = 'assets/raid/';

  // 抠图元数据：w/h 为图片尺寸；ax 为脚底中心横向比例；hx 为头部中心横向比例（裁头像用）
  var META = {
    tank: { file: 'hero_tank.png', ax: 0.522, hx: 0.52, h: 72 },
    rogue: { file: 'hero_rogue.png', ax: 0.51, hx: 0.5, h: 68 },
    mage: { file: 'hero_mage.png', ax: 0.551, hx: 0.59, h: 70 },
    hunter: { file: 'hero_hunter.png', ax: 0.525, hx: 0.46, h: 69 },
    heal: { file: 'hero_heal.png', ax: 0.484, hx: 0.41, h: 68 },
  };
  var BOSS = {
    golem: { file: 'boss_golem.png', floor: 'floor_forge.jpg', w: 262, feet: 0.95 },
    spider: { file: 'boss_spider.png', floor: 'floor_spider.jpg', w: 300, feet: 0.93 },
    frost: { file: 'boss_frost.png', floor: 'floor_frost.jpg', w: 270, feet: 0.96 },
  };

  var imgs = {};
  var tint = {};
  var Art = { ready: false, failed: false, loading: false };

  /** 生成纯色剪影（受击闪白 / 受伤泛红 / 破绽泛金），只在加载时做一次 */
  function silhouette(img, color) {
    var c = P.createOffscreenCanvas(img.width, img.height);
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  Art.load = function () {
    if (Art.ready || Art.loading) return;
    Art.loading = true;
    var files = [];
    var k;
    for (k in META) files.push(META[k].file);
    for (k in BOSS) { files.push(BOSS[k].file); files.push(BOSS[k].floor); }
    Promise.all(files.map(function (f) {
      return P.loadImage(BASE + f).then(function (im) { imgs[f] = im; });
    })).then(function () {
      for (var id in META) {
        var im = imgs[META[id].file];
        tint[id] = { white: silhouette(im, '#ffffff'), red: silhouette(im, '#ff2020') };
      }
      for (var b in BOSS) {
        var bi = imgs[BOSS[b].file];
        tint[b] = { white: silhouette(bi, '#ffffff'), red: silhouette(bi, '#ff1a00'), gold: silhouette(bi, '#ffcf4a') };
      }
      Art.ready = true;
      Art.loading = false;
    }, function () {
      Art.failed = true;
      Art.loading = false;
    });
  };

  // ------------------------------------------------------------------ 战场
  /** 铺满全屏：03 号战场图，地面符文圈落在首领脚下 */
  Art.drawFloor = function (ctx, shape, t) {
    var B = BOSS[shape];
    var im = imgs[B.floor];
    var s = Math.max(540 / im.width, 960 / im.height);
    var w = im.width * s, h = im.height * s;
    ctx.drawImage(im, (540 - w) / 2, 0, w, h);
    // 轻微压暗，保证危险圈与角色的对比度
    var vg = ctx.createRadialGradient(270, 430, 180, 270, 430, 560);
    vg.addColorStop(0, 'rgba(0,0,0,0.08)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, 540, 960);
    void t;
  };

  // ------------------------------------------------------------------ 角色
  /**
   * 以脚底中心 (x, y) 为锚点绘制场上角色。
   * opt: walk 相位, moving, atk 0~1, lean 朝向首领的倾斜方向(-1/1), hurt, ult
   */
  Art.drawHero = function (ctx, id, x, y, opt) {
    var M = META[id];
    var im = imgs[M.file];
    var h = M.h * (opt.scale || 1);
    var w = h * im.width / im.height;
    var bob = opt.moving ? Math.abs(Math.sin(opt.walk)) * 3 : 0;
    var breathe = 1 + Math.sin(opt.walk * 0.6) * 0.015;
    var atk = opt.atk || 0;
    var lean = atk > 0 ? Math.sin(atk * Math.PI) * 0.16 * (opt.lean || 1) : (opt.moving ? Math.sin(opt.walk) * 0.04 : 0);
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.32, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.rotate(lean);
    ctx.scale(1 + (atk > 0 ? Math.sin(atk * Math.PI) * 0.05 : 0), breathe);
    var dx = -w * M.ax, dy = -h;
    if (opt.ult) G.glow(ctx, 0, -h * 0.5, h * 0.9, '#ffb347', 0.4);
    ctx.drawImage(im, dx, dy, w, h);
    if (opt.hurt > 0) {
      ctx.globalAlpha = Math.min(0.7, opt.hurt * 5);
      ctx.drawImage(tint[id].red, dx, dy, w, h);
    }
    ctx.restore();
    return h;
  };

  /** 头像：裁取原画肩部以上，放进圆角方框 */
  Art.drawPortrait = function (ctx, id, x, y, size, opt) {
    opt = opt || {};
    var M = META[id];
    var im = imgs[M.file];
    var cropH = im.height * 0.36;
    var cropW = cropH;
    var sx = U.clamp(im.width * M.hx - cropW / 2, 0, im.width - cropW);
    var r = size * 0.2;
    ctx.save();
    G.roundRect(ctx, x - size / 2, y - size / 2, size, size, r);
    var bg = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    bg.addColorStop(0, opt.dead ? '#2a2630' : U.mix(opt.color || '#555555', '#000000', 0.35));
    bg.addColorStop(1, opt.dead ? '#141218' : U.mix(opt.color || '#555555', '#000000', 0.75));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();
    if (opt.dead) ctx.globalAlpha = 0.35;
    ctx.drawImage(im, sx, 0, cropW, cropH, x - size / 2, y - size / 2 + size * 0.04, size, size);
    ctx.restore();
    // 金属边框
    G.roundRect(ctx, x - size / 2, y - size / 2, size, size, r);
    ctx.lineWidth = 3;
    ctx.strokeStyle = opt.dead ? '#555' : '#c9a24a';
    ctx.stroke();
    G.roundRect(ctx, x - size / 2 + 3, y - size / 2 + 3, size - 6, size - 6, r * 0.7);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opt.dead ? '#333' : U.rgba(opt.color || '#ffffff', 0.9);
    ctx.stroke();
  };

  // ------------------------------------------------------------------ Boss
  /**
   * 以首领脚底 (x, footY) 为锚点绘制；返回绘制宽高。
   * st: t, hurt, slam 0~1, enraged, vuln, scale
   */
  Art.drawBoss = function (ctx, shape, x, footY, st) {
    var B = BOSS[shape];
    var im = imgs[B.file];
    var w = B.w * (st.scale || 1);
    var h = w * im.height / im.width;
    var t = st.t || 0;
    var slam = st.slam || 0;
    var sk = Math.sin(slam * Math.PI);
    var breathe = 1 + Math.sin(t * 2.2) * 0.018;
    var dx = -w / 2, dy = -h * B.feet;
    ctx.save();
    ctx.translate(x, footY + sk * 6 + (st.vuln ? 8 : 0));
    // 砸地：压扁再弹起；破绽：微微前倾
    ctx.scale(1 + sk * 0.04, breathe * (1 - sk * 0.06));
    if (st.vuln) ctx.rotate(Math.sin(t * 3) * 0.02 + 0.03);
    ctx.drawImage(im, dx, dy, w, h);
    if (st.enraged) {
      ctx.globalAlpha = 0.18 + Math.sin(t * 6) * 0.08;
      ctx.drawImage(tint[shape].red, dx, dy, w, h);
    }
    if (st.vuln) {
      ctx.globalAlpha = 0.12 + Math.sin(t * 8) * 0.06;
      ctx.drawImage(tint[shape].gold, dx, dy, w, h);
    }
    if (st.hurt > 0) {
      ctx.globalAlpha = Math.min(0.22, st.hurt * 4);
      ctx.drawImage(tint[shape].white, dx, dy, w, h);
    }
    ctx.restore();
    return { w: w, h: h };
  };

  Art.has = function (shape) { return Art.ready && !!BOSS[shape]; };

  ER.RaidArt = Art;
})();
