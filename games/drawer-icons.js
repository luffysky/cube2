/* Line icons for the side menus (轉磚's and the brick games'). 24×24, drawn with the current colour.
   window.SnowRealmIcons.svg(name) gives the markup; SnowRealmIcons.fill(root) fills every <i class="ic" data-ic>. */
(function (root) {
  'use strict';
  var P = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l2 2"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.5 4.5 0 0 0 7 18z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>',
    swords: '<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4"/><path d="M7 14l3 3M5.5 18.5l2-2M17 14l-3 3M18.5 18.5l-2-2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
    ghost: '<path d="M5 20V11a7 7 0 0 1 14 0v9l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    sun: '<circle cx="9" cy="9" r="3"/><path d="M9 2.5V4M3.5 9H2M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M9 20h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 9 20z"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    hist: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 2.5h4M18.5 6.5l1.5-1.5"/>',
    bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.9 0-1 .8-1.6 1.8-1.6h2.2a3.9 3.9 0 0 0 4-4c0-3.9-3.8-6.8-8.5-6.8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 15l2 2 4-4"/>',
    bag: '<path d="M5 9h14l-1 11.5H6z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/><path d="M9 13h6"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8c-1-3-5.5-4-5.5-1.5S10 8 12 8zM12 8c1-3 5.5-4 5.5-1.5S14 8 12 8z"/>',
    slot: '<rect x="3.5" y="5" width="14" height="14" rx="2.5"/><path d="M8 9v6M13 9v6M17.5 9H20V6"/><circle cx="20" cy="5" r="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    chart: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    brick: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 12h17M10 5v7M14 12v7"/>',
    snake: '<path d="M4 17c0-3 2-4 4-4s3 1.5 5 1.5S16 13 16 10s-2-4-4-4"/><circle cx="17.5" cy="17.5" r="2"/>',
    ball: '<path d="M4 18h7"/><circle cx="16" cy="9" r="3"/><path d="M4 5h4M10 5h4"/>',
    layers: '<rect x="6" y="15" width="12" height="4" rx="1"/><rect x="7.5" y="10" width="9" height="4" rx="1"/><rect x="9" y="5" width="6" height="4" rx="1"/>',
    box: '<rect x="5" y="7" width="11" height="11" rx="1.5"/><path d="M5 12.5h11M10.5 7v11M19.5 12.5h-2M18.5 10.5l1.5 2-1.5 2"/>',
    merge: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M10.5 7H17v6.5M7 10.5V17h6.5"/>',
    sort: '<path d="M6 20V12M10 20V8M14 20V14M18 20V5"/>',
    pixel: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/><path d="M9.3 9.3h5.4v5.4H9.3z" fill="currentColor"/>',
    pipe: '<path d="M4 9h7a4 4 0 0 1 4 4v7M4 15h4a1 1 0 0 1 1 1v4"/>',
    mine: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 16V8l5 2.5-5 2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.5"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    snow: '<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2M4 10.5l3-.5-1-3M20 13.5l-3 .5 1 3M4 13.5l3 .5-1 3M20 10.5l-3-.5 1-3"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    chev: '<path d="M9.5 6l6 6-6 6"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[n] || P.brick) + '</svg>'; }
  function fill(r) { var a = (r || document).querySelectorAll('i.ic[data-ic]'); for (var i = 0; i < a.length; i++) if (!a[i].firstChild) a[i].innerHTML = svg(a[i].getAttribute('data-ic')); }
  var api = { svg: svg, fill: fill, names: Object.keys(P) };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SnowRealmIcons = api;
})(typeof window !== 'undefined' ? window : this);
