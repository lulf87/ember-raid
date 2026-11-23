/**
 * 程序化音效：全部用 WebAudio 振荡器与噪声实时合成，不依赖任何音频文件。
 * 音频上下文由平台层创建（H5: AudioContext / 微信: wx.createWebAudioContext）。
 */
(function () {
  'use strict';
  var ER = (window.ER = window.ER || {});
  var P = ER.platform;

  var ctx = null, master = null, noiseBuf = null;
  var lastPlay = {};
  var A = { enabled: true };

  function ensure() {
    if (ctx) return ctx;
    ctx = P.createAudioContext();
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = 0.55;
    var comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
    if (comp) { master.connect(comp); comp.connect(ctx.destination); } else master.connect(ctx.destination);
    var len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  /** 首次触摸时解锁（浏览器与微信都要求用户手势后才能出声） */
  A.unlock = function () {
    var c = ensure();
    if (c && c.state === 'suspended' && c.resume) c.resume();
  };

  A.setEnabled = function (on) { A.enabled = !!on; };

  function tone(freq, dur, type, vol, slideTo, delay, attack) {
    var c = ctx;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    var a = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay, filterType, sweepTo) {
    var c = ctx;
    var t0 = c.currentTime + (delay || 0);
    var s = c.createBufferSource();
    s.buffer = noiseBuf;
    var f = c.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 2000, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  function arp(notes, step, type, vol, dur) {
    for (var i = 0; i < notes.length; i++) tone(notes[i], dur || 0.25, type, vol, null, i * step);
  }

  var SFX = {
    click: function () { tone(880, 0.06, 'triangle', 0.12, 1200); },
    hit: function () { noise(0.07, 0.18, 1800); tone(180, 0.06, 'square', 0.05, 90); },
    hitSoft: function () { noise(0.05, 0.08, 1200); },
    crit: function () { noise(0.1, 0.25, 3200); tone(520, 0.12, 'sawtooth', 0.08, 260); },
    slash: function () { noise(0.09, 0.15, 5000, 0, 'highpass', 1500); },
    fire: function () { noise(0.18, 0.12, 900, 0, 'lowpass', 300); },
    boom: function () { noise(0.6, 0.45, 900, 0, 'lowpass', 80); tone(90, 0.5, 'sine', 0.35, 35); },
    bigBoom: function () {
      noise(1.2, 0.6, 1400, 0, 'lowpass', 60); tone(70, 1.0, 'sine', 0.5, 25);
      tone(140, 0.6, 'sawtooth', 0.12, 40);
    },
    warn: function () { tone(440, 0.18, 'square', 0.07, 330); tone(440, 0.18, 'square', 0.07, 330, 0.22); },
    heal: function () { arp([660, 880, 1100], 0.05, 'sine', 0.06, 0.2); },
    coin: function () { tone(1320, 0.07, 'square', 0.05); tone(1760, 0.12, 'square', 0.05, null, 0.06); },
    pickup: function () { tone(900 + Math.random() * 300, 0.06, 'sine', 0.06, 1600); },
    levelup: function () { arp([523, 659, 784, 1047], 0.07, 'triangle', 0.12, 0.3); },
    death: function () { tone(300, 0.5, 'sawtooth', 0.1, 80); },
    wipe: function () { arp([392, 330, 262, 196], 0.18, 'sawtooth', 0.09, 0.5); },
    victory: function () { arp([523, 659, 784, 1047, 1319], 0.09, 'triangle', 0.14, 0.5); },
    ult: function () { tone(110, 0.9, 'sawtooth', 0.18, 440); noise(0.8, 0.2, 400, 0, 'bandpass', 3000); },
    shake: function () { noise(0.12, 0.25, 300); tone(70, 0.12, 'sine', 0.2, 50); },
    chestOpen: function () { noise(0.3, 0.3, 2500, 0, 'highpass', 600); tone(200, 0.3, 'triangle', 0.15, 600); },
    loot0: function () { arp([523, 659], 0.06, 'triangle', 0.1, 0.25); },
    loot1: function () { arp([523, 659, 784], 0.06, 'triangle', 0.11, 0.3); },
    loot2: function () { arp([587, 740, 880, 1175], 0.06, 'triangle', 0.12, 0.35); },
    loot3: function () {
      arp([523, 659, 784, 988, 1319], 0.07, 'sawtooth', 0.07, 0.5);
      tone(262, 1.0, 'sine', 0.2, null, 0, 0.05);
    },
    loot4: function () {
      arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.075, 'sawtooth', 0.07, 0.6);
      tone(131, 1.6, 'sine', 0.3, null, 0, 0.05);
      tone(196, 1.6, 'triangle', 0.15, null, 0.1, 0.1);
      noise(1.4, 0.18, 6000, 0.1, 'highpass', 2000);
    },
    tick: function () { tone(1500, 0.03, 'square', 0.04); },
    error: function () { tone(160, 0.15, 'square', 0.08, 120); },
  };

  /** 播放音效；minGap 防止同一音效在一帧内堆叠爆音 */
  A.play = function (name, minGap) {
    if (!A.enabled) return;
    if (!ensure() || ctx.state !== 'running') return;
    var now = ctx.currentTime;
    var gap = minGap == null ? 0.035 : minGap;
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    var fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* ignore */ } }
  };

  ER.audio = A;
})();
