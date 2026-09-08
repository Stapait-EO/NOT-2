import express from "express";
import path from "path";
import fs from "fs";

// Global crash and error diagnostics
process.on('uncaughtException', (err) => {
  const errLog = `[CRITICAL UNCAUGHT EXCEPTION] ${new Date().toISOString()}: ${err.stack || err}\n`;
  console.error(errLog);
  try {
    fs.appendFileSync(path.join(process.cwd(), 'debug_error.log'), errLog, 'utf-8');
  } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
  const errLog = `[CRITICAL UNHANDLED REJECTION] ${new Date().toISOString()}: ${reason}\n`;
  console.error(errLog);
  try {
    fs.appendFileSync(path.join(process.cwd(), 'debug_error.log'), errLog, 'utf-8');
  } catch (_) {}
});

const DB_FILE = path.join(process.cwd(), "db.json");

// Rolling in-memory log of recent requests for debug inspection
const recentRequests: Array<{
  timestamp: string;
  method: string;
  url: string;
  originalUrl: string;
  ip: string;
  status?: number;
  query: any;
  headers: Record<string, string | string[] | undefined>;
}> = [];

function logRequest(req: express.Request, res: express.Response) {
  const reqInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    ip: req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
    query: req.query,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
      referer: req.headers.referer,
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
    }
  };

  if (recentRequests.length >= 100) {
    recentRequests.shift();
  }
  recentRequests.push(reqInfo);

  console.log(`[REQUEST] ${reqInfo.timestamp} | ${req.method} ${req.originalUrl} | IP: ${reqInfo.ip}`);
}

