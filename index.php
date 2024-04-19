<?php
   function getBrands() {
       $brands = array();
       $url = "https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=&sort=puissance_maximale&facet=marque";
       $response = file_get_contents($url);
       $data = json_decode($response, true);
   
       $brands = $data["facet_groups"][0]["facets"];
       
       usort($brands, function ($a, $b) {
           return strcmp($a["name"], $b["name"]);
       });
   
       return $brands;
   }
   
   function getModelsByBrand($brand) {
       $url = "https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=marque:${brand}&rows=1000";
       $response = file_get_contents($url);
       $data = json_decode($response, true);
   
       $models = array_map(function ($record) {
           return $record["fields"]["designation_commerciale"];
       }, $data["records"]);
   
       return $models;
   }
   
   function getConsumptionData($model) {
       $url = "https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=designation_commerciale:${model}";
       $response = file_get_contents($url);
       $data = json_decode($response, true);
   
       return $data["records"][0]["fields"];
   }
   ?>
<!DOCTYPE html>
<html lang="fr">
   <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@latest/dist/leaflet.css"/>
      <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@latest/dist/MarkerCluster.css" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@latest/dist/MarkerCluster.Default.css" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.css">
      <link rel="stylesheet" href="css/styles.css">
      <title>Interactive Map</title>
   </head>
   <body>
      <div id="loadingOverlay" style="display: none;">
         <div id="loadingMessage">Chargement des données en cours...</div>
      </div>

      <!-- Bouton de menu burger -->
      <div class="burger-button">
         <a id="header-menu-trigger" href="#0" class="opaque"> <span class="header-menu-text">Menu</span> <span class="header-menu-icon"></span> </a>
      </div>
      <!-- Menu burger -->
      <div class="burger-menu">
         <!-- Insérez ici le contenu de votre menu "legend" -->
         <div class="wrapper">
            <div class="legend">
               <h2>Prix les moins chers en fonction du carburant</h2>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-gazole"><span>Gazole (B7)</span></div>
               </div>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-e10"><span>E10</span></div>
               </div>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-sp98"><span>SP98 (E5)</span></div>
               </div>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-sp95"><span>SP95 (E5)</span></div>
               </div>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-e85"><span>E85</span></div>
               </div>
               <div class="legend-item">
                  <div class="marker-icon marker-icon-gplc"><span>GPLc (LPG)</span></div>
               </div>
            </div>
            <div class="legend">
               <div class="departement-select">
                  <h2>Choisissez le département</h2>
                  <select id="departement">
                     <option value="" value2="">Sélectionnez un département</option>
                  </select>
                  <button id="update-button">OK !</button>
               </div>
            </div>
            <div class="legend ">
               <h2>Calculer la consommation du carburant entre votre position et la station</h2>
               <label for="brands">Choisissez une marque :</label>
               <select id="brands">
                  <option value="" disabled selected>Sélectionnez une marque</option>
                  <?php
                     $brands = getBrands();
                     
                     foreach ($brands as $brand) {
                         $brandName = $brand["name"];
                         echo "<option value='$brandName'>$brandName</option>";
                     }
                     ?>
               </select>
               <label for="models">Choisir un modèle :</label>
               <select id="models" disabled>
                  <option value="" disabled selected>Sélectionnez un modèle</option>
               </select>
               <!-- Remove the kilometers input field and update the button -->
               <button id="calculateBtnBis">Calculer la consommation</button>
               <div id="distanceErrorMessage"></div>
               <div id="consumptionResult"></div>
            </div>
         </div>
      </div>
      <!-- Contenu principal -->
      <div class="container">
         <div id="map"></div>
      </div>
      <!-- Chargement du script JavaScript -->
      <script src="https://unpkg.com/leaflet@latest/dist/leaflet.js"></script>
      <script src="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js"></script>
      <script src="https://unpkg.com/leaflet.markercluster@latest/dist/leaflet.markercluster.js"></script>
      <script>
         // Gestion du clic sur le bouton de menu burger
         const burgerButton = document.querySelector('.burger-button');
         const burgerMenu = document.querySelector('.burger-menu');
         
         burgerButton.addEventListener('click', () => {
           burgerMenu.classList.toggle('active');
         });
         
         function loadScript() {
           const scriptElement = document.createElement('script');
           const version = Math.random();
           scriptElement.src = `js/script.js?v=${version}`;
           document.body.appendChild(scriptElement);
         }
         
         // Appelez la fonction pour charger le script
         loadScript();
      </script>
   </body>
</html>