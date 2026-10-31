/* Cargador de mods de Sol Cesto (Legado · Glasius.Mods). */
(function () {
  if (window.top !== window) return;
  var MODS = ["mods/legado.js"];
  MODS.forEach(function (src) {
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onerror = function () { console.log("[mods] no encontrado: " + src); };
    (document.head || document.documentElement).appendChild(s);
  });
})();
