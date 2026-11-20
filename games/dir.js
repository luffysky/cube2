/* the brick games directory: 轉磚's coins on this device, and what the brick games have waiting to be paid */
(function () {
  'use strict';
  var M = window.SnowRealmMini, el = document.getElementById('wallet');
  if (!M || !el) return;
  var b = M.balance(), w = M.waiting();
  if (b == null && !w) return;
  var T = function () { return window.SRW ? window.SRW.t.apply(null, arguments) : arguments[0]; };
  el.innerHTML = T('dir.wallet', b == null ? 0 : b) + (w ? T('g.sep') + '<a href="../?from=games">' + T('dir.walletWait', w) + '</a>' : '');
  el.hidden = false;
})();
