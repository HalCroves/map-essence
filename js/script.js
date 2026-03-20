/* ==========================================================================
   Carte interactive - Prix des carburants en France
   ========================================================================== */

'use strict';

// ---------------------------------------------------------------------------
//  Constantes & configuration
// ---------------------------------------------------------------------------

const FRANCE_CENTER = [46.603354, 1.888334];
const MIN_ZOOM = 5;
const DEFAULT_ZOOM = 6;
const DEPT_ZOOM = 10;
const RECORDS_PER_PAGE = 100;

const CARBURANT_LABELS = {
  e10: 'E10',
  e85: 'E85',
  sp95: 'E5',
  sp98: 'E5',
  gazole: 'B7',
  gplc: 'LPG',
};

// ---------------------------------------------------------------------------
//  Initialisation carte Leaflet
// ---------------------------------------------------------------------------

L.Icon.Default.imagePath = 'libs/leaflet/';

const map = L.map('map', {
  center: FRANCE_CENTER,
  zoom: DEFAULT_ZOOM,
  minZoom: MIN_ZOOM,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a target="_blank" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ' +
    '<a target="_blank" href="https://public.opendatasoft.com/explore/?sort=modified">OpenDataSoft</a>, ' +
    '&copy; Wilfried PERET',
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);

let markersCluster = L.markerClusterGroup({
  maxClusterRadius: 80,
  iconCreateFunction(cluster) {
    const base = L.MarkerClusterGroup.prototype._defaultIconCreateFunction(cluster);
    return L.divIcon({
      html: '<div><span>' + cluster.getChildCount() + '</span><i class="fas fa-charging-station"></i></div>',
      className: base.options.className,
      iconSize: new L.Point(40, 40),
    });
  },
});

// ---------------------------------------------------------------------------
//  Etat global
// ---------------------------------------------------------------------------

let routeControl = null;
let userMarker = null;
let userLatitude = null;
let userLongitude = null;
let carburantPrices = {};
let routeDistance = 0;
let totalMarkersElec = 0;
let totalMarkersParking = 0;
let allMarkers = [];
let markersByPosition = {};
let currentZoomHandler = null;

const brandsSelect = document.getElementById('brands');
const modelsSelect = document.getElementById('models');
const calculateBtnBis = document.getElementById('calculateBtnBis');
const consumptionResultDiv = document.getElementById('consumptionResult');
const updateButton = document.getElementById('update-button');
const departementSelect = document.getElementById('departement');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingDetail = document.getElementById('loadingDetail');
const loadingProgressFill = document.getElementById('loadingProgressFill');

// ---------------------------------------------------------------------------
//  Utilitaire : echapper le HTML pour eviter les XSS
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (str == null) return '';
  var s = String(str);
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(s));
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
//  Utilitaire : afficher/masquer le chargement
// ---------------------------------------------------------------------------

function showLoading() {
  loadingOverlay.style.display = 'flex';
  updateLoadingProgress(0, 'Initialisation…');
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
  updateLoadingProgress(0, '');
}

function updateLoadingProgress(percent, detail) {
  if (loadingProgressFill) loadingProgressFill.style.width = percent + '%';
  if (loadingDetail) loadingDetail.textContent = detail || '';
}

// ---------------------------------------------------------------------------
//  Icones personnalisees (creees une seule fois)
// ---------------------------------------------------------------------------

const fuelIcon = L.divIcon({
  html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-gas-pump"></i></div></div></div>',
  iconAnchor: [0, 0],
  popupAnchor: [0, 0],
  shadowSize: [0, 0],
  shadowAnchor: [0, 0],
  iconSize: L.point(23, 23),
});

const electricIcon = L.divIcon({
  html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-charging-station"></i></div></div></div>',
  iconAnchor: [0, 0],
  popupAnchor: [0, 0],
  shadowSize: [0, 0],
  shadowAnchor: [0, 0],
});

const parkingIcon = L.divIcon({
  html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-parking"></i></div></div></div>',
  iconAnchor: [0, 0],
  popupAnchor: [0, 0],
  shadowSize: [0, 0],
  shadowAnchor: [0, 0],
});

// ---------------------------------------------------------------------------
//  Nettoyage des couches precedentes
// ---------------------------------------------------------------------------

function clearPreviousData() {
  markersLayer.clearLayers();
  map.removeLayer(markersLayer);
  markersCluster.clearLayers();
  map.removeLayer(markersCluster);
  markersByPosition = {};
  totalMarkersElec = 0;
  totalMarkersParking = 0;
  allMarkers = [];
  carburantPrices = {};

  if (currentZoomHandler) {
    map.off('zoomend', currentZoomHandler);
    currentZoomHandler = null;
  }
}

// ---------------------------------------------------------------------------
//  Suppression / ajout de route
// ---------------------------------------------------------------------------