const INITIAL_DB = {
  products: [
    { code: 'PROD001', name: 'Notebook Dell Inspiron 15', category: 'Informática', pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', avgQty1x: 12, avgQty3x: 36 },
    { code: 'PROD002', name: 'Monitor LG UltraWide 29"', category: 'Monitores', pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', avgQty1x: 8, avgQty3x: 24 },
    { code: 'PROD003', name: 'Teclado Mecânico Keychron K2', category: 'Acessórios', pr_cod: 10003, codigo: 'PROD000003', lote: 'LOTE000003', avgQty1x: 25, avgQty3x: 75 },
    { code: 'PROD004', name: 'Mouse Sem Fio Logitech MX Master 3', category: 'Acessórios', pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', avgQty1x: 40, avgQty3x: 120 },
    { code: 'PROD005', name: 'Headset Gamer HyperX Cloud II', category: 'Áudio', pr_cod: 10005, codigo: 'PROD000005', lote: 'LOTE000005', avgQty1x: 15, avgQty3x: 45 },
    { code: 'PROD006', name: 'Smartphone Samsung Galaxy S23', category: 'Celulares', pr_cod: 10006, codigo: 'PROD000006', lote: 'LOTE000006', avgQty1x: 10, avgQty3x: 30 }
  ],
  warehouses: [
    { id: 'wh-1', name: '0002.001', isActive: true, groupName: 'Deposito Central' },
    { id: 'wh-2', name: '0002.004', isActive: true, groupName: 'Deposito Central' },
    { id: 'wh-3', name: '0004.001', isActive: true, groupName: 'Deposito Sul' },
    { id: 'wh-4', name: '0004.003', isActive: true, groupName: 'Deposito Sul' },
    { id: 'wh-5', name: '0004.0004', isActive: true, groupName: 'Deposito Sul' },
    { id: 'wh-6', name: 'DEP01 - Depósito Central', isActive: true, groupName: 'Deposito Central' },
    { id: 'wh-7', name: 'DEP02 - Depósito Auxiliar', isActive: true, groupName: '' },
    { id: 'wh-8', name: 'DEP03 - Logística Reversa/Rápida', isActive: true, groupName: '' }
  ],
  stock: [
    { id: 'stk-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', warehouse: 'DEP01 - Depósito Central', quantity: 12, pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', pr_preco: 3899.90, vlrest: 3899.90 },
    { id: 'stk-2', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 5, pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', pr_preco: 3899.90, vlrest: 3899.90 },
    { id: 'stk-3', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', warehouse: 'DEP01 - Depósito Central', quantity: 4, pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', pr_preco: 1299.00, vlrest: 1299.00 },
    { id: 'stk-4', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', warehouse: 'DEP03 - Logística Reversa/Rápida', quantity: 6, pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', pr_preco: 1299.00, vlrest: 1299.00 },
    { id: 'stk-5', productCode: 'PROD003', productName: 'Teclado Mecânico Keychron K2', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 18, pr_cod: 10003, codigo: 'PROD000003', lote: 'LOTE000003', pr_preco: 650.00, vlrest: 650.00 },
    { id: 'stk-6', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', warehouse: 'DEP01 - Depósito Central', quantity: 45, pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', pr_preco: 499.00, vlrest: 499.00 },
    { id: 'stk-7', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 15, pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', pr_preco: 499.00, vlrest: 499.00 },
    { id: 'stk-8', productCode: 'PROD005', productName: 'Headset Gamer HyperX Cloud II', warehouse: 'DEP03 - Logística Reversa/Rápida', quantity: 2, pr_cod: 10005, codigo: 'PROD000005', lote: 'LOTE000005', pr_preco: 549.90, vlrest: 549.90 },
    { id: 'stk-9', productCode: 'PROD006', productName: 'Smartphone Samsung Galaxy S23', warehouse: 'DEP01 - Depósito Central', quantity: 0, pr_cod: 10006, codigo: 'PROD000006', lote: 'LOTE000006', pr_preco: 4200.00, vlrest: 4200.00 }
  ],
  orders: [
    {
      id: 'ord-1001',
      orderNumber: 'PED-1001',
      clientName: 'Tech Solutions Paulista Ltda',
      date: '2026-07-10',
      priority: 'Alta',
      items: [
        { id: 'itm-1-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', quantityOrdered: 8, unitPrice: 3899.90 },
        { id: 'itm-1-2', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', quantityOrdered: 10, unitPrice: 499.00 }
      ],
      notes: 'Cliente solicitou entrega prioritária no período da manhã.'
    },
    {
      id: 'ord-1002',
      orderNumber: 'PED-1002',
      clientName: 'Distribuidora Global Varejo',
      date: '2026-07-12',
      priority: 'Média',
      items: [
        { id: 'itm-2-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', quantityOrdered: 10, unitPrice: 3899.90 },
        { id: 'itm-2-2', productCode: 'PROD005', productName: 'Headset Gamer HyperX Cloud II', quantityOrdered: 12, unitPrice: 549.90 },
        { id: 'itm-2-3', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', quantityOrdered: 5, unitPrice: 1299.00 }
      ],
      notes: 'Aguardando liberação de crédito para despacho completo.'
    },
    {
      id: 'ord-1003',
      orderNumber: 'PED-1003',
      clientName: 'Mariana Silva de Souza',
      date: '2026-07-13',
      priority: 'Baixa',
      items: [
        { id: 'itm-3-1', productCode: 'PROD003', productName: 'Teclado Mecânico Keychron K2', quantityOrdered: 3, unitPrice: 650.00 },
        { id: 'itm-3-2', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', quantityOrdered: 8, unitPrice: 1299.00 }
      ],
      notes: 'Compra via e-commerce.'
    },
    {
      id: 'ord-1004',
      orderNumber: 'PED-1004',
      clientName: 'Alfa Engenharia e Sistemas',
      date: '2026-07-14',
      priority: 'Alta',
      items: [
        { id: 'itm-4-1', productCode: 'PROD006', productName: 'Smartphone Samsung Galaxy S23', quantityOrdered: 2, unitPrice: 4200.00 },
        { id: 'itm-4-2', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', quantityOrdered: 5, unitPrice: 499.00 }
      ],
      notes: 'Retirada agendada pelo cliente.'
    }
  ],
  users: [
    {
      id: 'user-admin',
      username: 'admin',
      fullName: 'Administrador Geral',
      passwordHash: 'admin',
      createdAt: '2026-07-14T00:00:00.000Z',
      role: 'admin'
    },
    {
      id: 'user-vendedor',
      username: 'vendedor',
      fullName: 'Carlos Vendedor',
      passwordHash: 'vendedor',
      createdAt: '2026-07-14T00:00:00.000Z',
      role: 'vendedor'
    },
    {
      id: 'user-almoxarife',
      username: 'almoxarife',
      fullName: 'João Almoxarife',
      passwordHash: 'almoxarife',
      createdAt: '2026-07-14T00:00:00.000Z',
      role: 'almoxarife'
    }
  ],
  webhooks: [
    {
      id: 'wh-1',
      seq: 1,
      tableName: 'StockBalance',
      url: 'https://api.empresa.com/v1/stock-updates',
      secretKey: 'sec_stock_123456789',
      filterCondition: 'quantity > 0',
      createdAt: '2026-07-14T09:00:00.000Z',
      isActive: true
    },
    {
      id: 'wh-2',
      seq: 2,
      tableName: 'OrderHeader',
      url: 'https://api.empresa.com/v1/new-orders',
      secretKey: 'sec_orders_987654321',
      filterCondition: 'priority == "Alta"',
      createdAt: '2026-07-14T09:10:00.000Z',
      isActive: true
    },
    {
      id: 'wh-3',
      seq: 3,
      tableName: 'ProdutosSistema',
      url: 'https://api.empresa.com/v1/sistema-products',
      secretKey: 'sec_sistema_333333333',
      filterCondition: 'status == "active"',
      createdAt: '2026-07-14T09:20:00.000Z',
      isActive: true
    }
  ],
  fieldMappings: [
    {
      id: 'map-1',
      webhookId: 'wh-1',
      systemTable: 'StockBalance',
      mappings: {
        id: 'id_estoque',
        productCode: 'codigo_produto',
        productName: 'nome_produto',
        warehouse: 'deposito',
        quantity: 'quantidade_atual'
      },
      updatedAt: '2026-07-14T09:00:00.000Z'
    },
    {
      id: 'map-2',
      webhookId: 'wh-2',
      systemTable: 'OrderHeader',
      mappings: {
        id: 'id_pedido',
        orderNumber: 'numero_controle',
        clientName: 'cliente',
        date: 'data_criacao',
        priority: 'prioridade_envio',
        notes: 'observacao_pedido'
      },
      updatedAt: '2026-07-14T09:10:00.000Z'
    },
    {
      id: 'map-3',
      webhookId: 'wh-3',
      systemTable: 'ProdutosSistema',
      mappings: {
        orderNumber: 'numero_pedido',
        itemProductCode: 'codigo_produto',
        itemQuantity: 'quantidade',
        itemUnitPrice: 'preco_unitario'
      },
      updatedAt: '2026-07-14T09:20:00.000Z'
    }
  ],
  sales: []
};

// Helper to read DB safely with file existence validation
function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Erro ao ler db.json, usando padrão", err);
  }
  // Initialize with default
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao criar db.json padrão", err);
  }
  return INITIAL_DB;
}

// Helper to write DB safely
function writeDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Erro ao escrever db.json", err);
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Global Request Logging Middleware
  app.use((req, res, next) => {
    logRequest(req, res);
    next();
  });

  // JSON parsing middleware
  app.use(express.json({ limit: '20mb' }));

  // Debug Diagnostics Endpoint (accessible via multiple aliases for easy testing in browser)
  const handleDebug = (req: express.Request, res: express.Response) => {
    let filesInCwd: string[] = [];
    try {
      filesInCwd = fs.readdirSync(process.cwd());
    } catch (e: any) {
      filesInCwd = [`Erro ao listar cwd: ${e.message}`];
    }

    let distPath = path.join(process.cwd(), 'dist');
    let distExists = fs.existsSync(distPath);
    let filesInDist: string[] = [];
    if (distExists) {
      try {
        filesInDist = fs.readdirSync(distPath);
      } catch (e: any) {
        filesInDist = [`Erro ao listar dist: ${e.message}`];
      }
    }

    let dbExists = fs.existsSync(DB_FILE);
    let dbWritable = false;
    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
      dbWritable = true;
    } catch (_) {
      dbWritable = false;
    }

    res.json({
      status: "online",
      serverTime: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      processId: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      cwd: process.cwd(),
      dirname: __dirname,
      configuredPort: PORT,
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || 'default 3000',
        PASSENGER_APP_ENV: process.env.PASSENGER_APP_ENV || null
      },
      fileChecks: {
        distPath,
        distExists,
        indexHtmlExists: fs.existsSync(path.join(distPath, 'index.html')) || fs.existsSync(path.join(__dirname, 'index.html')),
        dbFileLocation: DB_FILE,
        dbExists,
        directoryWritable: dbWritable,
        filesInCwd,
        filesInDist
      },
      currentIncomingRequest: {
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        headers: req.headers,
        query: req.query
      },
      recentRequestsLog: recentRequests.slice(-30)
    });
  };

  // Register Debug Routes
  app.get("/api/debug", handleDebug);
  app.get("/debug", handleDebug);
  app.get("/notifier/api/debug", handleDebug);
  app.get("/notifier/debug", handleDebug);

  // Health check endpoints
  app.get(["/api/health", "/health", "/notifier/api/health"], (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), service: "notifier" });
  });

  // Get full DB state
  app.get(["/api/db", "/notifier/api/db"], (req, res) => {
    res.json(readDB());
  });

  // Update DB state
  app.post(["/api/db", "/notifier/api/db"], (req, res) => {
    const currentData = readDB();
    const newData = { ...currentData, ...req.body };
    const success = writeDB(newData);
    if (success) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: "Erro ao salvar banco de dados." });
    }
  });

  // API proxy endpoint to bypass CORS and browser HTTP limitations
  app.post(["/api/proxy-webhook", "/notifier/api/proxy-webhook"], async (req, res) => {
    const { url, headers, body } = req.body;
    if (!url) {
      return res.status(400).json({ error: "A URL de destino é obrigatória." });
    }

    try {
      const startTime = performance.now();
      const response = await fetch(url, {
        method: 'POST',
        headers: headers || {},
        body: typeof body === 'string' ? body : JSON.stringify(body)
      });
      const duration = (performance.now() - startTime).toFixed(0);

      const text = await response.text();
      const resHeaders: { [key: string]: string } = {};
      response.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      res.json({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration,
        body: text,
        headers: resHeaders
      });
    } catch (err: any) {
      res.status(500).json({
        error: `Erro ao fazer requisição do servidor: ${err.message || 'Falha na conexão'}`
      });
    }
  });

  // SSO Token Validation Proxy Route
  app.post(["/api/auth/sso-validate", "/notifier/api/auth/sso-validate"], async (req, res) => {
    const { token, appId = 'app_notifier', portalUrl } = req.body;
    if (!token) {
      return res.status(400).json({ valid: false, error: "Token de autenticação não fornecido." });
    }

    const baseValidateUrl = portalUrl || 'https://mifireapp.com.br/login/api/auth/validate';
    const targetUrl = `${baseValidateUrl}?app_id=${encodeURIComponent(appId)}`;

    try {
      const ssoRes = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      const data = await ssoRes.json();
      return res.status(ssoRes.status).json(data);
    } catch (err: any) {
      console.error("Erro ao validar token SSO no servidor:", err);
      return res.status(500).json({
        valid: false,
        error: `Falha de comunicação com o Portal SSO: ${err.message || 'Erro de rede'}`
      });
    }
  });

  // Serve static files in production, use Vite middleware in dev
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Find dist path accurately whether running from root, cwd, or within dist/
    let distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
      if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        distPath = __dirname;
      }
    }

    // Serve static files from root AND from /notifier prefix
    app.use(express.static(distPath));
    app.use("/notifier", express.static(distPath));

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BOOT] Server started successfully on port ${PORT} at ${new Date().toISOString()}`);
    console.log(`[BOOT] Working Directory: ${process.cwd()}`);
  });
}

startServer();
