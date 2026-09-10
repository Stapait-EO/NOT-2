import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Shield, 
  Globe, 
  X, 
  Check, 
  AlertCircle,
  Clock,
  Key,
  Filter,
  Database,
  Copy,
  ArrowRight,
  Settings,
  Link,
  FileText,
  FileSpreadsheet,
  Upload,
  RefreshCw,
  Info,
  Play,
  Send,
  Terminal,
  Zap,
  Hand
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { UserAccount, WebhookConfig, FieldMapping, StockBalance, OrderHeader, Product } from '../types';
import { executeProxyWebhook } from '../utils/proxyWebhook';

interface WebhookTableProps {
  currentUser: UserAccount;
  webhooks: WebhookConfig[];
  onAddWebhook: (webhook: Omit<WebhookConfig, 'id' | 'createdAt'>) => void;
  onEditWebhook: (webhook: WebhookConfig) => void;
  onDeleteWebhook: (id: string) => void;
  fieldMappings: FieldMapping[];
  onSaveFieldMapping: (webhookId: string, systemTable: string, mappings: { [field: string]: string }) => void;
  onDeleteFieldMapping: (id: string) => void;
  onImportStock: (items: Omit<StockBalance, 'id'>[]) => void;
  onImportOrders: (items: Omit<OrderHeader, 'id'>[]) => void;
  onImportProducts: (items: Product[]) => void;
  onImportUsers: (items: Omit<UserAccount, 'id' | 'createdAt'>[]) => void;
  stock?: StockBalance[];
  orders?: OrderHeader[];
  products?: Product[];
  users?: UserAccount[];
  isAutoSyncRunning?: boolean;
  onTriggerAutoSync?: () => void;
}