// Patch global : proteger _clearLines contre _map === null
(function() {
  var proto = L.Routing.Control.prototype;
  var orig = proto._clearLines;
  if (orig) {
    proto._clearLines = function() {
      if (this._map) orig.apply(this, arguments);
    };
  }
})();

function removeExistingRoute() {
  if (routeControl) {
    try { map.removeControl(routeControl); } catch(e) { /* ignore */ }
    routeControl = null;
  }
}

function createRoute(fromLat, fromLng, toLat, toLng, color) {
  removeExistingRoute();
  routeControl = L.Routing.control({
    waypoints: [L.latLng(fromLat, fromLng), L.latLng(toLat, toLng)],
    draggableWaypoints: false,
    routeWhileDragging: false,
    show: false,
    addWaypoints: false,
    fitSelectedRoutes: false,
    createMarker: function() { return null; },
    lineOptions: {
      addWaypoints: false,
      styles: [{ weight: 2, className: 'abricot', color: color || '#3388ff' }],
    },
  }).addTo(map);
  // Masquer le conteneur de directions s'il existe
  var container = routeControl.getContainer();
  if (container) container.style.display = 'none';
  return routeControl;
}

// ---------------------------------------------------------------------------
//  Formatage des prix dans les popups carburant
// ---------------------------------------------------------------------------

function formatPrix(prix) {
  if (!prix) return 'Non disponible';
  var prixArray;
  try {
    prixArray = typeof prix === 'string' ? JSON.parse(prix) : prix;
  } catch(e) {
    return 'Non disponible';
  }

  if (!Array.isArray(prixArray)) return 'Non disponible';

  return prixArray
    .map(function(item) {
      var name = escapeHtml(item['@nom']);
      var price = parseFloat(item['@valeur']);
      var date = new Date(item['@maj']);
      var days = Math.floor((Date.now() - date) / 86400000);

      var colorClass = 'green';
      if (days > 15) colorClass = 'red';
      else if (days > 7) colorClass = 'orange';
      else if (days > 3) colorClass = 'yellow';

      var time = date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      carburantPrices[item['@nom']] = price;

      return '<span class="marker-icon-' + name.toLowerCase() + ' etiquette-essence">' + name + ': ' + price.toFixed(3) + ' \u20AC</span>' +
        '<span class="move-info-right">MAJ: <span class="' + colorClass + ' etiquette-essence">+' + days + 'J \u00E0 ' + time + '</span></span>';
    })
    .join('<br>');
}

// ---------------------------------------------------------------------------
//  Popup carburant (station essence)
// ---------------------------------------------------------------------------

function buildFuelPopup(record, parsedPrix, distanceKm) {
  var enseigne = escapeHtml(record._enseigne) || '';
  var adresse = escapeHtml(record.adresse) || 'Adresse inconnue';
  var cp = escapeHtml(record.cp) || '';
  var ville = escapeHtml(record.ville) || '';
  var services = record.services_service
    ? (Array.isArray(record.services_service)
      ? record.services_service.map(escapeHtml).join(', ')
      : escapeHtml(record.services_service))
    : 'Aucun';
  var carburants = record.carburants_disponibles
    ? (Array.isArray(record.carburants_disponibles)
      ? record.carburants_disponibles.map(escapeHtml).join(', ')
      : escapeHtml(record.carburants_disponibles))
    : 'Aucun';
  var automate = escapeHtml(record.horaires_automate_24_24) || 'Non renseign\u00E9';
  var prixHtml = formatPrix(parsedPrix);
  var dist = distanceKm != null ? distanceKm + ' km' : 'Calcul en attente';

  var enseigneHtml = enseigne
    ? '<h3 class="station-enseigne">' + enseigne + '</h3>'
    : '';

  return enseigneHtml +
    '<p><b>Adresse :</b> ' + adresse + ', ' + cp + ' ' + ville + '</p>' +
    '<p><b>Services :</b> ' + services + '</p>' +
    '<p><b>Automate 24/24 :</b> ' + automate + '</p>' +
    '<p><b>Carburants disponibles :</b> ' + carburants + '</p>' +
    '<p><b>Prix :</b><br>' + prixHtml + '</p>' +
    '<div id="route-info">Distance : ' + dist + '</div>';
}

// ---------------------------------------------------------------------------
//  Popup electrique
// ---------------------------------------------------------------------------

