//projection Web Mercator
const franceBounds = [
    [41, -5.266007882805498], // Coordonnée du coin sud-ouest
    [51.12419973748072, 9.66249989073084]  // Coordonnée du coin nord-est
];
const map = L.map('map', {
    center: [46.603354, 1.888334], // Coordonnées approximatives du centre de la France
    zoom: 6,
    //maxBounds: franceBounds,
    //maxBoundsViscosity: 1.0, // Empêche complètement le déplacement en dehors des limites
    minZoom: 5
}); 

const markersLayer = L.layerGroup();

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a target="_blank" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>,<a target="_blank" href="https://public.opendatasoft.com/explore/?sort=modified">OpenDataSoft</a>, ©Wilfried PERET'
}).addTo(map);


markersLayer.addTo(map);

function getRandomNumberBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

const recordsPerPage = -1 //getRandomNumberBetween(250, 700);
let currentPage = 1;
let selectedDepartement // Département par défaut
let routeControl; // Variable pour stocker la référence de la route générée
let where_clause
let selectedDistance = 0;
let userMarker = null;
let userLatitude = null;
let userLongitude = null;
let carburantPrices = {};
let zoomLevel = 10;
let markersByPosition = {}; // Utilisez un objet pour stocker les marqueurs par position
let routeDistance = 0; // Ajoutez une variable globale pour stocker la distance de la route trouvée
let totalMarkersElec = 0; // Variable pour suivre le nombre total de marqueurs ajoutés
let totalMarkersParking = 0;
let allMarkers = []; // stocker tout les markers avant de les ajouter dans L.MarkerClusterGroup()
const brandsSelect = document.getElementById("brands");
const modelsSelect = document.getElementById("models");
const calculateBtn = document.getElementById("calculateBtn");
const calculateBtnBis = document.getElementById("calculateBtnBis"); // Ajout du bouton calculateBtnBis
const kilometersInput = document.getElementById("kilometers");
const consumptionResultDiv = document.getElementById("consumptionResult");
const updateButton = document.getElementById('update-button');
const departementSelect = document.getElementById('departement');

function getApiUrl(page, selectedDepartement) {
	return `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?&limit=${recordsPerPage}&refine=departement%3A${selectedDepartement}`;
}

// Fonction pour clear les markers
function clearPreviousData() {
    //console.log("Fonction clearPreviousData appelée!"); // Juste pour débugger
    markersLayer.clearLayers();
    map.removeLayer(markersLayer);
    markersCluster.clearLayers();
    map.removeLayer(markersCluster);
    markersByPosition = {};
    totalMarkersElec = 0;
	allMarkers = [];
}

// Fonction pour vérifier le nombre d'enregistrement
function logRecordCount(count) {
    console.log("Nombre d'enregistrements:", count);
}

// Fonction pour créer les markers
function createCustomIcon() {
    return L.divIcon({
        html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-gas-pump"></i></div></div></div>',
        iconAnchor: [0, 0],
        popupAnchor: [0, 0],
        shadowSize: [0, 0],
        shadowAnchor: [0, 0],
        iconSize: L.point(23, 23)
    });
}

function initializePricesByCarburant() {
    return {
        Gazole: [],
        E10: [],
        SP98: [],
        SP95: [],
        E85: [],
        GPLc: [],
    };
}
// Fonction pour enregistrer le nombre total de pages
function logTotalPages(totalPages) {
    console.log("Total pages:", totalPages);
}

async function fetchRecords(page, selectedDepartement) {
    clearPreviousData();

    try {
        const apiUrl = getApiUrl(page, selectedDepartement);
        const response = await fetch(apiUrl);
        const data = await response.json();
        const records = data.results;

        if (records.length > 0) {
            const departementCoordinates = extractDepartementCoordinates(records);
            logRecordCount(records.length);

            // Correction de la pagination
            const totalCount = data.total_count;
            const totalPages = Math.ceil(data.total_count / 100);

            logTotalPages(totalPages);
        } else {
            logRecordCount(records.length);
        }

        const pricesByCarburant = initializePricesByCarburant();
        const myIcon = createCustomIcon();

        for (const record of records) {
            const { geom, prix, services_service, carburants_disponibles } = record;

            if (geom && geom.lat && geom.lon) {
                const latitude = geom.lat;
                const longitude = geom.lon;

                try {
                    const parsedServices = services_service;
                    const parsedPrix = JSON.parse(prix);

                    const popupContent = createPopupContentCarbu(record, parsedServices, carburants_disponibles, parsedPrix);
                    const marker = createMarker(latitude, longitude, myIcon);
                    marker.bindPopup(popupContent);

                    addMarkerEventListener(marker, latitude, longitude, record, parsedServices, carburants_disponibles, parsedPrix);

                    collectPricesByCarburant(record, pricesByCarburant, { coordinates: [longitude, latitude] });
                } catch (error) {
                    console.error("Erreur lors de l'analyse JSON :", error);
                }
            }
        }

        highlightTop3(pricesByCarburant);

        await fetchElectricRecords(page, selectedDepartement);

        if (selectedDepartement === "Paris") {
            await fetchParkingRecords(page, "Île-de-France");
        } else {
            await fetchParkingRecords(page, selectedDepartement);
        }

    } catch (error) {
        console.error("Une erreur s'est produite lors de la récupération des données :", error);
    }
}

