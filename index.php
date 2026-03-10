<?php
function getBrands() {
    $url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/vehicules-commercialises/records?select=marque&group_by=marque&limit=100';

    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'method'  => 'GET',
            'header'  => "User-Agent: Mozilla/5.0\r\n",
        ],
    ]);

    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        return getFallbackBrands();
    }

    $data = json_decode($response, true);

    if (!$data || !isset($data['results'])) {
        return getFallbackBrands();
    }

    $brands = array_map(function ($r) {
        return ['name' => $r['marque']];
    }, $data['results']);

    usort($brands, function ($a, $b) {
        return strcmp($a['name'], $b['name']);
    });

    return $brands;
}

function getFallbackBrands() {
    return [
        ['name' => 'Peugeot'],  ['name' => 'Renault'],
        ['name' => 'Citroën'], ['name' => 'Volkswagen'],
        ['name' => 'Ford'],     ['name' => 'BMW'],
        ['name' => 'Mercedes'], ['name' => 'Audi'],
        ['name' => 'Toyota'],   ['name' => 'Honda'],
    ];
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prix des carburants - Carte interactive</title>
    <link rel="stylesheet" href="libs/leaflet/leaflet.css">
    <link rel="stylesheet" href="libs/leaflet-routing-machine/leaflet-routing-machine.css">
    <link rel="stylesheet" href="libs/leaflet-markercluster/MarkerCluster.css">
    <link rel="stylesheet" href="libs/leaflet-markercluster/MarkerCluster.Default.css">
    <link rel="stylesheet" href="libs/font-awesome/all.min.css">
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>

<div id="loadingOverlay" style="display:none">
    <div id="loadingMessage">Chargement des données en cours…</div>
</div>

<!-- Bouton burger -->
<div class="burger-button">
    <a id="header-menu-trigger" href="#0" class="opaque">
        <span class="header-menu-text">Menu</span>
        <span class="header-menu-icon"></span>
    </a>
</div>

<!-- Menu burger -->
<nav class="burger-menu" aria-label="Menu principal">
    <div class="wrapper">

        <!-- Légende -->
        <div class="legend">
            <h2>Prix les moins chers par carburant</h2>
            <div class="legend-item"><div class="marker-icon marker-icon-gazole"><span>Gazole (B7)</span></div></div>
            <div class="legend-item"><div class="marker-icon marker-icon-e10"><span>E10</span></div></div>
            <div class="legend-item"><div class="marker-icon marker-icon-sp98"><span>SP98 (E5)</span></div></div>
            <div class="legend-item"><div class="marker-icon marker-icon-sp95"><span>SP95 (E5)</span></div></div>
            <div class="legend-item"><div class="marker-icon marker-icon-e85"><span>E85</span></div></div>
            <div class="legend-item"><div class="marker-icon marker-icon-gplc"><span>GPLc (LPG)</span></div></div>
        </div>

        <!-- Sélecteur département -->
        <div class="legend">
            <div class="departement-select">
                <h2>Choisissez le département</h2>
                <select id="departement" aria-label="Département">
                    <option value="">Sélectionnez un département</option>
                </select>
                <button id="update-button" type="button">OK !</button>
            </div>
        </div>

        <!-- Calcul consommation -->
        <div class="legend">
            <h2>Consommation entre votre position et la station</h2>

            <label for="brands">Marque :</label>
            <select id="brands" aria-label="Marque du véhicule">
                <option value="" disabled selected>Sélectionnez une marque</option>
                <?php
                $brands = getBrands();
                foreach ($brands as $brand) {
                    $name = htmlspecialchars($brand['name'], ENT_QUOTES, 'UTF-8');
                    echo "<option value=\"$name\">$name</option>\n";
                }
                ?>
            </select>

            <label for="models">Modèle :</label>
            <select id="models" disabled aria-label="Modèle du véhicule">
                <option value="" disabled selected>Sélectionnez un modèle</option>
            </select>

            <button id="calculateBtnBis" type="button">Calculer la consommation</button>
            <div id="distanceErrorMessage" role="alert"></div>
            <div id="consumptionResult"></div>
        </div>

    </div>
</nav>

<!-- Carte -->
<div class="container">
    <div id="map" role="application" aria-label="Carte interactive des stations"></div>
</div>

<!-- Scripts -->
<script src="libs/leaflet/leaflet.js"></script>
<script src="libs/leaflet-routing-machine/leaflet-routing-machine.js"></script>
<script src="libs/leaflet-markercluster/leaflet.markercluster.js"></script>
<script>
(function() {
  var btn = document.querySelector('.burger-button');
  var menu = document.querySelector('.burger-menu');
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    menu.classList.toggle('active');
    btn.classList.toggle('is-active');
  });
  // Fermer le menu si on clique sur la carte
  document.getElementById('map').addEventListener('click', function() {
    menu.classList.remove('active');
    btn.classList.remove('is-active');
  });
})();
</script>
<script src="js/script.js"></script>
</body>
</html>
