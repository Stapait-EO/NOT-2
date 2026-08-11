import { useState, useMemo, FormEvent } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { StockBalance, Product, UserRole, WebhookConfig, FieldMapping, Warehouse } from '../types';
import { INITIAL_WAREHOUSES } from '../data';

interface StockTableProps {
  stock: StockBalance[];
  products: Product[];
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
}

export default function StockTable({ 
  stock, 
  products, 
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
  onImportStock
}: StockTableProps) {
  const canManageStock = currentUserRole === 'admin' || currentUserRole === 'almoxarife';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('Todos');

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

    addLog('O usuário clicou no botão "Atualizar" na tela de Saldo de Estoque.');

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
      setUpdateMessage('Nenhum webhook ativo configurado para o Saldo de Estoque. Por favor, configure um webhook com esta tela de execução em "Configurações de Webhook".');
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

      // Encontra o mapeamento De/Para configurado para este Webhook & Tabela
      const mapping = fieldMappings.find(
        m => m.webhookId === webhook!.id && 
        m.systemTable.trim().toLowerCase() === 'stockbalance'
      );

      if (mapping) {
        addLog(`Utilizando mapeamento "De/Para" ativo localizado (ID: ${mapping.id}, atualizado em: ${new Date(mapping.updatedAt).toLocaleString()}).`);
      } else {
        addLog('AVISO: Nenhum mapeamento "De/Para" customizado localizado para esta tabela. Utilizando nomes de campos originais do payload.');
      }

      // Mapeia e valida os dados do formato de retorno do Webhook de volta ao padrão do sistema (StockBalance)
      const systemFields = ['productCode', 'productName', 'warehouse', 'quantity', 'pr_cod', 'codigo', 'lote', 'pr_preco', 'vlrest'];
      
      const validImportedItems: Omit<StockBalance, 'id'>[] = [];
      const rejectedItems: { item: any; reason: string }[] = [];

      itemsArray.forEach((webhookItem: any, index: number) => {
        const mappedItem: any = {};
        systemFields.forEach(sysKey => {
          const webhookKey = mapping?.mappings[sysKey];
          if (webhookKey && webhookItem[webhookKey] !== undefined) {
            mappedItem[sysKey] = webhookItem[webhookKey];
          } else if (webhookItem[sysKey] !== undefined) {
            mappedItem[sysKey] = webhookItem[sysKey];
          }
        });

        // Resolve productCode with auxiliary and nested field fallbacks
        const productCode = mappedItem.productCode || 
                            mappedItem.pr_cod || 
                            mappedItem.codigo || 
                            webhookItem.productCode || 
                            webhookItem.sku || 
                            webhookItem.code || 
                            webhookItem.pr_cod || 
                            webhookItem.codigo || 
                            webhookItem.cod || 
                            webhookItem.cod_produto || 
                            webhookItem.product_code ||
                            webhookItem.productId ||
                            webhookItem.product_id;
        
        if (!productCode) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Item #${index + 1}: Nenhum código de produto identificado nos campos mapeados ou originais (productCode, sku, code, pr_cod, codigo).`
          });
          return;
        }

        // VERIFICA SE O PRODUTO EXISTE NO CADASTRO DE PRODUTOS
        // Compara com p.code, p.pr_cod e p.codigo
        const codeStr = String(productCode).trim().toLowerCase();
        const matchedProd = products.find(p => {
          const matchCode = String(p.code).trim().toLowerCase() === codeStr;
          const matchPrCod = p.pr_cod !== undefined && String(p.pr_cod).trim().toLowerCase() === codeStr;
          const matchCodigo = p.codigo !== undefined && String(p.codigo).trim().toLowerCase() === codeStr;
          return matchCode || matchPrCod || matchCodigo;
        });

        if (!matchedProd) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Código de Produto "${productCode}" não foi localizado no cadastro de Produtos (verificado SKU, pr_cod e codigo).`
          });
          return;
        }

        // Preenche os campos obrigatórios utilizando os cadastros e dados mapeados
        if (!mappedItem.productCode) mappedItem.productCode = matchedProd.code;
        
        if (!mappedItem.productName) {
          mappedItem.productName = matchedProd.name;
        }
        
        if (!mappedItem.warehouse) {
          mappedItem.warehouse = String(webhookItem.warehouse || webhookItem.deposito || 'DEP01 - Depósito Central');
        }
        
        if (mappedItem.quantity === undefined) {
          mappedItem.quantity = Number(webhookItem.quantity || webhookItem.qtd || webhookItem.stock || 0);
        } else {
          mappedItem.quantity = Number(mappedItem.quantity);
        }

        // Converte campos numéricos opcionais com segurança
        if (mappedItem.pr_cod !== undefined) mappedItem.pr_cod = Number(mappedItem.pr_cod);
        if (mappedItem.pr_preco !== undefined) {
          mappedItem.pr_preco = parseWebhookMonetary(mappedItem.pr_preco);
        } else {
          // Pega o preço padrão do produto cadastrado como fallback
          mappedItem.pr_preco = (matchedProd as any).pr_preco || 0;
        }
        
        if (mappedItem.vlrest !== undefined) {
          mappedItem.vlrest = parseWebhookMonetary(mappedItem.vlrest);
        } else if (mappedItem.pr_preco !== undefined) {
          mappedItem.vlrest = mappedItem.quantity * mappedItem.pr_preco;
        }

        validImportedItems.push(mappedItem);
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
    text += `Tabela Alvo: StockBalance (Saldo de Estoque)\n`;
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

  // Filtered Stock Balance list
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const matchesSearch = 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.productCode.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWarehouse = 
        selectedWarehouseFilter === 'Todos' || 
        item.warehouse === selectedWarehouseFilter;

      return matchesSearch && matchesWarehouse;
    });
  }, [stock, searchTerm, selectedWarehouseFilter]);

  // Helper to determine warehouse group
  const getWarehouseGroup = (whName: string): string => {
    const wh = warehouses.find(w => w.name === whName);
    if (!wh) return "Outros";
    if (!wh.isActive) return "Inativo";
    return wh.groupName.trim() || "Outros";
  };

  // Extract all unique group names of active warehouses
  const activeGroups = useMemo(() => {
    const groups = new Set<string>();
    warehouses.forEach(w => {
      if (w.isActive && w.groupName?.trim()) {
        groups.add(w.groupName.trim());
      }
    });
    // Fallback/Default groups if none configured
    if (groups.size === 0) {
      groups.add("Deposito Central");
      groups.add("Deposito Sul");
    }
    // Check if there are active warehouses that are ungrouped (empty groupName)
    const hasUngrouped = warehouses.some(w => w.isActive && !w.groupName?.trim());
    if (hasUngrouped) {
      groups.add("Outros");
    }
    return Array.from(groups);
  }, [warehouses]);

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
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Buscar por código ou nome do produto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Warehouse Dropdown Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Building className="h-4 w-4" />
              Filtrar Depósito:
            </span>
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="border border-slate-300 rounded-lg text-sm bg-white px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              <option value="Todos">Todos os Depósitos</option>
              {allWarehouses.map(wh => (
                <option key={wh} value={wh}>{wh}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Add/Manage Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-50 items-center">
            <button
              type="button"
              onClick={() => setViewMode('consolidated')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                viewMode === 'consolidated'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Consolidado por Grupo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detailed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                viewMode === 'detailed'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-100'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Detalhado por Lote
            </button>
          </div>

          <button
            onClick={() => setIsWhManagementOpen(true)}
            className="flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            title="Visualizar ou pré-cadastrar depósitos do sistema"
          >
            <Building className="h-4 w-4 text-slate-500" />
            <span>{canManageStock ? 'Gerenciar Depósitos' : 'Ver Depósitos'}</span>
          </button>
          
          {canManageStock ? (
            <>
              <button
                id="btn-update-stock"
                onClick={handleExecuteUpdate}
                disabled={isUpdating}
                className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer border ${
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

              {stock.length > 0 && (
                <button
                  id="btn-clear-all-stock"
                  onClick={() => setIsClearAllConfirmOpen(true)}
                  className="flex items-center justify-center gap-2 border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  title="Excluir todos os saldos de estoque do sistema"
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                  <span>Excluir Todos os Saldos</span>
                </button>
              )}
              <button
                id="btn-add-stock-balance"
                onClick={handleOpenAddModal}
                className="flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Lançar Saldo de Estoque
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-400 text-xs font-semibold rounded-lg select-none">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Apenas visualização do estoque</span>
            </div>
          )}
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
                  {activeGroups.map(grp => (
                    <th key={grp} colSpan={3} className="px-6 py-2 border-l border-slate-200 bg-indigo-50/10 text-center">
                      <span className="text-xs font-bold text-indigo-900 block border-b border-indigo-100/60 pb-1 mb-1">
                        {grp} = {"$ " + (groupTotals[grp] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-500 tracking-wider font-semibold">
                        <span>Quantidade</span>
                        <span>Preço Unit Médio</span>
                        <span>Vr Total Médio</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {groupedStock.map((row) => {
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

                      {/* Groups */}
                      {activeGroups.map(grp => {
                        const data = row.groups[grp] || { quantity: 0, sumPrPrecoTimesQty: 0, sumVlrestTimesQty: 0 };
                        const avgPrice = data.quantity > 0 ? data.sumPrPrecoTimesQty / data.quantity : 0;
                        const totalVal = avgPrice * data.quantity;

                        return (
                          <td key={grp} colSpan={3} className="px-6 py-4 border-l border-slate-150 align-middle">
                            <div className="grid grid-cols-3 gap-2 items-center text-center">
                              {/* Quantity */}
                              <div className="font-mono font-bold text-slate-800">
                                {data.quantity > 0 ? (
                                  <span>{data.quantity} <span className="text-[10px] text-slate-400 font-normal">un</span></span>
                                ) : (
                                  <span className="text-slate-300">0</span>
                                )}
                              </div>

                              {/* Preço Unit médio */}
                              <div className="font-mono text-xs font-semibold text-emerald-700">
                                {data.quantity > 0 ? (
                                  `$ ${avgPrice.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
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
                  <th className="px-6 py-3.5">Depósito</th>
                  <th className="px-6 py-3.5">Cód. Interno</th>
                  <th className="px-6 py-3.5">Cód. Estruturado</th>
                  <th className="px-6 py-3.5">Lote</th>
                  <th className="px-6 py-3.5">Preço Unit (10/4)</th>
                  <th className="px-6 py-3.5">Preço/Vl Rest (10/4)</th>
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

                      {/* Warehouse */}
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-slate-400 shrink-0" />
                          <span>{item.warehouse}</span>
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
                        {displayPrPreco !== undefined ? `$ ${Number(displayPrPreco).toFixed(4).replace('.', ',')}` : <span className="text-slate-300">-</span>}
                      </td>

                      {/* displayVlrest */}
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-blue-700">
                        {displayVlrest !== undefined ? `$ ${Number(displayVlrest).toFixed(4).replace('.', ',')}` : <span className="text-slate-300">-</span>}
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

    </div>
  );
}
