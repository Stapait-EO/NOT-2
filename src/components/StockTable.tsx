import { useState, useMemo, useEffect, useCallback, FormEvent } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Building, 
  AlertCircle, 
  Package, 
  HelpCircle,
  X,
  FileCheck2,
  RefreshCw,
  FileText,
  Clipboard,
  Download,
  CheckCircle2,
  Layers,
  Tag,
  Copy,
  Check,
  ArrowUpDown,
  Info,
  Truck,
  ShoppingCart,
  ArrowUpRight,
  Calendar,
  User,
  ExternalLink
} from 'lucide-react';
import { StockBalance, Product, UserRole, WebhookConfig, FieldMapping, Warehouse, OrderHeader } from '../types';
import { INITIAL_WAREHOUSES } from '../data';

interface StockTableProps {
  stock: StockBalance[];
  products: Product[];
  orders?: OrderHeader[];
  onAddStock: (item: Omit<StockBalance, 'id'>) => void;
  onEditStock: (item: StockBalance) => void;
  onDeleteStock: (id: string) => void;
  onAddProduct: (prod: Product) => void;
  currentUserRole: UserRole;
  warehouses: Warehouse[];
  onUpdateWarehouses: (updated: Warehouse[]) => void;
  onClearAllStock?: () => void;
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
  onImportStock: (imported: Omit<StockBalance, 'id'>[], overwrite?: boolean) => void;
  onNavigateToOrders?: () => void;
}

