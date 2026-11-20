/* the brick games directory: 轉磚's coins on this device, and what the brick games have waiting to be paid */
(function () {
  'use strict';
  var M = window.SnowRealmMini, el = document.getElementById('wallet');
  if (!M || !el) return;
  var b = M.balance(), w = M.waiting();
  if (b == null && !w) return;
  el.innerHTML = '轉磚金幣 <b>' + (b == null ? 0 : b) + '</b>' + (w ? '・<a href="../?from=games">+' + w + ' 待入帳，回轉磚領取</a>' : '');
  el.hidden = false;
})();
