<?php
/**
 * Secure Backend Endpoint for Database Persistence
 * Storage Location: /home/mifireco/PORTAL/notifier/db.json
 */

// Disable error display to avoid breaking JSON response, but log them
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Security & Caching Headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');

// CORS configuration
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'https://mifireapp.com.br',
    'https://mifire.com.br',
    'http://localhost:3000'
];

if (in_array($origin, $allowedOrigins) || empty($origin) || strpos($origin, 'mifireapp.com.br') !== false || strpos($origin, 'mifire.com.br') !== false) {
    header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-App-Id, Accept');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// -------------------------------------------------------------
// 1. Resolve Secure Database File Path
// Comprehensive search across potential cPanel locations and naming variations
// -------------------------------------------------------------
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
$parentDocRoot = $docRoot ? dirname($docRoot) : '';

$candidatePaths = [
    // 1. Direct explicit user path outside public_html
    '/home/mifireco/PORTAL/notifier/db.json',
    '/home/mifireco/PORTAL/notifier/db.jason',
    '/home/mifireco/PORTAL/notifier/DB.json',
    '/home/mifireco/portal/notifier/db.json',
    '/home/mifireco/portal/notifier/db.jason',
    '/home/mifireco/notifier/db.json',
    '/home/mifireco/db.json',

    // 2. Relative to cPanel user home (derived from DOCUMENT_ROOT)
    $parentDocRoot ? $parentDocRoot . '/PORTAL/notifier/db.json' : '',
    $parentDocRoot ? $parentDocRoot . '/PORTAL/notifier/db.jason' : '',
    $parentDocRoot ? $parentDocRoot . '/portal/notifier/db.json' : '',
    $parentDocRoot ? $parentDocRoot . '/notifier/db.json' : '',

    // 3. Inside public_html / web root (in case user uploaded it inside web root)
    $docRoot ? $docRoot . '/PORTAL/notifier/db.json' : '',
    $docRoot ? $docRoot . '/PORTAL/notifier/db.jason' : '',
    $docRoot ? $docRoot . '/portal/notifier/db.json' : '',
    $docRoot ? $docRoot . '/notifier/db.json' : '',
    $docRoot ? $docRoot . '/db.json' : '',

    // 4. Relative to current script (__DIR__ is /public/api/db)
    dirname(__DIR__, 3) . '/PORTAL/notifier/db.json',
    dirname(__DIR__, 3) . '/PORTAL/notifier/db.jason',
    dirname(__DIR__, 3) . '/portal/notifier/db.json',
    dirname(__DIR__, 3) . '/notifier/db.json',
    dirname(__DIR__, 2) . '/notifier/db.json',
    dirname(__DIR__, 2) . '/db.json',
    __DIR__ . '/db.json'
];

// Clean and deduplicate candidates
$cleanCandidates = [];
foreach ($candidatePaths as $p) {
    if (!empty($p) && !in_array($p, $cleanCandidates)) {
        $cleanCandidates[] = $p;
    }
}

// Check for any matching JSON file if a folder exists
$folderCandidates = [
    '/home/mifireco/PORTAL/notifier',
    '/home/mifireco/portal/notifier',
    $parentDocRoot ? $parentDocRoot . '/PORTAL/notifier' : '',
    $docRoot ? $docRoot . '/PORTAL/notifier' : '',
    $docRoot ? $docRoot . '/notifier' : ''
];

foreach ($folderCandidates as $folder) {
    if (!empty($folder) && is_dir($folder) && is_readable($folder)) {
        $files = @scandir($folder);
        if (is_array($files)) {
            foreach ($files as $file) {
                if (preg_match('/\.(json|jason)$/i', $file)) {
                    $foundPath = rtrim($folder, '/') . '/' . $file;
                    if (!in_array($foundPath, $cleanCandidates)) {
                        array_unshift($cleanCandidates, $foundPath);
                    }
                }
            }
        }
    }
}

$activeDbFile = null;
$diagnosticLogs = [];

foreach ($cleanCandidates as $path) {
    $exists = file_exists($path);
    $readable = $exists && is_readable($path);
    $writable = $exists && is_writable($path);
    $size = $exists ? @filesize($path) : 0;

    $diagnosticLogs[] = [
        'path' => $path,
        'exists' => $exists,
        'readable' => $readable,
        'writable' => $writable,
        'size' => $size
    ];

    if ($readable && $size > 0 && !$activeDbFile) {
        $activeDbFile = $path;
    }
}

// Preferred destination if we need to create/write from scratch
$preferredDestination = '/home/mifireco/PORTAL/notifier/db.json';
if (!is_dir(dirname($preferredDestination))) {
    @mkdir(dirname($preferredDestination), 0755, true);
}

// -------------------------------------------------------------
// 2. Diagnostic Endpoint (?debug=1 or ?diagnostics=1)
// Allows user to visit /api/db?debug=1 in browser and immediately verify
// -------------------------------------------------------------
if (isset($_GET['debug']) || isset($_GET['diagnostics']) || isset($_GET['test'])) {
    $parsedSample = null;
    if ($activeDbFile && file_exists($activeDbFile)) {
        $content = @file_get_contents($activeDbFile);
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        $decoded = json_decode($content, true);
        if (is_array($decoded)) {
            $parsedSample = [
                'products_count' => isset($decoded['products']) && is_array($decoded['products']) ? count($decoded['products']) : 0,
                'stock_count' => isset($decoded['stock']) && is_array($decoded['stock']) ? count($decoded['stock']) : 0,
                'orders_count' => isset($decoded['orders']) && is_array($decoded['orders']) ? count($decoded['orders']) : 0,
                'webhooks_count' => isset($decoded['webhooks']) && is_array($decoded['webhooks']) ? count($decoded['webhooks']) : 0,
                'field_mappings_count' => isset($decoded['fieldMappings']) && is_array($decoded['fieldMappings']) ? count($decoded['fieldMappings']) : 0,
                'sales_count' => isset($decoded['sales']) && is_array($decoded['sales']) ? count($decoded['sales']) : 0,
            ];
        }
    }

    echo json_encode([
        'status' => 'diagnostic_report',
        'active_database_file' => $activeDbFile,
        'active_file_exists' => $activeDbFile ? file_exists($activeDbFile) : false,
        'parsed_counts' => $parsedSample,
        'system_info' => [
            'php_version' => PHP_VERSION,
            'current_user' => function_exists('get_current_user') ? get_current_user() : 'unknown',
            'script_path' => __FILE__,
            'document_root' => $docRoot,
            'parent_document_root' => $parentDocRoot,
            'open_basedir' => ini_get('open_basedir') ?: 'none'
        ],
        'paths_evaluated' => $diagnosticLogs
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------
// 3. GET: Retrieve Database Content
// -------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($activeDbFile && file_exists($activeDbFile)) {
        $content = @file_get_contents($activeDbFile);
        if (!empty($content)) {
            // Strip potential UTF-8 BOM
            $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                echo $content;
                exit;
            }
        }
    }

    // If active file was not readable or empty, output clean schema with defaults
    http_response_code(200);
    echo json_encode([
        'stock' => [],
        'products' => [],
        'orders' => [],
        'warehouses' => [],
        'users' => [],
        'sales' => [],
        'webhooks' => [],
        'fieldMappings' => [],
        '_warning' => 'Database file not found or empty. Evaluated ' . count($cleanCandidates) . ' paths.'
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
        if (!empty($existingRaw)) {
            $existingRaw = preg_replace('/^\xEF\xBB\xBF/', '', $existingRaw);
            $decoded = json_decode($existingRaw, true);
            if (is_array($decoded)) {
                $existing = $decoded;
            }
        }
    }

    // CRITICAL SAFETY GUARDS: Never overwrite populated lists with empty arrays
    $keysToProtect = ['stock', 'products', 'webhooks', 'fieldMappings', 'orders', 'sales', 'warehouses', 'users'];
    foreach ($keysToProtect as $key) {
        if (isset($data[$key]) && is_array($data[$key]) && count($data[$key]) === 0 && !empty($existing[$key])) {
            unset($data[$key]);
        }
    }

    $merged = array_merge($existing, is_array($data) ? $data : []);
    $json = json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // Determine target save location
    $targetDestination = $activeDbFile;
    if (!$targetDestination || !is_writable(dirname($targetDestination))) {
        if (is_dir(dirname($preferredDestination)) && is_writable(dirname($preferredDestination))) {
            $targetDestination = $preferredDestination;
        } elseif ($docRoot && is_writable($docRoot)) {
            $targetDestination = $docRoot . '/db.json';
        } else {
            $targetDestination = dirname(__DIR__, 2) . '/db.json';
        }
    }

    $written = @file_put_contents($targetDestination, $json, LOCK_EX);

    if ($written !== false) {
        @chmod($targetDestination, 0644);
    }

    echo json_encode([
        'ok' => $written !== false,
        'saved_to' => $targetDestination,
        'bytes' => $written
    ]);
    exit;
}
