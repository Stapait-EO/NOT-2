import { WebhookConfig, FieldMapping, Product, OrderHeader, OrderItem, StockBalance, Warehouse, SaleRecord } from '../types';
import { executeProxyWebhook } from './proxyWebhook';

export interface SyncResult<T> {
  success: boolean;
  count: number;
  data?: T;
  logs: string[];
  rawResponse?: string;
  rejectedCount?: number;
  rejectedItems?: any[];
  error?: string;
  newWarehouses?: Warehouse[];
}

export interface AutoSyncSummary {
  executedCount: number;
  successfulCount: number;
  failedCount: number;
  results: {
    webhookId: string;
    webhookName: string;
    target: string;
    success: boolean;
    count: number;
    error?: string;
  }[];
  timestamp: string;
}

/**
 * Parses monetary values formatted as Brazilian Real (e.g., "1.234,56" or "R$ 12,50") or standard floats.
 */
export function parseWebhookMonetary(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Remove currency symbol and spaces
  str = str.replace(/[R$\s]/g, '');

  // If there's a dot and NO comma (e.g. 12.50 or 1.250), convert dot to comma first for unified handling
  if (str.includes('.') && !str.includes(',')) {
    str = str.replace(/\./g, ',');
  }

  // Convert decimal comma to standard JS dot
  if (str.includes(',')) {
    const lastCommaIndex = str.lastIndexOf(',');
    let before = str.substring(0, lastCommaIndex);
    const after = str.substring(lastCommaIndex + 1);
    before = before.replace(/[\.,]/g, '');
    str = before + '.' + after;
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Standardizes raw date strings into 'YYYY-MM-DD'.
 */
export function parseWebhookDate(rawDate: any): string {
  if (!rawDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const str = String(rawDate).trim();

  // Handle YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    const yyyy = str.substring(0, 4);
    const mm = str.substring(4, 6);
    const dd = str.substring(6, 8);
    return `${yyyy}-${mm}-${dd}`;
  }

  // Handle YYYY/MM/DD or YYYY-MM-DD
  if (/^\d{4}[\/\-]\d{2}[\/\-]\d{2}$/.test(str)) {
    return str.replace(/\//g, '-');
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(str)) {
    const separator = str.includes('/') ? '/' : '-';
    const parts = str.split(separator);
    const dd = parts[0];
    const mm = parts[1];
    const yyyy = parts[2];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback to native Date
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch {}

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolves mapped field values, supporting simple key lookups and basic math expressions.
 */
export function resolveMappedValue(item: any, mappingKey: string | undefined): any {
  if (!mappingKey) return undefined;
  const trimmedKey = String(mappingKey).trim();
  if (!trimmedKey) return undefined;

  const hasOperators = /[\+\-\*\/\(\)]/.test(trimmedKey);
  if (!hasOperators) {
    return item[trimmedKey];
  }

  try {
    let expr = trimmedKey;
    const varRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    const variablesFound = new Set<string>();

    while ((match = varRegex.exec(trimmedKey)) !== null) {
      variablesFound.add(match[0]);
    }

    variablesFound.forEach(varName => {
      const val = item[varName];
      const numericVal = (val !== undefined && val !== null) ? parseWebhookMonetary(val) : 0;
      const safeVarName = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp('\\b' + safeVarName + '\\b', 'g');
      expr = expr.replace(regex, String(numericVal));
    });

    const sanitized = expr.replace(/[^0-9.+\-*/() ]/g, '');
    if (!sanitized.trim()) return undefined;

    const result = new Function(`return (${sanitized})`)();
    return isNaN(result) || !isFinite(result) ? 0 : result;
  } catch {
    return undefined;
  }
}

/**
 * Case-insensitive field resolution with fallbacks.
 */
export function resolveWebhookField(item: any, configuredKey?: string, fallbackKeys: string[] = []): any {
  if (!item || typeof item !== 'object') return undefined;

  // 1. Check configured key
  if (configuredKey && typeof configuredKey === 'string' && configuredKey.trim()) {
    const trimmed = configuredKey.trim();
    if (item[trimmed] !== undefined && item[trimmed] !== null && item[trimmed] !== '') {
      return item[trimmed];
    }
    const lower = trimmed.toLowerCase();
    const foundKey = Object.keys(item).find(k => k.trim().toLowerCase() === lower);
    if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null && item[foundKey] !== '') {
      return item[foundKey];
    }
  }

  // 2. Check fallback keys
  for (const fb of fallbackKeys) {
    if (item[fb] !== undefined && item[fb] !== null && item[fb] !== '') {
      return item[fb];
    }
    const lowerFb = fb.toLowerCase();
    const foundFb = Object.keys(item).find(k => k.trim().toLowerCase() === lowerFb);
    if (foundFb && item[foundFb] !== undefined && item[foundFb] !== null && item[foundFb] !== '') {
      return item[foundFb];
    }
  }

  return undefined;
}

/**
 * Searches an object for the first or largest array of records.
 */
export function findArrayInObject(obj: any, path = ''): { array: any[]; path: string } | null {
  if (Array.isArray(obj)) {
    return { array: obj, path: path || 'root' };
  }
  if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj);
    for (const k of keys) {
      if (Array.isArray(obj[k])) {
        const currentPath = path ? `${path}.${k}` : k;
        return { array: obj[k], path: currentPath };
      }
    }
    for (const k of keys) {
      if (obj[k] && typeof obj[k] === 'object') {
        const currentPath = path ? `${path}.${k}` : k;
        const result = findArrayInObject(obj[k], currentPath);
        if (result) return result;
      }
    }
  }
  return null;
}

/**
 * Helper to identify which screen a webhook targets.
 */
export function getWebhookTargetScreen(wh: WebhookConfig): 'products' | 'orders' | 'stock' | 'sales' | 'users' | null {
  if (wh.targetScreen) {
    const t = wh.targetScreen.trim().toLowerCase();
    if (t === 'products' || t === 'orders' || t === 'stock' || t === 'sales' || t === 'users') {
      return t as any;
    }
  }

  // Fallback by table name
  const name = (wh.tableName || '').trim().toLowerCase();
  if (name.includes('prd') || name.includes('prod') || name.includes('produto')) {
    return 'products';
  }
  if (name.includes('ped') || name.includes('order') || name.includes('pedido')) {
    return 'orders';
  }
  if (name.includes('stk') || name.includes('stock') || name.includes('estoque') || name.includes('saldo')) {
    return 'stock';
  }
  if (name.includes('est_not') || name.includes('sale') || name.includes('venda')) {
    return 'sales';
  }
  if (name.includes('user') || name.includes('usuari')) {
    return 'users';
  }

  return null;
}

/**
 * Executes a sync for Products from the specified webhook.
 */
export async function syncProductsWebhook(
  webhook: WebhookConfig,
  fieldMappings: FieldMapping[]
): Promise<SyncResult<Product[]>> {
  const logs: string[] = [];
  const addLog = (m: string) => logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`);

  try {
    addLog(`Iniciando sincronização de Produtos com Webhook: "${webhook.tableName}" (${webhook.url})`);

    const requestBody = {
      tabela: webhook.tableName,
      condicao: webhook.filterCondition,
      $condicao: webhook.filterCondition
    };

    const res = await executeProxyWebhook({
      url: webhook.url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
        'X-API-Key': `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
      },
      body: requestBody
    });

    if (!res.ok) {
      throw new Error(`Servidor do Webhook retornou status ${res.status}: ${res.statusText || 'Erro'}`);
    }

    if (!res.body) {
      throw new Error('Servidor retornou corpo de resposta vazio.');
    }

    const responseData = JSON.parse(res.body);
    const searchRes = findArrayInObject(responseData);
    const itemsArray = searchRes ? searchRes.array : [responseData];

    const mapping = fieldMappings.find(
      m => m.webhookId === webhook.id && m.systemTable.trim().toLowerCase() === 'product'
    );

    const validImportedItems: Product[] = [];
    const rejectedItems: any[] = [];
    const systemFields = ['code', 'name', 'category', 'pr_cod', 'codigo', 'lote', 'avgQty1x', 'avgQty3x'];

    itemsArray.forEach((webhookItem: any, index: number) => {
      const mappedItem: any = {};
      systemFields.forEach(sysKey => {
        const webhookKey = mapping?.mappings[sysKey];
        if (webhookKey !== undefined) {
          mappedItem[sysKey] = resolveMappedValue(webhookItem, webhookKey);
        } else if (webhookItem[sysKey] !== undefined) {
          mappedItem[sysKey] = webhookItem[sysKey];
        }
      });

      const code = mappedItem.code || mappedItem.pr_cod || mappedItem.codigo ||
                   webhookItem.code || webhookItem.sku || webhookItem.productCode || webhookItem.pr_cod || webhookItem.codigo;
      const name = mappedItem.name || webhookItem.name || webhookItem.productName || webhookItem.nome || webhookItem.descricao;

      if (!code || !name) {
        rejectedItems.push({ item: webhookItem, reason: `Item #${index + 1}: SKU ou Nome ausente` });
        return;
      }

      const category = mappedItem.category || webhookItem.category || webhookItem.categoria || 'Geral';
      const pr_cod = mappedItem.pr_cod !== undefined ? Number(mappedItem.pr_cod) : (webhookItem.pr_cod !== undefined ? Number(webhookItem.pr_cod) : undefined);
      const codigo = mappedItem.codigo || webhookItem.codigo || undefined;
      const lote = mappedItem.lote || webhookItem.lote || undefined;

      let avgQty1x = 0;
      const rawAvgQty1x = mappedItem.avgQty1x !== undefined ? mappedItem.avgQty1x : webhookItem.avgQty1x;
      if (rawAvgQty1x !== undefined && rawAvgQty1x !== null) {
        avgQty1x = Math.round(Number(rawAvgQty1x)) || 0;
      }

      let avgQty3x = 0;
      const rawAvgQty3x = mappedItem.avgQty3x !== undefined ? mappedItem.avgQty3x : webhookItem.avgQty3x;
      if (rawAvgQty3x !== undefined && rawAvgQty3x !== null) {
        avgQty3x = Math.round(Number(rawAvgQty3x)) || 0;
      }

      validImportedItems.push({
        code: String(code).trim(),
        name: String(name).trim(),
        category: String(category).trim(),
        pr_cod,
        codigo: codigo ? String(codigo).trim() : undefined,
        lote: lote ? String(lote).trim() : undefined,
        avgQty1x,
        avgQty3x
      });
    });

    addLog(`Sincronização concluída: ${validImportedItems.length} produtos válidos importados.`);

    return {
      success: true,
      count: validImportedItems.length,
      data: validImportedItems,
      logs,
      rawResponse: res.body,
      rejectedCount: rejectedItems.length,
      rejectedItems
    };
  } catch (err: any) {
    addLog(`Erro ao sincronizar produtos: ${err.message}`);
    return {
      success: false,
      count: 0,
      logs,
      error: err.message || 'Erro desconhecido'
    };
  }
}