function buildElectricPopup(record, distanceKm) {
  var dist = distanceKm != null ? distanceKm + ' km' : 'Calcul en attente';

  return '<h3>' + escapeHtml(record.nom_epci || record.nom_station) + '</h3>' +
    '<p><b>Adresse :</b> ' + (escapeHtml(record.adresse_station) || 'Inconnue') + '</p>' +
    '<p><b>Type d\'acc\u00E8s :</b> ' + escapeHtml(record.implantation_station) + ' - ' + (escapeHtml(record.condition_acces) || 'Inconnu') + '</p>' +
    '<p><b>Horaires :</b> ' + (escapeHtml(record.horaires) || 'Inconnus') + '</p>' +
    '<p><b>Nombre de PDC :</b> ' + (escapeHtml(record.nbre_pdc) || 'Inconnu') + '</p>' +
    '<p><b>Prises disponibles :</b></p>' +
    '<table>' +
    '<tr><td><img src="./img/Ef.PNG" alt="Ef" class="img_elec"></td><td><img src="./img/Type2.PNG" alt="Type 2" class="img_elec"></td><td><img src="./img/Combo_CCS.PNG" alt="Combo CCS" class="img_elec"></td><td><img src="./img/Chademo.PNG" alt="CHAdeMO" class="img_elec"></td><td></td></tr>' +
    '<tr><td class="text-elec">Ef</td><td class="text-elec">Type2</td><td class="text-elec">Combo CCS</td><td class="text-elec">CHAdeMO</td><td class="text-elec">Autres</td></tr>' +
    '<tr><td class="text-elec">' + escapeHtml(record.prise_type_ef) + '</td><td class="text-elec">' + escapeHtml(record.prise_type_2) + '</td><td class="text-elec">' + escapeHtml(record.prise_type_combo_ccs) + '</td><td class="text-elec">' + escapeHtml(record.prise_type_chademo) + '</td><td class="text-elec">' + escapeHtml(record.prise_type_autre) + '</td></tr>' +
    '</table>' +
    '<p><b>Puissance nominale :</b> ' + (escapeHtml(record.puissance_nominale) || 'Inconnue') + ' kW</p>' +
    '<p><b>Tarifications :</b> ' + (escapeHtml(record.tarification) || 'Inconnues') + '</p>' +
    '<p><b>Paiement :</b> Acte ' + escapeHtml(record.paiement_acte) + ' - CB ' + escapeHtml(record.paiement_cb) + ' - Autres ' + escapeHtml(record.paiement_autre) + '</p>' +
    '<p><b>Infos :</b> ' + (escapeHtml(record.observations) || 'Aucune') + '</p>' +
    '<div id="route-info">Distance : ' + dist + '</div>';
}

// ---------------------------------------------------------------------------
//  Popup parking
// ---------------------------------------------------------------------------

function buildParkingPopup(record, distanceKm) {
  var dist = distanceKm != null ? distanceKm + ' km' : 'Calcul en attente';
  var urlHtml = record.url
    ? '<a href="' + escapeHtml(record.url) + '" target="_blank" rel="noopener noreferrer">Lien</a>'
    : 'Non disponible';

  return '<h3>' + escapeHtml(record.name) + '</h3>' +
    '<p><b>Adresse :</b> ' + (escapeHtml(record.address) || 'Inconnue') + '</p>' +
    '<p><b>URL :</b> ' + urlHtml + '</p>' +
    '<p><b>Places :</b> ' + (escapeHtml(record.space_count) || 'Inconnu') + '</p>' +
    '<p><b>Places PMR :</b> ' + (escapeHtml(record.disable_count) || 'Inconnu') + '</p>' +
    '<table>' +
    '<tr><td>1h</td><td>2h</td><td>3h</td><td>4h</td><td>24h</td></tr>' +
    '<tr><td class="text-elec">' + (escapeHtml(record.cost_1h) || '?') + ' \u20AC</td>' +
    '<td class="text-elec">' + (escapeHtml(record.cost_2h) || '?') + ' \u20AC</td>' +
    '<td class="text-elec">' + (escapeHtml(record.cost_3h) || '?') + ' \u20AC</td>' +
    '<td class="text-elec">' + (escapeHtml(record.cost_4h) || '?') + ' \u20AC</td>' +
    '<td class="text-elec">' + (escapeHtml(record.cost_24h) || '?') + ' \u20AC</td></tr>' +
    '</table>' +
    '<p><b>Informations :</b> ' + (escapeHtml(record.info) || 'Aucune') + '</p>' +
    '<div id="route-info">Distance : ' + dist + '</div>';
}

// ---------------------------------------------------------------------------
//  Handler de clic geolocalise (commun aux 3 types de markers)
// ---------------------------------------------------------------------------

function handleGeolocatedClick(marker, lat, lng, buildPopupFn, routeColor) {
  if (!('geolocation' in navigator)) return;
  removeExistingRoute();

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var uLat = pos.coords.latitude;
      var uLng = pos.coords.longitude;
      var ctrl = createRoute(uLat, uLng, lat, lng, routeColor);

      ctrl.on('routesfound', function(e) {
        var km = (e.routes[0].summary.totalDistance / 1000).toFixed(2);
        routeDistance = km;
        marker.getPopup().setContent(buildPopupFn(km));
      });
    },
    function(err) { console.error('G\u00E9olocalisation impossible.', err); }
  );
}

// ---------------------------------------------------------------------------
//  API URL helpers
// ---------------------------------------------------------------------------

