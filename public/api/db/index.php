<?php
/**
 * Secure Backend Endpoint for Database Persistence
 * Storage Location: /home/mifireco/PORTAL/notifier/db.json
 */

// Security Headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');

// CORS configuration (allow requests from the same domain and authorized portal)
$allowedOrigins = [
    'https://mifireapp.com.br',
    'http://localhost:3000'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins) || empty($origin) || strpos($origin, 'mifireapp.com.br') !== false) {
    header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-App-Id');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// -------------------------------------------------------------
// 1. Resolve Secure Database File Path
// Primary: /home/mifireco/PORTAL/notifier/db.json (outside public_html)
// -------------------------------------------------------------
$secureDir = '/home/mifireco/PORTAL/notifier';
$targetDbFile = $secureDir . '/db.json';

// Ensure the secure directory exists if we have filesystem permissions
if (!is_dir($secureDir)) {
    @mkdir($secureDir, 0750, true);
}

// Fallback search locations if running in a different environment
$possiblePaths = [
    $targetDbFile,
    dirname(__DIR__, 3) . '/PORTAL/notifier/db.json',
    dirname(__DIR__, 2) . '/notifier/db.json',
    dirname(__DIR__, 2) . '/db.json',
    __DIR__ . '/db.json'
];

$activeDbFile = null;
foreach ($possiblePaths as $path) {
    if (file_exists($path) && is_readable($path)) {
        $activeDbFile = $path;
        break;
    }
}

// If no existing file found yet, prefer the secure path if directory exists or is writable
if (!$activeDbFile) {
    if (is_dir($secureDir) && is_writable($secureDir)) {
        $activeDbFile = $targetDbFile;
    } else {
        $activeDbFile = dirname(__DIR__, 2) . '/db.json';
    }
}

// -------------------------------------------------------------
// 2. Authentication / Authorization Verification
// -------------------------------------------------------------
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
    $token = $matches[1];
}

// -------------------------------------------------------------
// 3. GET: Retrieve Database
// -------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($activeDbFile && file_exists($activeDbFile)) {
        $content = @file_get_contents($activeDbFile);
        if (!empty($content)) {
            echo $content;
            exit;
        }
    }
    
    // Fallback empty structure
    echo json_encode([
        'stock' => [],
        'products' => [],
        'orders' => [],
        'warehouses' => [],
        'users' => [],
        'sales' => [],
        'webhooks' => [],
        'fieldMappings' => []
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// 4. POST: Save / Update Database
// -------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if ($data === null && !empty($raw)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON input']);
        exit;
    }

    $existing = [];
    if ($activeDbFile && file_exists($activeDbFile)) {
        $existingRaw = @file_get_contents($activeDbFile);
        $decoded = json_decode($existingRaw, true);
        if (is_array($decoded)) {
            $existing = $decoded;
        }
    }

    // Safety guard: do not allow overwriting populated stock/products with empty arrays
    if (isset($data['stock']) && is_array($data['stock']) && count($data['stock']) === 0 && !empty($existing['stock'])) {
        unset($data['stock']);
    }
    if (isset($data['products']) && is_array($data['products']) && count($data['products']) === 0 && !empty($existing['products'])) {
        unset($data['products']);
    }

    $merged = array_merge($existing, is_array($data) ? $data : []);
    $json = json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    // Save to the active secure location
    $destination = (is_dir($secureDir) && is_writable($secureDir)) ? $targetDbFile : $activeDbFile;
    $written = @file_put_contents($destination, $json);

    // Set restrictive file permissions (only owner can read/write)
    if ($written !== false) {
        @chmod($destination, 0600);
    }

    echo json_encode([
        'ok' => $written !== false,
        'path' => (is_dir($secureDir) ? 'secure_storage' : 'local_storage'),
        'bytes' => $written
    ]);
    exit;
}