export default function StockTable({ 
  stock, 
  products, 
  orders = [],
  onAddStock, 
  onEditStock, 
  onDeleteStock,
  onAddProduct,
  currentUserRole,
  warehouses,
  onUpdateWarehouses,
  onClearAllStock,
  webhooks,
  fieldMappings,
  onImportStock,
  onNavigateToOrders
}: StockTableProps) {
  const roleLower = (currentUserRole || '').toLowerCase();
  const isMasterOrAdmin = roleLower === 'master' || roleLower === 'admin';
  const canManageStock = isMasterOrAdmin || roleLower === 'almoxarife';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('Todos');
  const [filterOnlyWithOpenOrders, setFilterOnlyWithOpenOrders] = useState(false);

  // Webhook execution and import integration states
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

    // Função para converter campos monetários do webhook tratando . como ,
    const parseWebhookMonetary = (val: any): number => {
      if (val === undefined || val === null) return 0;
      if (typeof val === 'number') return val;
      let str = String(val).trim();
      if (!str) return 0;
      
      // Remove cifrão e espaços
      str = str.replace(/[R$\s]/g, '');
      
      // Se tiver ponto e NÃO tiver vírgula (ex: 12.50 ou 1.250), substitui o ponto por vírgula para considerar como decimal
      if (str.includes('.') && !str.includes(',')) {
        str = str.replace(/\./g, ',');
      }
      
      // Converte padrão decimal com vírgula para ponto suportado pelo JS
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

    addLog('O usuário clicou no botão "Atualizar" na tela de Análise Estoque.');

    // 1. Apagar todos os itens da tabela 'StockBalance' conforme Requisito 3
    if (onClearAllStock) {
      onClearAllStock();
      addLog('Executado o delete da tabela local "StockBalance" (todos os registros locais foram limpos).');
    } else {
      addLog('AVISO: Função para limpar tabela local indisponível.');
    }

    // 2. Encontrar o webhook ativo configurado para esta tela ou para a tabela 'StockBalance'
    let webhook = webhooks.find(wh => wh.isActive && wh.targetScreen === 'stock');
    if (!webhook) {
      webhook = webhooks.find(wh => wh.isActive && wh.tableName.trim().toLowerCase() === 'stockbalance');
    }

    if (!webhook) {
      addLog('ERRO: Nenhum webhook ativo associado a esta tela ou à tabela StockBalance.');
      setUpdateStatus('error');
      setUpdateMessage('Nenhum webhook ativo configurado para a Análise Estoque. Por favor, configure um webhook com esta tela de execução em "Configurações de Webhook".');
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

      // 3. Executar o Webhook via proxy conforme Requisito 4
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

      // 4. Analisar e importar o retorno
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

      // Função recursiva para varrer o JSON em busca do maior/primeiro array de registros
      const findArrayInObject = (obj: any, path = ''): { array: any[]; path: string } | null => {
        if (Array.isArray(obj)) {
          return { array: obj, path: path || 'root' };
        }
        if (obj && typeof obj === 'object') {
          // Primeiro tenta chaves de nível imediato (prioriza nível superior)
          const keys = Object.keys(obj);
          for (const k of keys) {
            if (Array.isArray(obj[k])) {
              const currentPath = path ? `${path}.${k}` : k;
              return { array: obj[k], path: currentPath };
            }
          }
          // Se não achou no nível imediato, desce recursivamente
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
        // Fallback: interpreta o próprio objeto como um único registro
        itemsArray = [responseData];
        addLog('O JSON de resposta não continha nenhum array diretamente. Interpretando o objeto inteiro como um único registro.');
      }

      addLog(`Dados encontrados no retorno do webhook (total de registros: ${itemsArray.length}). Iniciando validação e mapeamento...`);

      // 1. Localiza o mapeamento De/Para configurado para StockBalance (específico do webhook ou geral para StockBalance)
      const mapping = fieldMappings.find(
        m => m.webhookId === webhook!.id && 
        (m.systemTable.trim().toLowerCase() === 'stockbalance' || m.systemTable.trim().toLowerCase() === 'stock')
      ) || fieldMappings.find(
        m => (m.systemTable.trim().toLowerCase() === 'stockbalance' || m.systemTable.trim().toLowerCase() === 'stock')
      );

      // Helper robusto para ler campos do webhook considerando mapeamento De/Para, variações de maiúsculas/minúsculas e fallbacks inteligentes
      const resolveWebhookField = (item: any, configuredKey?: string, fallbackKeys: string[] = []): any => {
        if (!item || typeof item !== 'object') return undefined;

        // 1. Chave configurada no De/Para
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

        // 2. Chaves de fallback
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
      };

      if (mapping) {
        addLog(`Utilizando mapeamento "De/Para" ativo localizado (ID: ${mapping.id}, Tabela: ${mapping.systemTable}).`);
        const whMap = mapping.mappings['warehouse'] || 'cdgrupo (automático)';
        addLog(`   • Regra de Depósito De/Para: warehouse ← "${whMap}"`);
      } else {
        addLog('AVISO: Nenhum mapeamento "De/Para" manual localizado. Aplicando tradução automática inteligente (warehouse ← cdgrupo/depósito/filial).');
      }

      addLog(`Depósitos cadastrados no sistema (${warehouses.length}): ${warehouses.map(w => `${w.name} [${w.groupName || 'Sem grupo'}]`).join(', ')}`);

      const validImportedItems: Omit<StockBalance, 'id'>[] = [];
      const rejectedItems: { item: any; reason: string }[] = [];

      itemsArray.forEach((webhookItem: any, index: number) => {
        const mappedItem: any = {};

        // Resolve productCode with mapping and fallbacks
        const productCodeRaw = resolveWebhookField(webhookItem, mapping?.mappings['productCode'], [
          'productCode', 'modelo', 'code', 'sku', 'pr_cod', 'codigo', 'cod', 'cod_produto', 'product_code', 'productId', 'product_id'
        ]);

        if (!productCodeRaw) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Item #${index + 1}: Nenhum código de produto identificado nos campos mapeados ou originais (productCode, modelo, sku, code, pr_cod, codigo).`
          });
          return;
        }

        // VERIFICA SE O PRODUTO EXISTE NO CADASTRO DE PRODUTOS
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
            reason: `Código de Produto "${productCodeRaw}" não foi localizado no cadastro de Produtos (verificado SKU, pr_cod e codigo).`
          });
          return;
        }

        mappedItem.productCode = matchedProd.code;

        // Resolve productName
        const productNameRaw = resolveWebhookField(webhookItem, mapping?.mappings['productName'], [
          'productName', 'descricao', 'name', 'nome', 'description', 'product_name'
        ]);
        mappedItem.productName = productNameRaw ? String(productNameRaw).trim() : matchedProd.name;

        // RESOLVE O DEPÓSITO COM DE/PARA E TRADUÇÃO COM O CADASTRO DE DEPÓSITOS
        const rawWarehouseValue = resolveWebhookField(webhookItem, mapping?.mappings['warehouse'], [
          'warehouse', 'cdgrupo', 'cd_grupo', 'deposito', 'armazem', 'filial', 'local', 'cd_deposito', 'grupo'
        ]);

        let translatedWarehouse = '';
        if (rawWarehouseValue !== undefined && rawWarehouseValue !== null && String(rawWarehouseValue).trim() !== '') {
          const rawWhStr = String(rawWarehouseValue).trim();
          const rawWhLower = rawWhStr.toLowerCase();

          // Tradução com o Pré-cadastro de Depósitos (De/Para de Depósito):
          // 1. Busca correspondência exata por nome/código (ex: "0002.001" === "0002.001")
          // 2. Busca por prefixo/início (ex: "0002.001 - São Paulo")
          // 3. Busca por agrupamento cadastrado (ex: "São Paulo")
          // 4. Busca por ID (ex: "wh-1")
          const matchedWh = warehouses.find(w => w.name.trim().toLowerCase() === rawWhLower) ||
                            warehouses.find(w => w.name.trim().toLowerCase().startsWith(rawWhLower) || rawWhLower.startsWith(w.name.trim().toLowerCase())) ||
                            warehouses.find(w => w.groupName && w.groupName.trim().toLowerCase() === rawWhLower) ||
                            warehouses.find(w => w.id.toLowerCase() === rawWhLower);

          if (matchedWh) {
            translatedWarehouse = matchedWh.name;
          } else {
            // Mantém o código do webhook traduzido sem forçar "DEP01"
            translatedWarehouse = rawWhStr;
          }
        } else {
          // Fallback final: primeiro depósito ativo do cadastro
          const firstActiveWh = warehouses.find(w => w.isActive)?.name || 'DEP01 - Depósito Central';
          translatedWarehouse = firstActiveWh;
        }

        mappedItem.warehouse = translatedWarehouse;

        // Resolve quantity
        const rawQuantity = resolveWebhookField(webhookItem, mapping?.mappings['quantity'], [
          'quantity', 'qtdest', 'qtdEst', 'qtd', 'stock', 'quantidade', 'saldo', 'quantidade_atual'
        ]);
        mappedItem.quantity = rawQuantity !== undefined ? Number(rawQuantity) : 0;

        // Resolve campos auxiliares opcionais
        const rawPrCod = resolveWebhookField(webhookItem, mapping?.mappings['pr_cod'], [
          'pr_cod', 'prCod', 'cod_interno', 'codigo_interno'
        ]);
        if (rawPrCod !== undefined) mappedItem.pr_cod = Number(rawPrCod);

        const rawCodigo = resolveWebhookField(webhookItem, mapping?.mappings['codigo'], [
          'codigo', 'cod_estruturado', 'codigo_estruturado'
        ]);
        if (rawCodigo !== undefined) mappedItem.codigo = String(rawCodigo).trim();

        const rawLote = resolveWebhookField(webhookItem, mapping?.mappings['lote'], [
          'lote', 'marca', 'batch', 'lot'
        ]);
        if (rawLote !== undefined) mappedItem.lote = String(rawLote).trim();

        const rawPrPreco = resolveWebhookField(webhookItem, mapping?.mappings['pr_preco'], [
          'pr_preco', 'prPreco', 'preco', 'preco_unitario', 'price', 'unit_price', 'customed', 'custopdr'
        ]);
        if (rawPrPreco !== undefined) {
          mappedItem.pr_preco = parseWebhookMonetary(rawPrPreco);
        } else {
          mappedItem.pr_preco = (matchedProd as any).pr_preco || 0;
        }

        const rawVlrest = resolveWebhookField(webhookItem, mapping?.mappings['vlrest'], [
          'vlrest', 'vlrEst', 'valor_total', 'total_value', 'vlr_estoque'
        ]);
        if (rawVlrest !== undefined) {
          mappedItem.vlrest = parseWebhookMonetary(rawVlrest);
        } else if (mappedItem.pr_preco !== undefined) {
          mappedItem.vlrest = mappedItem.quantity * mappedItem.pr_preco;
        }

        validImportedItems.push(mappedItem);
      });

      // Identifica se algum depósito do webhook não constava no cadastro de depósitos e inclui para sincronização
      const uniqueFoundWhs = new Set<string>();
      validImportedItems.forEach(item => {
        if (item.warehouse) uniqueFoundWhs.add(item.warehouse);
      });

      const missingWhsToAdd: Warehouse[] = [];
      uniqueFoundWhs.forEach(whCode => {
        const alreadyInCad = warehouses.some(w => 
          w.name.trim().toLowerCase() === whCode.trim().toLowerCase()
        );
        if (!alreadyInCad) {
          let autoGroup = 'Outros';
          if (whCode.startsWith('0002')) autoGroup = 'São Paulo';
          else if (whCode.startsWith('0004')) autoGroup = 'Miami';
          else if (whCode.startsWith('DEP01') || whCode.startsWith('DEP02')) autoGroup = 'São Paulo';

          missingWhsToAdd.push({
            id: `wh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: whCode,
            isActive: true,
            groupName: autoGroup
          });
        }
      });

      if (missingWhsToAdd.length > 0) {
        const updatedWhList = [...warehouses, ...missingWhsToAdd];
        onUpdateWarehouses(updatedWhList);
        addLog(`Novos depósitos cadastrados no sistema: ${missingWhsToAdd.map(w => `${w.name} (${w.groupName})`).join(', ')}.`);
      }

      // Detalha nos logs a distribuição dos itens por depósito e agrupamento
      const whCounts: { [key: string]: number } = {};
      validImportedItems.forEach(item => {
        whCounts[item.warehouse] = (whCounts[item.warehouse] || 0) + 1;
      });
      addLog(`Distribuição dos registros importados por Depósito:`);
      Object.entries(whCounts).forEach(([wh, count]) => {
        const whObj = warehouses.find(w => w.name.trim().toLowerCase() === wh.toLowerCase());
        const grpName = whObj?.groupName || (wh.startsWith('0002') ? 'São Paulo' : wh.startsWith('0004') ? 'Miami' : 'Outros');
        addLog(`   • Depósito "${wh}" [Grupo: ${grpName}]: ${count} registros`);
      });

      // Importa os itens mapeados na tabela 'StockBalance' substituindo os anteriores completamente
      onImportStock(validImportedItems, true);

      // Atualiza os contadores
      setLogSummary({
        totalRaw: itemsArray.length,
        totalImported: validImportedItems.length,
        totalRejected: rejectedItems.length
      });
      setUnimportedDetails(rejectedItems);

      addLog(`Mapeamento finalizado com sucesso!`);
      addLog(`Importado para a tabela "StockBalance": ${validImportedItems.length} registros com sucesso.`);
      if (rejectedItems.length > 0) {
        addLog(`Não importado (registros rejeitados: ${rejectedItems.length}).`);
        addLog(`Motivo de não ter importado: não encontrado referência com o cadastro de produto (ou ausência de chave de produto).`);
      }

      setUpdateStatus('success');
      setUpdateMessage(`Sucesso! Tabela de Estoque recarregada com ${validImportedItems.length} registros reais importados. ${rejectedItems.length} registros foram rejeitados por falta de referência no cadastro de produtos.`);
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
      setUnimportedDetails([]);
      setIsLogModalOpen(true);
    } finally {
      setIsUpdating(false);
    }
  };

  const exportLogToTxt = () => {
    let text = "==================================================\n";
    text += "        RELATÓRIO DE AUDITORIA E EXECUÇÃO DO WEBHOOK\n";
    text += "==================================================\n\n";
    text += `Data/Hora: ${new Date().toLocaleString()}\n`;
    text += `Tabela Alvo: StockBalance (Analise Estoque)\n`;
    text += `Total Processados: ${logSummary.totalRaw}\n`;
    text += `Sucesso (Importados): ${logSummary.totalImported}\n`;
    text += `Rejeitados (Sem cadastro de produto): ${logSummary.totalRejected}\n\n`;
    
    text += "--- FLUXO DE EXECUÇÃO DETALHADO ---\n";
    executionLogs.forEach(log => {
      text += `${log}\n`;
    });

    if (rawResponseBody) {
      text += "\n--- RETORNO BRUTO DA API (JSON) ---\n";
      text += `${rawResponseBody}\n`;
    }
    
    text += "\n--- REGISTROS REJEITADOS ---\n";
    if (unimportedDetails.length === 0) {
      text += "Nenhum registro foi rejeitado. Sucesso total na sincronização!\n";
    } else {
      unimportedDetails.forEach((d, idx) => {
        text += `\n[Registro #${idx + 1}]\n`;
        text += `Motivo da Rejeição: ${d.reason}\n`;
        text += `Dados Originais do Webhook:\n${JSON.stringify(d.item, null, 2)}\n`;
      });
    }
    
    text += "\n==================================================\n";
    text += "Fim do Relatório de Auditoria\n";
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria-webhook-estoque-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockBalance | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form Fields
  const [productSelectionMode, setProductSelectionMode] = useState<'existing' | 'new'>('existing');
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [newProductCode, setNewProductCode] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(warehouses[0]?.name || 'DEP01 - Depósito Central');
  const [customWarehouse, setCustomWarehouse] = useState('');
  const [warehouseMode, setWarehouseMode] = useState<'standard' | 'custom'>('standard');
  const [quantity, setQuantity] = useState<number>(0);
  const [prCod, setPrCod] = useState('');
  const [codigoStructured, setCodigoStructured] = useState('');
  const [lote, setLote] = useState('');
  const [prPreco, setPrPreco] = useState('');
  const [vlrest, setVlrest] = useState('');
  
  // Error handling
  const [formError, setFormError] = useState('');

  // Warehouse View and Management State
  const [viewMode, setViewMode] = useState<'consolidated' | 'detailed'>('consolidated');
  const [isWhManagementOpen, setIsWhManagementOpen] = useState(false);
  const [newWhName, setNewWhName] = useState('');
  const [newWhGroup, setNewWhGroup] = useState('');
  const [whError, setWhError] = useState('');

  // Editing warehouses state
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [editingWhName, setEditingWhName] = useState('');
  const [editingWhActive, setEditingWhActive] = useState(true);
  const [editingWhGroup, setEditingWhGroup] = useState('');

  // Extract unique active warehouses from pre-registered list plus any warehouse currently in use in stock
  const allWarehouses = useMemo(() => {
    const set = new Set<string>();
    warehouses.forEach(w => {
      if (w.isActive) {
        set.add(w.name);
      }
    });
    // If no active pre-registered warehouses are loaded, fall back to default list
    if (set.size === 0) {
      INITIAL_WAREHOUSES.forEach(w => {
        // Handle both string fallback and structured format
        const name = typeof w === 'string' ? w : w.name;
        set.add(name);
      });
    }
    // Also include warehouses currently present in existing stock to avoid losing them
    stock.forEach(s => set.add(s.warehouse));
    return Array.from(set);
  }, [stock, warehouses]);

  // Open Orders (Pedidos em Aberto / A Sair) Map & Metrics
  const productOrdersMap = useMemo(() => {
    const map = new Map<string, {
      totalQtyOrdered: number;
      ordersCount: number;
      ordersList: {
        orderId: string;
        orderNumber: string;
        clientName: string;
        date: string;
        priority: string;
        quantityOrdered: number;
        unitPrice: number;
        totalPrice: number;
      }[];
    }>();

    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const rawCode = item.productCode?.trim();
        if (!rawCode) return;
        const codeKey = rawCode.toUpperCase();

        let summary = map.get(codeKey);
        if (!summary) {
          summary = {
            totalQtyOrdered: 0,
            ordersCount: 0,
            ordersList: []
          };
          map.set(codeKey, summary);
        }

        const qty = Number(item.quantityOrdered) || 0;
        const price = Number(item.unitPrice) || 0;
        summary.totalQtyOrdered += qty;
        summary.ordersList.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          clientName: order.clientName || 'Cliente não informado',
          date: order.date || '',
          priority: order.priority || 'Média',
          quantityOrdered: qty,
          unitPrice: price,
          totalPrice: qty * price
        });
        summary.ordersCount = summary.ordersList.length;
      });
    });

    return map;
  }, [orders]);

  const getProductOrdersSummary = (productCode: string) => {
    if (!productCode) return { totalQtyOrdered: 0, ordersCount: 0, ordersList: [] };
    const key = productCode.trim().toUpperCase();
    return productOrdersMap.get(key) || { totalQtyOrdered: 0, ordersCount: 0, ordersList: [] };
  };

  const totalProductsWithOrdersCount = useMemo(() => {
    let count = 0;
    productOrdersMap.forEach(summary => {
      if (summary.totalQtyOrdered > 0) count++;
    });
    return count;
  }, [productOrdersMap]);

  const totalAllOpenOrdersQty = useMemo(() => {
    let total = 0;
    productOrdersMap.forEach(summary => {
      total += summary.totalQtyOrdered;
    });
    return total;
  }, [productOrdersMap]);

  // Helper to determine warehouse group
  const getWarehouseGroup = useCallback((whName: string): string => {
    if (!whName) return "Outros";
    const cleanWh = String(whName).trim().toLowerCase();
    const wh = warehouses.find(w => 
      w.name.trim().toLowerCase() === cleanWh ||
      cleanWh.startsWith(w.name.trim().toLowerCase()) ||
      w.name.trim().toLowerCase().startsWith(cleanWh) ||
      (w.groupName && w.groupName.trim().toLowerCase() === cleanWh)
    );
    if (!wh) {
      if (cleanWh.startsWith('0002')) return "São Paulo";
      if (cleanWh.startsWith('0004')) return "Miami";
      return "Outros";
    }
    if (!wh.isActive) return "Inativo";
    return wh.groupName?.trim() || "Outros";
  }, [warehouses]);

  // Extract all unique group names of active warehouses + any groups present in current stock
  const activeGroups = useMemo(() => {
    const groups = new Set<string>();
    warehouses.forEach(w => {
      if (w.isActive && w.groupName?.trim()) {
        groups.add(w.groupName.trim());
      }
    });
    // Also include any active groups present in stock items
    stock.forEach(item => {
      const grp = getWarehouseGroup(item.warehouse);
      if (grp && grp !== 'Inativo') {
        groups.add(grp);
      }
    });
    // Fallback/Default groups if none configured
    if (groups.size === 0) {
      groups.add("São Paulo");
      groups.add("Miami");
    }
    // Check if there are active warehouses that are ungrouped (empty groupName)
    const hasUngrouped = warehouses.some(w => w.isActive && !w.groupName?.trim());
    if (hasUngrouped) {
      groups.add("Outros");
    }
    return Array.from(groups);
  }, [warehouses, stock, getWarehouseGroup]);

  // Filtered Stock Balance list by search term, group, and open orders
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const matchesSearch = 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase());
      
      const itemGroup = getWarehouseGroup(item.warehouse);
      const matchesWarehouseGroup = 
        selectedWarehouseFilter === 'Todos' || 
        itemGroup.toLowerCase() === selectedWarehouseFilter.toLowerCase();

      const matchesOpenOrders = 
        !filterOnlyWithOpenOrders || 
        (getProductOrdersSummary(item.productCode).totalQtyOrdered > 0);

      return matchesSearch && matchesWarehouseGroup && matchesOpenOrders;
    });
  }, [stock, searchTerm, selectedWarehouseFilter, filterOnlyWithOpenOrders, productOrdersMap, getWarehouseGroup]);

  // Groups to display as columns in the consolidated view
  const displayedGroups = useMemo(() => {
    if (selectedWarehouseFilter !== 'Todos') {
      const matched = activeGroups.filter(g => g.toLowerCase() === selectedWarehouseFilter.toLowerCase());
      return matched.length > 0 ? matched : activeGroups;
    }
    return activeGroups;
  }, [selectedWarehouseFilter, activeGroups]);

  // Grouped Stock items for the Consolidated Grid
  const groupedStock = useMemo(() => {
    const map = new Map<string, {
      productCode: string;
      productName: string;
      groups: {
        [groupName: string]: {
          quantity: number;
          sumPrPrecoTimesQty: number;
          sumVlrestTimesQty: number;
        }
      }
    }>();

    filteredStock.forEach(item => {
      const prod = products.find(p => p.code === item.productCode);
      const displayPrPreco = item.pr_preco !== undefined ? item.pr_preco : ((prod as any)?.pr_preco || 0);
      const displayVlrest = item.vlrest !== undefined ? item.vlrest : ((prod as any)?.vlrest || 0);

      const groupName = getWarehouseGroup(item.warehouse);
      if (groupName === 'Inativo') return; // Hide stock from inactive warehouses in consolidated view

      let row = map.get(item.productCode);
      if (!row) {
        row = {
          productCode: item.productCode,
          productName: item.productName || prod?.name || 'Produto Sem Nome',
          groups: {}
        };
        map.set(item.productCode, row);
      }

      if (!row.groups[groupName]) {
        row.groups[groupName] = {
          quantity: 0,
          sumPrPrecoTimesQty: 0,
          sumVlrestTimesQty: 0
        };
      }

      const g = row.groups[groupName];
      g.quantity += item.quantity;
      g.sumPrPrecoTimesQty += item.quantity * displayPrPreco;
      g.sumVlrestTimesQty += item.quantity * displayVlrest;
    });

    return Array.from(map.values()).sort((a, b) => 
      a.productCode.localeCompare(b.productCode, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [filteredStock, products, warehouses]);

  // Total sum of "Vr total médio" per group
  const groupTotals = useMemo(() => {
    const totals: { [groupName: string]: number } = {};
    activeGroups.forEach(grp => {
      let sum = 0;
      groupedStock.forEach(row => {
        const data = row.groups[grp];
        if (data && data.quantity > 0) {
          const avgPrice = data.sumPrPrecoTimesQty / data.quantity;
          const totalVal = avgPrice * data.quantity; // Preço Unit Médio * Quantidade
          sum += totalVal;
        }
      });
      totals[grp] = sum;
    });
    return totals;
  }, [activeGroups, groupedStock]);

  // Batch Breakdown Modal ("Saldo por Lote") State & Calculations
  const [batchModalData, setBatchModalData] = useState<{
    isOpen: boolean;
    productCode: string;
    productName: string;
    groupName: string;
  } | null>(null);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [batchSortField, setBatchSortField] = useState<'lote' | 'warehouse' | 'quantity' | 'pr_preco' | 'vlrest'>('quantity');
  const [batchSortOrder, setBatchSortOrder] = useState<'asc' | 'desc'>('desc');
  const [copiedBatchData, setCopiedBatchData] = useState(false);

  const handleOpenBatchModal = (productCode: string, productName: string, groupName: string) => {
    setBatchSearchTerm('');
    setBatchSortField('quantity');
    setBatchSortOrder('desc');
    setCopiedBatchData(false);
    setBatchModalData({
      isOpen: true,
      productCode,
      productName,
      groupName
    });
  };

  const handleCloseBatchModal = () => {
    setBatchModalData(null);
  };

  // Close batch modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && batchModalData?.isOpen) {
        handleCloseBatchModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [batchModalData]);

  // Items belonging to this product and selected warehouse group
  const batchModalItems = useMemo(() => {
    if (!batchModalData?.isOpen) return [];
    return stock.filter(item => {
      if (item.productCode !== batchModalData.productCode) return false;
      const grp = getWarehouseGroup(item.warehouse);
      return grp === batchModalData.groupName;
    });
  }, [batchModalData, stock, warehouses]);

  // Filtered and sorted items inside the batch modal
  const filteredBatchItems = useMemo(() => {
    let list = batchModalItems.filter(item => {
      if (!batchSearchTerm.trim()) return true;
      const q = batchSearchTerm.toLowerCase();
      const loteMatch = (item.lote || '').toLowerCase().includes(q);
      const whMatch = (item.warehouse || '').toLowerCase().includes(q);
      const codigoMatch = (item.codigo || '').toLowerCase().includes(q);
      const prCodMatch = String(item.pr_cod || '').toLowerCase().includes(q);
      return loteMatch || whMatch || codigoMatch || prCodMatch;
    });

    list.sort((a, b) => {
      let valA: any = a[batchSortField];
      let valB: any = b[batchSortField];

      if (batchSortField === 'lote') {
        valA = a.lote || '';
        valB = b.lote || '';
        return batchSortOrder === 'asc'
          ? String(valA).localeCompare(String(valB), undefined, { numeric: true })
          : String(valB).localeCompare(String(valA), undefined, { numeric: true });
      }
      if (batchSortField === 'warehouse') {
        valA = a.warehouse || '';
        valB = b.warehouse || '';
        return batchSortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return batchSortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return list;
  }, [batchModalItems, batchSearchTerm, batchSortField, batchSortOrder]);

  const batchMetrics = useMemo(() => {
    let totalQty = 0;
    let totalVal = 0;
    const uniqueLots = new Set<string>();
    const uniqueWhs = new Set<string>();

    batchModalItems.forEach(item => {
      totalQty += item.quantity;
      const pr = item.pr_preco || 0;
      const vl = item.vlrest !== undefined ? item.vlrest : (item.quantity * pr);
      totalVal += vl;
      uniqueLots.add(item.lote?.trim() || '(Sem lote)');
      uniqueWhs.add(item.warehouse);
    });

    const avgPrice = totalQty > 0 ? (totalVal / totalQty) : 0;

    return {
      totalQty,
      totalVal,
      avgPrice,
      lotCount: uniqueLots.size,
      whCount: uniqueWhs.size
    };
  }, [batchModalItems]);

  const copyBatchDetailsToClipboard = () => {
    if (!batchModalData) return;
    let text = `SALDO POR LOTE - ${batchModalData.productCode} (${batchModalData.productName})\n`;
    text += `Depósito / Grupo: ${batchModalData.groupName}\n`;
    text += `Saldo Total: ${batchMetrics.totalQty.toLocaleString('pt-BR')} un | Valor Total: $ ${batchMetrics.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    text += `Lote\tDepósito\tCód. Estruturado\tpr_cod\tQuantidade\tPreço Unit.\tValor Total\n`;
    filteredBatchItems.forEach(item => {
      const pr = item.pr_preco !== undefined ? item.pr_preco : 0;
      const vl = item.vlrest !== undefined ? item.vlrest : (item.quantity * pr);
      text += `${item.lote || '-'}\t${item.warehouse}\t${item.codigo || '-'}\t${item.pr_cod || '-'}\t${item.quantity}\t${pr}\t${vl}\n`;
    });
    navigator.clipboard.writeText(text);
    setCopiedBatchData(true);
    setTimeout(() => setCopiedBatchData(false), 2000);
  };

  // Open Orders Modal ("Pedidos em Aberto (A Sair)") State & Calculations
  const [ordersModalData, setOrdersModalData] = useState<{
    isOpen: boolean;
    productCode: string;
    productName: string;
  } | null>(null);
  const [ordersSearchTerm, setOrdersSearchTerm] = useState('');
  const [ordersSortField, setOrdersSortField] = useState<'orderNumber' | 'clientName' | 'date' | 'priority' | 'quantityOrdered' | 'unitPrice' | 'totalPrice'>('quantityOrdered');
  const [ordersSortOrder, setOrdersSortOrder] = useState<'asc' | 'desc'>('desc');
  const [copiedOrdersData, setCopiedOrdersData] = useState(false);

  const handleOpenOrdersModal = (productCode: string, productName: string) => {
    setOrdersSearchTerm('');
    setOrdersSortField('quantityOrdered');
    setOrdersSortOrder('desc');
    setCopiedOrdersData(false);
    setOrdersModalData({
      isOpen: true,
      productCode,
      productName
    });
  };

  const handleCloseOrdersModal = () => {
    setOrdersModalData(null);
  };

  // Close orders modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ordersModalData?.isOpen) {
        handleCloseOrdersModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ordersModalData]);

  // Orders summary for the currently opened modal
  const currentModalOrdersSummary = useMemo(() => {
    if (!ordersModalData?.isOpen) return { totalQtyOrdered: 0, ordersCount: 0, ordersList: [] };
    return getProductOrdersSummary(ordersModalData.productCode);
  }, [ordersModalData, productOrdersMap]);

  // Physical stock in total across all warehouses for the product in modal
  const currentModalPhysicalStock = useMemo(() => {
    if (!ordersModalData?.isOpen) return 0;
    const targetCode = ordersModalData.productCode.trim().toUpperCase();
    return stock
      .filter(s => s.productCode.trim().toUpperCase() === targetCode)
      .reduce((acc, s) => acc + s.quantity, 0);
  }, [ordersModalData, stock]);

  // Filtered and sorted orders inside the modal
  const filteredModalOrders = useMemo(() => {
    const list = currentModalOrdersSummary.ordersList.filter(item => {
      if (!ordersSearchTerm.trim()) return true;
      const q = ordersSearchTerm.toLowerCase();
      const numMatch = (item.orderNumber || '').toLowerCase().includes(q);
      const clientMatch = (item.clientName || '').toLowerCase().includes(q);
      const dateMatch = (item.date || '').toLowerCase().includes(q);
      const priorityMatch = (item.priority || '').toLowerCase().includes(q);
      return numMatch || clientMatch || dateMatch || priorityMatch;
    });

    list.sort((a, b) => {
      let valA: any = a[ordersSortField];
      let valB: any = b[ordersSortField];

      if (ordersSortField === 'orderNumber' || ordersSortField === 'clientName' || ordersSortField === 'date' || ordersSortField === 'priority') {
        return ordersSortOrder === 'asc'
          ? String(valA || '').localeCompare(String(valB || ''), undefined, { numeric: true })
          : String(valB || '').localeCompare(String(valA || ''), undefined, { numeric: true });
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return ordersSortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return list;
  }, [currentModalOrdersSummary, ordersSearchTerm, ordersSortField, ordersSortOrder]);

  const copyOrdersDetailsToClipboard = () => {
    if (!ordersModalData) return;
    let text = `PEDIDOS EM ABERTO (A SAIR) - ${ordersModalData.productCode} (${ordersModalData.productName})\n`;
    text += `Total a Sair: ${currentModalOrdersSummary.totalQtyOrdered.toLocaleString('pt-BR')} un em ${currentModalOrdersSummary.ordersCount} pedidos\n`;
    text += `Estoque Físico Total: ${currentModalPhysicalStock.toLocaleString('pt-BR')} un\n`;
    text += `Saldo Disponível Líquido: ${(currentModalPhysicalStock - currentModalOrdersSummary.totalQtyOrdered).toLocaleString('pt-BR')} un\n\n`;
    text += `Nº Pedido\tCliente\tData\tPrioridade\tQtd Solicitada\tPreço Unit.\tValor Total\n`;
    filteredModalOrders.forEach(ord => {
      text += `${ord.orderNumber}\t${ord.clientName}\t${ord.date}\t${ord.priority}\t${ord.quantityOrdered}\t${ord.unitPrice}\t${ord.totalPrice}\n`;
    });
    navigator.clipboard.writeText(text);
    setCopiedOrdersData(true);
    setTimeout(() => setCopiedOrdersData(false), 2000);
  };

  // Helper to handle product selection change and auto-populate product properties
  const handleProductChange = (prodCode: string) => {
    setSelectedProductCode(prodCode);
    const prod = products.find(p => p.code === prodCode);
    if (prod) {
      setPrCod(prod.pr_cod !== undefined ? String(prod.pr_cod) : '');
      setCodigoStructured(prod.codigo || '');
      setLote(prod.lote || '');
      setPrPreco((prod as any).pr_preco !== undefined ? String((prod as any).pr_preco) : '');
      setVlrest((prod as any).vlrest !== undefined ? String((prod as any).vlrest) : '');
    } else {
      setPrCod('');
      setCodigoStructured('');
      setLote('');
      setPrPreco('');
      setVlrest('');
    }
  };

  // Open modal for creating a new balance
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setProductSelectionMode('existing');
    if (products.length > 0) {
      setSelectedProductCode(products[0].code);
      const prod = products[0];
      setPrCod(prod.pr_cod !== undefined ? String(prod.pr_cod) : '');
      setCodigoStructured(prod.codigo || '');
      setLote(prod.lote || '');
      setPrPreco((prod as any).pr_preco !== undefined ? String((prod as any).pr_preco) : '');
      setVlrest((prod as any).vlrest !== undefined ? String((prod as any).vlrest) : '');
    } else {
      setProductSelectionMode('new');
      setPrCod('');
      setCodigoStructured('');
      setLote('');
      setPrPreco('');
      setVlrest('');
    }
    setNewProductCode('');
    setNewProductName('');
    setSelectedWarehouse(warehouses[0]?.name || 'DEP01 - Depósito Central');
    setCustomWarehouse('');
    setWarehouseMode('standard');
    setQuantity(10);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for editing an existing balance
  const handleOpenEditModal = (item: StockBalance) => {
    setEditingItem(item);
    setProductSelectionMode('existing');
    setSelectedProductCode(item.productCode);
    
    // Check if item itself has values or fall back to product values
    const prod = products.find(p => p.code === item.productCode);
    const finalPrCod = item.pr_cod !== undefined ? String(item.pr_cod) : (prod?.pr_cod !== undefined ? String(prod.pr_cod) : '');
    const finalCodigo = item.codigo || prod?.codigo || '';
    const finalLote = item.lote || prod?.lote || '';
    const finalPrPreco = item.pr_preco !== undefined ? String(item.pr_preco) : ((prod as any)?.pr_preco !== undefined ? String((prod as any)?.pr_preco) : '');
    const finalVlrest = item.vlrest !== undefined ? String(item.vlrest) : ((prod as any)?.vlrest !== undefined ? String((prod as any)?.vlrest) : '');

    setPrCod(finalPrCod);
    setCodigoStructured(finalCodigo);
    setLote(finalLote);
    setPrPreco(finalPrPreco);
    setVlrest(finalVlrest);
    
    // Check if the warehouse is standard (by name matching)
    if (warehouses.some(w => w.name === item.warehouse)) {
      setSelectedWarehouse(item.warehouse);
      setWarehouseMode('standard');
    } else {
      setCustomWarehouse(item.warehouse);
      setWarehouseMode('custom');
    }
    setQuantity(item.quantity);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open delete confirmation modal
  const handleOpenDeleteConfirm = (id: string) => {
    setDeletingId(id);
    setIsDeleteConfirmOpen(true);
  };

  // Handle submit for Add/Edit
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    let finalProductCode = '';
    let finalProductName = '';

    const prCodParsed = prCod.trim() ? parseInt(prCod.trim(), 10) : undefined;
    if (prCodParsed !== undefined) {
      if (isNaN(prCodParsed) || prCodParsed < 0 || prCodParsed > 99999) {
        setFormError('O Código Interno (Pr_cod) deve ser um número válido de até 5 dígitos (0 a 99999).');
        return;
      }
    }

    const codigoStructuredParsed = codigoStructured.trim() ? codigoStructured.trim() : undefined;
    if (codigoStructuredParsed && codigoStructuredParsed.length > 10) {
      setFormError('O Código Estruturado deve ter no máximo 10 caracteres.');
      return;
    }

    const loteParsed = lote.trim() ? lote.trim() : undefined;
    if (loteParsed && loteParsed.length > 10) {
      setFormError('O Lote do Produto deve ter no máximo 10 caracteres.');
      return;
    }

    const prPrecoParsed = prPreco.trim() ? parseFloat(prPreco.trim()) : undefined;
    if (prPrecoParsed !== undefined && isNaN(prPrecoParsed)) {
      setFormError('O Preço Unitário (pr_preco) deve ser um número monetário válido.');
      return;
    }

    const vlrestParsed = vlrest.trim() ? parseFloat(vlrest.trim()) : undefined;
    if (vlrestParsed !== undefined && isNaN(vlrestParsed)) {
      setFormError('O Preço/Vl. Rest (vlrest) deve ser um número monetário válido.');
      return;
    }

    if (productSelectionMode === 'new') {
      if (!newProductCode.trim() || !newProductName.trim()) {
        setFormError('Código e Nome do Produto são obrigatórios para um novo cadastro.');
        return;
      }
      
      const codeUpper = newProductCode.trim().toUpperCase();
      // Check if product code already exists
      const codeExists = products.some(p => p.code === codeUpper);
      if (codeExists) {
        setFormError(`Já existe um produto com o código ${codeUpper}.`);
        return;
      }

      // Add product to parent state
      const newProd = { 
        code: codeUpper, 
        name: newProductName.trim(),
        pr_cod: prCodParsed,
        codigo: codigoStructuredParsed,
        lote: loteParsed,
        pr_preco: prPrecoParsed,
        vlrest: vlrestParsed
      };
      onAddProduct(newProd);
      finalProductCode = codeUpper;
      finalProductName = newProductName.trim();
    } else {
      const selectedProd = products.find(p => p.code === selectedProductCode);
      if (!selectedProd) {
        setFormError('Produto não selecionado ou inexistente.');
        return;
      }
      finalProductCode = selectedProd.code;
      finalProductName = selectedProd.name;
    }

    const finalWarehouse = warehouseMode === 'custom' 
      ? customWarehouse.trim() 
      : selectedWarehouse;

    if (!finalWarehouse) {
      setFormError('Informe o depósito correspondente.');
      return;
    }

    if (quantity < 0) {
      setFormError('A quantidade de estoque não pode ser negativa.');
      return;
    }

    // Check if there is already a stock entry for this Product in this Warehouse
    // but exclude the current editing item if editing
    const duplicate = stock.find(s => 
      s.productCode === finalProductCode && 
      s.warehouse === finalWarehouse &&
      (!editingItem || s.id !== editingItem.id)
    );

    if (duplicate) {
      setFormError(`Já existe um saldo cadastrado para este produto no "${finalWarehouse}". Para alterar o saldo, edite o registro existente ou escolha outro depósito.`);
      return;
    }

    if (editingItem) {
      // Edit mode
      onEditStock({
        id: editingItem.id,
        productCode: finalProductCode,
        productName: finalProductName,
        warehouse: finalWarehouse,
        quantity: quantity,
        pr_cod: prCodParsed,
        codigo: codigoStructuredParsed,
        lote: loteParsed,
        pr_preco: prPrecoParsed,
        vlrest: vlrestParsed
      });
    } else {
      // Create mode
      onAddStock({
        productCode: finalProductCode,
        productName: finalProductName,
        warehouse: finalWarehouse,
        quantity: quantity,
        pr_cod: prCodParsed,
        codigo: codigoStructuredParsed,
        lote: loteParsed,
        pr_preco: prPrecoParsed,
        vlrest: vlrestParsed
      });
    }

    setIsModalOpen(false);
  };

  // Handle deletion
  const handleDelete = () => {
    if (deletingId) {
      onDeleteStock(deletingId);
      setIsDeleteConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const handleClearAll = () => {
    if (onClearAllStock) {
      onClearAllStock();
    }
    setIsClearAllConfirmOpen(false);
  };

  const handleAddWarehouse = (e: FormEvent) => {
    e.preventDefault();
    setWhError('');
    const trimmed = newWhName.trim();
    if (!trimmed) {
      setWhError('O nome do depósito não pode ser vazio.');
      return;
    }
    if (warehouses.some(w => w.name.toLowerCase() === trimmed.toLowerCase())) {
      setWhError('Este depósito já está cadastrado.');
      return;
    }
    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      name: trimmed,
      isActive: true,
      groupName: newWhGroup.trim()
    };
    onUpdateWarehouses([...warehouses, newWh]);
    setNewWhName('');
    setNewWhGroup('');
  };

  const handleStartEditWh = (wh: Warehouse) => {
    setEditingWhId(wh.id);
    setEditingWhName(wh.name);
    setEditingWhActive(wh.isActive);
    setEditingWhGroup(wh.groupName);
  };

  const handleSaveEditWh = (id: string) => {
    setWhError('');
    const trimmedName = editingWhName.trim();
    if (!trimmedName) {
      setWhError('O nome do depósito não pode ser vazio.');
      return;
    }
    
    // Check if another warehouse has this name
    if (warehouses.some(w => w.id !== id && w.name.toLowerCase() === trimmedName.toLowerCase())) {
      setWhError('Já existe outro depósito cadastrado com este nome.');
      return;
    }

    const updated = warehouses.map(w => {
      if (w.id === id) {
        return {
          ...w,
          name: trimmedName,
          isActive: editingWhActive,
          groupName: editingWhGroup.trim()
        };
      }
      return w;
    });

    onUpdateWarehouses(updated);
    setEditingWhId(null);
  };

  const handleDeleteWarehouse = (wh: Warehouse) => {
    setWhError('');
    // Check if any stock balance is currently using this warehouse
    const inUse = stock.some(s => s.warehouse === wh.name);
    if (inUse) {
      setWhError(`Não é possível excluir o depósito "${wh.name}" pois ele possui saldos de estoque vinculados.`);
      return;
    }
    const updated = warehouses.filter(w => w.id !== wh.id);
    onUpdateWarehouses(updated);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters and Action Button */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3.5">
        
        {/* Row 1: Dedicated Search Bar (Full Width) */}
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </span>
          <input
            type="text"
            placeholder="Buscar por código ou nome do produto em todo o estoque..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Row 2: Warehouse Filter (Left) & Actions (Right) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
          {/* Warehouse Dropdown Filter & Open Orders Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center">
              <select
                id="select-group-filter"
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                aria-label="Filtrar por Grupo"
                className="border border-slate-300 rounded-lg text-sm bg-white px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer text-slate-700 font-medium"
              >
                <option value="Todos">Todos os Grupos ({activeGroups.length})</option>
                {activeGroups.map(grp => (
                  <option key={grp} value={grp}>{grp}</option>
                ))}
              </select>
            </div>

            {/* Filter by Open Orders Chip */}
            <button
              type="button"
              onClick={() => setFilterOnlyWithOpenOrders(!filterOnlyWithOpenOrders)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                filterOnlyWithOpenOrders
                  ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-2xs ring-1 ring-amber-400/50'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
              title="Filtrar somente produtos que possuem pedidos em aberto (a sair)"
            >
              <Truck className={`h-3.5 w-3.5 ${filterOnlyWithOpenOrders ? 'text-amber-700' : 'text-slate-400'}`} />
              <span>Apenas com Pedidos a Sair</span>
              {totalProductsWithOrdersCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  filterOnlyWithOpenOrders ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-600'
                }`}>
                  {totalProductsWithOrdersCount}
                </span>
              )}
            </button>
          </div>

          {/* Add/Manage Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isMasterOrAdmin && (
              <button
                id="btn-warehouse-management"
                onClick={() => setIsWhManagementOpen(true)}
                className="flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                title="Visualizar ou pré-cadastrar depósitos do sistema"
              >
                <Building className="h-4 w-4 text-slate-500" />
                <span>Cadastro</span>
              </button>
            )}
            
            {canManageStock ? (
              <>
                <button
                  id="btn-update-stock"
                  onClick={handleExecuteUpdate}
                  disabled={isUpdating}
                  className={`flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer border ${
                    isUpdating 
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 hover:shadow-indigo-500/10'
                  }`}
                  title="Apagar dados locais e atualizar importando os dados reais através do Webhook configurado"
                >
                  {isUpdating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Atualizando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span>Atualizar</span>
                    </>
                  )}
                </button>

                {isMasterOrAdmin && stock.length > 0 && (
                  <button
                    id="btn-clear-all-stock"
                    onClick={() => setIsClearAllConfirmOpen(true)}
                    className="flex items-center justify-center gap-2 border border-rose-200 text-rose-700 hover:bg-rose-50 px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                    title="Excluir todos os saldos de estoque do sistema"
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                    <span>Excluir</span>
                  </button>
                )}
                {isMasterOrAdmin && (
                  <button
                    id="btn-add-stock-balance"
                    onClick={handleOpenAddModal}
                    className="flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Lançar
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-400 text-xs font-semibold rounded-lg select-none">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>Apenas visualização do estoque</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {updateStatus !== 'idle' && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
          updateStatus === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
            : 'bg-rose-50 border-rose-200 text-rose-950'
        }`}>
          <div className={`p-1 rounded-full shrink-0 ${updateStatus === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 text-sm">
            <strong className="block font-bold">{updateStatus === 'success' ? 'Atualização Concluída' : 'Erro na Atualização'}</strong>
            <p className="mt-0.5 leading-relaxed text-xs opacity-90">{updateMessage}</p>
            <div className="mt-2.5 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsLogModalOpen(true)}
                className={`text-xs font-bold underline cursor-pointer flex items-center gap-1.5 transition-colors ${
                  updateStatus === 'success' ? 'text-emerald-800 hover:text-emerald-950' : 'text-rose-800 hover:text-rose-950'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Ver Relatório de Auditoria / Logs Completos</span>
              </button>
            </div>
          </div>
          <button 
            onClick={() => setUpdateStatus('idle')}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {filteredStock.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium">Nenhum saldo de estoque encontrado.</p>
              <p className="text-xs text-slate-400 mt-1">Experimente mudar o filtro ou lançar um novo saldo de estoque acima.</p>
            </div>
          ) : viewMode === 'consolidated' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                  <th className="px-6 py-3.5 whitespace-nowrap min-w-[120px]">Código (SKU)</th>
                  <th className="px-6 py-3.5 min-w-[200px]">Produto</th>
                  <th className="px-4 py-2 border-l border-slate-200 bg-amber-50/60 text-center min-w-[150px]">
                    <span className="text-xs font-bold text-amber-950 block border-b border-amber-200 pb-1 mb-1">
                      Pedidos em Aberto
                    </span>
                    <div className="flex items-center justify-center gap-1 text-[10px] text-amber-800 tracking-wider font-semibold">
                      <Truck className="h-3 w-3 text-amber-600 shrink-0" />
                      <span>Total a Sair</span>
                    </div>
                  </th>
                  {displayedGroups.map(grp => (
                    <th key={grp} colSpan={3} className="px-6 py-2 border-l border-slate-200 bg-indigo-50/10 text-center">
                      <span className="text-xs font-bold text-indigo-900 block border-b border-indigo-100/60 pb-1 mb-1">
                        {grp} = {"$ " + (groupTotals[grp] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500 tracking-wider font-semibold">
                        <span className="inline-flex items-center justify-center gap-1 text-indigo-800" title="Dê dois cliques no número da quantidade para detalhar por lote">
                          Quantidade
                          <Layers className="h-2.5 w-2.5 text-indigo-500 shrink-0" />
                        </span>
                        <span>Preço Unit Médio</span>
                        <span>Vr Total Médio</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {groupedStock.map((row) => {
                  const ordersSummary = getProductOrdersSummary(row.productCode);
                  return (
                    <tr key={row.productCode} className="hover:bg-slate-50/50 transition-colors">
                      {/* Product Code */}
                      <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600 align-middle">
                        {row.productCode}
                      </td>

                      {/* Product Name */}
                      <td className="px-6 py-4 font-semibold text-slate-800 align-middle">
                        {row.productName}
                      </td>

                      {/* Pedidos em Aberto (A Sair) */}
                      <td className="px-4 py-3 border-l border-slate-200 align-middle text-center bg-amber-50/15">
                        {ordersSummary.totalQtyOrdered > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenOrdersModal(row.productCode, row.productName)}
                            title={`Clique para listar os ${ordersSummary.ordersCount} pedidos em aberto de ${row.productCode} (${ordersSummary.totalQtyOrdered} un a sair)`}
                            className="inline-flex flex-col items-center justify-center py-1.5 px-3 rounded-lg bg-amber-100/90 hover:bg-amber-200/90 text-amber-950 border border-amber-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer group active:scale-95 mx-auto"
                          >
                            <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-amber-950">
                              <Truck className="h-3.5 w-3.5 text-amber-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                              <span className="text-sm font-black tracking-tight">{ordersSummary.totalQtyOrdered.toLocaleString('pt-BR')}</span>
                              <span className="text-[10px] text-amber-800 font-semibold">un</span>
                            </div>
                            <span className="text-[10px] font-medium text-amber-800 group-hover:underline flex items-center gap-0.5 mt-0.5">
                              <span>{ordersSummary.ordersCount} {ordersSummary.ordersCount === 1 ? 'pedido' : 'pedidos'}</span>
                              <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                            </span>
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-slate-300 select-none">0 un</span>
                        )}
                      </td>

                      {/* Groups */}
                      {displayedGroups.map(grp => {
                        const data = row.groups[grp] || { quantity: 0, sumPrPrecoTimesQty: 0, sumVlrestTimesQty: 0 };
                        const avgPrice = data.quantity > 0 ? data.sumPrPrecoTimesQty / data.quantity : 0;
                        const totalVal = avgPrice * data.quantity;
                        const hasQty = data.quantity > 0;

                        return (
                          <td 
                            key={grp} 
                            colSpan={3} 
                            onDoubleClick={() => {
                              if (hasQty) {
                                handleOpenBatchModal(row.productCode, row.productName, grp);
                              }
                            }}
                            className={`px-6 py-4 border-l border-slate-150 align-middle transition-colors ${
                              hasQty ? 'hover:bg-indigo-50/40' : ''
                            }`}
                          >
                            <div className="grid grid-cols-3 gap-2 items-center text-center">
                              {/* Quantity */}
                              <div 
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (hasQty) {
                                    handleOpenBatchModal(row.productCode, row.productName, grp);
                                  }
                                }}
                                title={hasQty ? `Duplo clique para abrir o saldo por lote de ${row.productCode} em ${grp}` : undefined}
                                className={`font-mono font-bold select-none transition-all inline-flex items-center justify-center gap-1 mx-auto py-1 px-2 rounded-md ${
                                  hasQty 
                                    ? 'text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100 hover:text-indigo-700 cursor-pointer border border-indigo-200/80 shadow-2xs group/qty active:scale-95' 
                                    : 'text-slate-300'
                                }`}
                              >
                                {hasQty ? (
                                  <>
                                    <span>{data.quantity.toLocaleString('pt-BR')}</span>
                                    <span className="text-[10px] text-indigo-500/80 font-normal">un</span>
                                    <Layers className="h-3 w-3 text-indigo-500 opacity-60 group-hover/qty:opacity-100 transition-opacity ml-0.5 shrink-0" />
                                  </>
                                ) : (
                                  <span className="text-slate-300">0</span>
                                )}
                              </div>

                              {/* Preço Unit médio */}
                              <div className="font-mono text-xs font-semibold text-emerald-700">
                                {data.quantity > 0 ? (
                                  `$ ${avgPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </div>

                              {/* Vr Total médio */}
                              <div className="font-mono text-xs font-bold text-blue-700">
                                {data.quantity > 0 ? (
                                  `$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                  <th className="px-6 py-3.5">Código (SKU)</th>
                  <th className="px-6 py-3.5">Produto</th>
                  <th className="px-4 py-3.5 text-center bg-amber-50/50 min-w-[130px]">Pedidos em Aberto</th>
                  <th className="px-6 py-3.5">Depósito</th>
                  <th className="px-6 py-3.5">Cód. Interno</th>
                  <th className="px-6 py-3.5">Cód. Estruturado</th>
                  <th className="px-6 py-3.5">Lote</th>
                  <th className="px-6 py-3.5">Preço Unit</th>
                  <th className="px-6 py-3.5">Preço/Vl Rest</th>
                  <th className="px-6 py-3.5 text-center">Quantidade Saldo</th>
                  {canManageStock && <th className="px-6 py-3.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStock.map((item) => {
                  const isOutOfStock = item.quantity === 0;
                  const isLowStock = item.quantity > 0 && item.quantity <= 3;

                  // Resolve the resolved values (stored in stock balance OR fall back to product catalog)
                  const prod = products.find(p => p.code === item.productCode);
                  const displayPrCod = item.pr_cod !== undefined ? item.pr_cod : prod?.pr_cod;
                  const displayCodigo = item.codigo || prod?.codigo;
                  const displayLote = item.lote || prod?.lote;
                  const displayPrPreco = item.pr_preco !== undefined ? item.pr_preco : (prod as any)?.pr_preco;
                  const displayVlrest = item.vlrest !== undefined ? item.vlrest : (prod as any)?.vlrest;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Product Code */}
                      <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">
                        {item.productCode}
                      </td>

                      {/* Product Name */}
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {item.productName}
                      </td>

                      {/* Pedidos em Aberto */}
                      <td className="px-4 py-4 align-middle text-center bg-amber-50/15">
                        {(() => {
                          const ordSummary = getProductOrdersSummary(item.productCode);
                          if (ordSummary.totalQtyOrdered > 0) {
                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenOrdersModal(item.productCode, item.productName)}
                                title={`Clique para listar os ${ordSummary.ordersCount} pedidos em aberto de ${item.productCode}`}
                                className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-mono text-xs font-bold transition-colors cursor-pointer"
                              >
                                <Truck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                <span>{ordSummary.totalQtyOrdered.toLocaleString('pt-BR')} un</span>
                              </button>
                            );
                          }
                          return <span className="font-mono text-xs text-slate-300 select-none">0 un</span>;
                        })()}
                      </td>

                      {/* Warehouse */}
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Building className="h-4 w-4 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800">{item.warehouse}</span>
                          {(() => {
                            const grp = getWarehouseGroup(item.warehouse);
                            if (grp && grp !== 'Outros' && grp !== 'Inativo') {
                              return (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  {grp}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>

                      {/* displayPrCod */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {displayPrCod !== undefined ? String(displayPrCod).padStart(5, '0') : <span className="text-slate-300">-</span>}
                      </td>

                      {/* displayCodigo */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {displayCodigo || <span className="text-slate-300">-</span>}
                      </td>

                      {/* displayLote */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {displayLote || <span className="text-slate-300">-</span>}
                      </td>

                      {/* displayPrPreco */}
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-emerald-700">
                        {displayPrPreco !== undefined ? `$ ${Number(displayPrPreco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-slate-300">-</span>}
                      </td>

                      {/* displayVlrest */}
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-blue-700">
                        {displayVlrest !== undefined ? `$ ${Number(displayVlrest).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-slate-300">-</span>}
                      </td>

                      {/* Quantity */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`font-mono font-bold text-base ${
                            isOutOfStock 
                              ? 'text-rose-600' 
                              : isLowStock 
                                ? 'text-amber-600' 
                                : 'text-slate-800'
                          }`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs text-slate-400">un</span>
                          
                          {isOutOfStock && (
                            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-sm">
                              Zerar
                            </span>
                          )}
                          {isLowStock && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm">
                              Baixo
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      {canManageStock && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                              title="Editar saldo"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleOpenDeleteConfirm(item.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Excluir registro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL - CADASTRO E EDIÇÃO DE SALDO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Building className="text-indigo-600 h-5 w-5" />
                {editingItem ? 'Editar Lançamento de Saldo' : 'Lançar Novo Saldo em Estoque'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Product selection block */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Produto</label>
                
                {/* Mode toggle (only if not editing) */}
                {!editingItem && (
                  <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-50 mb-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setProductSelectionMode('existing')}
                      className={`flex-1 py-1.5 text-center font-medium rounded-md transition-all ${
                        productSelectionMode === 'existing' 
                          ? 'bg-white text-slate-800 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Selecionar Cadastrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductSelectionMode('new')}
                      className={`flex-1 py-1.5 text-center font-medium rounded-md transition-all ${
                        productSelectionMode === 'new' 
                          ? 'bg-white text-slate-800 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      + Cadastrar Novo Código
                    </button>
                  </div>
                )}

                {/* Selected Product Form Controls */}
                {productSelectionMode === 'existing' || editingItem ? (
                  <div>
                    <select
                      value={selectedProductCode}
                      onChange={(e) => handleProductChange(e.target.value)}
                      disabled={!!editingItem} // Disable product change on edit to preserve database structure
                      className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      {products.map(p => (
                        <option key={p.code} value={p.code}>
                          [{p.code}] - {p.name}
                        </option>
                      ))}
                    </select>
                    {editingItem && (
                      <span className="text-[10px] text-slate-400 block mt-1">
                        * O código do produto não pode ser alterado após o lançamento inicial.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 bg-indigo-50/40 rounded-lg border border-indigo-100/50">
                    <div className="md:col-span-4 space-y-1">
                      <label className="text-[10px] font-bold text-indigo-700 uppercase">Cód. Produto</label>
                      <input
                        type="text"
                        placeholder="Ex: PROD007"
                        value={newProductCode}
                        onChange={(e) => setNewProductCode(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 uppercase"
                      />
                    </div>
                    <div className="md:col-span-8 space-y-1">
                      <label className="text-[10px] font-bold text-indigo-700 uppercase">Nome Completo</label>
                      <input
                        type="text"
                        placeholder="Ex: Smartphone Motorola Moto G"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Parâmetros Adicionais do Produto no Saldo */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Parâmetros Adicionais (Pr_cod, Código, Lote, Preço)</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Cód. Interno (Pr_cod)</label>
                    <input
                      type="number"
                      min="0"
                      max="99999"
                      placeholder="Ex: 10001"
                      value={prCod}
                      onChange={(e) => setPrCod(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-xs bg-white px-2.5 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Cód. Estruturado</label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="Ex: PROD000001"
                      value={codigoStructured}
                      onChange={(e) => setCodigoStructured(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-xs bg-white px-2.5 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Lote</label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="Ex: LOTE000001"
                      value={lote}
                      onChange={(e) => setLote(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-xs bg-white px-2.5 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Preço Unitário</label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="Ex: 129.9000"
                      value={prPreco}
                      onChange={(e) => setPrPreco(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-xs bg-white px-2.5 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Preço/Vl Rest</label>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="Ex: 129.9000"
                      value={vlrest}
                      onChange={(e) => setVlrest(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg text-xs bg-white px-2.5 py-1.5 font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* Warehouse Selection Block */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Depósito</label>
                  {canManageStock && (
                    <button
                      type="button"
                      onClick={() => setIsWhManagementOpen(true)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      + Gerenciar Depósitos
                    </button>
                  )}
                </div>
                
                <div className="flex gap-4 mb-2 text-xs">
                  <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                    <input 
                      type="radio" 
                      name="whMode" 
                      checked={warehouseMode === 'standard'}
                      onChange={() => setWarehouseMode('standard')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Pré-cadastrado
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                    <input 
                      type="radio" 
                      name="whMode" 
                      checked={warehouseMode === 'custom'}
                      onChange={() => setWarehouseMode('custom')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Personalizado / Novo
                  </label>
                </div>

                {warehouseMode === 'standard' ? (
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  >
                    {warehouses.filter(w => w.isActive).map(wh => (
                      <option key={wh.id} value={wh.name}>{wh.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ex: DEP04 - Depósito de Carga Fria"
                    value={customWarehouse}
                    onChange={(e) => setCustomWarehouse(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg text-sm bg-white px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                )}
              </div>

              {/* Quantity Block */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Quantidade de Saldo</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-40 border border-slate-300 rounded-lg text-sm bg-white px-3 py-2.5 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  <span className="text-sm text-slate-500">unidades disponíveis</span>
                </div>
              </div>

              {/* Form Footer Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1"
                >
                  <FileCheck2 className="h-4 w-4" />
                  {editingItem ? 'Salvar Alterações' : 'Salvar Saldo'}
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
              <h3 className="font-bold text-lg text-slate-800">Confirmar Exclusão</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-normal">
              Tem certeza que deseja excluir este saldo de estoque? Esta operação é irreversível e afetará os cálculos imediatos de expedição no painel.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
              >
                Sim, Excluir Saldo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR ALL MODAL */}
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="h-6 w-6" />
              <h3 className="font-bold text-lg text-slate-800">Confirmar Limpeza Total</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-normal">
              Tem certeza que deseja <strong>excluir todos os saldos de estoque</strong>? Esta ação removerá completamente todos os registros de saldo cadastrados para que você possa importá-los novamente. Essa operação é irreversível!
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
                id="btn-confirm-clear-all"
                onClick={handleClearAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WAREHOUSE PRE-REGISTRATION / MANAGEMENT MODAL */}
      {isWhManagementOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Building className="text-indigo-600 h-5 w-5" />
                <span>Pré-cadastro de Depósitos</span>
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setIsWhManagementOpen(false);
                  setWhError('');
                  setNewWhName('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Abaixo estão listados os depósitos pré-cadastrados no sistema. Estes depósitos aparecem como opções de escolha rápida ao realizar o lançamento ou alteração do saldo de estoque. Você pode ativar/desativar depósitos e agrupá-los para fins de consolidação na grid.
              </p>

              {whError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-start gap-1.5 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{whError}</span>
                </div>
              )}

              {/* Add form (only if canManageStock) */}
              {canManageStock ? (
                <form onSubmit={handleAddWarehouse} className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-600 mb-1">Cadastrar Novo Depósito</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Nome / Código</label>
                        <input
                          type="text"
                          placeholder="Ex: 0002.001"
                          value={newWhName}
                          onChange={(e) => setNewWhName(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg text-xs px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Agrupamento (Grupo)</label>
                        <input
                          type="text"
                          placeholder="Ex: Deposito Central"
                          value={newWhGroup}
                          onChange={(e) => setNewWhGroup(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg text-xs px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Cadastrar Depósito
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-medium">
                  Apenas usuários com permissão de Almoxarife ou Admin podem cadastrar ou remover depósitos pré-cadastrados.
                </div>
              )}

              {/* Warehouses list */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Depósitos Registrados ({warehouses.length})</p>
                {warehouses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Nenhum depósito pré-cadastrado.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {warehouses.map(wh => {
                      const isWhInUse = stock.some(s => s.warehouse === wh.name);
                      const isEditing = editingWhId === wh.id;

                      if (isEditing) {
                        return (
                          <div key={wh.id} className="p-3.5 bg-indigo-50/30 space-y-3">
                            <div className="text-xs font-bold text-indigo-900">Editando Depósito</div>
                            <div className="space-y-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nome / Código</label>
                                <input
                                  type="text"
                                  value={editingWhName}
                                  onChange={(e) => setEditingWhName(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded-md text-xs px-2.5 py-1.5 focus:outline-hidden"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Agrupamento</label>
                                <input
                                  type="text"
                                  placeholder="Ex: Deposito Central"
                                  value={editingWhGroup}
                                  onChange={(e) => setEditingWhGroup(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded-md text-xs px-2.5 py-1.5 focus:outline-hidden"
                                />
                              </div>
                              <div className="flex items-center gap-2 py-1">
                                <input
                                  type="checkbox"
                                  id={`edit-active-${wh.id}`}
                                  checked={editingWhActive}
                                  onChange={(e) => setEditingWhActive(e.target.checked)}
                                  className="h-4 w-4 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor={`edit-active-${wh.id}`} className="text-xs font-medium text-slate-700 select-none cursor-pointer">
                                  Ativo (Permitir lançar novos saldos neste depósito)
                                </label>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingWhId(null)}
                                className="px-2.5 py-1.5 border border-slate-300 text-slate-600 text-[11px] font-semibold rounded-md hover:bg-slate-50 transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditWh(wh.id)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-md transition-colors"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={wh.id || wh.name} className={`px-3.5 py-3 flex items-center justify-between text-xs hover:bg-slate-50/50 transition-colors ${!wh.isActive ? 'bg-slate-50/50 opacity-75' : ''}`}>
                          <div className="flex flex-col gap-1 flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Building className={`h-4 w-4 shrink-0 ${wh.isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                              <span className="font-bold text-slate-800">{wh.name}</span>
                              
                              {wh.isActive ? (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-sm">
                                  Ativo
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                                  Inativo
                                </span>
                              )}

                              {isWhInUse && (
                                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-sm shrink-0">
                                  Em uso
                                </span>
                              )}
                            </div>
                            {wh.groupName ? (
                              <div className="text-[10px] text-indigo-600 font-medium flex items-center gap-1">
                                <span className="text-slate-400">Grupo:</span>
                                <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded-xs">{wh.groupName}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 italic">Sem agrupamento</div>
                            )}
                          </div>
                          
                          {canManageStock && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEditWh(wh)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                                title="Editar depósito"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWarehouse(wh)}
                                disabled={isWhInUse}
                                className={`p-1.5 rounded transition-colors ${
                                  isWhInUse 
                                    ? 'text-slate-200 cursor-not-allowed' 
                                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                                }`}
                                title={isWhInUse ? "Este depósito possui saldos de estoque vinculados e não pode ser removido." : "Remover depósito do pré-cadastro"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsWhManagementOpen(false);
                  setWhError('');
                  setNewWhName('');
                  setNewWhGroup('');
                  setEditingWhId(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* AUDIT LOG MODAL */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText className="text-indigo-600 h-5 w-5" />
                <span>Auditoria de Integração e Logs do Webhook</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
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
                  <span className="block text-[10px] text-emerald-500 mt-1 font-medium">Gravados no Estoque</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-center">
                  <span className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-0.5">Rejeitados</span>
                  <span className="text-2xl font-black text-rose-950">{logSummary.totalRejected}</span>
                  <span className="block text-[10px] text-rose-500 mt-1 font-medium">Sem ref. produto</span>
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
                    <span>Lista de Registros Rejeitados ({unimportedDetails.length})</span>
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
                  <div className="bg-slate-900 text-indigo-200 rounded-lg p-3 font-mono text-[10px] overflow-y-auto max-h-[140px] whitespace-pre break-all scrollbar-thin scrollbar-thumb-slate-700">
                    {rawResponseBody}
                  </div>
                </div>
              )}

              {/* Read-only raw log text for easy copy */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Cópia Rápida de Logs</label>
                <textarea
                  readOnly
                  value={executionLogs.join('\n') + (unimportedDetails.length > 0 ? '\n\nREJEITADOS:\n' + unimportedDetails.map((d, i) => `[#${i+1}] ${d.reason}`).join('\n') : '')}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full h-16 p-2 text-slate-500 text-[10px] bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                  title="Clique para selecionar tudo e copiar"
                />
                <span className="text-[10px] text-slate-400 block">Clique dentro da caixa acima para selecionar tudo e copiar rapidamente para o Bloco de Notas se necessário.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={exportLogToTxt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar Relatório (.txt)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL - DETALHAMENTO DE SALDO POR LOTE */}
      {batchModalData?.isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[120] p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseBatchModal();
          }}
        >
          <div 
            id="modal-batch-balance"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    Saldo Detalhado por Lote
                  </h3>
                  <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                    SKU: {batchModalData.productCode}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    <Building className="h-3.5 w-3.5 text-blue-600" />
                    Depósito: {batchModalData.groupName}
                  </span>
                </div>
                <p className="text-xs text-slate-600 pl-9 font-medium">
                  {batchModalData.productName}
                </p>
              </div>

              <button 
                id="btn-close-batch-modal"
                onClick={handleCloseBatchModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Fechar modal (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* KPI Summary Cards */}
            <div className="p-6 pb-3 border-b border-slate-100 bg-slate-50/40">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Saldo Total no Grupo</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-indigo-900">
                      {batchMetrics.totalQty.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">un</span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total de Lotes</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-emerald-800">
                      {batchMetrics.lotCount}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{batchMetrics.lotCount === 1 ? 'lote' : 'lotes'}</span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Preço Médio Ponderado</span>
                  <div className="mt-1">
                    <span className="text-xl font-bold font-mono text-slate-800">
                      $ {batchMetrics.avgPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Valor Total em Estoque</span>
                  <div className="mt-1">
                    <span className="text-xl font-bold font-mono text-blue-700">
                      $ {batchMetrics.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-toolbar: Search & Actions */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar por lote, armazém, código interno..."
                    value={batchSearchTerm}
                    onChange={(e) => setBatchSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  {batchSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setBatchSearchTerm('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="btn-copy-batch-data"
                    type="button"
                    onClick={copyBatchDetailsToClipboard}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="Copiar lista de lotes para a área de transferência"
                  >
                    {copiedBatchData ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Lotes Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-500" />
                        <span>Copiar Lotes</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {filteredBatchItems.length} de {batchModalItems.length} {batchModalItems.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>
              </div>
            </div>

            {/* Table of Batches */}
            <div className="overflow-y-auto max-h-[50vh] p-6 pt-2">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-3 text-center w-12">#</th>
                      <th 
                        className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (batchSortField === 'lote') setBatchSortOrder(batchSortOrder === 'asc' ? 'desc' : 'asc');
                          else { setBatchSortField('lote'); setBatchSortOrder('asc'); }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>Lote / Marca</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (batchSortField === 'warehouse') setBatchSortOrder(batchSortOrder === 'asc' ? 'desc' : 'asc');
                          else { setBatchSortField('warehouse'); setBatchSortOrder('asc'); }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>Depósito</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="px-4 py-3">Cód. Estruturado</th>
                      <th className="px-4 py-3">Cód. Interno</th>
                      <th 
                        className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (batchSortField === 'quantity') setBatchSortOrder(batchSortOrder === 'asc' ? 'desc' : 'asc');
                          else { setBatchSortField('quantity'); setBatchSortOrder('desc'); }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Quantidade (Saldo)</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (batchSortField === 'pr_preco') setBatchSortOrder(batchSortOrder === 'asc' ? 'desc' : 'asc');
                          else { setBatchSortField('pr_preco'); setBatchSortOrder('desc'); }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Preço Unitário</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (batchSortField === 'vlrest') setBatchSortOrder(batchSortOrder === 'asc' ? 'desc' : 'asc');
                          else { setBatchSortField('vlrest'); setBatchSortOrder('desc'); }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Valor Total</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBatchItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                          <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          <p className="font-semibold">Nenhum lote localizado</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Tente alterar os termos da busca acima.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredBatchItems.map((item, idx) => {
                        const pr = item.pr_preco !== undefined ? item.pr_preco : 0;
                        const vl = item.vlrest !== undefined ? item.vlrest : (item.quantity * pr);
                        const pctOfGroup = batchMetrics.totalQty > 0 
                          ? ((item.quantity / batchMetrics.totalQty) * 100).toFixed(1)
                          : '0.0';

                        return (
                          <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 text-center text-slate-400 font-mono text-[10px]">
                              {idx + 1}
                            </td>

                            {/* Lote */}
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md border border-slate-200 inline-flex items-center gap-1.5 shadow-2xs">
                                <Tag className="h-3 w-3 text-indigo-500" />
                                {item.lote && item.lote.trim() ? item.lote : <span className="text-slate-400 italic">Sem lote</span>}
                              </span>
                            </td>

                            {/* Depósito */}
                            <td className="px-4 py-3 font-mono text-slate-700">
                              <div className="flex items-center gap-1.5">
                                <Building className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold">{item.warehouse}</span>
                              </div>
                            </td>

                            {/* Código Estruturado */}
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {item.codigo || '-'}
                            </td>

                            {/* pr_cod */}
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {item.pr_cod !== undefined ? item.pr_cod : '-'}
                            </td>

                            {/* Quantidade */}
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end">
                                <div className="font-mono font-bold text-slate-900 text-sm">
                                  {item.quantity.toLocaleString('pt-BR')} <span className="text-[10px] text-slate-400 font-normal">un</span>
                                </div>
                                <div className="w-20 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div 
                                    className="bg-indigo-600 h-1.5 rounded-full" 
                                    style={{ width: `${Math.min(100, Math.max(4, Number(pctOfGroup)))}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">{pctOfGroup}% do grupo</span>
                              </div>
                            </td>

                            {/* Preço Unit */}
                            <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                              $ {pr.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Valor Total */}
                            <td className="px-4 py-3 text-right font-mono text-blue-700 font-bold">
                              $ {vl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Summary Footer of the table */}
                  {filteredBatchItems.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-800 text-xs">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider text-[11px] text-slate-600 font-bold">
                          Subtotal dos Lotes Listados ({filteredBatchItems.length} registros):
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-950 text-sm">
                          {filteredBatchItems.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString('pt-BR')} un
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-800 text-xs">
                          {(() => {
                            const subQty = filteredBatchItems.reduce((acc, curr) => acc + curr.quantity, 0);
                            const subVal = filteredBatchItems.reduce((acc, curr) => acc + (curr.vlrest !== undefined ? curr.vlrest : (curr.quantity * (curr.pr_preco || 0))), 0);
                            const subAvg = subQty > 0 ? (subVal / subQty) : 0;
                            return `$ ${subAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-blue-800 text-sm">
                          $ {filteredBatchItems.reduce((acc, curr) => acc + (curr.vlrest !== undefined ? curr.vlrest : (curr.quantity * (curr.pr_preco || 0))), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Info className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>Dê duplo clique em qualquer saldo na tabela principal para abrir este detalhamento.</span>
              </div>
              <button
                type="button"
                onClick={handleCloseBatchModal}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Orders Breakdown Modal ("Pedidos em Aberto (A Sair)") */}
      {ordersModalData?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-linear-to-r from-amber-50 via-amber-50/70 to-orange-50/40 border-b border-amber-200/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 border border-amber-300 rounded-xl text-amber-800 shadow-xs">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-amber-950">
                      Pedidos em Aberto (A Sair)
                    </h3>
                    <span className="font-mono text-xs font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md border border-amber-300">
                      {ordersModalData.productCode}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800/90 mt-0.5 font-medium">
                    {ordersModalData.productName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseOrdersModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Metrics Dashboard Cards */}
            <div className="p-5 bg-slate-50/70 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Total Ordered / Outgoing */}
              <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-amber-800 font-semibold mb-1">
                  <span>Total a Sair</span>
                  <Truck className="h-4 w-4 text-amber-600" />
                </div>
                <div className="font-mono text-xl font-black text-amber-950">
                  {currentModalOrdersSummary.totalQtyOrdered.toLocaleString('pt-BR')} <span className="text-xs font-normal text-amber-800">un</span>
                </div>
                <div className="text-[11px] text-amber-800 font-medium mt-1">
                  Em {currentModalOrdersSummary.ordersCount} {currentModalOrdersSummary.ordersCount === 1 ? 'pedido em aberto' : 'pedidos em aberto'}
                </div>
              </div>

              {/* Physical Stock Total */}
              <div className="bg-white p-3.5 rounded-xl border border-indigo-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-indigo-800 font-semibold mb-1">
                  <span>Estoque Físico Total</span>
                  <Package className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="font-mono text-xl font-black text-indigo-950">
                  {currentModalPhysicalStock.toLocaleString('pt-BR')} <span className="text-xs font-normal text-indigo-800">un</span>
                </div>
                <div className="text-[11px] text-indigo-700 font-medium mt-1">
                  Soma de todos os depósitos
                </div>
              </div>

              {/* Net Available Stock */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-600 font-semibold mb-1">
                  <span>Saldo Disponível Líquido</span>
                  <Layers className="h-4 w-4 text-slate-500" />
                </div>
                <div className={`font-mono text-xl font-black ${
                  (currentModalPhysicalStock - currentModalOrdersSummary.totalQtyOrdered) >= 0
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}>
                  {(currentModalPhysicalStock - currentModalOrdersSummary.totalQtyOrdered).toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500">un</span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {(currentModalPhysicalStock - currentModalOrdersSummary.totalQtyOrdered) >= 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      Estoque Suficiente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      <AlertCircle className="h-3 w-3" />
                      Déficit de Estoque
                    </span>
                  )}
                </div>
              </div>

              {/* Total Order Value */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold mb-1">
                  <span>Valor Total Pedidos</span>
                  <Tag className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="font-mono text-lg font-black text-emerald-950">
                  $ {filteredModalOrders.reduce((acc, o) => acc + o.totalPrice, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-emerald-800 font-medium mt-1">
                  {filteredModalOrders.length} {filteredModalOrders.length === 1 ? 'pedido listado' : 'pedidos listados'}
                </div>
              </div>
            </div>

            {/* Filter and Action Bar */}
            <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por pedido, cliente..."
                  value={ordersSearchTerm}
                  onChange={(e) => setOrdersSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
                {ordersSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setOrdersSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {onNavigateToOrders && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseOrdersModal();
                      onNavigateToOrders();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                    title="Navegar para a aba completa de Pedidos"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    <span>Ver na Tela de Pedidos</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={copyOrdersDetailsToClipboard}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  title="Copiar lista de pedidos para a área de transferência"
                >
                  {copiedOrdersData ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Lista</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Orders Table Container */}
            <div className="flex-1 overflow-auto p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="px-3.5 py-2.5 text-center w-12">#</th>
                      <th 
                        className="px-4 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'orderNumber') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('orderNumber');
                            setOrdersSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>Nº Pedido</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'clientName') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('clientName');
                            setOrdersSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>Cliente</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'date') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('date');
                            setOrdersSortOrder('desc');
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span>Data</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'priority') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('priority');
                            setOrdersSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Prioridade</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 text-right cursor-pointer hover:bg-amber-100/50 bg-amber-50/40 text-amber-950 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'quantityOrdered') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('quantityOrdered');
                            setOrdersSortOrder('desc');
                          }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1 font-bold">
                          <span>Qtd Solicitada</span>
                          <ArrowUpDown className="h-3 w-3 text-amber-700" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'unitPrice') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('unitPrice');
                            setOrdersSortOrder('desc');
                          }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Preço Unit.</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        onClick={() => {
                          if (ordersSortField === 'totalPrice') {
                            setOrdersSortOrder(ordersSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setOrdersSortField('totalPrice');
                            setOrdersSortOrder('desc');
                          }
                        }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Valor Total</span>
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredModalOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                          <Truck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-medium text-sm">Nenhum pedido em aberto encontrado com os critérios.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredModalOrders.map((ord, idx) => {
                        const totalReq = currentModalOrdersSummary.totalQtyOrdered;
                        const pct = totalReq > 0 ? ((ord.quantityOrdered / totalReq) * 100).toFixed(1) : '0';

                        return (
                          <tr key={`${ord.orderId}-${idx}`} className="hover:bg-amber-50/20 transition-colors">
                            <td className="px-3.5 py-3 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>

                            {/* Nº Pedido */}
                            <td className="px-4 py-3 font-mono font-bold text-indigo-700">
                              <span className="inline-flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                <span>{ord.orderNumber}</span>
                              </span>
                            </td>

                            {/* Cliente */}
                            <td className="px-4 py-3 font-medium text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[240px]" title={ord.clientName}>{ord.clientName}</span>
                              </div>
                            </td>

                            {/* Data */}
                            <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>{ord.date || '-'}</span>
                              </div>
                            </td>

                            {/* Prioridade */}
                            <td className="px-4 py-3 text-center">
                              {ord.priority === 'Alta' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  Alta
                                </span>
                              ) : ord.priority === 'Baixa' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Baixa
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Média
                                </span>
                              )}
                            </td>

                            {/* Qtd Solicitada */}
                            <td className="px-4 py-3 text-right bg-amber-50/30">
                              <div className="flex flex-col items-end">
                                <span className="font-mono text-sm font-black text-amber-950">
                                  {ord.quantityOrdered.toLocaleString('pt-BR')} <span className="text-xs font-normal text-amber-800">un</span>
                                </span>
                                <div className="w-20 bg-amber-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                  <div 
                                    className="bg-amber-600 h-1.5 rounded-full" 
                                    style={{ width: `${Math.min(100, Math.max(5, Number(pct)))}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-amber-700 font-mono mt-0.5">{pct}% do total a sair</span>
                              </div>
                            </td>

                            {/* Preço Unit */}
                            <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                              $ {ord.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Valor Total */}
                            <td className="px-4 py-3 text-right font-mono text-blue-700 font-bold">
                              $ {ord.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Summary Footer of the table */}
                  {filteredModalOrders.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-800 text-xs">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider text-[11px] text-slate-600 font-bold">
                          Subtotal dos Pedidos Listados ({filteredModalOrders.length} registros):
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-amber-950 text-sm bg-amber-100/50">
                          {filteredModalOrders.reduce((acc, curr) => acc + curr.quantityOrdered, 0).toLocaleString('pt-BR')} un
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-800 text-xs">
                          {(() => {
                            const subQty = filteredModalOrders.reduce((acc, curr) => acc + curr.quantityOrdered, 0);
                            const subVal = filteredModalOrders.reduce((acc, curr) => acc + curr.totalPrice, 0);
                            const subAvg = subQty > 0 ? (subVal / subQty) : 0;
                            return `$ ${subAvg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-blue-800 text-sm">
                          $ {filteredModalOrders.reduce((acc, curr) => acc + curr.totalPrice, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Info className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Estes pedidos representam saídas pendentes registradas no sistema para este produto.</span>
              </div>
              <button
                type="button"
                onClick={handleCloseOrdersModal}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