function getFuelApiUrl(page, departement) {
  var offset = (page - 1) * RECORDS_PER_PAGE;
  return 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
    'prix-des-carburants-en-france-flux-instantane-v2/records' +
    '?limit=' + RECORDS_PER_PAGE + '&offset=' + offset +
    '&refine=departement:' + encodeURIComponent(departement);
}

// ---------------------------------------------------------------------------
//  Enrichissement enseigne via Overpass API (batch par bbox du departement)
// ---------------------------------------------------------------------------

async function fetchEnseignesBatch(records) {
  if (!records.length) return;

  var lats = [], lngs = [];
  for (var i = 0; i < records.length; i++) {
    var g = records[i].geom;
    if (g && g.lat && g.lon) {
      lats.push(g.lat);
      lngs.push(g.lon);
    }
  }
  if (!lats.length) return;

  var minLat = Math.min.apply(null, lats) - 0.01;
  var maxLat = Math.max.apply(null, lats) + 0.01;
  var minLng = Math.min.apply(null, lngs) - 0.01;
  var maxLng = Math.max.apply(null, lngs) + 0.01;

  var bbox = minLat + ',' + minLng + ',' + maxLat + ',' + maxLng;
  var query = '[out:json][timeout:25];(' +
    'node["amenity"="fuel"](' + bbox + ');' +
    'way["amenity"="fuel"](' + bbox + ');' +
    ');out center tags;';

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 20000);

  try {
    var resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.warn('Overpass HTTP ' + resp.status + ' — enrichissement ignor\u00E9');
      return;
    }

    var data = await resp.json();
    var osmStations = (data.elements || []).map(function(el) {
      var lat = el.lat || (el.center && el.center.lat);
      var lon = el.lon || (el.center && el.center.lon);
      var name = (el.tags && (el.tags.brand || el.tags.name || el.tags.operator)) || '';
      return { lat: lat, lon: lon, name: name };
    }).filter(function(s) { return s.lat && s.lon && s.name; });

    if (!osmStations.length) return;

    // Associer chaque record a la station OSM la plus proche (< 150m)
    for (var r = 0; r < records.length; r++) {
      var rec = records[r];
      var geom = rec.geom;
      if (!geom || !geom.lat || !geom.lon) continue;

      var bestDist = 0.0015; // ~150m en degres
      var bestName = '';
      for (var s = 0; s < osmStations.length; s++) {
        var dLat = geom.lat - osmStations[s].lat;
        var dLon = geom.lon - osmStations[s].lon;
        var dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist < bestDist) {
          bestDist = dist;
          bestName = osmStations[s].name;
        }
      }
      if (bestName) rec._enseigne = bestName;
    }
  } catch(err) {
    console.warn('Enrichissement enseignes indisponible :', err);
  }
}

// ---------------------------------------------------------------------------
//  Recuperation paginee de toutes les stations essence
// ---------------------------------------------------------------------------

async function fetchAllFuelRecords(selectedDepartement) {
  var allRecords = [];
  var page = 1;
  var totalCount = null;

  while (true) {
    updateLoadingProgress(10, 'Stations essence : page ' + page + '…');
    var resp = await fetch(getFuelApiUrl(page, selectedDepartement));
    var data = await resp.json();
    var records = data.results || [];
    if (totalCount === null) totalCount = data.total_count || 0;

    allRecords = allRecords.concat(records);
    console.log('Carburants page ' + page + ' : ' + records.length + ' enregistrements (total : ' + allRecords.length + '/' + totalCount + ')');

    if (allRecords.length >= totalCount || records.length < RECORDS_PER_PAGE) break;
    page++;
  }

  return allRecords;
}

// ---------------------------------------------------------------------------
//  Recuperation des stations essence (avec enrichissement + parallele)
// ---------------------------------------------------------------------------

