/**
 * 共享掉落系统：品质、装备生成、程序化图标、装备卡片。
 * 所有名称均为原创。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var U = ER.U, G = ER.G;

  var RARITY = [
    { name: '普通', color: '#c8c8c8', mult: 1.0, w: 52 },
    { name: '优秀', color: '#3fd65a', mult: 1.3, w: 30 },
    { name: '精良', color: '#3d8bff', mult: 1.7, w: 13 },
    { name: '史诗', color: '#b35cff', mult: 2.3, w: 4.2 },
    { name: '传说', color: '#ff8a1f', mult: 3.2, w: 0.8 },
  ];

  var SLOTS = {
    weapon: { name: '武器', bases: ['长剑', '战斧', '战锤', '双刃', '法杖', '长弓', '短刃', '权杖'] },
    helm: { name: '头盔', bases: ['铁盔', '兜帽', '角冠', '面甲'] },
    chest: { name: '胸甲', bases: ['胸甲', '法袍', '皮甲', '锁子甲'] },
    hands: { name: '护手', bases: ['护手', '手套', '腕甲'] },
    ring: { name: '戒指', bases: ['指环', '戒指', '印戒'] },
    trinket: { name: '饰品', bases: ['护符', '徽记', '吊坠', '圣物'] },
  };

  var PREFIX = [
    ['破旧的', '粗制', '学徒', '生锈的', '旅人'],
    ['坚固的', '锋利的', '巡林者', '老兵', '磨亮的'],
    ['精工', '秘银', '寒钢', '符文', '守望者'],
    ['炽炎', '暗影织就', '龙骨', '星辉', '深渊'],
  ];
  var SUFFIX = ['·灰烬', '·晨风', '·铁誓', '·狼嚎', '·星坠', '·潮汐', '·怒焰', '·静夜'];

  var LEGENDARY = {
    weapon: ['烬心·不熄之誓', '霜誓·终末低语', '晨星裂空者', '焚炉之喉', '影七的第二把刀'],
    helm: ['熔冠·千炉之王', '守夜人的旧梦'],
    chest: ['铁砧的最后一句话', '不眠守望者胸甲', '烬羽长袍'],
    hands: ['点火者之握', '寒獠断爪'],
    ring: ['无尽回响之戒', '晨露的承诺'],
    trinket: ['熄灭之星的残片', '团长的旧怀表', '第一缕余烬'],
  };

  var LEG_EFFECT = [
    '攻击有几率引爆余烬，造成额外伤害',
    '暴击时短暂提升全队急速',
    '生命低于30%时获得护盾',
    '每第5次攻击必定暴击',
    '击杀时回复生命',
  ];

  /** luck: 0~1 提升高品质权重；floor: 最低品质 */
  function rollRarity(luck, floor) {
    luck = luck || 0;
    floor = floor || 0;
    var entries = [];
    for (var i = floor; i < RARITY.length; i++) {
      var w = RARITY[i].w * (1 + luck * i * i * 0.9);
      entries.push({ w: w, r: i });
    }
    return U.weighted(entries).r;
  }

  /** 生成装备 opt: slot, ilvl, rarity, owner */
  function makeItem(opt) {
    var slot = opt.slot || U.pick(Object.keys(SLOTS));
    var rarity = opt.rarity == null ? rollRarity(opt.luck) : opt.rarity;
    var ilvl = Math.max(1, Math.round(opt.ilvl || 1));
    var R = RARITY[rarity];
    var name;
    var base = opt.base || U.pick(SLOTS[slot].bases);
    if (rarity === 4) name = U.pick(LEGENDARY[slot]);
    else if (rarity === 0) name = U.pick(PREFIX[0]) + base;
    else name = U.pick(PREFIX[rarity]) + base + (rarity >= 2 ? U.pick(SUFFIX) : '');
    var power = Math.round(ilvl * R.mult * U.rand(0.92, 1.08) * 1.2);
    var item = {
      id: U.uid(), slot: slot, rarity: rarity, ilvl: ilvl, name: name, power: Math.max(1, power),
      crit: rarity >= 2 ? Math.round(U.rand(1, 2 + rarity * 1.5)) : 0,
      haste: rarity >= 3 ? Math.round(U.rand(2, 4 + rarity)) : 0,
      effect: rarity === 4 ? U.pick(LEG_EFFECT) : null,
      owner: opt.owner || null,
      base: base,
    };
    return item;
  }

  /** 以新品质重铸（保留部位/装等/归属） */
  function reforge(item, rarity) {
    return makeItem({ slot: item.slot, ilvl: item.ilvl, rarity: rarity, owner: item.owner, base: item.base });
  }

  // ------------------------------------------------------------------
  // 程序化装备图标
  function drawIcon(ctx, slot, x, y, size, rarity, opt) {
    opt = opt || {};
    var R = RARITY[rarity == null ? 0 : rarity];
    var s = size;
    ctx.save();
    ctx.translate(x, y);
    // 底框
    G.roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.18);
    var grd = ctx.createRadialGradient(0, -s * 0.1, s * 0.05, 0, 0, s * 0.7);
    grd.addColorStop(0, U.rgba(R.color, 0.45));
    grd.addColorStop(1, 'rgba(12,10,18,0.95)');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = R.color;
    ctx.stroke();
    if (rarity >= 3 && !opt.noGlow) {
      ctx.shadowColor = R.color;
      ctx.shadowBlur = s * 0.35;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    var k = s / 64;
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var metal = '#e8e2d6', dark = '#6b5a48', accent = R.color;
    ctx.fillStyle = metal;
    ctx.strokeStyle = '#1a1420';
    ctx.lineWidth = 2.5;
    switch (slot) {
      case 'weapon':
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -24); ctx.lineTo(5, -16); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.lineTo(-5, -16); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.fillRect(-12, 8, 24, 5); ctx.strokeRect(-12, 8, 24, 5);
        ctx.fillStyle = dark;
        ctx.fillRect(-3, 13, 6, 10); ctx.strokeRect(-3, 13, 6, 10);
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(0, 25, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'helm':
        ctx.beginPath();
        ctx.moveTo(-18, 12); ctx.quadraticCurveTo(-20, -20, 0, -20); ctx.quadraticCurveTo(20, -20, 18, 12);
        ctx.lineTo(8, 12); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.lineTo(-8, 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(0, -28); ctx.lineTo(3, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(-18, 10, 36, 5); ctx.strokeRect(-18, 10, 36, 5);
        break;
      case 'chest':
        ctx.beginPath();
        ctx.moveTo(-20, -16); ctx.lineTo(-8, -20); ctx.quadraticCurveTo(0, -12, 8, -20); ctx.lineTo(20, -16);
        ctx.lineTo(16, 0); ctx.lineTo(14, 20); ctx.lineTo(-14, 20); ctx.lineTo(-16, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'hands':
        ctx.beginPath();
        ctx.moveTo(-12, 20); ctx.lineTo(-14, -2); ctx.lineTo(-14, -18); ctx.lineTo(-8, -18); ctx.lineTo(-8, -6);
        ctx.lineTo(-4, -22); ctx.lineTo(2, -22); ctx.lineTo(2, -6); ctx.lineTo(6, -18); ctx.lineTo(12, -16);
        ctx.lineTo(12, 4); ctx.lineTo(18, -2); ctx.lineTo(20, 4); ctx.lineTo(12, 20); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.fillRect(-13, 12, 26, 6); ctx.strokeRect(-13, 12, 26, 6);
        break;
      case 'ring':
        ctx.beginPath(); ctx.arc(0, 6, 15, 0, Math.PI * 2); ctx.arc(0, 6, 9, 0, Math.PI * 2, true);
        ctx.fillStyle = '#e9c46a'; ctx.fill('evenodd'); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(8, -10); ctx.lineTo(0, -2); ctx.lineTo(-8, -10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      default: // trinket
        ctx.beginPath(); ctx.moveTo(-8, -22); ctx.quadraticCurveTo(0, -12, 8, -22);
        ctx.strokeStyle = '#e9c46a'; ctx.stroke();
        ctx.strokeStyle = '#1a1420';
        ctx.fillStyle = accent;
        ctx.beginPath();
        for (var i = 0; i < 10; i++) {
          var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          var r = i % 2 === 0 ? 18 : 8;
          ctx.lineTo(Math.cos(a) * r, 4 + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 4, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 装备卡片；compare 为当前同部位装备（可空）。返回卡片高度。
   */
  function drawCard(ctx, item, x, y, w, compare, opt) {
    opt = opt || {};
    var R = RARITY[item.rarity];
    var lines = [];
    lines.push({ t: SLOTS[item.slot].name + '  ·  装等 ' + item.ilvl, c: '#bbb', s: 16 });
    lines.push({ t: '战力 +' + item.power, c: '#fff', s: 22, b: true });
    if (item.crit) lines.push({ t: '暴击 +' + item.crit + '%', c: '#7dff9a', s: 17 });
    if (item.haste) lines.push({ t: '急速 +' + item.haste + '%', c: '#7dff9a', s: 17 });
    if (item.effect) lines.push({ t: '传说特效：' + item.effect, c: '#ffb347', s: 16, wrap: true });
    if (opt.ownerName) lines.push({ t: '适合：' + opt.ownerName, c: '#9fd0ff', s: 16 });
    var h = 92;
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      L.h = L.wrap ? G.wrap(ctx, L.t, w - 40, L.s).length * L.s * 1.4 : L.s * 1.55;
      h += L.h;
    }
    if (compare !== undefined) h += 34;
    G.panel(ctx, x, y, w, h, { border: R.color, glow: item.rarity >= 3 ? R.color : null, lineWidth: 3 });
    drawIcon(ctx, item.slot, x + 46, y + 46, 60, item.rarity);
    G.text(ctx, R.name, x + 88, y + 28, { size: 15, color: R.color });
    var nameLines = G.wrap(ctx, item.name, w - 104, 22, 'bold');
    G.text(ctx, nameLines[0], x + 88, y + 56, { size: 22, weight: 'bold', color: R.color });
    var cy = y + 92;
    for (var j = 0; j < lines.length; j++) {
      var M = lines[j];
      if (M.wrap) {
        G.paragraph(ctx, M.t, x + 20, cy + M.s * 0.6, w - 40, { size: M.s, color: M.c, lineHeight: M.s * 1.4 });
      } else {
        G.text(ctx, M.t, x + 20, cy + M.h / 2, { size: M.s, color: M.c, weight: M.b ? 'bold' : 'normal' });
      }
      cy += M.h;
    }
    if (compare !== undefined) {
      var diff = item.power - (compare ? compare.power : 0);
      var txt = compare ? (diff >= 0 ? '比当前装备 战力 +' + diff : '比当前装备 战力 ' + diff) : '该部位当前为空';
      G.text(ctx, txt, x + 20, cy + 16, { size: 17, weight: 'bold', color: diff >= 0 ? '#7dff9a' : '#ff6b6b' });
    }
    return h;
  }

  ER.Loot = {
    RARITY: RARITY,
    SLOTS: SLOTS,
    rollRarity: rollRarity,
    makeItem: makeItem,
    reforge: reforge,
    drawIcon: drawIcon,
    drawCard: drawCard,
  };
})();
