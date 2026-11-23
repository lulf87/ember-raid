# 余烬（ember-raid）· 玩法原型合集

面向微信小游戏的竖屏单机游戏原型，目前是浏览器可直接运行的 H5 版本。
所有画面、UI、音效都用纯 Canvas 2D 和 WebAudio 实时生成，不依赖任何图片或音频文件。

## 运行

- **最简单**：直接双击 `index.html`，在浏览器里打开即可。
- 或者起一个本地服务器（方便手机在同一局域网访问）：
  ```bash
  python3 -m http.server 8080
  # 浏览器访问 http://localhost:8080
  ```
- 桌面用鼠标，手机用单指触控。桌面宽屏会自动加黑边，保持 9:16。

## 三个原型

| | 名称 | 核心体验 | 激励视频位置 |
|---|---|---|---|
| A | **余烬团本** | 单指拖动带 5 人小队躲技能（红圈、横扫、新星、黄圈集合分摊），队员自动坦克/治疗/输出；击杀后看伤害统计，开箱分装备 | 灭团后“引魂复活”、结算时“团长私房宝箱”、开箱时“再摇一次”（品质只升不降）、“传说之夜”30 分钟高掉率 |
| B（主推） | **余烬远征** | 2D 横版挂机过关：6 层视差、日夜循环、动态光照、5 种地域天气；5 名英雄各有必杀切入特写；首领登场演出、章节通关转场；点屏幕补刀连击 | 离线收益翻倍、10 分钟 2 倍速、金币礼包 |
| C | **灰烬独行者** | 虚拟摇杆走位、自动攻击，升级三选一构筑技能，坚持 5 分钟击败烬王；可选战士/法师/祭司 | 原地复活、刷新升级选项、双倍余烬 |

H5 原型里的激励视频由一个 Canvas 绘制的模拟浮层代替，2.5 秒后发奖励，可以提前关闭放弃奖励。

## 目录结构

```
index.html               仅包含一个 <canvas> 和脚本引用
src/platform/platform.h5.js   平台适配层（存档/音频/触控/广告/前后台），迁移微信时替换此文件
src/engine/              引擎：主循环与场景栈、DPR 适配、即时模式 UI、粒子特效、程序化音效、广告封装
src/shared/              共享系统：装备与品质掉落、开箱演出
src/games/raid.js        原型 A
src/games/expedition/    原型 B（world.js 世界渲染 / game.js 战斗与演出）
src/games/survivor.js    原型 C
src/scenes/menu.js       首页
src/main.js              入口
```

## 平台解耦

业务代码只通过 `ER.platform` 访问底层能力。迁移微信小游戏时，新写一个 `platform.wx.js` 实现同样的接口即可：

- `getCanvas` → `wx.createCanvas()`
- `getSystemInfo` → `wx.getSystemInfoSync()`
- `onPointer` → `wx.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel`
- `storage` → `wx.getStorageSync / wx.setStorageSync`
- `createAudioContext` → `wx.createWebAudioContext()`
- `showRewardedAd` → `wx.createRewardedVideoAd`
- `onHide / onShow` → `wx.onHide / wx.onShow`

引擎使用 540×960 的逻辑分辨率，按屏幕等比缩放并按设备像素比（DPR）提高清晰度。

工程与合规底线见 [`CLAUDE.md`](CLAUDE.md)。
