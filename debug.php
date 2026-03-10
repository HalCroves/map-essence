<?php
// Test simple pour vérifier que PHP fonctionne
echo "<!-- PHP fonctionne correctement -->\n";
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="libs/leaflet/leaflet.css"/>
    <link rel="stylesheet" href="libs/leaflet-routing-machine/leaflet-routing-machine.css" />
    <link rel="stylesheet" href="libs/leaflet-markercluster/MarkerCluster.css" />
    <link rel="stylesheet" href="libs/leaflet-markercluster/MarkerCluster.Default.css" />
    <link rel="stylesheet" href="libs/font-awesome/all.min.css">
    <style>
        body { margin: 0; font-family: Arial, sans-serif; background-color: #f7f7f7; }
        .container { display: flex; height: 100vh; position: relative; }
        #map { flex: 1; position: relative; z-index: 0; }
        .test-banner { background: red; color: white; text-align: center; padding: 10px; position: fixed; top: 0; width: 100%; z-index: 1000; }
    </style>
    <title>Test Debug - Interactive Map</title>
</head>
<body>
    <div class="test-banner">TEST MODE - PHP: <?php echo phpversion(); ?> - Si vous voyez ceci, PHP fonctionne</div>
    
    <div class="container">
        <div id="map"></div>
    </div>

    <script src="libs/leaflet/leaflet.js"></script>
    <script src="libs/leaflet-routing-machine/leaflet-routing-machine.js"></script>
    <script src="libs/leaflet-markercluster/leaflet.markercluster.js"></script>
    <script>
        console.log('Page chargée');
        console.log('Leaflet disponible:', typeof L !== 'undefined');
        console.log('Leaflet version:', typeof L !== 'undefined' ? L.version : 'Non disponible');
        
        // Test simple de carte
        try {
            const map = L.map('map').setView([46.603354, 1.888334], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            
            // Ajouter un marqueur de test
            L.marker([46.603354, 1.888334]).addTo(map)
                .bindPopup('Test marker - Si vous voyez ceci, tout fonctionne!')
                .openPopup();
            
            console.log('Carte créée avec succès');
        } catch (error) {
            console.error('Erreur lors de la création de la carte:', error);
            document.body.innerHTML += '<div style="position:fixed; top:50px; left:10px; background:red; color:white; padding:10px; z-index:2000;">ERREUR: ' + error.message + '</div>';
        }
    </script>
</body>
</html>