// Fonctions utilitaires
// Fonction pour extraire les coordonnées du département
function extractDepartementCoordinates(records) {
    const firstRecord = records[0];
    const { geometry } = firstRecord;
    if (geometry && geometry.coordinates) {
        return geometry.coordinates;
    }
    return null;
}

// Fonction pour vérifier la validité des coordonnées
function isValidCoordinates(latitude, longitude) {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// Fonction pour créer un marqueur avec une icône personnalisée
function createMarker(latitude, longitude, icon) {
    const marker = L.marker([latitude, longitude], { icon: icon }).addTo(markersLayer);
    return marker;
}

// Fonction pour extraire les services et les traiter
function extractServices(servicesField, fields) {
    let services = 'Non disponible';
    try {
        if (fields.services) {
            const servicesData = JSON.parse(fields.services);
            if (servicesData.service && Array.isArray(servicesData.service)) {
                services = servicesData.service.join(", ");
            }
        }
    } catch (error) {
        console.error("Erreur lors de la manipulation du champ services :", error);
    }
    return services;
}

// Fonction pour extraire et traiter les prix des carburants
function extractPrix(prixField, pricesByCarburant, fields) {
	let prix = '';
	if (fields.prix) {
		try {
			const prixData = JSON.parse(fields.prix);

			if (Array.isArray(prixData)) {
				prix = prixData.map(item => {
					const carburantName = item["@nom"];
					const carburantPrice = parseFloat(item["@valeur"]);
					const carburantDate = new Date(item["@maj"]);
					const timeDiff = Math.floor((new Date() - carburantDate) / (1000 * 60 * 60 * 24));

					let colorClass = '';
					if (timeDiff > 15) {
						colorClass = 'red';
					} else if (timeDiff > 7) {
						colorClass = 'orange';
					} else if (timeDiff > 3) {
						colorClass = 'yellow';
					} else {
						colorClass = 'green';
					}

					const formattedTime = carburantDate.toLocaleTimeString('fr-FR', {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					});

					return `<span class="marker-icon-${carburantName.toLowerCase()} etiquette-essence">${carburantName}: ${carburantPrice.toFixed(3)}€ </span><span class="move-info-right">Dernière MAJ: <span class="${colorClass} etiquette-essence"> +${timeDiff}J à ${formattedTime}</span></span>`;
				}).join("<br>");

				prixData.forEach(item => {
					const carburantName = item["@nom"];
					const carburantPrice = parseFloat(item["@valeur"]);
					carburantPrices[carburantName] = carburantPrice;
				});
			} else if (typeof prixData === 'object') {
				for (const carburantName in prixData) {
					const carburantPrice = parseFloat(prixData[carburantName]);
					carburantPrices[carburantName] = carburantPrice;
				}
				prix = Object.keys(prixData).map(carburantName => `${carburantName}: ${prixData[carburantName]} €`).join("<br>");
			}

		} catch (error) {
			console.error("Erreur lors de la manipulation du champ prix :", error);
		}
	}
    return prix;
}

function addMarkerEventListener(marker, latitude, longitude, fields, services, carburantsDisponibles, prix) {
    marker.addEventListener('click', async () => {
        if ("geolocation" in navigator) {
			if (routeControl) {
				map.removeControl(routeControl);
				map.removeLayer(routeControl);
			}

			navigator.geolocation.getCurrentPosition(
				userPosition => {
					const userLatitude = userPosition.coords.latitude;
					const userLongitude = userPosition.coords.longitude;
					// when instantiating L.Routing.Control pass lineOptions property with addWaypoints: false inside and your code would look like this :
					// https://github.com/perliedman/leaflet-routing-machine/issues/455
					routeControl = L.Routing.control({
						waypoints: [
							L.latLng(userLatitude, userLongitude),
							L.latLng(latitude, longitude)
						],
						draggableWaypoints: false,
						routeWhileDragging: false,
						show: false,
						drag: false,
						createMarker: function() { return null; },
						lineOptions: {
							addWaypoints: false,
							styles: [{ weight: 2, className: 'abricot'}]
						}
					}).addTo(map);

					routeControl.on('routesfound', event => {
						const route = event.routes[0];
						routeDistance = (route.summary.totalDistance / 1000).toFixed(2); // Stocker la distance de la route
						
						// Convertir l'objet prix en une chaîne de caractères lisible
						const prixString = Object.values(prix).map(item => {
                            const carburantName = item["@nom"];
                            const carburantPrice = parseFloat(item["@valeur"]);
                            const carburantDate = new Date(item["@maj"]);
                            const timeDiff = Math.floor((new Date() - carburantDate) / (1000 * 60 * 60 * 24));

                            let colorClass = '';
                            if (timeDiff > 15) {
                                colorClass = 'red';
                            } else if (timeDiff > 7) {
                                colorClass = 'orange';
                            } else if (timeDiff > 3) {
                                colorClass = 'yellow';
                            } else {
                                colorClass = 'green';
                            }

                            const formattedTime = carburantDate.toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            });

							//console.log(carburantName.toLowerCase())
                            return `<span class="marker-icon-${carburantName.toLowerCase()} etiquette-essence">${carburantName}: ${carburantPrice.toFixed(3)}€ </span><span class="move-info-right">Dernière MAJ: <span class="${colorClass} etiquette-essence"> +${timeDiff}J à ${formattedTime}</span></span>`;
                        }).join("<br>");

						const updatedPopupContent = `
							<p><b>Adresse:</b> ${fields.adresse || "Adresse inconnue"}, ${fields.cp || "Code postal inconnu"} ${fields.ville || "Ville inconnue"}</p>
							<p><b>Services:</b> ${services}</p>
							<p><b>Automate 24/24:</b> ${fields.horaires_automate_24_24}</p>
							<p><b>Carburants disponibles:</b> ${carburantsDisponibles.join(", ")}</p>
							<p><b>Prix:</b><br>${prixString}</p>
							<div id="route-info">Distance: ${routeDistance} km</div>
						`;
						marker.getPopup().setContent(updatedPopupContent);
					});
				},
				error => {
					console.error("Impossible d'obtenir la géolocalisation.", error);
				}
			);
		}
    });
}



