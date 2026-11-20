/* the site theme the player picked in 轉磚 (Meta.SITE), on this brick-game page too; runs first, in <head> */
(function () {
  try {
    var r = JSON.parse(localStorage.getItem('zhuanzhuan.meta.v1') || 'null'), s = r && r.equip && r.equip.site;
    if (typeof s === 'string' && /^[a-z]{2,16}$/.test(s) && s !== 'default') document.documentElement.setAttribute('data-site', s);
  } catch (e) { /* the default look */ }
})();
