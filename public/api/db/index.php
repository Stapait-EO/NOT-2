<?php
// cPanel PHP Endpoint for /api/db local data persistence
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// Determine location of db.json
$possiblePaths = [
    __DIR__ . '/db.json',
    dirname(__DIR__, 2) . '/db.json',
    dirname(__DIR__, 3) . '/db.json'
];

$dbFile = __DIR__ . '/db.json';
foreach ($possiblePaths as $path) {
    if (file_exists($path)) {
        $dbFile = $path;
        break;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($dbFile)) {
        $content = file_get_contents($dbFile);
        echo !empty($content) ? $content : json_encode(new stdClass());
    } else {
        echo json_encode(new stdClass());
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if ($data === null && !empty($raw)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON input']);
        exit;
    }

    $existing = [];
    if (file_exists($dbFile)) {
        $existingRaw = file_get_contents($dbFile);
        $decoded = json_decode($existingRaw, true);
        if (is_array($decoded)) {
            $existing = $decoded;
        }
    }

    $merged = array_merge($existing, is_array($data) ? $data : []);
    @file_put_contents($dbFile, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    echo json_encode(['ok' => true]);
    exit;
}