// Fonction pour collecter les prix des carburants pour le top 3
function collectPricesByCarburant(fields, pricesByCarburant, geometry) {
    for (const carburant in fields) {
        if (carburant.endsWith("_prix")) {
            const carburantType = carburant.slice(0, -5);
            const carburantPrix = parseFloat(fields[carburant]);
            if (!isNaN(carburantPrix)) {
                if (!pricesByCarburant[carburantType]) {
                    pricesByCarburant[carburantType] = [];
                }
                pricesByCarburant[carburantType].push({
                    prix: carburantPrix,
                    geometry: geometry
                });
            }
        }
    }
}

// Fonction pour créer le contenu de la popup du marqueur
function createPopupContentCarbu(record, services, carburants_disponibles, prix) {
    let popupContent = '';

    popupContent += `<div><strong>Adresse:</strong> ${record.adresse}, ${record.cp} ${record.ville}</div>`;
    popupContent += `<div><strong>Services:</strong> ${services ? (Array.isArray(services) ? services.join(', ') : services) : 'Aucun'}</div>`; // Vérifie si services est null
    popupContent += `<div><strong>Carburants disponibles:</strong> ${carburants_disponibles ? (Array.isArray(carburants_disponibles) ? carburants_disponibles.join(', ') : carburants_disponibles) : 'Aucun'}</div>`; // Vérifie si carburants_disponibles est null
    popupContent += `<div><strong>Prix:</strong> ${prix ? prix : 'Non disponible'}</div>`; // Vérifie si prix est null

    return popupContent;
}


// Fonction pour afficher le top 3 par carburant
function highlightTop3(pricesByCarburant) {
    const carburantNames = {
        e10: 'E10',
        e85: 'E85',
        sp95: 'E5',
        sp98: 'E5',
        gazole: 'B7',
        gplc: 'LPG'
    };

    const markersByPosition = {}; // Suivre les marqueurs par position

    for (const carburant in pricesByCarburant) {
        const carburantRecords = pricesByCarburant[carburant];
        const top3Records = carburantRecords
            .filter(record => record.prix !== undefined)
            .sort((a, b) => a.prix - b.prix)
            .slice(0, 3);

        const carburantFullName = carburantNames[carburant.toLowerCase()] || carburant;
		const myIcon = L.divIcon({
			className: `marker-icon-custom marker-icon-${carburant.toLowerCase()}`,
			html: `<div class="leaflet-pulsing-icon"><div class="pulsating-content">${carburantFullName}</div></div>`,  // Encapsuler le contenu dans une div
			iconSize: [22, 22],
			iconAnchor: [0, 0],  // Mettre à jour pour correspondre à la moitié de iconSize
			popupAnchor: [0, 0],
			shadowSize: [0, 0],
			shadowAnchor: [0, 0]
		});
		

        top3Records.forEach(record => {
            const { geometry } = record;
            if (geometry && geometry.coordinates) {
                const [longitude, latitude] = geometry.coordinates;
                const positionKey = `${latitude},${longitude}`;
                
                if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
                    const marker = L.marker([latitude, longitude], { icon: myIcon });

                    if (!markersByPosition[positionKey]) {
                        markersByPosition[positionKey] = [];
                    }
                    markersByPosition[positionKey].push(marker);

                    markersLayer.addLayer(marker);
                }
            }
        });
    }

    const zoomFactor = 0.0000067;
    map.on('zoomend', function () {
        const currentZoom = map.getZoom();
        const adjustedRadius = calculateAdjustedRadius(currentZoom);
        updateMarkersPosition(adjustedRadius);
    });

    function calculateAdjustedRadius(zoom) {
		let baseRadius = 0.015;

        if (zoom < 10) return baseRadius;
        
        for (let i = 10; i < zoom; i++) {
            baseRadius /= 2;
        }
        return baseRadius + (zoom * zoomFactor);
    }

    function updateMarkersPosition(adjustedRadius) {
        for (const positionKey in markersByPosition) {
            const [latitude, longitude] = positionKey.split(',').map(parseFloat);
            const markers = markersByPosition[positionKey];

            //if (markers.length > 1) {
                markers.forEach((marker, index) => {
                    const angle = (index / markers.length) * 360;
                    const offsetX = adjustedRadius * Math.cos((angle * Math.PI) / 180);
                    const offsetY = adjustedRadius * Math.sin((angle * Math.PI) / 180);
                    const newLatitude = latitude + offsetX;
                    const newLongitude = longitude + offsetY;
                    marker.setLatLng([newLatitude, newLongitude]);
                });
            //}
        }
    }

    // Appel initial pour positionner les marqueurs en fonction du zoom actuel
    const initialZoom = map.getZoom();
    const initialAdjustedRadius = calculateAdjustedRadius(initialZoom);
    updateMarkersPosition(initialAdjustedRadius);
}