async function fetchRecords(page, selectedDepartement) {
  clearPreviousData();
  showLoading();

  try {
    // 1) Charger toutes les stations carburant (pagine)
    var fuelRecords = await fetchAllFuelRecords(selectedDepartement);
    console.log('Carburants total : ' + fuelRecords.length + ' enregistrements');

    // 2) Enrichir les enseignes via Overpass (en parallele avec bornes+parkings)
    updateLoadingProgress(30, 'Enrichissement des enseignes…');
    var parkingDept = selectedDepartement === 'Paris' ? '\u00CEle-de-France' : selectedDepartement;

    var enrichPromise = fetchEnseignesBatch(fuelRecords).catch(function(e) {
      console.warn('Enrichissement enseignes en erreur :', e);
    });
    var elecPromise = fetchElectricRecords(1, selectedDepartement).catch(function(e) {
      console.error('Erreur bornes \u00E9lectriques :', e);
    });
    var parkPromise = fetchParkingRecords(1, parkingDept).catch(function(e) {
      console.error('Erreur parkings :', e);
    });

    // Attendre l'enrichissement avant d'afficher les marqueurs carburant
    await enrichPromise;
    updateLoadingProgress(60, 'Affichage des stations…');

    // 3) Placer les marqueurs carburant
    var pricesByCarburant = {
      Gazole: [], E10: [], SP98: [], SP95: [], E85: [], GPLc: [],
    };

    for (var i = 0; i < fuelRecords.length; i++) {
      var record = fuelRecords[i];
      var geom = record.geom;
      var prix = record.prix;
      if (!geom || !geom.lat || !geom.lon) continue;

      var lat = geom.lat;
      var lng = geom.lon;
      var parsedPrix;
      try {
        parsedPrix = typeof prix === 'string' ? JSON.parse(prix) : prix;
      } catch(e) {
        continue;
      }

      var marker = L.marker([lat, lng], { icon: fuelIcon }).addTo(markersLayer);
      marker.bindPopup(buildFuelPopup(record, parsedPrix));

      (function(m, r, pp, la, ln) {
        m.on('click', function() {
          handleGeolocatedClick(m, la, ln, function(km) {
            return buildFuelPopup(r, pp, km);
          });
        });
      })(marker, record, parsedPrix, lat, lng);

      collectPrices(record, pricesByCarburant, [lng, lat]);
    }

    highlightTop3(pricesByCarburant);

    // 4) Attendre la fin des bornes et parkings
    updateLoadingProgress(80, 'Chargement bornes & parkings…');
    await Promise.all([elecPromise, parkPromise]);

  } catch(err) {
    console.error('Erreur r\u00E9cup\u00E9ration donn\u00E9es carburant :', err);
  } finally {
    markersLayer.addTo(map);
    updateLoadingProgress(100, 'Termin\u00E9 !');
    setTimeout(hideLoading, 300);
  }
}

// ---------------------------------------------------------------------------
//  Collecte des prix pour le top 3
// ---------------------------------------------------------------------------

function collectPrices(record, pricesByCarburant, coords) {
  for (var key in record) {
    if (!key.endsWith('_prix')) continue;
    var type = key.slice(0, -5);
    var price = parseFloat(record[key]);
    if (isNaN(price)) continue;
    if (!pricesByCarburant[type]) pricesByCarburant[type] = [];
    pricesByCarburant[type].push({ prix: price, coordinates: coords });
  }
}

// ---------------------------------------------------------------------------
//  Mise en valeur du top 3 par carburant
// ---------------------------------------------------------------------------

function highlightTop3(pricesByCarburant) {
  var localMarkersByPos = {};

  for (var carburant in pricesByCarburant) {
    var sorted = pricesByCarburant[carburant]
      .filter(function(r) { return r.prix !== undefined; })
      .sort(function(a, b) { return a.prix - b.prix; })
      .slice(0, 3);

    var label = CARBURANT_LABELS[carburant.toLowerCase()] || carburant;

    var icon = L.divIcon({
      className: 'marker-icon-custom marker-icon-' + carburant.toLowerCase(),
      html: '<div class="leaflet-pulsing-icon"><div class="pulsating-content">' + escapeHtml(label) + '</div></div>',
      iconSize: [22, 22],
      iconAnchor: [0, 0],
      popupAnchor: [0, 0],
      shadowSize: [0, 0],
      shadowAnchor: [0, 0],
    });

    for (var j = 0; j < sorted.length; j++) {
      var rec = sorted[j];
      var coords = rec.coordinates;
      if (!coords) continue;
      var lng = coords[0], lat = coords[1];
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

      var key = lat + ',' + lng;
      var m = L.marker([lat, lng], { icon: icon });

      if (!localMarkersByPos[key]) localMarkersByPos[key] = [];
      localMarkersByPos[key].push(m);
      markersLayer.addLayer(m);
    }
  }

  markersByPosition = localMarkersByPos;

  var ZOOM_FACTOR = 0.0000067;

  function adjustedRadius(zoom) {
    var base = 0.015;
    if (zoom < 10) return base;
    for (var i = 10; i < zoom; i++) base /= 2;
    return base + zoom * ZOOM_FACTOR;
  }

  function repositionMarkers() {
    var radius = adjustedRadius(map.getZoom());
    for (var posKey in markersByPosition) {
      var parts = posKey.split(',').map(Number);
      var la = parts[0], ln = parts[1];
      var markers = markersByPosition[posKey];
      for (var idx = 0; idx < markers.length; idx++) {
        var angle = (idx / markers.length) * 360;
        var rad = (angle * Math.PI) / 180;
        markers[idx].setLatLng([la + radius * Math.cos(rad), ln + radius * Math.sin(rad)]);
      }
    }
  }

  if (currentZoomHandler) map.off('zoomend', currentZoomHandler);
  currentZoomHandler = repositionMarkers;
  map.on('zoomend', currentZoomHandler);
  repositionMarkers();
}

// ---------------------------------------------------------------------------
//  Stations electriques (v2.1 - pagination recursive)
// ---------------------------------------------------------------------------

