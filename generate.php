<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const MIDJOURNEY_BASE_URL = 'https://api.midjourneyapi.io/v2';

$apiKey = getenv('MIDJOURNEY_API_KEY');
if (!$apiKey) {
    respond(500, ['error' => 'Переменная окружения MIDJOURNEY_API_KEY не задана.']);
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'POST':
            handleCreate($apiKey);
            break;
        case 'GET':
            handleStatus($apiKey);
            break;
        case 'DELETE':
            handleCancel($apiKey);
            break;
        default:
            respond(405, ['error' => 'Метод не поддерживается']);
    }
} catch (Throwable $e) {
    respond(500, ['error' => $e->getMessage()]);
}

function handleCreate(string $apiKey): void
{
    $input = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    $prompt = trim((string)($input['prompt'] ?? ''));

    if ($prompt === '') {
        respond(422, ['error' => 'Необходимо указать подсказку для генерации.']);
    }

    $type = ($input['type'] ?? 'image') === 'video' ? 'video' : 'image';

    $payload = [
        'prompt' => $prompt,
        'negative_prompt' => $input['negativePrompt'] ?? null,
        'aspect_ratio' => $input['aspectRatio'] ?? '1:1',
        'style' => $input['style'] ?? 'default',
        'quality' => $input['quality'] ?? 2,
        'remix' => !empty($input['remix']),
        'stealth' => true,
        'mode' => 'relax',
    ];

    if ($type === 'video') {
        $endpoint = MIDJOURNEY_BASE_URL . '/video';
        $payload['duration'] = $input['duration'] ?? 4;
    } else {
        $endpoint = MIDJOURNEY_BASE_URL . '/imagine';
    }

    [$status, $data] = callMidjourney($endpoint, 'POST', $payload, $apiKey);

    if ($status >= 400) {
        respond($status, ['error' => $data['error'] ?? $data['message'] ?? 'Ошибка Midjourney API', 'details' => $data]);
    }

    respond($status, $data);
}

function handleStatus(string $apiKey): void
{
    $jobId = isset($_GET['jobId']) ? trim((string)$_GET['jobId']) : '';
    if ($jobId === '') {
        respond(422, ['error' => 'Не указан идентификатор задачи jobId.']);
    }

    $endpoint = MIDJOURNEY_BASE_URL . '/jobs/' . rawurlencode($jobId);
    [$status, $data] = callMidjourney($endpoint, 'GET', null, $apiKey);

    if ($status >= 400) {
        respond($status, ['error' => $data['error'] ?? $data['message'] ?? 'Ошибка Midjourney API']);
    }

    respond($status, $data);
}

function handleCancel(string $apiKey): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    $jobId = isset($input['jobId']) ? trim((string)$input['jobId']) : '';
    if ($jobId === '') {
        respond(422, ['error' => 'Для отмены требуется jobId.']);
    }

    $endpoint = MIDJOURNEY_BASE_URL . '/jobs/' . rawurlencode($jobId) . '/cancel';
    [$status, $data] = callMidjourney($endpoint, 'POST', null, $apiKey);

    if ($status >= 400) {
        respond($status, ['error' => $data['error'] ?? $data['message'] ?? 'Не удалось отменить задачу']);
    }

    respond($status, $data);
}

/**
 * @param array<string, mixed>|null $payload
 * @return array{0:int,1:array<string,mixed>|null}
 */
function callMidjourney(string $url, string $method, ?array $payload, string $apiKey): array
{
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Не удалось инициализировать запрос.');
    }

    $headers = [
        'Accept: application/json',
        'Authorization: Bearer ' . $apiKey,
    ];

    if ($payload !== null) {
        $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($jsonPayload === false) {
            throw new RuntimeException('Не удалось сериализовать данные.');
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
        $headers[] = 'Content-Type: application/json';
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_TIMEOUT => 60,
    ]);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Ошибка запроса: ' . $error);
    }

    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = null;
    if ($response !== '') {
        $data = json_decode($response, true);
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Неверный JSON в ответе Midjourney API.');
        }
    }

    return [$status, $data ?? []];
}

function respond(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