// Fonction pour récupérer les modèles de véhicules
function getModelsByBrand(brand) {
	const apiUrl = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=marque:${brand}&rows=1000`;

	fetch(apiUrl)
		.then(response => response.json())
		.then(data => {
			const models = data.records.map(record => record.fields.designation_commerciale);
			const marques = data.records.map(record => record.fields.marque); // Ajout de la récupération de la marque
			const annees = data.records.map(record => record.fields.annee); // Ajout de la récupération de l'année
			const boites = data.records.map(record => record.fields.boite_de_vitesse); // Ajout de la récupération de la boîte de vitesse
			const carburants = data.records.map(record => record.fields.carburant); // Ajout de la récupération du carburant
			const puissancesCV = data.records.map(record => record.fields.puissance_administrative); // Ajout de la récupération de la puissance en CV
			const puissancesMaximales = data.records.map(record => record.fields.puissance_maximale); // Ajout de la récupération de la puissance maximale

			populateModelsDropdown(models, marques, annees, boites, carburants, puissancesCV, puissancesMaximales); // Passage des nouvelles données à la fonction de peuplement
		})
		.catch(error => {
			console.error("Error fetching models:", error);
		});
}

function populateModelsDropdown(models, marques, annees, boites, carburants, puissancesCV, puissancesMaximales) {
	modelsSelect.innerHTML = '<option value="" disabled selected>Sélectionnez un modèle</option>';

	models.sort();

	models.forEach((model, index) => {
		const option = document.createElement("option");
		option.value = model;
		option.textContent = `[${marques[index] || 'N/A'}] ${model || 'N/A'} (${annees[index] || 'N/A'}) (${boites[index] || 'N/A'}) (${puissancesCV[index] || 'N/A'} CV) (${puissancesMaximales[index] || 'N/A'} KW) (${carburants[index] || 'N/A'})`;
		modelsSelect.appendChild(option);
	});
	modelsSelect.disabled = false;
}

// Fonction pour obtenir la consommation d'un véhicule
function getConsumptionData(model) {
	const apiUrl = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=designation_commerciale:${model}`;

	fetch(apiUrl)
		.then(response => response.json())
		.then(data => {
			if (data.records && data.records.length > 0) {
				const consumptionData = data.records[0].fields;
				const consumptionText = `
                  <p class="mdl">Model: ${consumptionData.designation_commerciale}</p>
                  <p class="conso">Conso. urbaine : <span class="conso-details">${consumptionData.consommation_urbaine_l_100km} L/100km</span></p>
                  <p class="conso">Conso. extra-urbaine : <span class="conso-details">${consumptionData.consommation_extra_urbaine_l_100km} L/100km</span></p>
                  <p class="conso">Conso. Mixte: <span class="conso-details">${consumptionData.consommation_mixte_l_100km} L/100km</span></p>
              `;
				consumptionResultDiv.innerHTML = consumptionText;

				// Set the data-distance attribute for the Calculate Consumption button
				const urbanConsumption = parseFloat(consumptionData.consommation_urbaine_l_100km);
				const extraUrbanConsumption = parseFloat(consumptionData.consommation_extra_urbaine_l_100km);
				const mixteConsumption = parseFloat(consumptionData.consommation_mixte_l_100km);
				selectedDistance = (urbanConsumption + extraUrbanConsumption + mixteConsumption) / 3; // Calculate an average distance
				calculateBtnBis.setAttribute("data-distance", selectedDistance.toFixed(2));
			} else {
				consumptionResultDiv.textContent = "Données de consommation non disponibles pour ce modèle.";
				calculateBtnBis.removeAttribute("data-distance");
			}
		})
		.catch(error => {
			console.error("Error fetching consumption data:", error);
		});
}

function getConsumptionAndCalculate(model, distance) {
	const apiUrl = `https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&q=designation_commerciale:${model}`;

	fetch(apiUrl)
		.then(response => response.json())
		.then(data => {
			const consumptionData = data.records[0].fields;
			const urbanConsumption = parseFloat(consumptionData.consommation_urbaine_l_100km);
			const extraUrbanConsumption = parseFloat(consumptionData.consommation_extra_urbaine_l_100km);
			const mixteConsumption = parseFloat(consumptionData.consommation_mixte_l_100km);

			const totalUrbanConsumption = (urbanConsumption / 100) * distance;
			const totalExtraUrbanConsumption = (extraUrbanConsumption / 100) * distance;
			const totalMixteConsumption = (mixteConsumption / 100) * distance;

			let costResults = '';
			const validCarburantKeys = new Set(['Gazole', 'E10', 'SP98', 'SP95', 'E85', 'GPLc']); // Liste des carburants valides

			for (const carburant in carburantPrices) {
				if (validCarburantKeys.has(carburant)) {
					const carburantPrice = carburantPrices[carburant];
					const carburantCost = ((totalUrbanConsumption + totalExtraUrbanConsumption + totalMixteConsumption) / 3) * carburantPrice;
					costResults += `<p class="price-euros">${carburant}<span class="conso-details">${carburantCost.toFixed(2)} €</span></p>`;
				}
			}

			const consumptionResult = `
              <p class="mdl">Modèle : ${consumptionData.designation_commerciale}</p>
              <p class="conso">Conso. urbaine : <span class="conso-details">${totalUrbanConsumption.toFixed(2)} litres<span></p>
              <p class="conso">Conso. extra-urbaine : <span class="conso-details">${totalExtraUrbanConsumption.toFixed(2)} litres<span></p>
              <p class="conso">Conso. mixte : <span class="conso-details">${totalMixteConsumption.toFixed(2)} litres<span></p>
              <p class="conso">${costResults}</p>
          `;

			consumptionResultDiv.innerHTML = consumptionResult;
		})
		.catch(error => {
			console.error("Erreur lors de la récupération des données de consommation :", error);
		});
}

