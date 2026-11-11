/* Service worker : l'appli marche hors ligne ; les leçons sont toujours cherchées en ligne d'abord. */
var V = "cahier-v1.1.0";
var SHELL = ["./", "index.html", "app.js", "manifest.webmanifest", "fonts/andika-400.woff2", "fonts/andika-700.woff2", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  var data = /\/(lecons|cle)\//.test(url.pathname);
  if (data) {
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) { var cp = r.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (r) {
      if (r.ok) { var cp = r.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