async function fetchElectricRecords(page, selectedDepartement) {
  var offset = (page - 1) * RECORDS_PER_PAGE;
  var url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/' +
    'mobilityref-france-irve-220/records' +
    '?limit=' + RECORDS_PER_PAGE + '&offset=' + offset +
    '&where=dep_name%20like%20%22' + encodeURIComponent(selectedDepartement) + '%22';

  try {
    var resp = await fetch(url);
    var data = await resp.json();
    var records = data.results || [];

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var lat, lng;

      if (record.coordonneesxy) {
        if (typeof record.coordonneesxy === 'string') {
          try {
            var parsed = JSON.parse(record.coordonneesxy);
            lng = parsed[0]; lat = parsed[1];
          } catch(e) { continue; }
        } else if (record.coordonneesxy.lat != null) {
          lat = record.coordonneesxy.lat;
          lng = record.coordonneesxy.lon;
        } else if (Array.isArray(record.coordonneesxy)) {
          lng = record.coordonneesxy[0]; lat = record.coordonneesxy[1];
        } else {
          continue;
        }
      } else {
        continue;
      }

      var marker = L.marker([lat, lng], { icon: electricIcon });
      marker.bindPopup(buildElectricPopup(record));

      (function(m, r, la, ln) {
        m.on('click', function() {
          handleGeolocatedClick(m, la, ln, function(km) {
            return buildElectricPopup(r, km);
          }, '#228509');
        });
      })(marker, record, lat, lng);

      allMarkers.push(marker);
    }

    totalMarkersElec += records.length;

    if (totalMarkersElec < (data.total_count || 0) && records.length === RECORDS_PER_PAGE) {
      await fetchElectricRecords(page + 1, selectedDepartement);
    } else {
      for (var k = 0; k < allMarkers.length; k++) {
        markersCluster.addLayer(allMarkers[k]);
      }
      map.addLayer(markersCluster);
    }
  } catch(err) {
    console.error('Erreur donn\u00E9es bornes \u00E9lectriques :', err);
  }
}

// ---------------------------------------------------------------------------
//  Parkings
// ---------------------------------------------------------------------------

async function fetchParkingRecords(page, selectedDepartement) {
  var offset = (page - 1) * RECORDS_PER_PAGE;
  var whereClause;

  // Sanitize: n'autoriser que les caracteres alphanumeriques, espaces, tirets et apostrophes
  var safeDept = selectedDepartement.replace(/[^a-zA-ZÀ-ÿ0-9\s\-']/g, '');
  if (safeDept === 'Île-de-France' || selectedDepartement === '\u00CEle-de-France') {
    whereClause = "(insee_code like '75*') OR reg_name = 'Île-de-France'";
  } else {
    whereClause = 'dep_name like "' + safeDept + '"';
  }

  var url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/' +
    'mobilityref-france-base-nationale-des-lieux-de-stationnement/records' +
    '?limit=' + RECORDS_PER_PAGE + '&offset=' + offset +
    '&where=' + encodeURIComponent(whereClause);

  try {
    var resp = await fetch(url);
    var data = await resp.json();
    var records = data.results || [];

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var lat = record.ylat;
      var lng = record.xlong;
      if (!lat || !lng) continue;

      var marker = L.marker([lat, lng], { icon: parkingIcon }).addTo(markersLayer);
      marker.bindPopup(buildParkingPopup(record));

      (function(m, r, la, ln) {
        m.on('click', function() {
          handleGeolocatedClick(m, la, ln, function(km) {
            return buildParkingPopup(r, km);
          }, '#000');
        });
      })(marker, record, lat, lng);
    }

    markersLayer.addTo(map);
    totalMarkersParking += records.length;

    if (totalMarkersParking < (data.total_count || 0) && records.length === RECORDS_PER_PAGE) {
      await fetchParkingRecords(page + 1, selectedDepartement);
    }
  } catch(err) {
    console.error('Erreur donn\u00E9es parking :', err);
  }
}

// ---------------------------------------------------------------------------
//  Recuperation des departements (via group_by - 1 seule requete)
// ---------------------------------------------------------------------------

async function fetchDepartments() {
  var url = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
    'prix-des-carburants-en-france-flux-instantane-v2/records' +
    '?select=departement&group_by=departement&limit=100';

  try {
    var resp = await fetch(url);
    var data = await resp.json();

    if (!data.results || data.results.length === 0) {
      console.error('Aucun d\u00E9partement trouv\u00E9.');
      return;
    }

    var depts = data.results
      .map(function(r) { return r.departement; })
      .filter(Boolean)
      .sort(function(a, b) { return a.localeCompare(b); });

    var select = document.getElementById('departement');
    select.innerHTML = '<option value="">S\u00E9lectionnez un d\u00E9partement</option>';

    for (var i = 0; i < depts.length; i++) {
      var opt = document.createElement('option');
      opt.value = depts[i];
      opt.textContent = depts[i];
      select.appendChild(opt);
    }

    select.disabled = false;
  } catch(err) {
    console.error('Erreur r\u00E9cup\u00E9ration d\u00E9partements :', err);
  }
}

// ---------------------------------------------------------------------------
//  Selecteur de departement - changement
// ---------------------------------------------------------------------------

updateButton.addEventListener('click', async function() {
  var selected = departementSelect.value;
  if (!selected) return;

  // Sauvegarder le choix dans localStorage
  try { localStorage.setItem('lastDepartement', selected); } catch(e) { /* quota */ }

  clearPreviousData();
  await fetchRecords(1, selected);

  try {
    var resp = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(selected + ', France') + '&format=json&limit=1'
    );
    var data = await resp.json();
    if (data.length > 0) {
      map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], DEPT_ZOOM);
    }
  } catch(err) {
    console.error('Erreur g\u00E9ocodage d\u00E9partement :', err);
  }

  placeUserMarker();
});

