// ---------------------------------------------------------------------------
//  Service Worker - Prix des carburants PWA
//  Cache les assets statiques, laisse passer les requetes API
// ---------------------------------------------------------------------------

var CACHE_NAME = 'carburants-v2';

var STATIC_ASSETS = [
  './',
  'index.php',
  'css/styles.css',
  'js/script.js',
  'libs/leaflet/leaflet.js',
  'libs/leaflet/leaflet.css',
  'libs/leaflet/marker-icon.png',
  'libs/leaflet/marker-icon-2x.png',
  'libs/leaflet/marker-shadow.png',
  'libs/leaflet-routing-machine/leaflet-routing-machine.js',
  'libs/leaflet-routing-machine/leaflet-routing-machine.css',
  'libs/leaflet-markercluster/leaflet.markercluster.js',
  'libs/leaflet-markercluster/MarkerCluster.css',
  'libs/leaflet-markercluster/MarkerCluster.Default.css',
  'libs/font-awesome/all.min.css',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/Ef.PNG',
  'img/Type2.PNG',
  'img/Combo_CCS.PNG',
  'img/Chademo.PNG',
  'manifest.json',
];

// Installation : pre-cache des assets statiques
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('SW: certains assets n\'ont pas pu etre caches', err);
      });
    })
  );
  self.skipWaiting();
});

// Activation : supprimer les vieux caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

// Fetch : strategie Cache-First pour assets, Network-First pour API et tuiles
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Ne pas intercepter les requetes non-GET
  if (event.request.method !== 'GET') return;

  // Requetes API : network only (donnees temps reel)
  if (url.hostname.indexOf('opendatasoft.com') !== -1 ||
      url.hostname.indexOf('economie.gouv.fr') !== -1 ||
      url.hostname.indexOf('nominatim.openstreetmap.org') !== -1 ||
      url.hostname.indexOf('overpass-api.de') !== -1 ||
      url.hostname.indexOf('router.project-osrm.org') !== -1) {
    return;
  }

  // Tuiles OSM : cache avec fallback reseau (stale-while-revalidate)
  if (url.hostname.indexOf('tile.openstreetmap.org') !== -1) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Assets statiques : cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
