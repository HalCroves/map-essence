<?php
// Test des APIs
echo "<h1>Test des APIs</h1>";

// Test de la nouvelle API OpenDataSoft
$urls_to_test = [
    "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/vehicules-commercialises/records?limit=1",
    "https://public.opendatasoft.com/api/records/1.0/search/?dataset=vehicules-commercialises&rows=1",
    "https://data.economie.gouv.fr/api/records/1.0/search/?dataset=prix-des-carburants-en-france-flux-instantane-v2&rows=1"
];

foreach ($urls_to_test as $url) {
    echo "<h3>Test de: " . htmlspecialchars($url) . "</h3>";
    
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'method' => 'GET',
            'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n"
        ]
    ]);
    
    $response = file_get_contents($url, false, $context);
    
    if ($response === false) {
        echo "<p style='color:red;'>❌ Erreur avec cette URL</p>";
    } else {
        echo "<p style='color:green;'>✅ URL accessible</p>";
        $data = json_decode($response, true);
        if ($data) {
            echo "<p>Première clé trouvée: " . implode(', ', array_keys($data)) . "</p>";
        }
    }
}

// Test du fichier allow_url_fopen
if (ini_get('allow_url_fopen')) {
    echo "<p style='color:green;'>✅ allow_url_fopen est activé</p>";
} else {
    echo "<p style='color:red;'>❌ allow_url_fopen est désactivé dans php.ini</p>";
}

// Test des extensions
$extensions = ['curl', 'json', 'openssl'];
foreach ($extensions as $ext) {
    if (extension_loaded($ext)) {
        echo "<p style='color:green;'>✅ Extension $ext chargée</p>";
    } else {
        echo "<p style='color:red;'>❌ Extension $ext manquante</p>";
    }
}
?>

<p><a href="index.php">← Retour à index.php</a></p>
<p><a href="debug.php">← Retour à debug.php</a></p>