// Fonction pour peupler la liste déroulante des départements
function populateDepartementDropdown(departements) {
    const select = document.getElementById('departement');
    select.innerHTML = ''; // Vider le menu déroulant

    departements.forEach(departement => {
        const option = document.createElement('option');
        let values = departement.value;
        
        if (departement.value2) {
            values += "," + departement.value2;
        }

        option.value = values;
        option.textContent = departement.label;
        
        select.appendChild(option);
    });
	departementSelect.disabled = false;
}


let markersCluster = L.markerClusterGroup({
    maxClusterRadius: 80,  // Valeur par défaut de leaflet.markercluster
    iconCreateFunction: function(cluster) {
        const defaultIcon = L.MarkerClusterGroup.prototype._defaultIconCreateFunction(cluster);
        const defaultClassName = defaultIcon.options.className;
        
        return L.divIcon({
            html: `<div>
                    <span>${cluster.getChildCount()}</span>
                    <i class="fas fa-charging-station"></i>
                   </div>`,
            className: defaultClassName,
            iconSize: new L.Point(40, 40)
        });
    }
});

function fetchElectricRecords(page, selectedDepartement) {
	const recordsPerPage = 100;
	const start = (page - 1) * recordsPerPage;

	const apiUrlElectrique = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-irve-220/records?select=*&where=dep_name%20like%20%22${selectedDepartement}%22&start=${start}&rows=${recordsPerPage}`;

	// Créer l'icône une seule fois
	const myElectricIcon = L.divIcon({
		html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-charging-station"></i></div></div></div>',
		iconAnchor: [0, 0],
		popupAnchor: [0, 0],
		shadowSize: [0, 0],
		shadowAnchor: [0, 0]
	});

	fetch(apiUrlElectrique)
    .then(response => response.json())
    .then(data => {
        const records = data.results;

        records.forEach(record => {
            const {
                coordonneesxy
            } = record;

            if (coordonneesxy) {
                const [longitude, latitude] = JSON.parse(coordonneesxy);

                const marker = L.marker([latitude, longitude], {
                    icon: myElectricIcon
                });

                const popupContent = createPopupContent(record);
                marker.bindPopup(popupContent);

                marker.addEventListener('click', function() {
                    handleMarkerClick(this, record, latitude, longitude);
                });

                // Ajoutez le marker au tableau temporaire plutôt qu'au cluster directement
                allMarkers.push(marker);
            }
        });

        totalMarkersElec += records.length;

        if (totalMarkersElec < data.total_count) {
            fetchElectricRecords(page + 1, selectedDepartement);
        } else {
            // Une fois que tous les markers ont été récupérés, ajoutez-les tous au cluster
            allMarkers.forEach(marker => markersCluster.addLayer(marker));
            map.addLayer(markersCluster);
			hideLoadingMessage()
        }
    })
    .catch(error => console.error("Une erreur s'est produite lors de la récupération des données électriques :", error));

}

// Fonction pour générer le contenu du popup
function createPopupContent(record) {
	return `
		<h3>${record.nom_epci || record.nom_station}</h3>
		<p><b>Adresse:</b> ${record.adresse_station || "Adresse inconnue"}</p>
		<p><b>Type d'accès:</b> ${record.implantation_station} - ${record.condition_acces || "Type d'accès inconnu"}</p>
		<p><b>Horaires:</b> ${record.horaires || "Horaires inconnus"}</p>
		<p><b>Nombre de PDC:</b> ${record.nbre_pdc || "PDC inconnus"}</p>
		<p><b>Nombre de PDC:</b> ${record.nbre_pdc || "PDC inconnus"}</p>
		<p><b>Prises disponibles:</b></p>
		<table>
		<tr>
		<td><img src="./img/Ef.PNG" alt="Ef" class="img_elec"></td>
		<td><img src="./img/Type2.PNG" alt="Ef" class="img_elec"></td>
		<td><img src="./img/Combo_CCS.PNG" alt="Ef" class="img_elec"></td>
		<td><img src="./img/Chademo.PNG" alt="Ef" class="img_elec"></td>
		<td></td>
		</tr>
		<tr>
		<td class="text-elec">Ef</td>
		<td class="text-elec">Type2</td>
		<td class="text-elec">Combo CCS</td>
		<td class="text-elec">CHAdeMO</td>
		<td class="text-elec">Autres</td>
		</tr>
		<tr>
		<td class="text-elec">${record.prise_type_ef}</td>
		<td class="text-elec">${record.prise_type_2}</td>
		<td class="text-elec">${record.prise_type_combo_ccs}</td>
		<td class="text-elec">${record.prise_type_chademo}</td>
		<td class="text-elec">${record.prise_type_autre}</td>
		</tr>
		</table>
		<p><b>Puissance nominale:</b> ${record.puissance_nominale | "Puissance nominale inconnue"}kW</p>
		<p><b>Tarifications:</b> ${record.tarification || "Tarifs inconnus"}</p>
		<p><b>Paiement:</b> Acte ${record.paiement_acte} CB ${record.paiement_cb} Autres ${record.paiement_autre}
		<p><b>Autres infos:</b> ${record.observations || "Infos inconnus"}</p>
		<div id="route-info">Distance: Calcul en attente</div>
    `;
}

// Fonction pour gérer le click sur un marker
function handleMarkerClick(marker, record, latitude, longitude) {
	if ("geolocation" in navigator) {
		if (routeControl) {
			map.removeControl(routeControl);
			map.removeLayer(routeControl);
			routeControl = null;

		}

		navigator.geolocation.getCurrentPosition(userPosition => {
			const userLatitude = userPosition.coords.latitude;
			const userLongitude = userPosition.coords.longitude;

			routeControl = L.Routing.control({
				waypoints: [
					L.latLng(userLatitude, userLongitude),
					L.latLng(latitude, longitude)
				],
				draggableWaypoints: false,
				routeWhileDragging: false,
				show: false,
				drag: false,
				createMarker: function() {
					return null;
				},
				lineOptions: {
					addWaypoints: false,
					styles: [{
						weight: 2,
						className: 'abricot',
						color: '#228509'
					}]
				}
			}).addTo(map);

			routeControl.on('routesfound', event => {
				const routeDistance = (event.routes[0].summary.totalDistance / 1000).toFixed(2);
				const updatedPopupContent = `
					<h3>${record.nom_epci || record.nom_station }</h3>
					<p><b>Adresse:</b> ${record.adresse_station || "Adresse inconnue"}</p>
					<p><b>Type d'accès:</b> ${record.implantation_station} - ${record.condition_acces || "Type d'accès inconnu"}</p>
					<p><b>Horaires:</b> ${record.horaires || "Horaires inconnus"}</p>
					<p><b>Nombre de PDC:</b> ${record.nbre_pdc || "PDC inconnus"}</p>
					<p><b>Prises disponibles:</b></p>
					<table>
					<tr>
					<td><img src="./img/Ef.PNG" alt="Ef" class="img_elec"></td>
					<td><img src="./img/Type2.PNG" alt="Ef" class="img_elec"></td>
					<td><img src="./img/Combo_CCS.PNG" alt="Ef" class="img_elec"></td>
					<td><img src="./img/Chademo.PNG" alt="Ef" class="img_elec"></td>
					<td></td>
					</tr>
					<tr>
					<td class="text-elec">Ef</td>
					<td class="text-elec">Type2</td>
					<td class="text-elec">Combo CCS</td>
					<td class="text-elec">CHAdeMO</td>
					<td class="text-elec">Autres</td>
					</tr>
					<tr>
					<td class="text-elec">${record.prise_type_ef}</td>
					<td class="text-elec">${record.prise_type_2}</td>
					<td class="text-elec">${record.prise_type_combo_ccs}</td>
					<td class="text-elec">${record.prise_type_chademo}</td>
					<td class="text-elec">${record.prise_type_autre}</td>
					</tr>
					</table>
				
					<p><b>Puissance nominale:</b> ${record.puissance_nominale || "Puissance nominale inconnue"}kW</p>
					<p><b>Tarifications:</b> ${record.tarification || "Tarifs inconnus"}</p>
					<p><b>Paiement:</b> Acte ${record.paiement_acte} CB ${record.paiement_cb} Autres ${record.paiement_autre}
					<p><b>Autres infos:</b> ${record.observations || "Infos inconnus"}</p>
					<div id="route-info">Distance: ${routeDistance} km</div>
           		 `;

				marker.getPopup().setContent(updatedPopupContent);
			});
		}, error => {
			console.error("Impossible d'obtenir la géolocalisation.", error);
		});
	}
}

function fetchParkingRecords(page, selectedDepartement) {
    const recordsPerPage = 100;
    const start = (page - 1) * recordsPerPage;
	
	//console.log("->",selectedDepartement)

	if(selectedDepartement === "Île-de-France") {
		where_clause = "(insee_code like '75*' ) OR reg_name = 'Île-de-France'"
		//console.log(where_clause)
	} else {
		where_clause = `dep_name%20like%20%22${selectedDepartement}%22`
		//console.log(where_clause)
	}

    const apiUrlParking = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/mobilityref-france-base-nationale-des-lieux-de-stationnement/records?select=*&where=${where_clause}&start=${start}&rows=${recordsPerPage}`;

	// Créer l'icône une seule fois
	const myParkingIcon = L.divIcon({
		html: '<div class="euh"><div class="custom-icon"><div class="custom-icon-content"><i class="fa-solid fa-parking"></i></div></div></div>',
		iconAnchor: [0, 0],
		popupAnchor: [0, 0],
		shadowSize: [0, 0],
		shadowAnchor: [0, 0]
	});

    fetch(apiUrlParking)
        .then(response => response.json())
        .then(data => {
            const records = data.results;

            records.forEach(record => {
                const longitude = record.xlong;
                const latitude = record.ylat;

                if (longitude && latitude) {
					const marker = L.marker([latitude, longitude], {
						icon: myParkingIcon
					}).addTo(markersLayer);

                    // Use a template model for the content of the popup
                    const popupContent = createPopupContentParking(record); // Make sure to adjust the content of this function
                    marker.bindPopup(popupContent);

                    marker.addEventListener('click', function() {
                        handleMarkerClickParking(this, record, latitude, longitude);
                    });
                }
            });

            // Add the layer of markers only once
            markersLayer.addTo(map);

            totalMarkersParking += records.length;

            if (totalMarkersParking < data.total_count) {
                fetchParkingRecords(page + 1, selectedDepartement);
            }
        })
        .catch(error => console.error("Une erreur s'est produite lors de la récupération des données de parking:", error));
}

