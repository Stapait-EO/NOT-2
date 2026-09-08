<?php
// cPanel PHP Proxy Endpoint for Webhooks
// Allows running on standard cPanel/Apache hosting without Node.js

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true);

if (!$inputData || empty($inputData['url'])) {
    http_response_code(400);
    echo json_encode(['error' => 'A URL de destino é obrigatória no corpo da requisição.']);
    exit;
}

$targetUrl = $inputData['url'];
$headers = isset($inputData['headers']) && is_array($inputData['headers']) ? $inputData['headers'] : [];
$body = isset($inputData['body']) ? $inputData['body'] : '';

$curlHeaders = [];
foreach ($headers as $key => $value) {
    $curlHeaders[] = $key . ': ' . $value;
}

$postFields = is_string($body) ? $body : json_encode($body);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 45);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

$startTime = microtime(true);
$response = curl_exec($ch);
$duration = round((microtime(true) - $startTime) * 1000);

if (curl_errno($ch)) {
    $errorMsg = curl_error($ch);
    curl_close($ch);
    http_response_code(500);
    echo json_encode(['error' => 'Erro ao conectar ao endpoint via cURL (cPanel): ' . $errorMsg]);
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$rawHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);
curl_close($ch);

$parsedHeaders = [];
$headerLines = explode("\r\n", $rawHeaders);
foreach ($headerLines as $line) {
    if (strpos($line, ':') !== false) {
        list($k, $v) = explode(':', $line, 2);
        $parsedHeaders[trim(strtolower($k))] = trim($v);
    }
}

$isOk = ($httpCode >= 200 && $httpCode < 300);

echo json_encode([
    'ok' => $isOk,
    'status' => $httpCode,
    'statusText' => $isOk ? 'OK' : 'HTTP Status ' . $httpCode,
    'duration' => (string)$duration,
    'body' => $responseBody,
    'headers' => $parsedHeaders
]);