// ---------------------------------------------------------------------------
//  Placement du marqueur utilisateur
// ---------------------------------------------------------------------------

function placeUserMarker() {
  if (userLatitude && userLongitude) {
    addUserMarker(userLatitude, userLongitude);
    return;
  }
  if (!('geolocation' in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      userLatitude = pos.coords.latitude;
      userLongitude = pos.coords.longitude;
      addUserMarker(userLatitude, userLongitude);
    },
    function(err) { console.error('G\u00E9olocalisation impossible.', err); }
  );
}

function addUserMarker(lat, lng) {
  if (userMarker) markersLayer.removeLayer(userMarker);
  userMarker = L.marker([lat, lng]).addTo(markersLayer);

  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      userMarker.bindPopup('Votre position actuelle :<br>' + escapeHtml(data.display_name));
    })
    .catch(function() {
      userMarker.bindPopup('Position : ' + lat.toFixed(5) + ', ' + lng.toFixed(5));
    });
}

// ---------------------------------------------------------------------------
//  Vehicules - marques et modeles (API v2.1)
// ---------------------------------------------------------------------------

brandsSelect.addEventListener('change', function() {
  var brand = brandsSelect.value;
  if (!brand) return;

  var url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/' +
    'vehicules-commercialises/records' +
    '?where=marque%3D%22' + encodeURIComponent(brand) + '%22&limit=100';

  modelsSelect.innerHTML = '<option value="" disabled selected>Chargement\u2026</option>';
  modelsSelect.disabled = true;

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var records = data.results || [];
      modelsSelect.innerHTML = '<option value="" disabled selected>S\u00E9lectionnez un mod\u00E8le</option>';

      records
        .sort(function(a, b) {
          return (a.designation_commerciale || '').localeCompare(b.designation_commerciale || '');
        })
        .forEach(function(rec) {
          var opt = document.createElement('option');
          opt.value = rec.designation_commerciale || '';
          opt.textContent = '[' + (rec.marque || '?') + '] ' + (rec.designation_commerciale || '?') +
            ' (' + (rec.annee || '?') + ') (' + (rec.boite_de_vitesse || '?') + ') (' +
            (rec.puissance_administrative || '?') + ' CV) (' + (rec.puissance_maximale || '?') +
            ' kW) (' + (rec.carburant || '?') + ')';
          modelsSelect.appendChild(opt);
        });

      modelsSelect.disabled = false;
    })
    .catch(function(err) {
      console.error('Erreur chargement mod\u00E8les :', err);
      modelsSelect.innerHTML = '<option value="" disabled selected>Erreur de chargement</option>';
    });
});

// ---------------------------------------------------------------------------
//  Donnees de consommation du vehicule selectionne
// ---------------------------------------------------------------------------

modelsSelect.addEventListener('change', function() {
  var model = modelsSelect.value;
  if (!model) return;

  var url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/' +
    'vehicules-commercialises/records' +
    '?where=designation_commerciale%3D%22' + encodeURIComponent(model) + '%22&limit=1';

  consumptionResultDiv.innerHTML = '';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rec = (data.results || [])[0];
      if (!rec) {
        consumptionResultDiv.textContent = 'Donn\u00E9es non disponibles pour ce mod\u00E8le.';
        return;
      }

      consumptionResultDiv.innerHTML =
        '<p class="mdl">Mod\u00E8le : ' + escapeHtml(rec.designation_commerciale) + '</p>' +
        '<p class="conso">Conso. urbaine : <span class="conso-details">' + escapeHtml(rec.consommation_urbaine_l_100km) + ' L/100km</span></p>' +
        '<p class="conso">Conso. extra-urbaine : <span class="conso-details">' + escapeHtml(rec.consommation_extra_urbaine_l_100km) + ' L/100km</span></p>' +
        '<p class="conso">Conso. mixte : <span class="conso-details">' + escapeHtml(rec.consommation_mixte_l_100km) + ' L/100km</span></p>';
    })
    .catch(function(err) { console.error('Erreur donn\u00E9es consommation :', err); });
});

