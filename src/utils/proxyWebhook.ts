export interface ProxyWebhookPayload {
  url: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface ProxyWebhookResult {
  ok: boolean;
  status: number;
  statusText: string;
  duration: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Executes a webhook through the server proxy with automatic fallback and HTML error protection.
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" in cPanel / Apache environments.
 */
export async function executeProxyWebhook(payload: ProxyWebhookPayload): Promise<ProxyWebhookResult> {
  // Determine potential proxy endpoints based on current URL path
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '');
  const candidateEndpoints = [
    '/api/proxy-webhook',
    basePath ? `${basePath}/api/proxy-webhook` : '',
    'api/proxy-webhook'
  ].filter((p, i, arr) => Boolean(p) && arr.indexOf(p) === i);

  let lastError: any = null;
  let serverReturnedHtml = false;

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const rawText = await response.text();

      // If server returned HTML (e.g. cPanel / Apache returning index.html or 404/500 page)
      if (rawText.trim().startsWith('<') || contentType.includes('text/html')) {
        serverReturnedHtml = true;
        continue;
      }

      // Safe JSON parse
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        serverReturnedHtml = true;
        continue;
      }

      if (!response.ok) {
        throw new Error(data.error || `Erro do servidor proxy (${response.status}): ${data.message || response.statusText}`);
      }

      return data as ProxyWebhookResult;
    } catch (err: any) {
      lastError = err;
      if (!serverReturnedHtml) {
        // Continue or fallback
      }
    }
  }

  // Fallback: Attempt direct browser fetch to target webhook URL
  try {
    const directStartTime = performance.now();
    const directRes = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers || {},
      body: typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)
    });
    const directDuration = (performance.now() - directStartTime).toFixed(0);
    const directText = await directRes.text();
    const directHeaders: Record<string, string> = {};
    directRes.headers.forEach((v, k) => { directHeaders[k] = v; });

    return {
      ok: directRes.ok,
      status: directRes.status,
      statusText: directRes.statusText || (directRes.ok ? 'OK' : 'Error'),
      duration: directDuration,
      body: directText,
      headers: directHeaders
    };
  } catch (directErr: any) {
    if (serverReturnedHtml) {
      throw new Error(
        `O servidor web (cPanel / Apache) retornou HTML ("<!DOCTYPE html>...") em vez de executar o proxy da API (/api/proxy-webhook).\n\n` +
        `Causa identificada:\n` +
        `• No cPanel, a requisição para "/api/proxy-webhook" foi capturada pela regra de reescrita do Apache (.htaccess) e retornou a página inicial "index.html" (erro típico de SPA sem backend configurado).\n` +
        `• A tentativa alternativa de conexão direta pelo navegador também falhou devido à política de CORS do endpoint de destino: ${directErr.message || 'Bloqueio de CORS'}.\n\n` +
        `Como solucionar no cPanel:\n` +
        `1. Arquivo PHP nativo: Foi incluído o arquivo 'api/proxy-webhook/index.php' que roda automaticamente em qualquer hospedagem cPanel com PHP (cURL).\n` +
        `2. Se estiver usando o Node.js no cPanel: Acesse o "Setup Node.js App" no cPanel e verifique se a aplicação está em estado "Running" com o comando 'npm start' ou arquivo de entrada 'app.js'.`
      );
    }

    throw lastError || directErr;
  }
}
