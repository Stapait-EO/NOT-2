import { useState, useMemo, FormEvent } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Calendar, 
  User, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  FileText, 
  Trash, 
  X, 
  PlusCircle, 
  DollarSign,
  Briefcase,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  Clipboard
} from 'lucide-react';
import { OrderHeader, OrderItem, Product, UserRole, WebhookConfig, FieldMapping } from '../types';

interface OrdersTableProps {
  orders: OrderHeader[];
  products: Product[];
  onAddOrder: (order: Omit<OrderHeader, 'id'>) => void;
  onEditOrder: (order: OrderHeader) => void;
  onDeleteOrder: (id: string) => void;
  onClearAllOrders?: () => void;
  onImportOrders?: (imported: Omit<OrderHeader, 'id'>[], overwrite?: boolean) => void;
  currentUserRole: UserRole;
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
}

export default function OrdersTable({ 
  orders, 
  products, 
  onAddOrder, 
  onEditOrder, 
  onDeleteOrder,
  onClearAllOrders,
  onImportOrders,
  currentUserRole,
  webhooks,
  fieldMappings
}: OrdersTableProps) {
  const canManageOrders = currentUserRole === 'admin' || currentUserRole === 'vendedor';

  // Webhook execution and import integration states for Orders
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [unimportedDetails, setUnimportedDetails] = useState<{ item: any; reason: string }[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logSummary, setLogSummary] = useState({
    totalRaw: 0,
    totalImported: 0,
    totalRejected: 0
  });
  const [rawResponseBody, setRawResponseBody] = useState('');
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);

  const handleExecuteUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus('idle');
    setUpdateMessage('');
    setRawResponseBody('');
    
    const logsList: string[] = [];
    const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString();
      logsList.push(`[${time}] ${msg}`);
      setExecutionLogs([...logsList]);
    };

    // Helper to convert monetary values
    const parseWebhookMonetary = (val: any): number => {
      if (val === undefined || val === null) return 0;
      if (typeof val === 'number') return val;
      let str = String(val).trim();
      if (!str) return 0;
      str = str.replace(/[R$\s]/g, '');
      if (str.includes('.') && !str.includes(',')) {
        str = str.replace(/\./g, ',');
      }
      if (str.includes(',')) {
        const lastCommaIndex = str.lastIndexOf(',');
        let before = str.substring(0, lastCommaIndex);
        let after = str.substring(lastCommaIndex + 1);
        before = before.replace(/[\.,]/g, '');
        str = before + '.' + after;
      }
      const parsed = parseFloat(str);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Helper to resolve mapped values, supporting expressions with '+', '-', '*', '/' and parentheses (e.g. (i_Vtotal+i_vIpi)/i_Qtdade)
    const resolveMappedValue = (item: any, mappingKey: string | undefined): any => {
      if (!mappingKey) return undefined;
      const trimmedKey = String(mappingKey).trim();
      if (!trimmedKey) return undefined;

      // If it is a simple key without any operators, return directly (preserving types like strings/objects)
      const hasOperators = /[\+\-\*\/\(\)]/.test(trimmedKey);
      if (!hasOperators) {
        return item[trimmedKey];
      }

      // It has operators, so treat it as an arithmetic expression
      try {
        let expr = trimmedKey;
        const varRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        let match;
        const variablesFound = new Set<string>();
        
        while ((match = varRegex.exec(trimmedKey)) !== null) {
          variablesFound.add(match[0]);
        }

        // Replace each found variable in the expression with its numeric value
        variablesFound.forEach(varName => {
          const val = item[varName];
          const numericVal = (val !== undefined && val !== null) ? parseWebhookMonetary(val) : 0;
          // Replace all occurrences of varName in expr using word boundaries
          const safeVarName = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp('\\b' + safeVarName + '\\b', 'g');
          expr = expr.replace(regex, String(numericVal));
        });

        // Now, sanitize the final expression string to prevent injection of arbitrary JS
        // Only allow numbers, decimal points, spaces, and operators: + - * / ( )
        const sanitized = expr.replace(/[^0-9.+\-*/() ]/g, '');

        if (!sanitized.trim()) return undefined;

        // Safely evaluate the math expression
        // Since we strictly sanitized the string to mathematical tokens, Function(...) is safe
        const result = new Function(`return (${sanitized})`)();
        return isNaN(result) || !isFinite(result) ? 0 : result;
      } catch (err) {
        addLog(`Erro ao calcular expressão matemática "${trimmedKey}": ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    };

    // Helper to convert any incoming date format into standard YYYY-MM-DD
    const parseWebhookDate = (rawVal: any): string => {
      if (!rawVal) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }

      let str = String(rawVal).trim();
      
      // Handle ISO string split 'T'
      if (str.includes('T')) {
        str = str.split('T')[0];
      }

      // Handle YYYYMMDD (e.g., "20260105")
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

      // Try parsing with native Date as a fallback
      try {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, '0');
          const dd = String(parsed.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      } catch (e) {
        // ignore
      }

      // Ultimate fallback is today
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    addLog('O usuário clicou no botão "Atualizar" na tela de Pedidos em Aberto.');

    // 1. Apagar todos os pedidos da tabela 'OrderHeader'
    if (onClearAllOrders) {
      onClearAllOrders();
      addLog('Executado o delete da tabela local "OrderHeader" (todos os pedidos locais foram limpos).');
    } else {
      addLog('AVISO: Função para limpar tabela local indisponível.');
    }

    // 2. Encontrar o webhook ativo configurado para esta tela ou para a tabela 'OrderHeader'
    let webhook = webhooks.find(wh => wh.isActive && wh.targetScreen === 'orders');
    if (!webhook) {
      webhook = webhooks.find(wh => wh.isActive && (
        wh.tableName.trim().toLowerCase() === 'orderheader' || 
        wh.tableName.trim().toLowerCase() === 'orders' || 
        wh.tableName.trim().toLowerCase() === 'pedidos'
      ));
    }

    if (!webhook) {
      addLog('ERRO: Nenhum webhook ativo associado a esta tela ou à tabela OrderHeader.');
      setUpdateStatus('error');
      setUpdateMessage('Nenhum webhook ativo configurado para os Pedidos em Aberto. Por favor, configure um webhook com esta tela de execução em "Configurações de Webhook".');
      setIsUpdating(false);
      setExecutionLogs(logsList);
      setIsLogModalOpen(true);
      return;
    }

    addLog(`Webhook ativo localizado! ID: ${webhook.id}, Tabela: "${webhook.tableName}", URL: "${webhook.url}"`);

    try {
      const requestBody = {
        "tabela": webhook.tableName,
        "condicao": webhook.filterCondition,
        "$condicao": webhook.filterCondition
      };

      addLog(`Iniciando a requisição POST para o Webhook através do servidor proxy local...`);
      addLog(`Parâmetros enviados no payload (POST Body): ${JSON.stringify(requestBody)}`);

      const response = await fetch('/api/proxy-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: webhook.url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
            "X-API-Key": `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
          },
          body: requestBody
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro na resposta do servidor do Webhook.');
      }

      addLog(`Chamada do Webhook concluída com sucesso (Status: ${data.status} ${data.statusText || 'OK'}, Duração: ${data.duration}ms).`);

      if (!data.body) {
        throw new Error('O servidor do Webhook retornou um corpo de resposta vazio.');
      }

      setRawResponseBody(data.body);
      addLog(`Dado bruto recebido da API (JSON): ${data.body}`);

      let responseData: any;
      try {
        responseData = JSON.parse(data.body);
        addLog('O corpo de resposta do Webhook foi analisado como JSON válido.');
      } catch (e: any) {
        throw new Error(`A resposta do Webhook não é um JSON válido. Retorno bruto: ${data.body.substring(0, 150)}...`);
      }

      // Recursive function to search for array of items inside the payload
      const findArrayInObject = (obj: any, path = ''): { array: any[]; path: string } | null => {
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
      };

      let itemsArray: any[] = [];
      const arraySearchResult = findArrayInObject(responseData);

      if (arraySearchResult) {
        itemsArray = arraySearchResult.array;
        addLog(`Localizado array de registros no caminho "${arraySearchResult.path}" contendo ${itemsArray.length} itens.`);
      } else {
        itemsArray = [responseData];
        addLog('O JSON de resposta não continha nenhum array diretamente. Interpretando o objeto inteiro como um único registro.');
      }

      addLog(`Dados encontrados no retorno do webhook (total de registros: ${itemsArray.length}). Iniciando validação e mapeamento de Pedidos...`);

      // Find field mappings for this Webhook & Orders
      const mapping = fieldMappings.find(
        m => m.webhookId === webhook!.id && (
          m.systemTable.trim().toLowerCase() === 'orderheader' ||
          m.systemTable.trim().toLowerCase() === 'orders' ||
          m.systemTable.trim().toLowerCase() === 'pedidos'
        )
      );

      if (mapping) {
        addLog(`Utilizando mapeamento "De/Para" ativo localizado para Pedidos (ID: ${mapping.id}).`);
      } else {
        addLog('AVISO: Nenhum mapeamento "De/Para" customizado localizado para esta tabela. Utilizando nomes de campos originais do payload.');
      }

      // Check if any order contains an item with productCode or name "SISTEMA" (case-insensitive)
      let hasAnySistema = false;
      itemsArray.forEach((webhookItem) => {
        let rawItemsList: any[] = [];
        const possibleItemsKeys = ['items', 'itens', 'orderItems', 'produtos', 'lines', 'line_items', 'detalhes'];
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
        if (rawItemsList.length === 0) {
          rawItemsList = [webhookItem];
        }

        rawItemsList.forEach((rawItem) => {
          const mappedProdCodeKey = mapping?.mappings['itemProductCode'];
          const itemProdCode = (mappedProdCodeKey && rawItem[mappedProdCodeKey] !== undefined) 
            ? rawItem[mappedProdCodeKey] 
            : (rawItem.productCode || rawItem.sku || rawItem.code || rawItem.pr_cod || rawItem.codigo || rawItem.cod || rawItem.cod_produto || rawItem.product_code || rawItem.productId);
          
          const rawNameKey = mapping?.mappings['itemName'] || 'productName';
          const itemNameRaw = rawItem[rawNameKey] || rawItem.productName || rawItem.name || rawItem.descricao || rawItem.item || '';

          if (String(itemProdCode || '').trim().toUpperCase() === 'SISTEMA' || 
              String(itemNameRaw || '').trim().toUpperCase() === 'SISTEMA') {
            hasAnySistema = true;
          }
        });
      });

      let api3ItemsArray: any[] = [];
      let mapping3: FieldMapping | undefined = undefined;

      if (hasAnySistema) {
        addLog('Aviso: Item "SISTEMA" detectado na carga de importação! Ativando chamada para a API secundária (Código 3) para obter os itens reais...');
        const webhook3 = webhooks.find(wh => wh.seq === 3 || wh.id === 'wh-3' || wh.id === '3');
        if (!webhook3) {
          addLog('ERRO: API de código 3 (seq 3) não foi encontrada nas configurações de webhooks. A importação de itens "SISTEMA" falhará.');
        } else if (!webhook3.isActive) {
          addLog(`ERRO: A API de código 3 (ID: ${webhook3.id}) está cadastrada mas se encontra INATIVA.`);
        } else {
          addLog(`API de código 3 localizada! ID: ${webhook3.id}, URL: "${webhook3.url}"`);
          try {
            const requestBody3 = {
              "tabela": webhook3.tableName,
              "condicao": webhook3.filterCondition,
              "$condicao": webhook3.filterCondition
            };

            addLog(`Iniciando a requisição POST para a API de código 3 através do servidor proxy local...`);
            const response3 = await fetch('/api/proxy-webhook', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                url: webhook3.url,
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${webhook3.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
                  "X-API-Key": `${webhook3.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
                },
                body: requestBody3
              })
            });

            const data3 = await response3.json();
            if (!response3.ok) {
              throw new Error(data3.error || 'Falha no proxy ao acessar API de código 3.');
            }

            if (data3.body) {
              const responseData3 = JSON.parse(data3.body);
              const arraySearchResult3 = findArrayInObject(responseData3);
              if (arraySearchResult3) {
                api3ItemsArray = arraySearchResult3.array;
              } else {
                api3ItemsArray = [responseData3];
              }
              addLog(`API de código 3 executada com sucesso! Retornou ${api3ItemsArray.length} registros correspondentes.`);

              // Find mapping for webhook 3
              mapping3 = fieldMappings.find(m => m.webhookId === webhook3.id);
              if (mapping3) {
                addLog(`Mapeamento De/Para carregado para a API de código 3 (ID: ${mapping3.id}).`);
              } else {
                addLog('AVISO: Nenhum mapeamento De/Para encontrado para a API de código 3.');
              }
            } else {
              addLog('AVISO: Resposta da API de código 3 está vazia.');
            }
          } catch (err3: any) {
            addLog(`FALHA AO EXECUTAR API 3: ${err3.message || 'Erro desconhecido.'}`);
            throw new Error(`Falha na API 3 secundária ao tentar resolver itens do "SISTEMA": ${err3.message}`);
          }
        }
      }

      const validImportedItems: Omit<OrderHeader, 'id'>[] = [];
      const rejectedItems: { item: any; reason: string }[] = [];

      itemsArray.forEach((webhookItem: any, index: number) => {
        const mappedHeader: any = {};
        
        // System fields for Order Header
        const headerFields = ['orderNumber', 'clientName', 'date', 'priority', 'notes', 'items'];
        headerFields.forEach(sysKey => {
          const webhookKey = mapping?.mappings[sysKey];
          if (webhookKey && webhookItem[webhookKey] !== undefined) {
            mappedHeader[sysKey] = webhookItem[webhookKey];
          } else if (webhookItem[sysKey] !== undefined) {
            mappedHeader[sysKey] = webhookItem[sysKey];
          }
        });

        // Resolve Order Header Fields
        const orderNumberRaw = mappedHeader.orderNumber || webhookItem.orderNumber || webhookItem.order_number || webhookItem.numero || webhookItem.numero_pedido || webhookItem.id || webhookItem.code || webhookItem.pedido;
        const clientNameRaw = mappedHeader.clientName || webhookItem.clientName || webhookItem.client || webhookItem.cliente || webhookItem.nome_cliente || webhookItem.customer;
        const dateRaw = mappedHeader.date || webhookItem.date || webhookItem.data || webhookItem.data_pedido || webhookItem.created_at || webhookItem.emissao;
        const priorityRaw = mappedHeader.priority || webhookItem.priority || webhookItem.prioridade || 'Média';
        const notesRaw = mappedHeader.notes || webhookItem.notes || webhookItem.observacoes || webhookItem.obs || '';

        if (!orderNumberRaw) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Pedido #${index + 1}: Nenhum número de pedido identificado (orderNumber, order_number, numero, id, code).`
          });
          return;
        }

        if (!clientNameRaw) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Pedido #${index + 1}: Nenhum nome de cliente identificado (clientName, client, cliente, customer).`
          });
          return;
        }

        // Format priority
        let priority: 'Alta' | 'Média' | 'Baixa' = 'Média';
        const prioStr = String(priorityRaw).trim().toLowerCase();
        if (prioStr.startsWith('alt') || prioStr === 'high') {
          priority = 'Alta';
        } else if (prioStr.startsWith('baix') || prioStr === 'low') {
          priority = 'Baixa';
        }

        // Format Date
        const dateVal = parseWebhookDate(dateRaw);

        // Extract and map order items (lines)
        let rawItemsList: any[] = [];
        const possibleItemsKeys = ['items', 'itens', 'orderItems', 'produtos', 'lines', 'line_items', 'detalhes'];
        
        let foundItemsKey = '';
        const mappedItemsKey = mapping?.mappings['items'];
        if (mappedItemsKey && Array.isArray(webhookItem[mappedItemsKey])) {
          rawItemsList = webhookItem[mappedItemsKey];
          foundItemsKey = mappedItemsKey;
        } else {
          for (const key of possibleItemsKeys) {
            if (Array.isArray(webhookItem[key])) {
              rawItemsList = webhookItem[key];
              foundItemsKey = key;
              break;
            }
          }
        }

        // Fallback: If no sub-array of items found, treat the order row as a single flat item
        if (rawItemsList.length === 0) {
          rawItemsList = [webhookItem];
          addLog(`Pedido "${orderNumberRaw}": Nenhuma sub-lista de itens ("items", "itens", etc.) foi identificada. Tratando o registro como item plano (uma linha por item).`);
        }

        const compiledOrderItems: OrderItem[] = [];
        let orderRejected = false;
        let rejectReason = '';
        let hasSistemaItem = false;

        for (let itemIdx = 0; itemIdx < rawItemsList.length; itemIdx++) {
          const rawItem = rawItemsList[itemIdx];
          
          // Try to get item mapping fields or defaults
          const mappedProdCodeKey = mapping?.mappings['itemProductCode'];
          const itemProdCode = (mappedProdCodeKey && rawItem[mappedProdCodeKey] !== undefined) 
            ? rawItem[mappedProdCodeKey] 
            : (rawItem.productCode || rawItem.sku || rawItem.code || rawItem.pr_cod || rawItem.codigo || rawItem.cod || rawItem.cod_produto || rawItem.product_code || rawItem.productId);
          
          const rawNameKey = mapping?.mappings['itemName'] || 'productName';
          const itemNameRaw = rawItem[rawNameKey] || rawItem.productName || rawItem.name || rawItem.descricao || rawItem.item || '';

          const isSistema = String(itemProdCode || '').trim().toUpperCase() === 'SISTEMA' || 
                            String(itemNameRaw || '').trim().toUpperCase() === 'SISTEMA';

          if (isSistema) {
            hasSistemaItem = true;
            // Skip product search and addition of SISTEMA item since it will be replaced by API 3 products
            continue;
          }

          if (!itemProdCode) {
            orderRejected = true;
            rejectReason = `Código de produto ausente na linha do item #${itemIdx + 1} do pedido "${orderNumberRaw}".`;
            break;
          }

          // Match product in catalog (verify if exists, case-insensitive, support pr_cod & codigo)
          const codeStr = String(itemProdCode).trim().toLowerCase();
          const matchedProd = products.find(p => {
            const matchCode = String(p.code).trim().toLowerCase() === codeStr;
            const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr;
            const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr;
            return matchCode || matchPrCod || matchCodigo;
          });

          if (!matchedProd) {
            orderRejected = true;
            rejectReason = `Produto com código "${itemProdCode}" (linha #${itemIdx + 1}) não existe no cadastro do sistema.`;
            break;
          }

          // Quantity
          const mappedQtyKey = mapping?.mappings['itemQuantity'];
          const qtyRaw = (mappedQtyKey && rawItem[mappedQtyKey] !== undefined)
            ? rawItem[mappedQtyKey]
            : (rawItem.quantityOrdered || rawItem.quantity || rawItem.quantidade || rawItem.qtd || rawItem.qty);
          const quantityOrdered = Number(qtyRaw !== undefined ? qtyRaw : 1);

          // Price
          const mappedPriceKey = mapping?.mappings['itemUnitPrice'];
          const priceRaw = (mappedPriceKey !== undefined)
            ? resolveMappedValue(rawItem, mappedPriceKey)
            : undefined;
          const finalPriceRaw = priceRaw !== undefined
            ? priceRaw
            : (rawItem.unitPrice || rawItem.price || rawItem.preco || rawItem.valor || rawItem.valor_unitario);
          const unitPrice = finalPriceRaw !== undefined ? parseWebhookMonetary(finalPriceRaw) : ((matchedProd as any).pr_preco || 0);

          compiledOrderItems.push({
            id: `itm-${Date.now()}-${itemIdx}-${Math.floor(Math.random() * 1000)}`,
            productCode: matchedProd.code,
            productName: matchedProd.name,
            quantityOrdered,
            unitPrice
          });
        }

        // If this order contains "SISTEMA", replace that item with matching rows from API 3
        if (hasSistemaItem && !orderRejected) {
          if (api3ItemsArray.length === 0) {
            addLog(`Pedido "${orderNumberRaw}": Contém "SISTEMA" mas a API de código 3 retornou 0 itens.`);
          } else {
            let replacedItemsCount = 0;
            api3ItemsArray.forEach((api3Item, api3Idx) => {
              // Resolve order number key
              const api3OrderNumKey = mapping3?.mappings['orderNumber'];
              const api3OrderNum = api3OrderNumKey && api3Item[api3OrderNumKey] !== undefined
                ? api3Item[api3OrderNumKey]
                : (api3Item.orderNumber || api3Item.order_number || api3Item.numero_pedido || api3Item.numero || api3Item.id_pedido || api3Item.pedido || api3Item.id || api3Item.code);

              const isSameOrder = String(api3OrderNum || '').trim().toUpperCase() === String(orderNumberRaw).trim().toUpperCase();

              if (isSameOrder) {
                // Resolve product code
                const api3ProdCodeKey = mapping3?.mappings['itemProductCode'] || mapping3?.mappings['productCode'];
                const api3ProdCode = api3ProdCodeKey && api3Item[api3ProdCodeKey] !== undefined
                  ? api3Item[api3ProdCodeKey]
                  : (api3Item.productCode || api3Item.sku || api3Item.code || api3Item.pr_cod || api3Item.codigo || api3Item.cod || api3Item.cod_produto || api3Item.product_code || api3Item.productId);

                if (!api3ProdCode) {
                  addLog(`AVISO API 3: Item na linha #${api3Idx + 1} para o pedido "${orderNumberRaw}" não possui código de produto válido.`);
                  return;
                }

                // Match product in catalog
                const codeStr3 = String(api3ProdCode).trim().toLowerCase();
                const matchedProd3 = products.find(p => {
                  const matchCode = String(p.code).trim().toLowerCase() === codeStr3;
                  const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr3;
                  const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr3;
                  return matchCode || matchPrCod || matchCodigo;
                });

                if (!matchedProd3) {
                  orderRejected = true;
                  rejectReason = `Produto com código "${api3ProdCode}" retornado pela API 3 não existe no cadastro do sistema.`;
                  return;
                }

                // Quantity
                const api3QtyKey = mapping3?.mappings['itemQuantity'] || mapping3?.mappings['quantity'];
                const api3QtyRaw = api3QtyKey && api3Item[api3QtyKey] !== undefined
                  ? api3Item[api3QtyKey]
                  : (api3Item.quantityOrdered || api3Item.quantity || api3Item.quantidade || api3Item.qtd || api3Item.qty);
                const quantityOrdered3 = Number(api3QtyRaw !== undefined ? api3QtyRaw : 1);

                // Price
                const api3PriceKey = mapping3?.mappings['itemUnitPrice'] || mapping3?.mappings['unitPrice'] || mapping3?.mappings['price'];
                const api3PriceRaw = (api3PriceKey !== undefined)
                  ? resolveMappedValue(api3Item, api3PriceKey)
                  : undefined;
                const finalApi3PriceRaw = api3PriceRaw !== undefined
                  ? api3PriceRaw
                  : (api3Item.unitPrice || api3Item.price || api3Item.preco || api3Item.valor || api3Item.valor_unitario);
                const unitPrice3 = finalApi3PriceRaw !== undefined ? parseWebhookMonetary(finalApi3PriceRaw) : ((matchedProd3 as any).pr_preco || 0);

                compiledOrderItems.push({
                  id: `itm-${Date.now()}-api3-${api3Idx}-${Math.floor(Math.random() * 1000)}`,
                  productCode: matchedProd3.code,
                  productName: matchedProd3.name,
                  quantityOrdered: quantityOrdered3,
                  unitPrice: unitPrice3
                });
                replacedItemsCount++;
              }
            });

            addLog(`Pedido "${orderNumberRaw}": O item "SISTEMA" foi substituído com sucesso por ${replacedItemsCount} itens reais correspondentes retornados da API 3.`);
          }
        }

        if (orderRejected) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Pedido "${orderNumberRaw}": ${rejectReason}`
          });
          return;
        }

        // Group by orderNumber for flat formats (reusing order header details if already loaded)
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

      // Import the validated orders replacing all current ones
      if (onImportOrders) {
        onImportOrders(validImportedItems, true);
      }

      setLogSummary({
        totalRaw: itemsArray.length,
        totalImported: validImportedItems.length,
        totalRejected: rejectedItems.length
      });
      setUnimportedDetails(rejectedItems);

      addLog(`Importação de pedidos finalizada com sucesso!`);
      addLog(`Importado para a tabela "OrderHeader": ${validImportedItems.length} pedidos reais gravados.`);
      if (rejectedItems.length > 0) {
        addLog(`Rejeitados/Não importados: ${rejectedItems.length} registros (motivo: produto não cadastrado ou dados inválidos).`);
      }

      setUpdateStatus('success');
      setUpdateMessage(`Sucesso! Foram importados com sucesso ${validImportedItems.length} pedidos. ${rejectedItems.length} pedidos foram recusados por falta de associação de produto no cadastro.`);
      setIsLogModalOpen(true);
    } catch (err: any) {
      addLog(`FALHA NA INTEGRAÇÃO: ${err.message || 'Erro desconhecido.'}`);
      setUpdateStatus('error');
      setUpdateMessage(`Falha na integração: ${err.message || 'Erro desconhecido.'}`);
      setLogSummary({
        totalRaw: 0,
        totalImported: 0,
        totalRejected: 0
      });
      setIsLogModalOpen(true);
    } finally {
      setIsUpdating(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('Todos');
  
  // Track expanded order rows
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderHeader | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Order Form State (Header/Capa)
  const [orderNumber, setOrderNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<'Alta' | 'Média' | 'Baixa'>('Média');
  const [notes, setNotes] = useState('');
  
  // Order Form State (Items list inside the order)
  const [formItems, setFormItems] = useState<Omit<OrderItem, 'id'>[]>([]);

  // Item Temp fields for the add-line inside modal
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [tempQty, setTempQty] = useState<number>(1);
  const [tempPrice, setTempPrice] = useState<number>(0);

  const [formError, setFormError] = useState('');

  // Toggle row expansion
  const toggleRow = (orderId: string) => {
    setExpandedOrderIds(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      const matchesSearch = 
        ord.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ord.clientName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesPriority = 
        priorityFilter === 'Todos' || 
        ord.priority === priorityFilter;

      return matchesSearch && matchesPriority;
    });
  }, [orders, searchTerm, priorityFilter]);

  // Set default state when creating new product link
  const handleOpenAddModal = () => {
    setEditingOrder(null);
    setOrderNumber(`PED-${Math.floor(1000 + Math.random() * 9000)}`);
    setClientName('');
    
    // Set today's date in local YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
    
    setPriority('Média');
    setNotes('');
    setFormItems([]);
    
    // Set up temp item fields
    if (products.length > 0) {
      setSelectedProductCode(products[0].code);
    } else {
      setSelectedProductCode('');
    }
    setTempQty(1);
    setTempPrice(100);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open edit modal and load order header & items
  const handleOpenEditModal = (order: OrderHeader) => {
    setEditingOrder(order);
    setOrderNumber(order.orderNumber);
    setClientName(order.clientName);
    setDate(order.date);
    setPriority(order.priority);
    setNotes(order.notes || '');
    
    // Load existing items without their ID to let modal modify them cleanly
    setFormItems(order.items.map(it => ({
      productCode: it.productCode,
      productName: it.productName,
      quantityOrdered: it.quantityOrdered,
      unitPrice: it.unitPrice
    })));

    if (products.length > 0) {
      setSelectedProductCode(products[0].code);
    }
    setTempQty(1);
    setTempPrice(100);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open delete confirm
  const handleOpenDeleteConfirm = (id: string) => {
    setDeletingId(id);
    setIsDeleteConfirmOpen(true);
  };

  // Add an item line inside the order compilation form
  const handleAddFormItem = () => {
    if (!selectedProductCode) {
      setFormError('Selecione um produto para adicionar.');
      return;
    }

    const prod = products.find(p => p.code === selectedProductCode);
    if (!prod) {
      setFormError('Produto selecionado inválido.');
      return;
    }

    if (tempQty <= 0) {
      setFormError('A quantidade do item deve ser de pelo menos 1 unidade.');
      return;
    }

    if (tempPrice < 0) {
      setFormError('O preço unitário não pode ser negativo.');
      return;
    }

    // Check if product already exists in this compiling order form
    const existsIdx = formItems.findIndex(it => it.productCode === selectedProductCode);
    if (existsIdx > -1) {
      // Aggregate quantity
      const updated = [...formItems];
      updated[existsIdx].quantityOrdered += tempQty;
      // Optionally update price to latest or keep previous
      updated[existsIdx].unitPrice = tempPrice;
      setFormItems(updated);
    } else {
      setFormItems(prev => [
        ...prev,
        {
          productCode: prod.code,
          productName: prod.name,
          quantityOrdered: tempQty,
          unitPrice: tempPrice
        }
      ]);
    }

    // Reset temp fields
    setTempQty(1);
    setFormError('');
  };

  // Remove an item line inside the form
  const handleRemoveFormItem = (index: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  // Submit compiled order form
  const handleSubmitOrder = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!orderNumber.trim()) {
      setFormError('O número do pedido é obrigatório.');
      return;
    }

    if (!clientName.trim()) {
      setFormError('O nome do cliente é obrigatório.');
      return;
    }

    if (!date) {
      setFormError('A data de emissão é obrigatória.');
      return;
    }

    if (formItems.length === 0) {
      setFormError('O pedido deve conter pelo menos 1 item lançado.');
      return;
    }

    // Verify unique order number (excluding current editing order)
    const duplicate = orders.find(ord => 
      ord.orderNumber.trim().toUpperCase() === orderNumber.trim().toUpperCase() &&
      (!editingOrder || ord.id !== editingOrder.id)
    );

    if (duplicate) {
      setFormError(`Já existe um pedido lançado com o número "${orderNumber.trim().toUpperCase()}". Escolha outro número.`);
      return;
    }

    // Add unique IDs to the form items to create standard OrderItems
    const finalItems: OrderItem[] = formItems.map((it, idx) => ({
      id: `itm-${Date.now()}-${idx}`,
      ...it
    }));

    if (editingOrder) {
      onEditOrder({
        id: editingOrder.id,
        orderNumber: orderNumber.trim().toUpperCase(),
        clientName: clientName.trim(),
        date: date,
        priority: priority,
        items: finalItems,
        notes: notes.trim() || undefined
      });
    } else {
      onAddOrder({
        orderNumber: orderNumber.trim().toUpperCase(),
        clientName: clientName.trim(),
        date: date,
        priority: priority,
        items: finalItems,
        notes: notes.trim() || undefined
      });
    }

    setIsModalOpen(false);
  };

  // Confirm delete of full order
  const handleDeleteOrder = () => {
    if (deletingId) {
      onDeleteOrder(deletingId);
      setIsDeleteConfirmOpen(false);
      setDeletingId(null);
    }
  };

  // Compute Order Totals
  const getOrderTotal = (order: OrderHeader) => {
    return order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);
  };

  const getOrderTotalItemsCount = (order: OrderHeader) => {
    return order.items.reduce((sum, item) => sum + item.quantityOrdered, 0);
  };

  return (
    <div className="space-y-4">
      {/* Search, filters & Add Order button */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Buscar por nº do pedido ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Priority filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              Filtrar Prioridade:
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border border-slate-300 rounded-lg text-sm bg-white px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              <option value="Todos">Todas as Prioridades</option>
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap shrink-0">
          <button
            id="btn-execute-webhook-orders"
            onClick={handleExecuteUpdate}
            disabled={isUpdating}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Sincronizar pedidos via Webhook de Integração ativo"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Atualizando...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Atualizar</span>
              </>
            )}
          </button>

          {orders.length > 0 && canManageOrders && (
            <button
              id="btn-clear-all-orders"
              onClick={() => setIsClearAllConfirmOpen(true)}
              className="flex items-center justify-center gap-2 border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              title="Excluir todos os pedidos do sistema"
            >
              <Trash2 className="h-4 w-4 text-rose-500" />
              <span>Excluir Todos</span>
            </button>
          )}

          {canManageOrders ? (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Lançar Novo Pedido (Capa + Itens)
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-400 text-xs font-semibold rounded-lg select-none">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Apenas Vendedor/Admin altera pedidos</span>
            </div>
          )}
        </div>
      </div>

      {/* Orders List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium">Nenhum pedido localizado com os filtros atuais.</p>
              <p className="text-xs text-slate-400 mt-1">Ligue um novo pedido clicando no botão acima.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                  <th className="px-6 py-3.5 w-10"></th>
                  <th className="px-6 py-3.5">Nº do Pedido</th>
                  <th className="px-6 py-3.5">Cliente</th>
                  <th className="px-6 py-3.5">Emissão</th>
                  <th className="px-6 py-3.5 text-center">Prioridade</th>
                  <th className="px-6 py-3.5 text-center">Qtd Itens</th>
                  <th className="px-6 py-3.5 text-right">Valor Total</th>
                  {canManageOrders && <th className="px-6 py-3.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((order) => {
                  const isExpanded = !!expandedOrderIds[order.id];
                  const totalVal = getOrderTotal(order);
                  const totalItems = getOrderTotalItemsCount(order);

                  return (
                    <div key={order.id} className="contents">
                      {/* Main row */}
                      <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-indigo-50/10' : ''}`}>
                        {/* Expand Trigger Button */}
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleRow(order.id)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>

                        {/* Order Number */}
                        <td className="px-6 py-4 font-mono font-bold text-slate-800">
                          {order.orderNumber}
                        </td>

                        {/* Client Name */}
                        <td className="px-6 py-4 font-semibold text-slate-800 max-w-[200px] truncate">
                          {order.clientName}
                        </td>

                        {/* Emission date */}
                        <td className="px-6 py-4 text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{new Date(order.date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </td>

                        {/* Priority Badge */}
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            order.priority === 'Alta' 
                              ? 'bg-rose-100 text-rose-700' 
                              : order.priority === 'Média' 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {order.priority}
                          </span>
                        </td>

                        {/* Quantity items */}
                        <td className="px-6 py-4 text-center font-semibold text-slate-600">
                          {order.items.length} <span className="text-xs font-normal text-slate-400">({totalItems} un)</span>
                        </td>

                        {/* Value total */}
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                          $ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Actions */}
                        {canManageOrders && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEditModal(order)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                title="Editar pedido completo"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleOpenDeleteConfirm(order.id)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                title="Excluir pedido"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* Nested Expanded Row for Items */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={canManageOrders ? 8 : 7} className="px-8 py-4 bg-slate-50/50 border-t border-b border-slate-100 animate-slide-down">
                            <div className="bg-white rounded-lg border border-slate-200/60 p-4 shadow-2xs space-y-3">
                              
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                  <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                                  Itens Inclusos no Pedido
                                </h4>
                                {order.notes && (
                                  <div className="text-xs text-slate-500 italic max-w-md truncate">
                                    <strong className="text-slate-600">Obs:</strong> {order.notes}
                                  </div>
                                )}
                              </div>

                              {/* Items list inside the order */}
                              <div className="divide-y divide-slate-100">
                                {order.items.map((it, idx) => (
                                  <div key={it.id || idx} className="py-2.5 flex items-center justify-between text-xs gap-4">
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-sm">
                                        {it.productCode}
                                      </span>
                                      <span className="font-semibold text-slate-700">{it.productName}</span>
                                    </div>

                                    <div className="flex items-center gap-6 font-mono">
                                      <div>
                                        <span className="text-slate-400">Qtd:</span>{' '}
                                        <strong className="text-slate-700">{it.quantityOrdered} un</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">Preço:</span>{' '}
                                        <strong className="text-slate-700">$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">Subtotal:</span>{' '}
                                        <strong className="text-slate-900">$ {(it.quantityOrdered * it.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Summary footer */}
                              <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-slate-100 font-sans">
                                <span>Lançamento sequencial e simulação habilitada no painel principal.</span>
                                <div>
                                  Total do Pedido:{' '}
                                  <strong className="text-sm text-indigo-900 font-mono font-extrabold ml-1">
                                    $ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </strong>
                                </div>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </div>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL - CADASTRO / EDIÇÃO DE PEDIDOS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col my-8 max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <FileText className="text-indigo-600 h-5 w-5" />
                {editingOrder ? 'Editar Lançamento de Pedido' : 'Lançar Novo Pedido (Capa e Itens)'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Combined Scrollable Form */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* SECTION 1: CAPA (HEADER) */}
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Dados da Capa do Pedido</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Order Number */}
                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase">Nº do Pedido</label>
                    <input
                      type="text"
                      placeholder="Ex: PED-1005"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 uppercase"
                    />
                  </div>

                  {/* Client Name */}
                  <div className="md:col-span-8 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase">Cliente / Razão Social</label>
                    <input
                      type="text"
                      placeholder="Ex: Indústria Metalúrgica do Vale S/A"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>

                  {/* Emission Date */}
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase">Data de Emissão</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>

                  {/* Priority */}
                  <div className="md:col-span-6 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase">Prioridade de Expedição</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as 'Alta' | 'Média' | 'Baixa')}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-semibold"
                    >
                      <option value="Alta">Alta (Despacho Urgente)</option>
                      <option value="Média">Média (Fila de Coleta Padrão)</option>
                      <option value="Baixa">Baixa (Sem pressa de liberação)</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="md:col-span-12 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase">Observações / Instruções de Entrega</label>
                    <textarea
                      placeholder="Ex: Entregar apenas em horário comercial, faturar apenas lote completo..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: ITENS (DYNAMIC LIST) */}
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Itens do Pedido</h4>
                </div>

                {/* Sub-form to compile one item before adding it */}
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  
                  {/* Select product */}
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">Lançar Produto</label>
                    <select
                      value={selectedProductCode}
                      onChange={(e) => {
                        setSelectedProductCode(e.target.value);
                        // Try to fetch reasonable standard price based on product type to help user
                        if (e.target.value === 'PROD001') setTempPrice(3899.90);
                        else if (e.target.value === 'PROD002') setTempPrice(1299.00);
                        else if (e.target.value === 'PROD003') setTempPrice(650.00);
                        else if (e.target.value === 'PROD004') setTempPrice(499.00);
                        else if (e.target.value === 'PROD005') setTempPrice(549.90);
                        else if (e.target.value === 'PROD006') setTempPrice(4200.00);
                        else setTempPrice(150.00);
                      }}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    >
                      <option value="">-- Selecione o produto --</option>
                      {products.map(p => (
                        <option key={p.code} value={p.code}>[{p.code}] - {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Qty ordered */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">Qtd Pedida</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={(e) => setTempQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 font-mono font-bold focus:outline-hidden"
                    />
                  </div>

                  {/* Unit price */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-indigo-800 uppercase">Preço Unit. ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={tempPrice}
                      onChange={(e) => setTempPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2 font-mono focus:outline-hidden"
                    />
                  </div>

                  {/* Add action button */}
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddFormItem}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 shadow-xs transition-colors h-[38px]"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Incluir Item
                    </button>
                  </div>
                </div>

                {/* List of currently compiled items */}
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <span>Lista de Itens Lançados</span>
                    <span>{formItems.length} {formItems.length === 1 ? 'Lançado' : 'Lançados'}</span>
                  </div>

                  {formItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      Nenhum item adicionado a este pedido ainda. Utilize o formulário acima para lançar itens.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                      {formItems.map((it, idx) => {
                        const rowTotal = it.quantityOrdered * it.unitPrice;
                        return (
                          <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50/40 text-xs gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">
                                  {it.productCode}
                                </span>
                                <span className="font-semibold text-slate-800">{it.productName}</span>
                              </div>
                              <div className="text-slate-500 flex gap-4">
                                <span>Qtd: <strong>{it.quantityOrdered} un</strong></span>
                                <span>Preço Unit: <strong>$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="font-mono font-bold text-slate-800">
                                $ {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFormItem(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                title="Remover item do pedido"
                              >
                                <Trash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary row */}
                  {formItems.length > 0 && (
                    <div className="bg-slate-50/80 px-4 py-3 border-t border-slate-200 flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-500">SOMA TOTAL DOS ITENS:</span>
                      <strong className="text-sm text-indigo-900 font-mono font-extrabold">
                        $ {formItems.reduce((acc, c) => acc + (c.quantityOrdered * c.unitPrice), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  )}
                </div>

              </div>

              {/* Form Actions Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <PackageCheck className="h-4 w-4" />
                  {editingOrder ? 'Salvar Alterações no Pedido' : 'Confirmar e Salvar Pedido'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="h-6 w-6" />
              <h3 className="font-bold text-lg text-slate-800">Confirmar Exclusão de Pedido</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-normal">
              Tem certeza que deseja excluir o pedido em aberto selecionado? Isso liberará eventuais estoques reservados para outros pedidos na fila. Esta ação não pode ser desfeita.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteOrder}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
              >
                Sim, Excluir Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR ALL ORDERS MODAL */}
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="h-6 w-6" />
              <h3 className="font-bold text-lg text-slate-800">Confirmar Exclusão de Todos os Pedidos</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-normal">
              Tem certeza que deseja excluir TODOS os pedidos cadastrados atualmente? Esta ação não pode ser desfeita.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearAllOrders) onClearAllOrders();
                  setIsClearAllConfirmOpen(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Sim, Excluir Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WEBHHOO INTEGRATION LOGS MODAL */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText className="text-indigo-600 h-5 w-5" />
                <span>Auditoria de Integração e Logs do Webhook de Pedidos</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-center">
                  <span className="block text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-0.5">Encontrados</span>
                  <span className="text-2xl font-black text-indigo-950">{logSummary.totalRaw}</span>
                  <span className="block text-[10px] text-indigo-500 mt-1 font-medium">Registros brutos</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-center">
                  <span className="block text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Importados</span>
                  <span className="text-2xl font-black text-emerald-950">{logSummary.totalImported}</span>
                  <span className="block text-[10px] text-emerald-500 mt-1 font-medium">Gravados em Pedidos</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-center">
                  <span className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-0.5">Rejeitados</span>
                  <span className="text-2xl font-black text-rose-950">{logSummary.totalRejected}</span>
                  <span className="block text-[10px] text-rose-500 mt-1 font-medium">Sem ref. produto/dados</span>
                </div>
              </div>

              {/* Log Timeline Block */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Histórico de Movimentações</h4>
                <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-xs overflow-y-auto max-h-[180px] space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
                  {executionLogs.length === 0 ? (
                    <span className="text-slate-500 italic">Nenhum log gravado nesta sessão.</span>
                  ) : (
                    executionLogs.map((log, idx) => {
                      let color = 'text-slate-300';
                      if (log.includes('ERRO')) color = 'text-rose-400 font-bold';
                      else if (log.includes('Sucesso') || log.includes('concluída com sucesso')) color = 'text-emerald-400';
                      else if (log.includes('localizado') || log.includes('clicou no botão')) color = 'text-indigo-300';
                      
                      return (
                        <div key={idx} className={`${color} leading-relaxed break-all`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Rejected List Block */}
              {unimportedDetails.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 text-rose-600">
                    <span>Lista de Pedidos Rejeitados ({unimportedDetails.length})</span>
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[180px] overflow-y-auto divide-y divide-slate-100 text-xs">
                    {unimportedDetails.map((detail, idx) => (
                      <div key={idx} className="p-2.5 hover:bg-slate-50 flex items-start justify-between gap-3 bg-rose-50/20">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800 block">Item #{idx + 1}</span>
                          <span className="text-rose-600 font-bold block">{detail.reason}</span>
                        </div>
                        <div className="text-slate-400 text-[10px] max-w-[220px] font-mono truncate" title={JSON.stringify(detail.item)}>
                          {JSON.stringify(detail.item)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Response Block */}
              {rawResponseBody && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Retorno Bruto Completo da API (JSON)</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(rawResponseBody);
                        setCopiedRaw(true);
                        setTimeout(() => setCopiedRaw(false), 2000);
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer flex items-center gap-1"
                    >
                      <Clipboard className="h-3 w-3" />
                      <span>{copiedRaw ? 'Copiado!' : 'Copiar Retorno'}</span>
                    </button>
                  </h4>
                  <pre className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg p-3.5 font-mono text-[11px] overflow-auto max-h-[160px] whitespace-pre-wrap leading-relaxed select-all">
                    {rawResponseBody}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {updateStatus === 'success' ? (
                  <span className="text-emerald-600 font-bold">● Sincronização concluída com sucesso!</span>
                ) : updateStatus === 'error' ? (
                  <span className="text-rose-600 font-bold">● Sincronização interrompida com erros.</span>
                ) : (
                  <span className="text-slate-400">● Conectando e lendo registros da API externa...</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