// ---------------------------------------------------------------------------
//  Calcul cout carburant = consommation x distance x prix
// ---------------------------------------------------------------------------

calculateBtnBis.addEventListener('click', function() {
  var model = modelsSelect.value;
  var errorDiv = document.getElementById('distanceErrorMessage');
  errorDiv.textContent = '';

  var routeInfo = document.querySelector('#route-info');
  if (!routeInfo) {
    errorDiv.textContent = 'Cliquez d\'abord sur une station pour tracer un itin\u00E9raire.';
    return;
  }

  var distText = routeInfo.textContent.split(':')[1];
  var distance = parseFloat(distText);
  if (isNaN(distance)) {
    errorDiv.textContent = 'Distance non encore calcul\u00E9e.';
    return;
  }

  if (!model) {
    errorDiv.textContent = 'S\u00E9lectionnez un mod\u00E8le de v\u00E9hicule.';
    return;
  }

  var url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/' +
    'vehicules-commercialises/records' +
    '?where=designation_commerciale%3D%22' + encodeURIComponent(model) + '%22&limit=1';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rec = (data.results || [])[0];
      if (!rec) {
        consumptionResultDiv.textContent = 'Donn\u00E9es de consommation indisponibles.';
        return;
      }

      var urban = parseFloat(rec.consommation_urbaine_l_100km);
      var extra = parseFloat(rec.consommation_extra_urbaine_l_100km);
      var mixed = parseFloat(rec.consommation_mixte_l_100km);

      var litersUrban = (urban / 100) * distance;
      var litersExtra = (extra / 100) * distance;
      var litersMixed = (mixed / 100) * distance;
      var avgLiters = (litersUrban + litersExtra + litersMixed) / 3;

      var validFuels = { Gazole: 1, E10: 1, SP98: 1, SP95: 1, E85: 1, GPLc: 1 };
      var costHtml = '';
      for (var fuel in carburantPrices) {
        if (!validFuels[fuel]) continue;
        var cost = avgLiters * carburantPrices[fuel];
        costHtml += '<p class="price-euros">' + escapeHtml(fuel) + '<span class="conso-details">' + cost.toFixed(2) + ' \u20AC</span></p>';
      }

      consumptionResultDiv.innerHTML =
        '<p class="mdl">Mod\u00E8le : ' + escapeHtml(rec.designation_commerciale) + '</p>' +
        '<p class="conso">Conso. urbaine : <span class="conso-details">' + litersUrban.toFixed(2) + ' L</span></p>' +
        '<p class="conso">Conso. extra-urbaine : <span class="conso-details">' + litersExtra.toFixed(2) + ' L</span></p>' +
        '<p class="conso">Conso. mixte : <span class="conso-details">' + litersMixed.toFixed(2) + ' L</span></p>' +
        costHtml;
    })
    .catch(function(err) { console.error('Erreur calcul consommation :', err); });
});

// ---------------------------------------------------------------------------
//  Initialisation au chargement
// ---------------------------------------------------------------------------

window.addEventListener('load', function() {
  showLoading();

  // Charger les departements d'abord
  fetchDepartments().then(function() {
    var saved = null;
    try { saved = localStorage.getItem('lastDepartement'); } catch(e) { /* ignore */ }
    if (saved) {
      departementSelect.value = saved;
    }

    // Si on a un departement sauvegarde, charger directement sans attendre la geoloc
    if (saved) {
      fetchRecords(1, saved);
      // Puis tenter la geoloc en arriere-plan pour mettre a jour le marqueur
      requestGeolocationQuietly();
    } else {
      // Pas de departement sauvegarde : on doit attendre la geoloc
      requestGeolocationForDept();
    }
  });
});

// Geolocation pour trouver le departement (premiere visite)
function requestGeolocationForDept() {
  if (!('geolocation' in navigator)) { hideLoading(); return; }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      userLatitude = pos.coords.latitude;
      userLongitude = pos.coords.longitude;

      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + userLatitude + '&lon=' + userLongitude)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var dept = data.address && data.address.county;
          if (dept) {
            departementSelect.value = dept;
            try { localStorage.setItem('lastDepartement', dept); } catch(e) { /* ignore */ }
            fetchRecords(1, dept);
            addUserMarker(userLatitude, userLongitude);
          } else {
            hideLoading();
          }
        })
        .catch(function() { hideLoading(); });
    },
    function() { hideLoading(); }
  );
}

// Geolocation silencieuse (juste pour le marqueur, pas pour les donnees)
function requestGeolocationQuietly() {
  if (!('geolocation' in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      userLatitude = pos.coords.latitude;
      userLongitude = pos.coords.longitude;
      addUserMarker(userLatitude, userLongitude);
    },
    function() { /* silencieux */ }
  );
}