// Adjust createPopupContent to display relevant parking information
function createPopupContentParking(record) {
    return `
        <h3>${record.name}</h3>
        <p><b>Adresse:</b> ${record.address || "Adresse inconnue"}</p>
        <p><b>URL:</b> <a href="${record.url}" target="_blank">Lien</a></p>
        <p><b>Nombre de places:</b> ${record.space_count || "Nombre inconnu"}</p>
		<p><b>Nombre de places pour personnes handicapées:</b> ${record.disable_count || "Nombre inconnu"}</p>
		<table>
			<tr>
				<td>Tarif 1h</td>
				<td>Tarif 2h</td>
				<td>Tarif 3h</td>
				<td>Tarif 4h</td>
				<td>Tarif 5h</td>
			</tr>
			<tr>
				<td class="text-elec">${record.cost_1h || "Tarif inconnu"}€</td>
				<td class="text-elec">${record.cost_2h || "Tarif inconnu"}€</td>
				<td class="text-elec">${record.cost_3h || "Tarif inconnu"}€</td>
				<td class="text-elec">${record.cost_4h || "Tarif inconnu"}€</td>
				<td class="text-elec">${record.cost_24h || "Tarif inconnu"}€</td>
			</tr>
		</table>
		<p><b>Informations:</b> ${record.info || "Information inconnu"}</p>
		<br />
        <div id="route-info">Distance: Calcul en attente</div>
    `;
}