/**
 * Executes a sync for Orders from the specified webhook.
 */
export async function syncOrdersWebhook(
  webhook: WebhookConfig,
  allWebhooks: WebhookConfig[],
  fieldMappings: FieldMapping[],
  products: Product[]
): Promise<SyncResult<Omit<OrderHeader, 'id'>[]>> {
  const logs: string[] = [];
  const addLog = (m: string) => logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`);

  try {
    addLog(`Iniciando sincronização de Pedidos com Webhook: "${webhook.tableName}"`);

    const requestBody = {
      tabela: webhook.tableName,
      condicao: webhook.filterCondition,
      $condicao: webhook.filterCondition
    };

    const res = await executeProxyWebhook({
      url: webhook.url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
        'X-API-Key': `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
      },
      body: requestBody
    });

    if (!res.ok) {
      throw new Error(`Servidor do Webhook retornou status ${res.status}: ${res.statusText || 'Erro'}`);
    }

    const responseData = JSON.parse(res.body);
    const searchRes = findArrayInObject(responseData);
    const itemsArray = searchRes ? searchRes.array : [responseData];

    const mapping = fieldMappings.find(
      m => m.webhookId === webhook.id && (
        m.systemTable.trim().toLowerCase() === 'orderheader' ||
        m.systemTable.trim().toLowerCase() === 'orders' ||
        m.systemTable.trim().toLowerCase() === 'pedidos'
      )
    );

    // Detect if any SISTEMA item exists
    let hasAnySistema = false;
    itemsArray.forEach((webhookItem) => {
      let rawItemsList: any[] = [];
      const possibleItemsKeys = ['items', 'itens', 'orderItems', 'produtos', 'lines', 'line_items'];
      const mappedItemsKey = mapping?.mappings['items'];
      if (mappedItemsKey && Array.isArray(webhookItem[mappedItemsKey])) {
        rawItemsList = webhookItem[mappedItemsKey];
      } else {
        for (const key of possibleItemsKeys) {
          if (Array.isArray(webhookItem[key])) {
            rawItemsList = webhookItem[key];
            break;
          }
        }
      }
      if (rawItemsList.length === 0) rawItemsList = [webhookItem];

      rawItemsList.forEach((rawItem) => {
        const mappedProdCodeKey = mapping?.mappings['itemProductCode'];
        const itemProdCode = mappedProdCodeKey && rawItem[mappedProdCodeKey] !== undefined
          ? rawItem[mappedProdCodeKey]
          : (rawItem.productCode || rawItem.sku || rawItem.code || rawItem.pr_cod || rawItem.codigo);
        const itemNameRaw = rawItem.productName || rawItem.name || rawItem.descricao || '';
        if (String(itemProdCode || '').trim().toUpperCase() === 'SISTEMA' ||
            String(itemNameRaw || '').trim().toUpperCase() === 'SISTEMA') {
          hasAnySistema = true;
        }
      });
    });

    let api3ItemsArray: any[] = [];
    let mapping3: FieldMapping | undefined = undefined;

    if (hasAnySistema) {
      const webhook3 = allWebhooks.find(wh => wh.seq === 3 || wh.id === 'wh-3' || wh.id === '3');
      if (webhook3 && webhook3.isActive) {
        addLog(`Item "SISTEMA" detectado! Executando API 3 secundária (${webhook3.tableName})...`);
        try {
          const res3 = await executeProxyWebhook({
            url: webhook3.url,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${webhook3.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
              'X-API-Key': `${webhook3.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
            },
            body: {
              tabela: webhook3.tableName,
              condicao: webhook3.filterCondition,
              $condicao: webhook3.filterCondition
            }
          });
          if (res3.ok && res3.body) {
            const data3 = JSON.parse(res3.body);
            const search3 = findArrayInObject(data3);
            api3ItemsArray = search3 ? search3.array : [data3];
            mapping3 = fieldMappings.find(m => m.webhookId === webhook3.id);
            addLog(`API 3 retornou ${api3ItemsArray.length} registros para substituir itens SISTEMA.`);
          }
        } catch (e3: any) {
          addLog(`Aviso: Falha ao chamar API 3: ${e3.message}`);
        }
      }
    }

    const validImportedItems: Omit<OrderHeader, 'id'>[] = [];
    const rejectedItems: any[] = [];

    itemsArray.forEach((webhookItem: any, index: number) => {
      const mappedHeader: any = {};
      const headerFields = ['orderNumber', 'clientName', 'date', 'priority', 'notes', 'items'];
      headerFields.forEach(sysKey => {
        const webhookKey = mapping?.mappings[sysKey];
        if (webhookKey && webhookItem[webhookKey] !== undefined) {
          mappedHeader[sysKey] = webhookItem[webhookKey];
        } else if (webhookItem[sysKey] !== undefined) {
          mappedHeader[sysKey] = webhookItem[sysKey];
        }
      });

      const orderNumberRaw = mappedHeader.orderNumber || webhookItem.orderNumber || webhookItem.order_number || webhookItem.numero || webhookItem.numero_pedido || webhookItem.id || webhookItem.pedido;
      const clientNameRaw = mappedHeader.clientName || webhookItem.clientName || webhookItem.client || webhookItem.cliente || webhookItem.customer;
      const dateRaw = mappedHeader.date || webhookItem.date || webhookItem.data || webhookItem.data_pedido || webhookItem.emissao;
      const priorityRaw = mappedHeader.priority || webhookItem.priority || webhookItem.prioridade || 'Média';
      const notesRaw = mappedHeader.notes || webhookItem.notes || webhookItem.observacoes || '';

      if (!orderNumberRaw || !clientNameRaw) {
        rejectedItems.push({ item: webhookItem, reason: `Pedido #${index + 1}: Número de pedido ou cliente ausente` });
        return;
      }

      let priority: 'Alta' | 'Média' | 'Baixa' = 'Média';
      const prioStr = String(priorityRaw).trim().toLowerCase();
      if (prioStr.startsWith('alt') || prioStr === 'high') priority = 'Alta';
      else if (prioStr.startsWith('baix') || prioStr === 'low') priority = 'Baixa';

      const dateVal = parseWebhookDate(dateRaw);

      let rawItemsList: any[] = [];
      const possibleItemsKeys = ['items', 'itens', 'orderItems', 'produtos', 'lines', 'line_items'];
      const mappedItemsKey = mapping?.mappings['items'];
      if (mappedItemsKey && Array.isArray(webhookItem[mappedItemsKey])) {
        rawItemsList = webhookItem[mappedItemsKey];
      } else {
        for (const key of possibleItemsKeys) {
          if (Array.isArray(webhookItem[key])) {
            rawItemsList = webhookItem[key];
            break;
          }
        }
      }
      if (rawItemsList.length === 0) rawItemsList = [webhookItem];

      const compiledOrderItems: OrderItem[] = [];
      let orderRejected = false;
      let rejectReason = '';
      let hasSistemaItem = false;

      for (let itemIdx = 0; itemIdx < rawItemsList.length; itemIdx++) {
        const rawItem = rawItemsList[itemIdx];
        const mappedProdCodeKey = mapping?.mappings['itemProductCode'];
        const itemProdCode = mappedProdCodeKey && rawItem[mappedProdCodeKey] !== undefined
          ? rawItem[mappedProdCodeKey]
          : (rawItem.productCode || rawItem.sku || rawItem.code || rawItem.pr_cod || rawItem.codigo || rawItem.cod || rawItem.productId);

        const rawNameKey = mapping?.mappings['itemName'] || 'productName';
        const itemNameRaw = rawItem[rawNameKey] || rawItem.productName || rawItem.name || rawItem.descricao || '';

        const isSistema = String(itemProdCode || '').trim().toUpperCase() === 'SISTEMA' ||
                          String(itemNameRaw || '').trim().toUpperCase() === 'SISTEMA';

        if (isSistema) {
          hasSistemaItem = true;
          continue;
        }

        if (!itemProdCode) {
          orderRejected = true;
          rejectReason = `Código de produto ausente na linha #${itemIdx + 1} do pedido ${orderNumberRaw}`;
          break;
        }

        const codeStr = String(itemProdCode).trim().toLowerCase();
        const matchedProd = products.find(p => {
          const matchCode = String(p.code).trim().toLowerCase() === codeStr;
          const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr;
          const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr;
          return matchCode || matchPrCod || matchCodigo;
        });

        if (!matchedProd) {
          orderRejected = true;
          rejectReason = `Produto "${itemProdCode}" não existe no cadastro`;
          break;
        }

        const rawQtyKey = mapping?.mappings['itemQuantity'] || 'quantityOrdered';
        const rawQty = rawItem[rawQtyKey] !== undefined ? rawItem[rawQtyKey] : (rawItem.quantityOrdered || rawItem.quantity || rawItem.quantidade || rawItem.qtd);
        const quantityOrdered = Number(rawQty !== undefined ? rawQty : 1);

        const rawPriceKey = mapping?.mappings['itemUnitPrice'] || 'unitPrice';
        const mappedPrice = rawItem[rawPriceKey] !== undefined ? resolveMappedValue(rawItem, rawPriceKey) : undefined;
        const finalPriceRaw = mappedPrice !== undefined ? mappedPrice : (rawItem.unitPrice || rawItem.price || rawItem.preco || rawItem.valor);
        const unitPrice = finalPriceRaw !== undefined ? parseWebhookMonetary(finalPriceRaw) : ((matchedProd as any).pr_preco || 0);

        compiledOrderItems.push({
          id: `itm-${Date.now()}-${itemIdx}-${Math.floor(Math.random() * 1000)}`,
          productCode: matchedProd.code,
          productName: matchedProd.name,
          quantityOrdered,
          unitPrice
        });
      }

      if (hasSistemaItem && !orderRejected && api3ItemsArray.length > 0) {
        api3ItemsArray.forEach((api3Item, api3Idx) => {
          const api3OrderNumKey = mapping3?.mappings['orderNumber'];
          const api3OrderNum = api3OrderNumKey && api3Item[api3OrderNumKey] !== undefined
            ? api3Item[api3OrderNumKey]
            : (api3Item.orderNumber || api3Item.order_number || api3Item.numero_pedido || api3Item.numero || api3Item.pedido);

          if (String(api3OrderNum || '').trim().toUpperCase() === String(orderNumberRaw).trim().toUpperCase()) {
            const api3ProdCodeKey = mapping3?.mappings['itemProductCode'] || mapping3?.mappings['productCode'];
            const api3ProdCode = api3ProdCodeKey && api3Item[api3ProdCodeKey] !== undefined
              ? api3Item[api3ProdCodeKey]
              : (api3Item.productCode || api3Item.sku || api3Item.code || api3Item.pr_cod || api3Item.codigo);

            if (api3ProdCode) {
              const codeStr3 = String(api3ProdCode).trim().toLowerCase();
              const matchedProd3 = products.find(p => {
                const matchCode = String(p.code).trim().toLowerCase() === codeStr3;
                const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr3;
                const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr3;
                return matchCode || matchPrCod || matchCodigo;
              });

              if (matchedProd3) {
                const api3QtyKey = mapping3?.mappings['itemQuantity'] || 'quantity';
                const api3Qty = api3Item[api3QtyKey] !== undefined ? api3Item[api3QtyKey] : (api3Item.quantityOrdered || api3Item.quantity || api3Item.quantidade);
                const quantityOrdered3 = Number(api3Qty !== undefined ? api3Qty : 1);

                const api3PriceKey = mapping3?.mappings['itemUnitPrice'] || 'unitPrice';
                const api3PriceRaw = api3PriceKey && api3Item[api3PriceKey] !== undefined ? resolveMappedValue(api3Item, api3PriceKey) : (api3Item.unitPrice || api3Item.price || api3Item.preco);
                const unitPrice3 = api3PriceRaw !== undefined ? parseWebhookMonetary(api3PriceRaw) : ((matchedProd3 as any).pr_preco || 0);

                compiledOrderItems.push({
                  id: `itm-${Date.now()}-api3-${api3Idx}-${Math.floor(Math.random() * 1000)}`,
                  productCode: matchedProd3.code,
                  productName: matchedProd3.name,
                  quantityOrdered: quantityOrdered3,
                  unitPrice: unitPrice3
                });
              }
            }
          }
        });
      }

      if (orderRejected) {
        rejectedItems.push({ item: webhookItem, reason: `Pedido "${orderNumberRaw}": ${rejectReason}` });
        return;
      }

      const existingOrder = validImportedItems.find(o => o.orderNumber === String(orderNumberRaw).toUpperCase());
      if (existingOrder) {
        existingOrder.items.push(...compiledOrderItems);
      } else {
        validImportedItems.push({
          orderNumber: String(orderNumberRaw).toUpperCase(),
          clientName: String(clientNameRaw),
          date: dateVal,
          priority,
          items: compiledOrderItems,
          notes: notesRaw ? String(notesRaw) : undefined
        });
      }
    });

    addLog(`Sincronização de pedidos concluída: ${validImportedItems.length} pedidos gravados.`);

    return {
      success: true,
      count: validImportedItems.length,
      data: validImportedItems,
      logs,
      rawResponse: res.body,
      rejectedCount: rejectedItems.length,
      rejectedItems
    };
  } catch (err: any) {
    addLog(`Erro ao sincronizar pedidos: ${err.message}`);
    return {
      success: false,
      count: 0,
      logs,
      error: err.message || 'Erro desconhecido'
    };
  }
}

/**
 * Executes a sync for StockBalance from the specified webhook.
 */
export async function syncStockWebhook(
  webhook: WebhookConfig,
  fieldMappings: FieldMapping[],
  products: Product[],
  warehouses: Warehouse[]
): Promise<SyncResult<Omit<StockBalance, 'id'>[]>> {
  const logs: string[] = [];
  const addLog = (m: string) => logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`);

  try {
    addLog(`Iniciando sincronização de Estoque com Webhook: "${webhook.tableName}"`);

    const requestBody = {
      tabela: webhook.tableName,
      condicao: webhook.filterCondition,
      $condicao: webhook.filterCondition
    };

    const res = await executeProxyWebhook({
      url: webhook.url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
        'X-API-Key': `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
      },
      body: requestBody
    });

    if (!res.ok) {
      throw new Error(`Servidor do Webhook retornou status ${res.status}: ${res.statusText || 'Erro'}`);
    }

    const responseData = JSON.parse(res.body);
    const searchRes = findArrayInObject(responseData);
    const itemsArray = searchRes ? searchRes.array : [responseData];

    const mapping = fieldMappings.find(
      m => m.webhookId === webhook.id && (
        m.systemTable.trim().toLowerCase() === 'stockbalance' ||
        m.systemTable.trim().toLowerCase() === 'stock'
      )
    ) || fieldMappings.find(
      m => m.systemTable.trim().toLowerCase() === 'stockbalance' || m.systemTable.trim().toLowerCase() === 'stock'
    );

    const validImportedItems: Omit<StockBalance, 'id'>[] = [];
    const rejectedItems: any[] = [];

    itemsArray.forEach((webhookItem: any, index: number) => {
      const mappedItem: any = {};

      const productCodeRaw = resolveWebhookField(webhookItem, mapping?.mappings['productCode'], [
        'productCode', 'modelo', 'code', 'sku', 'pr_cod', 'codigo', 'cod', 'cod_produto', 'product_code', 'productId'
      ]);

      if (!productCodeRaw) {
        rejectedItems.push({
          item: webhookItem,
          reason: `Item #${index + 1}: Nenhum código de produto identificado.`
        });
        return;
      }

      const codeStr = String(productCodeRaw).trim().toLowerCase();
      const matchedProd = products.find(p => {
        const matchCode = String(p.code).trim().toLowerCase() === codeStr;
        const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr;
        const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr;
        return matchCode || matchPrCod || matchCodigo;
      });

      if (!matchedProd) {
        rejectedItems.push({
          item: webhookItem,
          reason: `Código "${productCodeRaw}" não localizado no catálogo de produtos.`
        });
        return;
      }

      mappedItem.productCode = matchedProd.code;

      const productNameRaw = resolveWebhookField(webhookItem, mapping?.mappings['productName'], [
        'productName', 'descricao', 'name', 'nome', 'description'
      ]);
      mappedItem.productName = productNameRaw ? String(productNameRaw).trim() : matchedProd.name;

      const rawWarehouseValue = resolveWebhookField(webhookItem, mapping?.mappings['warehouse'], [
        'warehouse', 'cdgrupo', 'cd_grupo', 'deposito', 'armazem', 'filial', 'local', 'grupo'
      ]);

      let translatedWarehouse = '';
      if (rawWarehouseValue !== undefined && rawWarehouseValue !== null && String(rawWarehouseValue).trim() !== '') {
        const rawWhStr = String(rawWarehouseValue).trim();
        const rawWhLower = rawWhStr.toLowerCase();

        const matchedWh = warehouses.find(w => w.name.trim().toLowerCase() === rawWhLower) ||
                          warehouses.find(w => w.name.trim().toLowerCase().startsWith(rawWhLower) || rawWhLower.startsWith(w.name.trim().toLowerCase())) ||
                          warehouses.find(w => w.groupName && w.groupName.trim().toLowerCase() === rawWhLower) ||
                          warehouses.find(w => w.id.toLowerCase() === rawWhLower);

        translatedWarehouse = matchedWh ? matchedWh.name : rawWhStr;
      } else {
        const firstActiveWh = warehouses.find(w => w.isActive)?.name || 'DEP01 - Depósito Central';
        translatedWarehouse = firstActiveWh;
      }

      mappedItem.warehouse = translatedWarehouse;

      const rawQuantity = resolveWebhookField(webhookItem, mapping?.mappings['quantity'], [
        'quantity', 'qtdest', 'qtdEst', 'qtd', 'stock', 'quantidade', 'saldo'
      ]);
      mappedItem.quantity = rawQuantity !== undefined ? Number(rawQuantity) : 0;

      const rawPrCod = resolveWebhookField(webhookItem, mapping?.mappings['pr_cod'], [
        'pr_cod', 'prCod', 'cod_interno'
      ]);
      if (rawPrCod !== undefined) mappedItem.pr_cod = Number(rawPrCod);

      const rawCodigo = resolveWebhookField(webhookItem, mapping?.mappings['codigo'], [
        'codigo', 'cod_estruturado'
      ]);
      if (rawCodigo !== undefined) mappedItem.codigo = String(rawCodigo).trim();

      const rawLote = resolveWebhookField(webhookItem, mapping?.mappings['lote'], [
        'lote', 'marca', 'batch'
      ]);
      if (rawLote !== undefined) mappedItem.lote = String(rawLote).trim();

      const rawPrPreco = resolveWebhookField(webhookItem, mapping?.mappings['pr_preco'], [
        'pr_preco', 'prPreco', 'preco', 'price'
      ]);
      if (rawPrPreco !== undefined) {
        mappedItem.pr_preco = parseWebhookMonetary(rawPrPreco);
      } else {
        mappedItem.pr_preco = (matchedProd as any).pr_preco || 0;
      }

      const rawVlrest = resolveWebhookField(webhookItem, mapping?.mappings['vlrest'], [
        'vlrest', 'vlrEst', 'valor_total'
      ]);
      if (rawVlrest !== undefined) {
        mappedItem.vlrest = parseWebhookMonetary(rawVlrest);
      } else if (mappedItem.pr_preco !== undefined) {
        mappedItem.vlrest = mappedItem.quantity * mappedItem.pr_preco;
      }

      validImportedItems.push(mappedItem);
    });

    // Detect any new warehouses
    const uniqueFoundWhs = new Set<string>();
    validImportedItems.forEach(item => {
      if (item.warehouse) uniqueFoundWhs.add(item.warehouse);
    });

    const newWarehouses: Warehouse[] = [];
    uniqueFoundWhs.forEach(whCode => {
      const alreadyInCad = warehouses.some(w => w.name.trim().toLowerCase() === whCode.trim().toLowerCase());
      if (!alreadyInCad) {
        let autoGroup = 'Outros';
        if (whCode.startsWith('0002')) autoGroup = 'São Paulo';
        else if (whCode.startsWith('0004')) autoGroup = 'Miami';
        else if (whCode.startsWith('DEP01') || whCode.startsWith('DEP02')) autoGroup = 'São Paulo';

        newWarehouses.push({
          id: `wh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: whCode,
          isActive: true,
          groupName: autoGroup
        });
      }
    });

    addLog(`Sincronização de estoque concluída: ${validImportedItems.length} registros válidos.`);

    return {
      success: true,
      count: validImportedItems.length,
      data: validImportedItems,
      newWarehouses,
      logs,
      rawResponse: res.body,
      rejectedCount: rejectedItems.length,
      rejectedItems
    };
  } catch (err: any) {
    addLog(`Erro ao sincronizar estoque: ${err.message}`);
    return {
      success: false,
      count: 0,
      logs,
      error: err.message || 'Erro desconhecido'
    };
  }
}

/**
 * Executes a sync for Sales from the specified webhook.
 */
export async function syncSalesWebhook(
  webhook: WebhookConfig,
  fieldMappings: FieldMapping[]
): Promise<SyncResult<SaleRecord[]>> {
  const logs: string[] = [];
  const addLog = (m: string) => logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`);

  try {
    addLog(`Iniciando sincronização de Vendas com Webhook: "${webhook.tableName}"`);

    const requestBody = {
      tabela: webhook.tableName,
      condicao: webhook.filterCondition,
      $condicao: webhook.filterCondition
    };

    const res = await executeProxyWebhook({
      url: webhook.url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhook.secretKey || ''}`,
        'X-API-Key': `${webhook.secretKey || ''}`
      },
      body: requestBody
    });

    if (!res.ok) {
      throw new Error(`Servidor do Webhook retornou status ${res.status}: ${res.statusText || 'Erro'}`);
    }

    const parsedPayload = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;

    let rawItems: any[] = [];
    if (Array.isArray(parsedPayload)) {
      rawItems = parsedPayload;
    } else if (parsedPayload && typeof parsedPayload === 'object') {
      const potentialKeys = ['vendas', 'sales', 'data', 'dados', 'items', 'registros', 'resultado', 'rows'];
      for (const key of potentialKeys) {
        if (Array.isArray(parsedPayload[key])) {
          rawItems = parsedPayload[key];
          break;
        }
      }
      if (rawItems.length === 0) {
        const values = Object.values(parsedPayload);
        const firstArray = values.find(v => Array.isArray(v));
        if (firstArray) rawItems = firstArray as any[];
      }
    }

    const mapping = fieldMappings.find(m => m.webhookId === webhook.id) ||
                    fieldMappings.find(m => m.systemTable === 'SaleRecord' || m.systemTable === 'Vendas' || m.systemTable === 'sales');
    const mapConfig = mapping?.mappings || {};

    const consolidatedSales = new Map<string, SaleRecord>();
    const monthColumns = [
      { key: 'jan', m: 1 }, { key: 'fev', m: 2 }, { key: 'mar', m: 3 },
      { key: 'abr', m: 4 }, { key: 'mai', m: 5 }, { key: 'jun', m: 6 },
      { key: 'jul', m: 7 }, { key: 'ago', m: 8 }, { key: 'set', m: 9 },
      { key: 'out', m: 10 }, { key: 'nov', m: 11 }, { key: 'dez', m: 12 }
    ];

    rawItems.forEach(raw => {
      const rawSku = resolveWebhookField(raw, mapConfig.sku, ['modelo', 'sku', 'codigo', 'cod', 'pr_cod', 'productCode', 'produto']);
      if (!rawSku) return;
      const sku = String(rawSku).trim();

      let foundWideColumns = false;
      const currentYear = new Date().getFullYear();
      const rawYearVal = resolveWebhookField(raw, mapConfig.year, ['2ano', 'ano', 'year', 'nu_ano', 'ANO']);
      const y = (rawYearVal && parseInt(String(rawYearVal).trim(), 10) >= 1900) ? parseInt(String(rawYearVal).trim(), 10) : currentYear;

      monthColumns.forEach(({ key, m }) => {
        const mappedKey = mapConfig[key];
        const val = resolveWebhookField(raw, mappedKey, [key, `qtd_${key}`, `vlr_${key}`]);
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const qty = typeof val === 'number' ? val : (parseFloat(String(val).replace(',', '.')) || 0);
          if (qty > 0) {
            foundWideColumns = true;
            const groupKey = `${sku}__${m}__${y}`;
            const existing = consolidatedSales.get(groupKey);
            if (existing) {
              existing.quantity += qty;
            } else {
              consolidatedSales.set(groupKey, {
                id: `sale-${sku}-${m}-${y}`,
                sku,
                month: m,
                year: y,
                quantity: qty,
                notes: 'Importado via API'
              });
            }
          }
        }
      });

      if (foundWideColumns) return;

      let month = 0;
      const rawMonth = resolveWebhookField(raw, mapConfig.month, ['mes', 'month', 'nu_mes', 'MES']);
      if (rawMonth !== undefined && rawMonth !== null && String(rawMonth).trim() !== '') {
        month = parseInt(String(rawMonth).trim(), 10) || 0;
      }

      let year = 0;
      if (rawYearVal !== undefined && rawYearVal !== null && String(rawYearVal).trim() !== '') {
        const parsedYear = parseInt(String(rawYearVal).trim(), 10) || 0;
        if (parsedYear >= 1900) year = parsedYear;
      }

      if (!month || !year || month < 1 || month > 12 || year < 1900) {
        const rawDate = resolveWebhookField(raw, mapConfig.date, ['data', 'dataref', 'date', 'periodo']);
        if (rawDate) {
          const dateStr = String(rawDate).trim();
          if (/^\d{8}$/.test(dateStr)) {
            year = parseInt(dateStr.substring(0, 4), 10);
            month = parseInt(dateStr.substring(4, 6), 10);
          } else if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length >= 2) {
              year = parseInt(parts[0], 10);
              month = parseInt(parts[1], 10);
            }
          }
        }
      }

      const rawQty = resolveWebhookField(raw, mapConfig.quantity, ['qtdest', 'qtd', 'quantidade', 'quantity', 'total']);
      let quantity = 0;
      if (rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '') {
        quantity = typeof rawQty === 'number' ? rawQty : (parseFloat(String(rawQty).replace(',', '.')) || 0);
      }

      if (sku && month >= 1 && month <= 12 && year >= 1900 && quantity > 0) {
        const groupKey = `${sku}__${month}__${year}`;
        const existing = consolidatedSales.get(groupKey);
        if (existing) {
          existing.quantity += quantity;
        } else {
          consolidatedSales.set(groupKey, {
            id: `sale-${sku}-${month}-${year}`,
            sku,
            month,
            year,
            quantity,
            notes: raw.notes || raw.observacao || 'Importado via API'
          });
        }
      }
    });

    const importedSales = Array.from(consolidatedSales.values());
    addLog(`Sincronização de vendas concluída: ${importedSales.length} registros mensais consolidados.`);

    return {
      success: true,
      count: importedSales.length,
      data: importedSales,
      logs,
      rawResponse: res.body
    };
  } catch (err: any) {
    addLog(`Erro ao sincronizar vendas: ${err.message}`);
    return {
      success: false,
      count: 0,
      logs,
      error: err.message || 'Erro desconhecido'
    };
  }
}

/**
 * Executes all webhooks configured with execution === 'Automática'.
 * Orders execution logically (Products first, then Orders, Stock, Sales).
 */
export async function executeAutomaticWebhooks({
  webhooks,
  fieldMappings,
  currentProducts,
  currentWarehouses,
  onImportProducts,
  onImportOrders,
  onImportStock,
  onUpdateWarehouses,
  onImportSales
}: {
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
  currentProducts: Product[];
  currentWarehouses: Warehouse[];
  onImportProducts: (products: Product[], overwrite?: boolean) => void;
  onImportOrders: (orders: Omit<OrderHeader, 'id'>[], overwrite?: boolean) => void;
  onImportStock: (stock: Omit<StockBalance, 'id'>[], overwrite?: boolean) => void;
  onUpdateWarehouses?: (whs: Warehouse[]) => void;
  onImportSales: (sales: SaleRecord[], overwrite?: boolean) => void;
}): Promise<AutoSyncSummary> {
  const autoWebhooks = webhooks.filter(wh => wh.isActive && wh.execution === 'Automática');

  const summary: AutoSyncSummary = {
    executedCount: autoWebhooks.length,
    successfulCount: 0,
    failedCount: 0,
    results: [],
    timestamp: new Date().toISOString()
  };

  if (autoWebhooks.length === 0) {
    return summary;
  }

  // Sort order: Products (1) -> Orders (2) -> Stock (3) -> Sales (4)
  const targetPriority: Record<string, number> = {
    products: 1,
    orders: 2,
    stock: 3,
    sales: 4,
    users: 5
  };

  const sortedWebhooks = [...autoWebhooks].sort((a, b) => {
    const targetA = getWebhookTargetScreen(a) || '';
    const targetB = getWebhookTargetScreen(b) || '';
    const pA = targetPriority[targetA] || 99;
    const pB = targetPriority[targetB] || 99;
    if (pA !== pB) return pA - pB;
    return (a.seq || 0) - (b.seq || 0);
  });

  let activeProducts = [...currentProducts];
  let activeWarehouses = [...currentWarehouses];

  for (const wh of sortedWebhooks) {
    const target = getWebhookTargetScreen(wh);
    const whName = wh.tableName || `Webhook #${wh.seq}`;

    try {
      if (target === 'products') {
        const res = await syncProductsWebhook(wh, fieldMappings);
        if (res.success && res.data) {
          onImportProducts(res.data, true);
          activeProducts = res.data;
          summary.successfulCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Produtos',
            success: true,
            count: res.count
          });
        } else {
          summary.failedCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Produtos',
            success: false,
            count: 0,
            error: res.error || 'Falha na requisição'
          });
        }
      } else if (target === 'orders') {
        const res = await syncOrdersWebhook(wh, webhooks, fieldMappings, activeProducts);
        if (res.success && res.data) {
          onImportOrders(res.data, true);
          summary.successfulCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Pedidos',
            success: true,
            count: res.count
          });
        } else {
          summary.failedCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Pedidos',
            success: false,
            count: 0,
            error: res.error || 'Falha na requisição'
          });
        }
      } else if (target === 'stock') {
        const res = await syncStockWebhook(wh, fieldMappings, activeProducts, activeWarehouses);
        if (res.success && res.data) {
          if (res.newWarehouses && res.newWarehouses.length > 0 && onUpdateWarehouses) {
            activeWarehouses = [...activeWarehouses, ...res.newWarehouses];
            onUpdateWarehouses(activeWarehouses);
          }
          onImportStock(res.data, true);
          summary.successfulCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Estoque',
            success: true,
            count: res.count
          });
        } else {
          summary.failedCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Estoque',
            success: false,
            count: 0,
            error: res.error || 'Falha na requisição'
          });
        }
      } else if (target === 'sales') {
        const res = await syncSalesWebhook(wh, fieldMappings);
        if (res.success && res.data) {
          onImportSales(res.data, true);
          summary.successfulCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Vendas',
            success: true,
            count: res.count
          });
        } else {
          summary.failedCount++;
          summary.results.push({
            webhookId: wh.id,
            webhookName: whName,
            target: 'Vendas',
            success: false,
            count: 0,
            error: res.error || 'Falha na requisição'
          });
        }
      } else {
        // Unknown or generic target
        summary.results.push({
          webhookId: wh.id,
          webhookName: whName,
          target: 'Desconhecido',
          success: false,
          count: 0,
          error: 'Nenhuma tela ou tabela associada reconhecida'
        });
      }
    } catch (err: any) {
      summary.failedCount++;
      summary.results.push({
        webhookId: wh.id,
        webhookName: whName,
        target: target || 'Geral',
        success: false,
        count: 0,
        error: err.message || 'Erro inesperado'
      });
    }
  }

  return summary;
}