export default function WebhookTable({
  currentUser,
  webhooks,
  onAddWebhook,
  onEditWebhook,
  onDeleteWebhook,
  fieldMappings = [],
  onSaveFieldMapping,
  onDeleteFieldMapping,
  onImportStock,
  onImportOrders,
  onImportProducts,
  onImportUsers,
  stock = [],
  orders = [],
  products = [],
  users = [],
  isAutoSyncRunning = false,
  onTriggerAutoSync
}: WebhookTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tabs: 'config' (Cadastro de Webhooks), 'mapping' (De / Para Mapeamento) or 'import' (Importar por Excel)
  const [activeSubTab, setActiveSubTab] = useState<'config' | 'mapping' | 'import'>('config');

  // Excel Import sub-tab states
  const [importSystemTable, setImportSystemTable] = useState<string>('StockBalance');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState('');
  const [importErrorMessage, setImportErrorMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookConfig | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form Fields
  const [seq, setSeq] = useState<number>(1);
  const [tableName, setTableName] = useState('StockBalance');
  const [url, setUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [targetScreen, setTargetScreen] = useState('');
  const [execution, setExecution] = useState<'Automática' | 'Manual'>('Manual');
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Mapping sub-tab states
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>('');
  const [selectedSystemTable, setSelectedSystemTable] = useState<string>('StockBalance');
  const [currentMappings, setCurrentMappings] = useState<{ [field: string]: string }>({});
  const [mappingSearchTerm, setMappingSearchTerm] = useState('');
  const [mappingSuccessMessage, setMappingSuccessMessage] = useState('');
  const [mappingErrorMessage, setMappingErrorMessage] = useState('');

  // Manual Webhook Execution States
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [executingWebhook, setExecutingWebhook] = useState<WebhookConfig | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResponse, setExecutionResponse] = useState<{
    status: number | string;
    body: string;
    headers: { [key: string]: string };
    type: 'success' | 'error' | null;
  } | null>(null);
  const [payloadMode, setPayloadMode] = useState<'mock' | 'actual'>('mock');
  const [customPayload, setCustomPayload] = useState<string>('');
  const [customHeaders, setCustomHeaders] = useState<string>('');
  const [applyFieldMapping, setApplyFieldMapping] = useState<boolean>(true);

  const isAdmin = currentUser.role === 'admin';

  // Available system tables and their fields for DE/PARA mapping
  const SYSTEM_TABLES_FIELDS: { [table: string]: string[] } = useMemo(() => ({
    StockBalance: ['id', 'productCode', 'productName', 'warehouse', 'quantity', 'pr_cod', 'codigo', 'lote', 'pr_preco', 'vlrest'],
    SaleRecord: ['sku', 'month', 'year', 'quantity', 'date', 'notes'],
    OrderHeader: ['id', 'orderNumber', 'clientName', 'date', 'priority', 'notes', 'items', 'itemProductCode', 'itemQuantity', 'itemUnitPrice'],
    Product: ['code', 'name', 'category', 'pr_cod', 'codigo', 'lote', 'avgQty1x', 'avgQty3x'],
    UserAccount: ['id', 'username', 'fullName', 'createdAt', 'role']
  }), []);

  const TABLE_LABELS: { [table: string]: string } = {
    StockBalance: 'StockBalance (Estoque)',
    SaleRecord: 'SaleRecord (Vendas)',
    OrderHeader: 'OrderHeader (Pedidos)',
    Product: 'Product (Produtos)',
    UserAccount: 'UserAccount (Usuários)'
  };

  const FIELD_LABELS: { [field: string]: string } = {
    id: 'ID do Registro',
    productCode: 'Código do Produto',
    productName: 'Nome do Produto',
    sku: 'Código do Produto (SKU)',
    month: 'Mês da Venda (1-12)',
    year: 'Ano da Venda (ex: 2025)',
    warehouse: 'Depósito / Almoxarifado',
    quantity: 'Quantidade',
    orderNumber: 'Número do Pedido',
    clientName: 'Nome do Cliente',
    date: 'Data de Emissão',
    priority: 'Prioridade',
    notes: 'Observações / Notas',
    items: 'Lista de Itens (Array de itens se estruturado)',
    itemProductCode: 'Item: Código do SKU / Produto',
    itemQuantity: 'Item: Quantidade do Item',
    itemUnitPrice: 'Item: Preço Unitário',
    code: 'Código do SKU',
    name: 'Nome / Descrição',
    category: 'Categoria do Produto',
    username: 'Usuário de Acesso',
    fullName: 'Nome Completo',
    createdAt: 'Data de Cadastro',
    role: 'Perfil / Permissão',
    pr_cod: 'Cód. Interno (Pr_cod)',
    codigo: 'Cód. Estruturado (Código)',
    lote: 'Lote',
    pr_preco: 'Preço Unitário (pr_preco)',
    vlrest: 'Preço/Vl. Restante (vlrest)',
    avgQty1x: 'Qtd Média 1x (avgQty1x)',
    avgQty3x: 'Qtd Média 3x (avgQty3x)'
  };

  // Initialize selected webhook when webhooks load
  useEffect(() => {
    if (webhooks.length > 0 && !selectedWebhookId) {
      setSelectedWebhookId(webhooks[0].id);
    }
  }, [webhooks, selectedWebhookId]);

  // Load mapping if it already exists for the selected Webhook + Table
  useEffect(() => {
    if (selectedWebhookId && selectedSystemTable) {
      const existing = fieldMappings.find(
        m => m.webhookId === selectedWebhookId && m.systemTable === selectedSystemTable
      );
      
      const fields = SYSTEM_TABLES_FIELDS[selectedSystemTable] || [];
      const newMap: { [field: string]: string } = {};
      
      fields.forEach(field => {
        newMap[field] = existing?.mappings[field] || '';
      });
      
      setCurrentMappings(newMap);
      setMappingSuccessMessage('');
      setMappingErrorMessage('');
    }
  }, [selectedWebhookId, selectedSystemTable, fieldMappings, SYSTEM_TABLES_FIELDS]);

  // Filter webhooks based on search
  const filteredWebhooks = useMemo(() => {
    return webhooks.filter(wh => {
      return (
        wh.tableName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.filterCondition.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wh.execution && wh.execution.toLowerCase().includes(searchTerm.toLowerCase())) ||
        wh.seq.toString().includes(searchTerm)
      );
    });
  }, [webhooks, searchTerm]);

  // Handle Copy Secret Key Feedback
  const handleCopySecret = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenAddModal = () => {
    // Auto-calculate next sequence number
    const nextSeq = webhooks.length > 0 ? Math.max(...webhooks.map(w => w.seq)) + 1 : 1;
    
    setEditingWebhook(null);
    setSeq(nextSeq);
    setTableName('StockBalance');
    setUrl('');
    setSecretKey('');
    setFilterCondition('');
    setIsActive(true);
    setTargetScreen('');
    setExecution('Manual');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (webhook: WebhookConfig) => {
    setEditingWebhook(webhook);
    setSeq(webhook.seq);
    setTableName(webhook.tableName);
    setUrl(webhook.url);
    setSecretKey(webhook.secretKey);
    setFilterCondition(webhook.filterCondition);
    setIsActive(webhook.isActive !== undefined ? webhook.isActive : true);
    setTargetScreen(webhook.targetScreen || '');
    setExecution(webhook.execution === 'Automática' ? 'Automática' : 'Manual');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenDeleteConfirm = (id: string) => {
    setDeletingId(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!tableName.trim()) {
      setFormError('Por favor, preencha o Nome da Tabela.');
      return;
    }

    if (!url.trim()) {
      setFormError('Por favor, preencha a URL do endpoint.');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setFormError('Por favor, insira uma URL válida (ex: https://exemplo.com/api).');
      return;
    }

    if (!secretKey.trim()) {
      setFormError('Por favor, defina uma Chave Secreta para autenticação.');
      return;
    }

    // Check if sequential number is already in use by another webhook
    const seqExists = webhooks.some(wh => 
      wh.seq === seq && (!editingWebhook || wh.id !== editingWebhook.id)
    );

    if (seqExists) {
      setFormError(`O número sequencial ${seq} já está sendo utilizado por outra configuração.`);
      return;
    }

    if (editingWebhook) {
      onEditWebhook({
        ...editingWebhook,
        seq: Number(seq),
        tableName: tableName.trim(),
        url: url.trim(),
        secretKey: secretKey.trim(),
        filterCondition: filterCondition.trim(),
        isActive: isActive,
        targetScreen: targetScreen,
        execution: execution
      });
    } else {
      onAddWebhook({
        seq: Number(seq),
        tableName: tableName.trim(),
        url: url.trim(),
        secretKey: secretKey.trim(),
        filterCondition: filterCondition.trim(),
        isActive: isActive,
        targetScreen: targetScreen,
        execution: execution
      });
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (deletingId) {
      onDeleteWebhook(deletingId);
      setIsDeleteConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const getMockTableItem = (tableName: string) => {
    const norm = (tableName || '').trim().toLowerCase();
    if (norm === 'stockbalance') {
      return {
        id: "EST-123",
        productCode: "PRD001",
        productName: "Parafuso Sextavado 1/4",
        warehouse: "Depósito Central",
        quantity: 150,
        pr_cod: 101,
        codigo: "EST-001",
        lote: "LOTE-2026",
        pr_preco: 2.50,
        vlrest: 375.00
      };
    } else if (norm === 'orderheader') {
      return {
        id: "PED-456",
        orderNumber: "PED-2026-001",
        clientName: "Distribuidora de Parafusos Ltda",
        date: "2026-07-15",
        priority: "Alta",
        notes: "Urgente - Entregar no período da manhã",
        items: [
          {
            id: "ITEM-01",
            productCode: "PRD001",
            productName: "Parafuso Sextavado 1/4",
            quantityOrdered: 50,
            unitPrice: 2.50
          }
        ]
      };
    } else if (norm === 'product') {
      return {
        code: "PRD001",
        name: "Parafuso Sextavado 1/4",
        category: "Ferragens",
        pr_cod: 101,
        codigo: "EST-001",
        lote: "LOTE-2026",
        avgQty1x: 15,
        avgQty3x: 45
      };
    } else if (norm === 'useraccount') {
      return {
        id: "USR-789",
        username: "joao.silva",
        fullName: "João da Silva",
        role: "almoxarife",
        createdAt: "2026-07-15T06:15:15-07:00"
      };
    }
    return {};
  };

  // Generate default mock payload based on webhook configuration
  const getDefaultPayload = (webhook: WebhookConfig, shouldMap = true) => {
    const mockItem = getMockTableItem(webhook.tableName);
    const basePayload: any = {
      ...mockItem,
      tabela: webhook.tableName
    };

    const filter = webhook.filterCondition?.trim() || '';
    if (filter !== '') {
      basePayload.condicao = filter;
      basePayload.$condicao = filter;
    }

    if (shouldMap) {
      const mapping = fieldMappings.find(
        m => m.webhookId === webhook.id && 
        m.systemTable.trim().toLowerCase() === webhook.tableName.trim().toLowerCase()
      );
      if (mapping) {
        const mapped: any = {};
        Object.keys(basePayload).forEach(key => {
          const mappedKey = mapping.mappings[key] || key;
          mapped[mappedKey] = basePayload[key];
        });
        return mapped;
      }
    }
    return basePayload;
  };

  const getActualRecordsCount = (webhook: WebhookConfig) => {
    let sourceData: any[] = [];
    const normTable = (webhook.tableName || '').trim().toLowerCase();
    if (normTable === 'stockbalance') {
      sourceData = stock || [];
    } else if (normTable === 'orderheader') {
      sourceData = orders || [];
    } else if (normTable === 'product') {
      sourceData = products || [];
    } else if (normTable === 'useraccount') {
      sourceData = users || [];
    }

    let filteredData = [...sourceData];
    const condition = webhook.filterCondition?.trim();
    if (condition) {
      try {
        filteredData = sourceData.filter(item => {
          const match = condition.match(/^([a-zA-Z0-9_$]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
          if (match) {
            const [_, field, operator, rawValue] = match;
            const itemValue = item[field];
            let value: any = rawValue.trim();
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
              value = value.substring(1, value.length - 1);
            } else if (!isNaN(Number(value))) {
              value = Number(value);
            } else if (value === 'true') {
              value = true;
            } else if (value === 'false') {
              value = false;
            }

            switch (operator) {
              case '==': return itemValue == value;
              case '!=': return itemValue != value;
              case '>': return Number(itemValue) > Number(value);
              case '<': return Number(itemValue) < Number(value);
              case '>=': return Number(itemValue) >= Number(value);
              case '<=': return Number(itemValue) <= Number(value);
              default: return true;
            }
          }
          return true;
        });
      } catch (e) {
        console.error("Erro ao filtrar:", e);
      }
    }
    return filteredData.length;
  };

  const getActualTableData = (webhook: WebhookConfig, shouldMap = true) => {
    let sourceData: any[] = [];
    const normTable = (webhook.tableName || '').trim().toLowerCase();
    if (normTable === 'stockbalance') {
      sourceData = stock || [];
    } else if (normTable === 'orderheader') {
      sourceData = orders || [];
    } else if (normTable === 'product') {
      sourceData = products || [];
    } else if (normTable === 'useraccount') {
      sourceData = users || [];
    }

    let filteredData = [...sourceData];
    const condition = webhook.filterCondition?.trim();
    if (condition) {
      try {
        filteredData = sourceData.filter(item => {
          const match = condition.match(/^([a-zA-Z0-9_$]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);
          if (match) {
            const [_, field, operator, rawValue] = match;
            const itemValue = item[field];
            let value: any = rawValue.trim();
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
              value = value.substring(1, value.length - 1);
            } else if (!isNaN(Number(value))) {
              value = Number(value);
            } else if (value === 'true') {
              value = true;
            } else if (value === 'false') {
              value = false;
            }

            switch (operator) {
              case '==': return itemValue == value;
              case '!=': return itemValue != value;
              case '>': return Number(itemValue) > Number(value);
              case '<': return Number(itemValue) < Number(value);
              case '>=': return Number(itemValue) >= Number(value);
              case '<=': return Number(itemValue) <= Number(value);
              default: return true;
            }
          }
          return true;
        });
      } catch (e) {
        console.error("Erro ao filtrar:", e);
      }
    }

    // Get the first item (actual record or fallback mock item)
    let singleItem: any = null;
    if (filteredData.length > 0) {
      singleItem = { ...filteredData[0] };
    } else {
      singleItem = getMockTableItem(webhook.tableName);
    }

    // Add webhook context fields
    singleItem.tabela = webhook.tableName;
    const filter = webhook.filterCondition?.trim() || '';
    if (filter !== '') {
      singleItem.condicao = filter;
      singleItem.$condicao = filter;
    }

    if (shouldMap) {
      const mapping = fieldMappings.find(
        m => m.webhookId === webhook.id && 
        m.systemTable.trim().toLowerCase() === webhook.tableName.trim().toLowerCase()
      );
      if (mapping) {
        const mappedItem: any = {};
        Object.keys(singleItem).forEach(key => {
          const targetKey = mapping.mappings[key] || key;
          mappedItem[targetKey] = singleItem[key];
        });
        return mappedItem;
      }
    }

    return singleItem;
  };

  // Update custom payload when webhook or mapping application changes
  useEffect(() => {
    if (executingWebhook) {
      if (payloadMode === 'actual') {
        const dataArr = getActualTableData(executingWebhook, applyFieldMapping);
        setCustomPayload(JSON.stringify(dataArr, null, 2));
      } else {
        const payloadObj = getDefaultPayload(executingWebhook, applyFieldMapping);
        setCustomPayload(JSON.stringify(payloadObj, null, 2));
      }
    }
  }, [executingWebhook, applyFieldMapping, payloadMode, stock, orders, products, users, fieldMappings]);

  const handleOpenExecuteModal = (webhook: WebhookConfig, initialMode: 'mock' | 'actual' = 'mock') => {
    setPayloadMode(initialMode);
    setExecutingWebhook(webhook);
    setExecutionResponse(null);
    setIsExecuting(false);
    setApplyFieldMapping(true);
    
    const headersObj = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
      "X-API-Key": `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
    };
    setCustomHeaders(JSON.stringify(headersObj, null, 2));
    
    const payloadObj = initialMode === 'actual'
      ? getActualTableData(webhook, true)
      : getDefaultPayload(webhook, true);
    setCustomPayload(JSON.stringify(payloadObj, null, 2));
    setIsExecuteModalOpen(true);
  };

  const handleRunExecution = async () => {
    if (!executingWebhook) return;
    setIsExecuting(true);
    setExecutionResponse(null);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(customPayload);
    } catch (err: any) {
      setExecutionResponse({
        status: 'Client Error (JSON do Corpo Inválido)',
        body: `Erro ao analisar JSON do Corpo: ${err.message}`,
        headers: {},
        type: 'error'
      });
      setIsExecuting(false);
      return;
    }

    let parsedHeaders: { [key: string]: string } = {};
    try {
      parsedHeaders = JSON.parse(customHeaders);
    } catch (err: any) {
      setExecutionResponse({
        status: 'Client Error (JSON dos Cabeçalhos Inválido)',
        body: `Erro ao analisar JSON dos Cabeçalhos: ${err.message}`,
        headers: {},
        type: 'error'
      });
      setIsExecuting(false);
      return;
    }

    const startTime = performance.now();

    try {
      const data = await executeProxyWebhook({
        url: executingWebhook.url,
        headers: parsedHeaders,
        body: parsedPayload
      });
      const duration = (performance.now() - startTime).toFixed(0);

      let formattedBody = data.body;
      try {
        const json = JSON.parse(data.body);
        formattedBody = JSON.stringify(json, null, 2);
      } catch {}

      setExecutionResponse({
        status: `${data.status} ${data.statusText || (data.ok ? 'OK' : 'Error')} (${duration}ms)`,
        body: formattedBody || '(Resposta do servidor vazia)',
        headers: data.headers || {},
        type: data.ok ? 'success' : 'error'
      });
    } catch (err: any) {
      const duration = (performance.now() - startTime).toFixed(0);
      setExecutionResponse({
        status: `Erro de Envio (${duration}ms)`,
        body: `Não foi possível conectar ao endpoint através do servidor proxy.\n\nDetalhes do Erro:\n- Erro: ${err.message || 'Falha ao processar requisição proxy'}\n\nNota: Ao utilizar o servidor proxy, evitamos restrições de CORS e a remoção de cabeçalhos (como o de Autorização) pelo navegador. Verifique se o seu servidor do Webhook está online e aceitando conexões públicas.`,
        headers: {},
        type: 'error'
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveMapping = (e: React.FormEvent) => {
    e.preventDefault();
    setMappingSuccessMessage('');
    setMappingErrorMessage('');

    if (!selectedWebhookId) {
      setMappingErrorMessage('Por favor, selecione ou cadastre um Webhook primeiro.');
      return;
    }

    if (!selectedSystemTable) {
      setMappingErrorMessage('Por favor, selecione uma Tabela do Sistema.');
      return;
    }

    // Validate that at least one field has a mapping configured
    const hasAnyMapping = Object.values(currentMappings).some(val => typeof val === 'string' && (val as string).trim() !== '');
    if (!hasAnyMapping) {
      setMappingErrorMessage('Por favor, defina pelo menos um campo de mapeamento ("PARA").');
      return;
    }

    // Clean empty mappings or keep them as empty strings
    const cleanedMappings: { [field: string]: string } = {};
    Object.entries(currentMappings).forEach(([k, v]) => {
      const valStr = String(v);
      if (valStr.trim()) {
        cleanedMappings[k] = valStr.trim();
      }
    });

    onSaveFieldMapping(selectedWebhookId, selectedSystemTable, cleanedMappings);
    setMappingSuccessMessage('Mapeamento "De / Para" salvo com sucesso!');
    setTimeout(() => setMappingSuccessMessage(''), 3000);
  };

  const handleFieldMappingValueChange = (field: string, val: string) => {
    setCurrentMappings(prev => ({
      ...prev,
      [field]: val
    }));
  };

  // Excel / CSV File Preview and Parsing logic
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setImportErrorMessage('');
    setImportSuccessMessage('');
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (data.length > 0) {
          const headers = data[0].map(h => String(h || '').trim());
          const rows = data.slice(1, 6).map(row => {
            const rowObj: any = {};
            headers.forEach((header, idx) => {
              rowObj[header] = row[idx];
            });
            return rowObj;
          });
          setPreviewColumns(headers);
          setPreviewRows(rows);
        } else {
          setPreviewColumns([]);
          setPreviewRows([]);
        }
      } catch (err: any) {
        setImportErrorMessage('Falha ao pré-visualizar o arquivo: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleProcessImport = () => {
    if (!excelFile) {
      setImportErrorMessage('Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV.');
      return;
    }
    
    setIsImporting(true);
    setImportErrorMessage('');
    setImportSuccessMessage('');
    
    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const bstr = event.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const rawRows = XLSX.utils.sheet_to_json(worksheet) as any[];
          
          if (rawRows.length === 0) {
            throw new Error('O arquivo selecionado está vazio.');
          }
          
          if (importSystemTable === 'StockBalance') {
            const imported: Omit<StockBalance, 'id'>[] = [];
            rawRows.forEach((row) => {
              const productCode = String(row.productCode || row.SKU || row['Código do Produto'] || row.codigo || row['Código'] || '').trim();
              const productName = String(row.productName || row.Name || row['Nome do Produto'] || row.nome || row['Nome'] || '').trim();
              const warehouse = String(row.warehouse || row.Warehouse || row['Almoxarifado'] || row.local || row['Local'] || '').trim();
              const quantityVal = Number(row.quantity ?? row.Quantity ?? row['Quantidade'] ?? row.quantidade ?? 0);
              
              if (!productCode || !warehouse) return;
              
              imported.push({
                productCode,
                productName: productName || `Produto ${productCode}`,
                warehouse,
                quantity: isNaN(quantityVal) ? 0 : quantityVal
              });
            });
            
            if (imported.length === 0) {
              throw new Error('Nenhum saldo de estoque válido processado. Cabeçalhos esperados: productCode (ou SKU, Código), warehouse (ou Almoxarifado), quantity (ou Quantidade).');
            }
            
            onImportStock(imported);
            setImportSuccessMessage(`Sucesso! ${imported.length} registros de Saldo de Estoque importados com êxito.`);
            
          } else if (importSystemTable === 'OrderHeader') {
            const ordersMap: { [orderNumber: string]: Omit<OrderHeader, 'id'> } = {};
            
            rawRows.forEach((row) => {
              const orderNumber = String(row.orderNumber || row['Número do Pedido'] || row.numero || row.ID || '').trim();
              const clientName = String(row.clientName || row['Cliente'] || row.cliente || 'Consumidor Final').trim();
              const date = String(row.date || row['Data'] || row.data || new Date().toISOString().split('T')[0]).trim();
              const priorityStr = String(row.priority || row['Prioridade'] || row.prioridade || 'Média').trim();
              
              const itemProductCode = String(row.productCode || row.SKU || row['Código do Produto'] || row.codigo || '').trim();
              const itemProductName = String(row.productName || row['Nome do Produto'] || row.nome || '').trim();
              const quantityOrdered = Number(row.quantityOrdered || row.quantity || row['Quantidade Pedida'] || row.quantidade || 1);
              const unitPrice = Number(row.unitPrice || row['Preço Unitário'] || row.preco || 0);
              
              if (!orderNumber) return;
              
              let priority: 'Alta' | 'Média' | 'Baixa' = 'Média';
              if (/alta/i.test(priorityStr)) priority = 'Alta';
              else if (/baixa/i.test(priorityStr)) priority = 'Baixa';
              
              if (!ordersMap[orderNumber]) {
                ordersMap[orderNumber] = {
                  orderNumber,
                  clientName,
                  date,
                  priority,
                  items: [],
                  notes: 'Importado via Excel'
                };
              }
              
              if (itemProductCode) {
                ordersMap[orderNumber].items.push({
                  id: `item-${Math.random().toString(36).substr(2, 9)}`,
                  productCode: itemProductCode,
                  productName: itemProductName || `Produto ${itemProductCode}`,
                  quantityOrdered: isNaN(quantityOrdered) ? 1 : quantityOrdered,
                  unitPrice: isNaN(unitPrice) ? 0 : unitPrice
                });
              }
            });
            
            const imported = Object.values(ordersMap);
            if (imported.length === 0) {
              throw new Error('Nenhum pedido de venda válido processado. Cabeçalhos esperados: orderNumber (ou Número do Pedido), clientName (ou Cliente).');
            }
            
            onImportOrders(imported);
            setImportSuccessMessage(`Sucesso! ${imported.length} Pedidos de Venda importados com êxito.`);
            
          } else if (importSystemTable === 'Product') {
            const imported: Product[] = [];
            rawRows.forEach((row) => {
              const code = String(row.code || row.SKU || row['Código'] || row.codigo || '').trim();
              const name = String(row.name || row['Nome'] || row.nome || '').trim();
              const category = String(row.category || row['Categoria'] || row.categoria || 'Geral').trim();
              
              if (!code || !name) return;
              
              imported.push({
                code,
                name,
                category
              });
            });
            
            if (imported.length === 0) {
              throw new Error('Nenhum produto válido processado. Cabeçalhos esperados: code (ou Código, SKU), name (ou Nome).');
            }
            
            onImportProducts(imported);
            setImportSuccessMessage(`Sucesso! ${imported.length} Produtos importados com êxito.`);
            
          } else if (importSystemTable === 'UserAccount') {
            const imported: Omit<UserAccount, 'id' | 'createdAt'>[] = [];
            rawRows.forEach((row) => {
              const username = String(row.username || row['Usuário'] || row.usuario || '').trim().toLowerCase();
              const fullName = String(row.fullName || row['Nome Completo'] || row.nome || '').trim();
              const roleStr = String(row.role || row['Função'] || row.cargo || 'almoxarife').trim().toLowerCase();
              const password = String(row.password || row['Senha'] || row.senha || '123').trim();
              
              if (!username || !fullName) return;
              
              let role: 'admin' | 'vendedor' | 'almoxarife' = 'almoxarife';
              if (roleStr === 'admin' || roleStr === 'administrador') role = 'admin';
              else if (roleStr === 'vendedor') role = 'vendedor';
              
              imported.push({
                username,
                fullName,
                role,
                passwordHash: password
              });
            });
            
            if (imported.length === 0) {
              throw new Error('Nenhum usuário válido processado. Cabeçalhos esperados: username (ou Usuário), fullName (ou Nome Completo).');
            }
            
            onImportUsers(imported);
            setImportSuccessMessage(`Sucesso! ${imported.length} Usuários importados com êxito.`);
          }
          
          setExcelFile(null);
          setPreviewRows([]);
          setPreviewColumns([]);
          
          const fileInput = document.getElementById('excel-file-input') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          
        } catch (err: any) {
          setImportErrorMessage(err.message || 'Ocorreu um erro ao processar o arquivo.');
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsBinaryString(excelFile);
    }, 500);
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Banner area */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 p-6 rounded-xl border border-indigo-950 shadow-sm text-white">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-300">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Cadastro de Configuração da API (Webhooks)</h2>
            <p className="text-xs text-indigo-200 mt-1">
              Configure endpoints remotos para receber atualizações automáticas e configure mapeamentos DE/PARA de campos de dados.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('config')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'config'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Settings className="h-4 w-4" />
          Configurações de Webhook
        </button>
        <button
          onClick={() => setActiveSubTab('mapping')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'mapping'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Link className="h-4 w-4" />
          De / Para (Mapeamento de Campos)
          <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            {fieldMappings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('import')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'import'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
          Importar por Excel
        </button>
      </div>

      {/* Tab CONTENT 1: CONFIGURATION OF WEBHOOKS */}
      {activeSubTab === 'config' && (
        <div className="space-y-6">
          {/* Search and Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-3xs">
            
            {/* Search Field */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Buscar por tabela, URL ou filtro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {onTriggerAutoSync && (
                <button
                  id="btn-manual-trigger-auto-sync"
                  onClick={onTriggerAutoSync}
                  disabled={isAutoSyncRunning}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg border transition-all cursor-pointer shadow-3xs ${
                    isAutoSyncRunning
                      ? 'bg-sky-50 text-sky-400 border-sky-200 cursor-not-allowed'
                      : 'bg-white text-sky-700 hover:bg-sky-50 border-sky-300 hover:border-sky-400'
                  }`}
                  title="Executar imediatamente todas as APIs configuradas com execução Automática"
                >
                  <Zap className={`h-4 w-4 ${isAutoSyncRunning ? 'animate-spin text-sky-400' : 'text-sky-600 fill-sky-600/20'}`} />
                  <span>{isAutoSyncRunning ? 'Sincronizando...' : 'Executar APIs Automáticas'}</span>
                </button>
              )}

              {isAdmin ? (
                <button
                  onClick={handleOpenAddModal}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm shadow-xs hover:shadow-indigo-500/10 transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Configurar Webhook
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 select-none">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Apenas administradores podem configurar a API / Webhooks.</span>
                </div>
              )}
            </div>
          </div>

          {/* Execution Mode Informational Banner */}
          <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-sky-900">
            <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sky-950">
                Regra de Execução Automática no Login:
              </p>
              <p className="text-sky-800 leading-relaxed">
                As APIs configuradas com o campo <strong className="text-sky-950 font-bold">"Execução: Automática"</strong> são disparadas em segundo plano assim que qualquer usuário autenticado entra no sistema. Os dados retornados são salvos no banco de dados e exibidos diretamente nas telas (Estoque, Pedidos, Vendas, Produtos), sem a necessidade de clicar no botão "Atualizar".
              </p>
            </div>
          </div>

          {/* Webhooks Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-6 w-36 text-center">Seq / Ações API</th>
                    <th className="py-3 px-6">Nome da Tabela</th>
                    <th className="py-3 px-6">URL do Endpoint</th>
                    <th className="py-3 px-6">Chave Secreta (Token)</th>
                    <th className="py-3 px-6">Condição de Filtro</th>
                    <th className="py-3 px-6">Tela de Execução</th>
                    <th className="py-3 px-6 text-center">Execução</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6">Data de Criação</th>
                    {isAdmin && <th className="py-3 px-6 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
                  {filteredWebhooks.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 9} className="py-12 text-center text-slate-400">
                        <Globe className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-500">Nenhum webhook configurado</p>
                        <p className="text-xs mt-1">Clique em "Configurar Webhook" para começar.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredWebhooks.map((wh) => (
                      <tr key={wh.id} className="hover:bg-slate-50/50 transition-colors">
                        
                        {/* Seq */}
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="inline-flex items-center justify-center font-bold font-mono text-xs bg-slate-100 border border-slate-200 text-slate-700 rounded-lg h-7 w-7 shrink-0 shadow-3xs" title={`Sequência ${wh.seq}`}>
                              {wh.seq}
                            </span>
                            <button
                              onClick={() => handleOpenExecuteModal(wh, 'mock')}
                              className="inline-flex items-center justify-center p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-250 hover:border-emerald-350 rounded-lg shadow-3xs transition-all cursor-pointer hover:scale-105 shrink-0"
                              title="Testar API (Simular payload de teste)"
                            >
                              <Play className="h-3 w-3.5 fill-emerald-600/10 shrink-0" />
                            </button>
                            <button
                              onClick={() => handleOpenExecuteModal(wh, 'actual')}
                              className="inline-flex items-center justify-center p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-lg shadow-3xs transition-all cursor-pointer hover:scale-105 shrink-0"
                              title="Executar API Efetivamente (Enviar dados reais da tabela)"
                            >
                              <Send className="h-3 w-3 shrink-0" />
                            </button>
                          </div>
                        </td>

                        {/* Table Name */}
                        <td className="py-4 px-6 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-indigo-500" />
                            <span>{wh.tableName}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono font-normal">
                              {wh.tableName === 'StockBalance' ? 'Estoque' : wh.tableName === 'OrderHeader' ? 'Pedidos' : wh.tableName === 'Product' ? 'Produtos' : wh.tableName === 'UserAccount' ? 'Usuários' : 'Tabela'}
                            </span>
                          </div>
                        </td>

                        {/* URL */}
                        <td className="py-4 px-6 font-mono text-xs text-slate-600 max-w-xs truncate" title={wh.url}>
                          <a href={wh.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                            {wh.url}
                          </a>
                        </td>

                        {/* Secret Key */}
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <Key className="h-3 w-3 text-slate-400" />
                            <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-[11px] max-w-[120px] truncate select-all" title="Clique para selecionar">
                              {wh.secretKey}
                            </span>
                            <button
                              onClick={() => handleCopySecret(wh.secretKey, wh.id)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                              title="Copiar token de autenticação"
                            >
                              {copiedId === wh.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Filter Condition */}
                        <td className="py-4 px-6 font-mono text-xs">
                          {wh.filterCondition ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-amber-700 bg-amber-50 border border-amber-100">
                              <Filter className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              {wh.filterCondition}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Nenhum (Dispara sempre)</span>
                          )}
                        </td>

                        {/* Tela de Execução */}
                        <td className="py-4 px-6">
                          {wh.targetScreen ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-indigo-700 bg-indigo-50 border border-indigo-200/60 font-semibold text-xs">
                              {wh.targetScreen === 'stock' ? 'Analise Estoque' :
                               wh.targetScreen === 'sales' ? 'Analise Consumo' :
                               wh.targetScreen === 'products' ? 'Produtos' :
                               wh.targetScreen === 'orders' ? 'Pedidos em Aberto' :
                               wh.targetScreen === 'users' ? 'Usuários' : wh.targetScreen}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Apenas Gatilhos</span>
                          )}
                        </td>

                        {/* Execução */}
                        <td className="py-4 px-6 text-center">
                          {wh.execution === 'Automática' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 shadow-3xs" title="Execução Automática">
                              <Zap className="h-3 w-3 text-sky-500" />
                              Automática
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 shadow-3xs" title="Execução Manual">
                              <Hand className="h-3 w-3 text-amber-500" />
                              Manual
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6 text-center">
                          {wh.isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-50 text-rose-600 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                              Inativo
                            </span>
                          )}
                        </td>

                        {/* Created At */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {new Date(wh.createdAt).toLocaleDateString('pt-BR')}
                          </div>
                        </td>

                        {/* Actions (Admin Only) */}
                        {isAdmin && (
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditModal(wh)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                                title="Editar webhook"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              
                              <button
                                onClick={() => handleOpenDeleteConfirm(wh.id)}
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                title="Excluir webhook"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Counter footer info */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Exibindo {filteredWebhooks.length} de {webhooks.length} integrados</span>
              <span>Sistemas ativos: {new Set(webhooks.map(w => new URL(w.url).hostname)).size} domínios integrados</span>
            </div>

          </div>

          {/* Integration Info Box */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 shadow-3xs space-y-3">
            <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-600" />
              Protocolo de Segurança e Sincronização
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sempre que ocorre uma alteração relevante em uma tabela monitorada (estoque, pedidos, etc.), o sistema de expedição dispara um payload JSON no método <strong className="text-indigo-800">POST</strong> contendo o cabeçalho <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono text-xs text-indigo-900">X-Hub-Signature</code> para conferência da <strong>Chave Secreta</strong>. Se houver uma <strong>Condição de filtro da API</strong> configurada, o webhook será acionado apenas quando a regra lógica retornar verdadeira.
            </p>
          </div>
        </div>
      )}

      {/* Tab CONTENT 2: FIELD MAPPINGS DE / PARA */}
      {activeSubTab === 'mapping' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Side: Mapping Configuration Form */}
            <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200 shadow-3xs space-y-5">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Settings className="h-5 w-5 text-indigo-600" />
                  Mapear Campos
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Selecione um Webhook e a tabela correspondente do sistema para configurar os termos "De / Para".
                </p>
              </div>

              <form onSubmit={handleSaveMapping} className="space-y-4">
                {/* 1. Webhook Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    1. Selecionar Webhook Configurado
                  </label>
                  {webhooks.length === 0 ? (
                    <div className="p-3 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-100 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                      Não há webhooks cadastrados. Cadastre um na aba ao lado primeiro.
                    </div>
                  ) : (
                    <select
                      value={selectedWebhookId}
                      onChange={(e) => setSelectedWebhookId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      {webhooks.map(w => (
                        <option key={w.id} value={w.id}>
                          Seq {w.seq} - {w.tableName} ({w.url.replace('https://', '').replace('http://', '').split('/')[0]})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 2. System Table Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    2. Tabela do Sistema (Origem)
                  </label>
                  <select
                    value={selectedSystemTable}
                    onChange={(e) => setSelectedSystemTable(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                  >
                    {Object.keys(SYSTEM_TABLES_FIELDS).map(tbl => (
                      <option key={tbl} value={tbl}>
                        {TABLE_LABELS[tbl]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Field Mappings list */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                      3. Campos de Equivalência
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      DE (Sistema) → PARA (API Externa)
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {(SYSTEM_TABLES_FIELDS[selectedSystemTable] || []).map((field) => (
                      <div key={field} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {/* DE (System Field Name) */}
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs font-bold text-slate-800 truncate" title={field}>
                            {field}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {FIELD_LABELS[field] || 'Campo do sistema'}
                          </p>
                        </div>

                        {/* Arrow */}
                        <ArrowRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />

                        {/* PARA (Target Endpoint Field) */}
                        <div className="w-1/2">
                          <input
                            type="text"
                            placeholder={field} // Show original as placeholder recommendation
                            value={currentMappings[field] || ''}
                            onChange={(e) => handleFieldMappingValueChange(field, e.target.value)}
                            disabled={!isAdmin || webhooks.length === 0}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Success & Error alerts */}
                {mappingSuccessMessage && (
                  <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-2 border border-emerald-100">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                    {mappingSuccessMessage}
                  </div>
                )}
                {mappingErrorMessage && (
                  <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-2 border border-red-100">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                    {mappingErrorMessage}
                  </div>
                )}

                {/* Action Buttons */}
                {isAdmin ? (
                  <button
                    type="submit"
                    disabled={webhooks.length === 0}
                    className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    Salvar Mapeamento
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 select-none">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Apenas administradores podem salvar mapeamentos de campos.</span>
                  </div>
                )}
              </form>
            </div>

            {/* Right Side: Active Saved Mappings List */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Mapeamentos Ativos</h4>
                    <p className="text-[11px] text-slate-400">Total de {fieldMappings.length} mapeamentos DE/PARA cadastrados</p>
                  </div>
                </div>
              </div>

              {/* Mappings Cards List */}
              <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                {fieldMappings.length === 0 ? (
                  <div className="bg-white p-12 text-center text-slate-400 border border-slate-200 rounded-xl">
                    <Link className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-500">Nenhum mapeamento salvo</p>
                    <p className="text-xs mt-1">Selecione as chaves ao lado e clique em Salvar para criar a primeira regra.</p>
                  </div>
                ) : (
                  fieldMappings.map((mapping) => {
                    const webhook = webhooks.find(w => w.id === mapping.webhookId);
                    const mappingKeys = Object.keys(mapping.mappings);

                    return (
                      <div key={mapping.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-2xs transition-shadow">
                        
                        {/* Card Header */}
                        <div className="bg-slate-50/50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-indigo-500" />
                            <span className="font-bold text-slate-800 text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                              {mapping.systemTable}
                            </span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                            <span className="text-xs text-slate-500 font-medium">
                              Webhook Seq {webhook?.seq || '?'} ({webhook ? webhook.url.replace('https://', '').replace('http://', '').split('/')[0] : 'Inativo'})
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Copy/Load mapping to Form */}
                            <button
                              onClick={() => {
                                setSelectedWebhookId(mapping.webhookId);
                                setSelectedSystemTable(mapping.systemTable);
                              }}
                              className="p-1 hover:bg-slate-200 rounded text-indigo-600 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                              title="Carregar no editor"
                            >
                              <Edit2 className="h-3 w-3" />
                              Carregar
                            </button>

                            {/* Delete Mapping */}
                            {isAdmin && (
                              <button
                                onClick={() => onDeleteFieldMapping(mapping.id)}
                                className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-slate-400 transition-colors cursor-pointer"
                                title="Excluir mapeamento"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Body Mappings list */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 pb-1">
                            <span>Mapeamento de Chaves ({mappingKeys.length})</span>
                            <span className="font-mono text-[9px] text-slate-400">
                              Atualizado em: {new Date(mapping.updatedAt).toLocaleTimeString('pt-BR')}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {mappingKeys.map((k) => (
                              <div key={k} className="flex items-center gap-1.5 text-xs font-mono bg-slate-50 border border-slate-200/50 p-1.5 rounded-md">
                                <span className="text-slate-600 font-bold truncate max-w-[120px]" title={k}>{k}</span>
                                <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="text-indigo-600 font-bold truncate max-w-[120px]" title={mapping.mappings[k]}>{mapping.mappings[k]}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Tab CONTENT 3: IMPORT FROM EXCEL */}
      {activeSubTab === 'import' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {/* Section Header */}
          <div className="border-b border-slate-100 p-6 bg-slate-50/50">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Importar Dados via Excel / CSV
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Selecione a tabela de destino, carregue sua planilha Excel (.xlsx, .xls) ou arquivo CSV e processe os registros para importação direta no sistema.
            </p>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left side: Controls */}
            <div className="lg:col-span-1 space-y-5">
              {/* Table Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  1. Tabela do Sistema Destino *
                </label>
                <select
                  value={importSystemTable}
                  onChange={(e) => {
                    setImportSystemTable(e.target.value);
                    setExcelFile(null);
                    setPreviewRows([]);
                    setPreviewColumns([]);
                    setImportSuccessMessage('');
                    setImportErrorMessage('');
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer font-semibold"
                >
                  <option value="StockBalance">📦 Saldo de Estoque (StockBalance)</option>
                  <option value="OrderHeader">📋 Pedidos de Venda (OrderHeader)</option>
                  <option value="Product">🏷️ Cadastro de Produtos (Product)</option>
                  <option value="UserAccount">👤 Usuários do Sistema (UserAccount)</option>
                </select>
              </div>

              {/* Template Guidelines Info */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <Info className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Cabeçalhos Recomendados:</span>
                </div>
                {importSystemTable === 'StockBalance' && (
                  <div className="text-amber-900 space-y-1">
                    <p>Sua planilha deve conter as seguintes colunas na primeira linha:</p>
                    <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-amber-950">
                      <li><strong>productCode</strong> ou <strong>SKU</strong> (Código do produto)</li>
                      <li><strong>productName</strong> ou <strong>Nome</strong> (Opcional)</li>
                      <li><strong>warehouse</strong> ou <strong>Almoxarifado</strong></li>
                      <li><strong>quantity</strong> ou <strong>Quantidade</strong></li>
                    </ul>
                  </div>
                )}
                {importSystemTable === 'OrderHeader' && (
                  <div className="text-amber-900 space-y-1">
                    <p>Sua planilha deve conter as seguintes colunas para os pedidos:</p>
                    <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-amber-950">
                      <li><strong>orderNumber</strong> (Número único do pedido)</li>
                      <li><strong>clientName</strong> (Nome do cliente)</li>
                      <li><strong>date</strong> (Data do pedido, ex: YYYY-MM-DD)</li>
                      <li><strong>priority</strong> (Alta, Média, Baixa)</li>
                      <li><strong>productCode</strong> (Para o item do pedido)</li>
                      <li><strong>quantityOrdered</strong> (Quantidade)</li>
                      <li><strong>unitPrice</strong> (Preço unitário)</li>
                    </ul>
                    <p className="text-[10px] text-amber-700 mt-1 italic">
                      Dica: Linhas consecutivas com o mesmo <strong>orderNumber</strong> serão agrupadas no mesmo pedido.
                    </p>
                  </div>
                )}
                {importSystemTable === 'Product' && (
                  <div className="text-amber-900 space-y-1">
                    <p>Sua planilha deve conter as seguintes colunas:</p>
                    <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-amber-950">
                      <li><strong>code</strong> ou <strong>SKU</strong> (Código único)</li>
                      <li><strong>name</strong> ou <strong>Nome</strong></li>
                      <li><strong>category</strong> ou <strong>Categoria</strong></li>
                    </ul>
                  </div>
                )}
                {importSystemTable === 'UserAccount' && (
                  <div className="text-amber-900 space-y-1">
                    <p>Sua planilha deve conter as seguintes colunas:</p>
                    <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-amber-950">
                      <li><strong>username</strong> (Login do usuário)</li>
                      <li><strong>fullName</strong> (Nome completo)</li>
                      <li><strong>role</strong> (Cargo: admin, vendedor, almoxarife)</li>
                      <li><strong>password</strong> (Senha inicial, opcional)</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Action Trigger Button */}
              <button
                onClick={handleProcessImport}
                disabled={!excelFile || isImporting}
                className={`w-full py-2.5 px-4 font-bold rounded-lg text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  excelFile && !isImporting
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/10'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Processando Arquivo...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Processar Importação
                  </>
                )}
              </button>
            </div>

            {/* Right side: Drag&Drop / Preview area */}
            <div className="lg:col-span-2 space-y-5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                2. Selecionar Arquivo do Computador *
              </label>

              {/* Drag and Drop Zone */}
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative ${
                  excelFile 
                    ? 'border-emerald-300 bg-emerald-50/10' 
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  id="excel-file-input"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                <div className="space-y-3 pointer-events-none">
                  <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center border ${
                    excelFile 
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-600' 
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}>
                    <Upload className="h-5 w-5" />
                  </div>
                  
                  {excelFile ? (
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{excelFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {(excelFile.size / 1024).toFixed(1)} KB • Arquivo carregado com sucesso
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-slate-700 text-sm">Arraste seu arquivo aqui ou clique para buscar</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Suporta planilhas Excel (.xlsx, .xls) ou arquivos texto delimitados por vírgulas (.csv)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Message Alerts */}
              {importErrorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Erro de Importação:</span> {importErrorMessage}
                  </div>
                </div>
              )}

              {importSuccessMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Sucesso!</span> {importSuccessMessage}
                  </div>
                </div>
              )}

              {/* Preview Table of Rows */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-indigo-500" />
                    Pré-visualização dos Dados (Primeiras 5 Linhas)
                  </h4>
                  
                  <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                          {previewColumns.map((col, idx) => (
                            <th key={idx} className="py-2 px-3 border-r border-slate-200 last:border-r-0">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                        {previewRows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-50">
                            {previewColumns.map((col, colIdx) => (
                              <td key={colIdx} className="py-2 px-3 border-r border-slate-200 last:border-r-0 max-w-[150px] truncate">
                                {row[col] !== undefined ? String(row[col]) : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* Global Modals for Webhooks Configuration */}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-600" />
                {editingWebhook ? 'Editar Configuração do Webhook' : 'Configurar Novo Webhook'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Error Alert */}
              {formError && (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-2 border border-red-100">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                  {formError}
                </div>
              )}

              {/* Seq & TableName */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Seq *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="1"
                    value={seq}
                    onChange={(e) => setSeq(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nome da Tabela *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: StockBalance"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* URL endpoint */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  URL do Endpoint *
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://exemplo.com/api/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
              </div>

              {/* Secret Key */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Chave Secreta (Token) *</span>
                  <button
                    type="button"
                    onClick={() => setSecretKey(`sec_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-500 font-bold transition-colors underline cursor-pointer"
                  >
                    Gerar Aleatório
                  </button>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: sec_abcd1234..."
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
              </div>

              {/* Filter Condition */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Condição de Filtro da API
                </label>
                <input
                  type="text"
                  placeholder="Ex: quantity > 10 ou priority == 'Alta'"
                  value={filterCondition}
                  onChange={(e) => setFilterCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Opcional. Se preenchido, os dados de alteração serão enviados somente ao atender essa condição lógica.
                </p>
              </div>

              {/* Target Screen (Tela de Execução) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Tela de Execução do Webhook *
                </label>
                <select
                  value={targetScreen}
                  onChange={(e) => setTargetScreen(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="">Não Executar em Tela (Somente via gatilhos/manual)</option>
                  <option value="stock">Analise Estoque</option>
                  <option value="sales">Analise Consumo</option>
                  <option value="products">Produtos</option>
                  <option value="orders">Pedidos em Aberto</option>
                  <option value="users">Usuários</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Associe este Webhook a uma tela específica para que ele possa ser executado através do botão "Atualizar".
                </p>
              </div>

              {/* Execução */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Execução *
                </label>
                <select
                  value={execution}
                  onChange={(e) => setExecution(e.target.value as 'Automática' | 'Manual')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="Automática">Automática</option>
                  <option value="Manual">Manual</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Escolha se este Webhook terá execução Automática ou Manual.
                </p>
              </div>

              {/* Status Ativo / Inativo */}
              <div className="flex items-start gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 select-none">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 transition-all cursor-pointer"
                />
                <label htmlFor="isActive" className="flex-1 text-xs cursor-pointer">
                  <span className="block font-bold text-slate-700">Webhook Ativo</span>
                  <span className="block text-slate-500 text-[10px] mt-0.5">
                    Se desativado, nenhuma alteração nesta tabela será enviada a este endpoint.
                  </span>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg shadow-xs hover:shadow-indigo-500/10 transition-all cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Salvar Webhook
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-full border border-red-100">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Confirmar Remoção</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza que deseja remover este endpoint de Webhook? Ele deixará de receber atualizações imediatamente.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg shadow-xs hover:shadow-red-500/10 transition-all cursor-pointer"
                >
                  Remover Webhook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Webhook Execution (Test Tool) Modal */}
      {isExecuteModalOpen && executingWebhook && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                  <Play className="h-4.5 w-4.5 text-emerald-600 fill-emerald-600/15" />
                  Executar & Testar Webhook Manualmente
                </h3>
                <p className="text-[11px] text-slate-500">
                  Teste o disparo de dados para o webhook cadastrado. Edite o cabeçalho HTTP e o corpo da requisição em tempo real.
                </p>
              </div>
              <button 
                onClick={() => setIsExecuteModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-50/30">
              
              {/* Left Column: Input Settings & Request Payload */}
              <div className="space-y-4 flex flex-col h-full">
                
                {/* Configuração Básica do Webhook */}
                <div className="bg-white p-4 border border-slate-200 rounded-xl space-y-2 shadow-3xs shrink-0 text-xs">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Configuração do Webhook</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 font-medium">Tabela de Origem:</span>
                      <span className="font-bold text-slate-800 block truncate">{executingWebhook.tableName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">URL de Envio (POST):</span>
                      <span className="font-mono font-bold text-indigo-600 block truncate" title={executingWebhook.url}>
                        {executingWebhook.url}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Seletor de Modo de Carga */}
                <div className="bg-white p-1 border border-slate-200 rounded-lg shadow-3xs flex gap-1 shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setPayloadMode('mock')}
                    className={`flex-1 py-1.5 px-3 rounded-md font-semibold text-center transition-all cursor-pointer ${
                      payloadMode === 'mock'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Carga de Teste (Mock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayloadMode('actual')}
                    className={`flex-1 py-1.5 px-3 rounded-md font-semibold text-center transition-all cursor-pointer ${
                      payloadMode === 'actual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Execução Efetiva (Dados Reais)
                  </button>
                </div>

                {/* Info Boxes based on payload mode */}
                {payloadMode === 'actual' ? (
                  <div className="bg-indigo-50/80 border border-indigo-150 p-3 rounded-xl text-xs text-indigo-900 flex items-start gap-2 shrink-0 leading-relaxed">
                    <Database className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Modo Execução Efetiva</span>
                      <span className="text-[11px] text-slate-600 mt-0.5 block">
                        Os dados exibidos abaixo correspondem à lista real de registros da tabela <strong className="text-indigo-800">{executingWebhook.tableName}</strong> no banco de dados local. Os campos foram traduzidos de acordo com as regras de mapeamento DE/PARA selecionadas.
                      </span>
                      <span className="inline-block mt-2 font-mono text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                        {getActualRecordsCount(executingWebhook)} registros encontrados
                      </span>
                      {getActualRecordsCount(executingWebhook) === 0 && (
                        <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] leading-relaxed">
                          <strong className="text-amber-800">Aviso importante:</strong> Como não existem registros reais salvos nesta tabela no banco de dados local (ou nenhum atende ao filtro estabelecido), o sistema utiliza automaticamente uma estrutura simulada (Mock) como fallback. Isso garante que o Corpo da Requisição não seja enviado vazio e você possa testar os mapeamentos de campos.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50/80 border border-emerald-150 p-3 rounded-xl text-xs text-emerald-900 flex items-start gap-2 shrink-0 leading-relaxed">
                    <Play className="h-4.5 w-4.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Modo de Teste Simulado</span>
                      <span className="text-[11px] text-slate-600 mt-0.5 block">
                        Este modo envia uma estrutura padrão reduzida de exemplo (contendo apenas metadados da tabela e filtros) para testar se o endpoint está online, aceitando conexões e autenticando cabeçalhos corretamente.
                      </span>
                    </div>
                  </div>
                )}

                {/* Cabeçalhos HTTP (Headers em JSON) */}
                <div className="flex flex-col shrink-0">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <Terminal className="h-4 w-4 text-amber-500" />
                    Cabeçalhos HTTP (Headers em JSON)
                  </label>
                  <textarea
                    value={customHeaders}
                    onChange={(e) => setCustomHeaders(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl text-xs font-mono bg-slate-900 text-amber-400 focus:outline-none focus:border-indigo-500 shadow-2xs leading-relaxed resize-none h-[110px]"
                    placeholder="Insira os Headers em JSON..."
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modifique o JSON acima para ajustar parâmetros de autorização e Content-Type.
                  </p>
                </div>

                {/* Corpo do Request (Body em JSON) */}
                <div className="flex-1 flex flex-col min-h-[220px]">
                  <div className="flex items-center justify-between mb-1.5 shrink-0">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="h-4 w-4 text-emerald-500" />
                      Corpo da Requisição (Body em JSON)
                    </label>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const payloadObj = getDefaultPayload(executingWebhook, applyFieldMapping);
                          setCustomPayload(JSON.stringify(payloadObj, null, 2));
                          const headersObj = {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${executingWebhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
                            "X-API-Key": `${executingWebhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
                          };
                          setCustomHeaders(JSON.stringify(headersObj, null, 2));
                        }}
                        className="text-[10px] text-indigo-700 hover:text-indigo-900 font-bold hover:underline cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded border border-indigo-200 transition-colors"
                        title="Restaura os Cabeçalhos e o Corpo da Requisição conforme configurado no cadastro"
                      >
                        Restaurar Padrão do Cadastro
                      </button>

                      {/* Checkbox to toggle Field Mappings dynamically */}
                      {fieldMappings.some(m => m.webhookId === executingWebhook.id && m.systemTable === executingWebhook.tableName) && (
                        <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={applyFieldMapping}
                            onChange={(e) => setApplyFieldMapping(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          Aplicar De/Para
                        </label>
                      )}
                    </div>
                  </div>

                  <textarea
                    value={customPayload}
                    onChange={(e) => setCustomPayload(e.target.value)}
                    className="w-full flex-1 p-3 border border-slate-200 rounded-xl text-xs font-mono bg-slate-900 text-emerald-400 focus:outline-none focus:border-indigo-500 shadow-2xs leading-relaxed resize-none h-[180px]"
                    placeholder="Insira o payload JSON aqui..."
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Modifique o JSON acima livremente para simular o corpo enviado.
                  </p>
                </div>
              </div>

              {/* Right Column: Console Response Log */}
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center justify-between shrink-0">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <RefreshCw className={`h-4 w-4 text-slate-400 ${isExecuting ? 'animate-spin' : ''}`} />
                    Retorno do Servidor (Response)
                  </label>
                  {executionResponse && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      executionResponse.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                      {executionResponse.status}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col min-h-[300px]">
                  {isExecuting ? (
                    <div className="flex-1 border border-slate-200 rounded-xl bg-slate-900/95 flex flex-col items-center justify-center text-slate-400 gap-3 p-6 h-[320px]">
                      <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin" />
                      <div className="text-center">
                        <p className="font-bold text-sm text-slate-200">Enviando Requisição...</p>
                        <p className="text-xs text-slate-500 mt-1">POST {executingWebhook.url}</p>
                      </div>
                    </div>
                  ) : executionResponse ? (
                    <div className="flex-1 border border-slate-200 rounded-xl bg-slate-950 text-slate-300 font-mono text-[11px] p-4 overflow-y-auto h-[320px] shadow-inner space-y-4 leading-relaxed max-w-full">
                      <div>
                        <span className="text-slate-500 block select-none border-b border-slate-800 pb-1 mb-2 font-sans font-bold uppercase tracking-wider text-[10px]">
                          Cabeçalhos Enviados (Headers)
                        </span>
                        <div className="space-y-0.5 text-slate-400 text-xs">
                          {(() => {
                            try {
                              const headersObj = JSON.parse(customHeaders);
                              return Object.entries(headersObj).map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-indigo-400 font-semibold">{key}:</span> {String(val)}
                                </div>
                              ));
                            } catch {
                              return <div className="text-rose-400">Headers inválidos ou vazios no editor</div>;
                            }
                          })()}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-500 block select-none border-b border-slate-800 pb-1 mb-2 font-sans font-bold uppercase tracking-wider text-[10px]">
                          Corpo da Resposta (Response Body)
                        </span>
                        <pre className="whitespace-pre-wrap font-mono text-emerald-400/90 break-all select-all">
                          {executionResponse.body}
                        </pre>
                      </div>

                      {executionResponse.type === 'error' && (
                        <div className="bg-amber-950/40 border border-amber-900/60 p-3 rounded-lg text-[10px] text-amber-300 font-sans mt-4">
                          <strong className="block text-amber-200 font-bold mb-0.5">Dica para Desenvolvedores:</strong>
                          Para testar endpoints locais que não possuem HTTPS ou CORS ativado, você pode usar ferramentas como o Insomnia, Postman ou o terminal cURL.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 border border-slate-200 rounded-xl bg-slate-900/95 border-dashed flex flex-col items-center justify-center text-slate-400 gap-3 p-6 text-center h-[320px]">
                      <Terminal className="h-10 w-10 text-slate-700" />
                      <div>
                        <p className="font-bold text-sm text-slate-300">Nenhuma requisição efetuada</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                          Clique em "Executar Requisição" para efetuar o disparo de teste ao endpoint configurado.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsExecuteModalOpen(false)}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-100 transition-all cursor-pointer border border-slate-200"
              >
                Fechar Painel
              </button>

              <button
                type="button"
                onClick={handleRunExecution}
                disabled={isExecuting || !customPayload.trim() || !customHeaders.trim()}
                className={`flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  isExecuting || !customPayload.trim() || !customHeaders.trim()
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-101'
                }`}
              >
                <Send className="h-4 w-4" />
                Executar Requisição (POST)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