// Fonction pour gérer le click sur un marker
function handleMarkerClickParking(marker, record, latitude, longitude) {
	if ("geolocation" in navigator) {
		if (routeControl) {
			map.removeControl(routeControl);
			map.removeLayer(routeControl);
			routeControl = null;

		}

		navigator.geolocation.getCurrentPosition(userPosition => {
			const userLatitude = userPosition.coords.latitude;
			const userLongitude = userPosition.coords.longitude;

			routeControl = L.Routing.control({
				waypoints: [
					L.latLng(userLatitude, userLongitude),
					L.latLng(latitude, longitude)
				],
				draggableWaypoints: false,
				routeWhileDragging: false,
				show: false,
				drag: false,
				createMarker: function() {
					return null;
				},
				lineOptions: {
					addWaypoints: false,
					styles: [{
						weight: 2,
						className: 'abricot',
						color: '#000'
					}]
				}
			}).addTo(map);

			routeControl.on('routesfound', event => {
				const routeDistance = (event.routes[0].summary.totalDistance / 1000).toFixed(2);
				const updatedPopupContent = `
					<h3>${record.name}</h3>
					<p><b>Adresse:</b> ${record.address || "Adresse inconnue"}</p>
					<p><b>URL:</b> <a href="${record.url}" target="_blank">Lien</a></p>
					<p><b>Nombre de places:</b> ${record.space_count || "Nombre inconnu"}</p>
					<p><b>Nombre de places pour personnes handicapées:</b> ${record.disable_count || "Nombre inconnu"}</p>
					<table>
						<tr>
							<td>Tarif 1h</td>
							<td>Tarif 2h</td>
							<td>Tarif 3h</td>
							<td>Tarif 4h</td>
							<td>Tarif 5h</td>
						</tr>
						<tr>
							<td class="text-elec">${record.cost_1h || "Tarif inconnu"}€</td>
							<td class="text-elec">${record.cost_2h || "Tarif inconnu"}€</td>
							<td class="text-elec">${record.cost_3h || "Tarif inconnu"}€</td>
							<td class="text-elec">${record.cost_4h || "Tarif inconnu"}€</td>
							<td class="text-elec">${record.cost_24h || "Tarif inconnu"}€</td>
						</tr>
					</table>
					<p><b>Informations:</b> ${record.info || "Information inconnu"}</p>
					<br />
					<div id="route-info">Distance: ${routeDistance} km</div>
           		 `;

				marker.getPopup().setContent(updatedPopupContent);
			});
		}, error => {
			console.error("Impossible d'obtenir la géolocalisation.", error);
		});
	}
}

