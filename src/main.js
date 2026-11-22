/**
 * 入口：创建应用、安装广告模拟层、进入首页。
 */
(function () {
  'use strict';
  var ER = window.ER;
  var app = new ER.App();
  ER.app = app;
  ER.ads.install(app);
  app.push(new ER.MenuScene());
  app.start();
})();