async function fetchDepartments() {
    const initialLimit = 100;
    const apiUrl = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?select=departement&limit=${initialLimit}`;
    let allDepartments = [];

    try {
        const fetchDepartmentsRecursive = async (url, offset) => {
            const response = await fetch(`${url}&offset=${offset}`);
            const data = await response.json();

            if (data.error_code) {
                console.error("Erreur lors de la récupération des départements :", data.message);
                return [];
            }

            if (data && data.results) {
                const departments = data.results.map(item => item.departement);
                allDepartments = allDepartments.concat(departments);

                // Si le nombre total de résultats dépasse la limite de la première requête, paginer localement
                const nextPageOffset = offset + initialLimit;
                if (nextPageOffset < data.total_count) {
                    return allDepartments.concat(await fetchDepartmentsRecursive(url, nextPageOffset));
                }
            }

            return allDepartments;
        };

        // Récupérer les départements de manière asynchrone en paginant
        allDepartments = await fetchDepartmentsRecursive(apiUrl, 0);

        if (allDepartments.length === 0) {
            console.error("Aucun département trouvé.");
            return;
        }

        // Supprimer les doublons et trier les départements
        const uniqueDepartments = Array.from(new Set(allDepartments)); 
        const sortedDepartments = uniqueDepartments.sort((a, b) => (a && b) ? a.localeCompare(b) : 0);

        // Créer la liste des départements avec le format attendu
        const departements = sortedDepartments.map(departement => ({
            value: departement,
            label: departement
        }));

        // Mettre à jour le dropdown avec les départements
        populateDepartementDropdown(departements);
        //console.log(departements);
    } catch (error) {
        console.error("Erreur lors de la récupération des départements :", error);
    }
}



window.addEventListener('load', () => {
	showLoadingMessage();
	fetchDepartments(); // Appel pour récupérer la liste des départements lors du chargement de la page
});

// Changer de departement et recharger les markers
updateButton.addEventListener('click', async () => {
    const selectElement = document.getElementById('departement');
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const selectedValues = selectedOption.value.split(',');  // Ceci sera un tableau
    clearPreviousData();
    fetchRecords(currentPage, selectedValues);

	// Obtenir les coordonnées du département depuis Nominatim
	const query = selectedValues[0] + ', France';
	try {
		const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`);
		const data = await response.json();
		if (data.length > 0) {
			const coordinates = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
			map.flyTo(coordinates, zoomLevel);
		} else {
			console.error("Coordonnées du département non trouvées.");
		}
	} catch (error) {
		console.error("Erreur lors de l'obtention des coordonnées du département :", error);
	}

	// Replacer le marker de l'utilisateur
	if (userLatitude && userLongitude) {
		// Si on a déjà les coordonnées, ajoutez simplement le marker
		addUserMarker(userLatitude, userLongitude);
		//console.log("Coordonnés de l'user déjà stockés.")
	} else if ("geolocation" in navigator) {
		navigator.geolocation.getCurrentPosition(
			position => {
				userLatitude = position.coords.latitude;
				userLongitude = position.coords.longitude;

				fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLatitude}&lon=${userLongitude}`)
				.then(response => response.json())
				.then(data => {
					const address = data.display_name;
					const popupContent = `Votre position actuelle: <br />${address}`;

					// Une fois les résultats affichés, on ajouter le marker de la position de l'user
					userMarker = L.marker([userLatitude, userLongitude]).addTo(markersLayer);

					userMarker.bindPopup(popupContent, {
						offset: L.point(0, 0)
					});
				})
				.catch(error => {
					console.error("Erreur lors du géocodage inverse:", error);
				});

				addUserMarker(userLatitude, userLongitude);
			},
			error => {
				console.error("Impossible d'obtenir la géolocalisation.", error);
			}
		);
	} else {
		console.error("La géolocalisation n'est pas prise en charge par ce navigateur.");
	}
});

function addUserMarker(lat, lon) {
	if (userMarker) {
		markersLayer.removeLayer(userMarker); // Supprime l'ancien marker si existant
	}
	userMarker = L.marker([lat, lon]).addTo(markersLayer);
	const popupContent = `Votre position actuelle: <br />Latitude: ${lat}, Longitude: ${lon}`;
	userMarker.bindPopup(popupContent, {
		offset: L.point(0, 0)
	});
}

// Obtenir la géolocalisation automatiquement
if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
        position => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
            .then(response => response.json())
            .then(data => {
                const address = data.display_name;
                const popupContent = `Votre position actuelle: <br />${address}`;

                // Extraire le département de la réponse
                if (data.address && data.address.county) {
                    selectedDepartement = data.address.county;
                    //console.log("Département sélectionné:", selectedDepartement);  // À des fins de débogage

					// On affiche les résultats en fonction du département de l'utilisateur
					fetchRecords(currentPage, selectedDepartement);

					// Une fois les résultats affichés, on ajouter le marker de la position de l'user
					userMarker = L.marker([latitude, longitude]).addTo(markersLayer);

					userMarker.bindPopup(popupContent, {
						offset: L.point(0, 0)
					});
                }

            })
            .catch(error => {
                console.error("Erreur lors du géocodage inverse:", error);
            });
        
        },
        error => {
            console.error("Impossible d'obtenir la géolocalisation.", error);
        }
    );
} else {
    console.error("La géolocalisation n'est pas prise en charge par ce navigateur.");
}

brandsSelect.addEventListener("change", () => {
	const selectedBrand = brandsSelect.value;
	getModelsByBrand(selectedBrand);
});

modelsSelect.addEventListener("change", () => {
	const selectedModel = modelsSelect.value;
	consumptionResultDiv.textContent = ""; // Effacer les résultats précédents de la consommation
	getConsumptionData(selectedModel);
});

calculateBtnBis.addEventListener("click", () => {
	const selectedModel = modelsSelect.value;
	const routeInfo = document.querySelector("#route-info");

	const errorMessageDiv = document.getElementById("distanceErrorMessage");
	errorMessageDiv.textContent = ""; // Effacer le message d'erreur

	if (!routeInfo) {
		errorMessageDiv.textContent = "Il faut d'abord cliquer sur une station pour effectuer le calcul.";
		return;
	}

	const distanceText = routeInfo.textContent.split(":")[1].trim();
	const distance = parseFloat(distanceText);

	if (isNaN(distance)) {
		errorMessageDiv.textContent = "Information de distance non disponible.";
		return;
	}

	if (!isNaN(selectedDistance)) {
		getConsumptionAndCalculate(selectedModel, distance);
	} else {
		consumptionResultDiv.textContent = "Information de distance non disponible.";
	}
});

// Fonction pour afficher le message de chargement
function showLoadingMessage() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Fonction pour masquer le message de chargement
function hideLoadingMessage() {
    document.getElementById('loadingOverlay').style.display = 'none';
}