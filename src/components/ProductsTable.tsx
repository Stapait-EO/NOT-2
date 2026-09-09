import { useState, useMemo, FormEvent } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertCircle, 
  Tag, 
  X, 
  Check, 
  Filter,
  Layers,
  Database,
  Archive,
  RefreshCw,
  FileText,
  Clipboard,
  Download
} from 'lucide-react';
import { Product, UserRole, WebhookConfig, FieldMapping } from '../types';
import { executeProxyWebhook } from '../utils/proxyWebhook';

interface ProductsTableProps {
  products: Product[];
  onAddProduct: (prod: Product) => void;
  onEditProduct: (oldCode: string, editedProd: Product) => void;
  onDeleteProduct: (code: string) => void;
  currentUserRole: UserRole;
  // We can pass stock and orders to check references before deleting
  stock?: { productCode: string }[];
  orders?: { items: { productCode: string }[] }[];
  onClearAllProducts?: () => void;
  webhooks?: WebhookConfig[];
  fieldMappings?: FieldMapping[];
  onImportProducts?: (imported: Product[], overwrite?: boolean) => void;
}

export default function ProductsTable({ 
  products = [], 
  onAddProduct, 
  onEditProduct, 
  onDeleteProduct,
  currentUserRole,
  stock = [],
  orders = [],
  onClearAllProducts,
  webhooks = [],
  fieldMappings = [],
  onImportProducts
}: ProductsTableProps) {
  const canManageProducts = currentUserRole === 'admin' || currentUserRole === 'vendedor';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Todos');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  // Form Fields
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [prCod, setPrCod] = useState('');
  const [codigoStructured, setCodigoStructured] = useState('');
  const [lote, setLote] = useState('');
  const [avgQty1x, setAvgQty1x] = useState('');
  const [avgQty3x, setAvgQty3x] = useState('');
  
  // Error / Warning handling
  const [formError, setFormError] = useState('');
  const [deleteWarning, setDeleteWarning] = useState('');

  // Webhook execution and import integration states for Products
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
        before = before.replace(/[\.,]/g, '');
        const after = str.substring(lastCommaIndex + 1);
        str = before + '.' + after;
      }
      
      const parsed = parseFloat(str);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Helper to resolve mapped values, supporting expressions with '+', '-', '*', '/' and parentheses
    const resolveMappedValue = (item: any, mappingKey: string | undefined): any => {
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
      } catch (err) {
        addLog(`Erro ao calcular expressão matemática "${trimmedKey}": ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    };

    addLog('O usuário clicou no botão "Atualizar" na tela de Produtos.');

    // 1. Apagar todos os produtos cadastrados localmente
    if (onClearAllProducts) {
      onClearAllProducts();
      addLog('Executado o delete da tabela local "Product" (todos os produtos locais foram limpos).');
    } else {
      addLog('AVISO: Função para limpar produtos locais indisponível.');
    }

    // 2. Encontrar o webhook ativo configurado para esta tela ou para a tabela 'Product'
    let webhook = webhooks.find(wh => wh.isActive && wh.targetScreen === 'products');
    if (!webhook) {
      webhook = webhooks.find(wh => wh.isActive && wh.tableName.trim().toLowerCase() === 'product');
    }
    if (!webhook) {
      webhook = webhooks.find(wh => wh.isActive && wh.tableName.trim().toLowerCase() === 'products');
    }

    if (!webhook) {
      addLog('ERRO: Nenhum webhook ativo associado a esta tela ou à tabela Product.');
      setUpdateStatus('error');
      setUpdateMessage('Nenhum webhook ativo configurado para o Catálogo de Produtos. Por favor, configure um webhook com esta tela de execução em "Configurações de Webhook".');
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

      const data = await executeProxyWebhook({
        url: webhook.url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`,
          "X-API-Key": `${webhook.secretKey || 'c9211efc48ddf332ed8927f8769a45bc4a5c20356a04baae0825bd7de5e9198d'}`
        },
        body: requestBody
      });

      if (!data.ok) {
        throw new Error(`Erro na resposta do servidor do Webhook (Status: ${data.status} ${data.statusText || ''}).`);
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

      addLog(`Dados encontrados no retorno do webhook (total de registros: ${itemsArray.length}). Iniciando validação e mapeamento...`);

      const mapping = fieldMappings.find(
        m => m.webhookId === webhook!.id && 
        m.systemTable.trim().toLowerCase() === 'product'
      );

      if (mapping) {
        addLog(`Utilizando mapeamento "De/Para" ativo localizado (ID: ${mapping.id}, atualizado em: ${new Date(mapping.updatedAt).toLocaleString()}).`);
      } else {
        addLog('AVISO: Nenhum mapeamento "De/Para" customizado localizado para esta tabela. Utilizando nomes de campos originais do payload.');
      }

      const systemFields = ['code', 'name', 'category', 'pr_cod', 'codigo', 'lote', 'avgQty1x', 'avgQty3x'];
      
      const validImportedItems: Product[] = [];
      const rejectedItems: { item: any; reason: string }[] = [];

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

        // Resolve code with auxiliary and nested field fallbacks
        const code = mappedItem.code || 
                     mappedItem.pr_cod || 
                     mappedItem.codigo || 
                     webhookItem.code || 
                     webhookItem.sku || 
                     webhookItem.productCode || 
                     webhookItem.product_code ||
                     webhookItem.cod || 
                     webhookItem.cod_produto || 
                     webhookItem.pr_cod || 
                     webhookItem.codigo;

        const name = mappedItem.name ||
                     webhookItem.name ||
                     webhookItem.productName ||
                     webhookItem.product_name ||
                     webhookItem.nome ||
                     webhookItem.descricao ||
                     webhookItem.description;

        if (!code) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Item #${index + 1}: Nenhum código/SKU identificado nos campos mapeados ou originais (code, SKU, productCode, pr_cod).`
          });
          return;
        }

        if (!name) {
          rejectedItems.push({
            item: webhookItem,
            reason: `Item #${index + 1} (SKU: ${code}): Nenhum nome ou descrição identificado (name, productName, nome, descricao).`
          });
          return;
        }

        const category = mappedItem.category || webhookItem.category || webhookItem.categoria || 'Geral';
        const pr_cod = mappedItem.pr_cod !== undefined ? Number(mappedItem.pr_cod) : (webhookItem.pr_cod !== undefined ? Number(webhookItem.pr_cod) : undefined);
        const codigo = mappedItem.codigo || webhookItem.codigo || undefined;
        const lote = mappedItem.lote || webhookItem.lote || undefined;
        
        let avgQty1x = 0;
        const rawAvgQty1x = mappedItem.avgQty1x !== undefined ? mappedItem.avgQty1x : (webhookItem.avgQty1x !== undefined ? webhookItem.avgQty1x : (webhookItem.avg_qty_1x !== undefined ? webhookItem.avg_qty_1x : webhookItem.qtd_media_1x));
        if (rawAvgQty1x !== undefined && rawAvgQty1x !== null) {
          avgQty1x = Math.round(Number(rawAvgQty1x));
          if (isNaN(avgQty1x)) avgQty1x = 0;
        }

        let avgQty3x = 0;
        const rawAvgQty3x = mappedItem.avgQty3x !== undefined ? mappedItem.avgQty3x : (webhookItem.avgQty3x !== undefined ? webhookItem.avgQty3x : (webhookItem.avg_qty_3x !== undefined ? webhookItem.avg_qty_3x : webhookItem.qtd_media_3x));
        if (rawAvgQty3x !== undefined && rawAvgQty3x !== null) {
          avgQty3x = Math.round(Number(rawAvgQty3x));
          if (isNaN(avgQty3x)) avgQty3x = 0;
        }

        const finalProduct: Product = {
          code: String(code).trim(),
          name: String(name).trim(),
          category: String(category).trim(),
          pr_cod,
          codigo: codigo ? String(codigo).trim() : undefined,
          lote: lote ? String(lote).trim() : undefined,
          avgQty1x,
          avgQty3x
        };

        validImportedItems.push(finalProduct);
      });

      if (onImportProducts) {
        onImportProducts(validImportedItems, true);
        addLog(`Importado para a tabela "Product": ${validImportedItems.length} produtos com sucesso.`);
      } else {
        addLog('ERRO: Função para gravar os produtos importados está indisponível.');
        throw new Error('Função de persistência onImportProducts ausente.');
      }

      setLogSummary({
        totalRaw: itemsArray.length,
        totalImported: validImportedItems.length,
        totalRejected: rejectedItems.length
      });
      setUnimportedDetails(rejectedItems);

      addLog(`Mapeamento finalizado com sucesso!`);
      if (rejectedItems.length > 0) {
        addLog(`AVISO: ${rejectedItems.length} registros foram ignorados ou rejeitados. Detalhes estão disponíveis abaixo.`);
        setUpdateStatus('success');
        setUpdateMessage(`Importação concluída parcialmente: ${validImportedItems.length} produtos gravados, ${rejectedItems.length} rejeitados.`);
      } else {
        setUpdateStatus('success');
        setUpdateMessage(`Catálogo de produtos atualizado com sucesso! ${validImportedItems.length} produtos importados.`);
      }

    } catch (err: any) {
      addLog(`ERRO CRÍTICO NA EXECUÇÃO: ${err.message || err}`);
      setUpdateStatus('error');
      setUpdateMessage(`Erro na integração com o Webhook: ${err.message || 'Erro desconhecido.'}`);
    } finally {
      setIsUpdating(false);
      setExecutionLogs(logsList);
      setIsLogModalOpen(true);
    }
  };

  const exportLogToTxt = () => {
    const header = `==================================================\n  RELATÓRIO DE AUDITORIA E LOGS - IMPORTAÇÃO PRODUTOS\n  Data/Hora: ${new Date().toLocaleString()}\n==================================================\n\n`;
    const summary = `SUMÁRIO DA INTEGRAÇÃO:\n- Registros Brutos Recebidos: ${logSummary.totalRaw}\n- Produtos Cadastrados com Sucesso: ${logSummary.totalImported}\n- Registros Rejeitados: ${logSummary.totalRejected}\n\n`;
    const logsSection = `LOGS DE EXECUÇÃO DETALHADOS:\n${executionLogs.join('\n')}\n\n`;
    let rejectionsSection = '';
    if (unimportedDetails.length > 0) {
      rejectionsSection = `REGISTROS REJEITADOS E MOTIVOS:\n` + unimportedDetails.map((d, i) => `[#${i+1}] Motivo: ${d.reason}\n    Dados Brutos: ${JSON.stringify(d.item)}`).join('\n\n') + '\n';
    }
    const fullText = header + summary + logsSection + rejectionsSection;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log-integracao-produtos-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      if (p.category) {
        list.add(p.category);
      }
    });
    return ['Todos', ...Array.from(list)];
  }, [products]);

  // Filter products based on search term & category
  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return products.filter(p => {
      const matchesSearch = 
        !term ||
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        (p.category && p.category.toLowerCase().includes(term)) ||
        (p.codigo && p.codigo.toLowerCase().includes(term)) ||
        (p.pr_cod !== undefined && String(p.pr_cod).toLowerCase().includes(term));
        
      const matchesCategory = 
        selectedCategoryFilter === 'Todos' || 
        p.category === selectedCategoryFilter;
        
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategoryFilter]);

  // Handle open create modal
  const handleOpenCreateModal = () => {
    if (!canManageProducts) return;
    setEditingProduct(null);
    setProductCode('');
    setProductName('');
    setProductCategory('');
    setPrCod('');
    setCodigoStructured('');
    setLote('');
    setAvgQty1x('');
    setAvgQty3x('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEditModal = (prod: Product) => {
    if (!canManageProducts) return;
    setEditingProduct(prod);
    setProductCode(prod.code);
    setProductName(prod.name);
    setProductCategory(prod.category || '');
    setPrCod(prod.pr_cod !== undefined ? String(prod.pr_cod) : '');
    setCodigoStructured(prod.codigo || '');
    setLote(prod.lote || '');
    setAvgQty1x(prod.avgQty1x !== undefined ? String(prod.avgQty1x) : '');
    setAvgQty3x(prod.avgQty3x !== undefined ? String(prod.avgQty3x) : '');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle open delete modal
  const handleOpenDeleteModal = (code: string) => {
    if (!canManageProducts) return;
    setDeletingCode(code);
    
    // Check if product is in stock or orders
    const isInStock = stock.some(s => s.productCode === code);
    const isInOrders = orders.some(o => o.items.some(item => item.productCode === code));
    
    let warning = '';
    if (isInStock && isInOrders) {
      warning = 'Este produto possui saldo em estoque ativo E está associado a pedidos em aberto. Deletar este produto pode causar inconsistências visuais.';
    } else if (isInStock) {
      warning = 'Este produto possui saldo físico registrado em estoque. Ao deletar, as referências de estoque continuarão exibindo o código.';
    } else if (isInOrders) {
      warning = 'Este produto está presente em pedidos de venda em aberto.';
    }
    
    setDeleteWarning(warning);
    setIsDeleteConfirmOpen(true);
  };

  // Save changes (add or edit)
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedCode = productCode.trim();
    const trimmedName = productName.trim();
    const trimmedCategory = productCategory.trim();

    if (!trimmedCode) {
      setFormError('O código do produto é obrigatório.');
      return;
    }
    if (!trimmedName) {
      setFormError('O nome do produto é obrigatório.');
      return;
    }

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

    const avgQty1xParsed = avgQty1x.trim() ? parseInt(avgQty1x.trim(), 10) : undefined;
    if (avgQty1xParsed !== undefined && (isNaN(avgQty1xParsed) || !Number.isInteger(avgQty1xParsed))) {
      setFormError('A Qtd Média 1x deve ser um número inteiro válido.');
      return;
    }

    const avgQty3xParsed = avgQty3x.trim() ? parseInt(avgQty3x.trim(), 10) : undefined;
    if (avgQty3xParsed !== undefined && (isNaN(avgQty3xParsed) || !Number.isInteger(avgQty3xParsed))) {
      setFormError('A Qtd Média 3x deve ser um número inteiro válido.');
      return;
    }

    const updatedProductData: Product = {
      code: trimmedCode,
      name: trimmedName,
      category: trimmedCategory || undefined,
      pr_cod: prCodParsed,
      codigo: codigoStructuredParsed,
      lote: loteParsed,
      avgQty1x: avgQty1xParsed,
      avgQty3x: avgQty3xParsed
    };

    // If creating new, check for duplicate code
    if (!editingProduct) {
      const codeExists = products.some(p => p.code.toLowerCase() === trimmedCode.toLowerCase());
      if (codeExists) {
        setFormError(`Já existe um produto cadastrado com o código "${trimmedCode}".`);
        return;
      }

      onAddProduct(updatedProductData);
    } else {
      // Editing
      onEditProduct(editingProduct.code, updatedProductData);
    }

    setIsModalOpen(false);
  };

  // Confirm delete
  const handleDeleteConfirm = () => {
    if (deletingCode) {
      onDeleteProduct(deletingCode);
      setDeletingCode(null);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleClearAll = () => {
    if (onClearAllProducts) {
      onClearAllProducts();
    }
    setIsClearAllConfirmOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Page Title Area */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Archive className="h-5 w-5 text-indigo-600" />
            Catálogo de Produtos
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre, edite ou remova produtos do catálogo geral do sistema de expedição.
          </p>
        </div>
        
        {canManageProducts && (
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 self-start sm:self-auto w-full sm:w-auto">
            {products.length > 0 && onClearAllProducts && (
              <button
                id="btn-clear-all-products"
                onClick={() => setIsClearAllConfirmOpen(true)}
                className="flex items-center justify-center gap-2 border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer w-full sm:w-auto"
                title="Excluir todos os produtos do catálogo"
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
                <span>Excluir Todos os Produtos</span>
              </button>
            )}
            
            <button
              id="btn-update-products"
              onClick={handleExecuteUpdate}
              disabled={isUpdating}
              className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer border ${
                isUpdating 
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 hover:shadow-indigo-500/10'
              }`}
              title="Apagar dados locais e atualizar importando os dados reais de produtos através do Webhook configurado"
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

            <button
              onClick={handleOpenCreateModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Produto</span>
            </button>
          </div>
        )}
      </div>

      {/* Stats row inside tab */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total de Itens</span>
            <span className="font-mono text-lg font-extrabold text-slate-800">{products.length}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Categorias Únicas</span>
            <span className="font-mono text-lg font-extrabold text-slate-800">{categories.length - 1}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Filtro Aplicado</span>
            <span className="font-mono text-sm font-bold text-amber-800 truncate block">{selectedCategoryFilter}</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search Input */}
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, nome ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 self-stretch md:self-auto w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full md:w-48 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer font-semibold"
          >
            {categories.map((cat, idx) => (
              <option key={idx} value={cat}>
                {cat === 'Todos' ? '📂 Todas as Categorias' : `🏷️ ${cat}`}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* Products Table Wrapper */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-6">Código (SKU)</th>
                <th className="py-3 px-6">Descrição / Nome do Produto</th>
                <th className="py-3 px-6">Categoria</th>
                <th className="py-3 px-6">Cód. Interno</th>
                <th className="py-3 px-6">Cód. Estruturado</th>
                {canManageProducts && <th className="py-3 px-6 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={canManageProducts ? 6 : 5} className="py-12 text-center text-slate-400">
                    <Archive className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-500">Nenhum produto cadastrado</p>
                    <p className="text-xs mt-1">Modifique sua busca ou cadastre um novo produto.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod, index) => (
                  <tr key={`${prod.code}-${prod.pr_cod ?? ''}-${prod.codigo ?? ''}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                    
                    {/* Code */}
                    <td className="py-4 px-6 font-mono text-xs font-bold text-indigo-950">
                      <span className="bg-indigo-50/50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-md">
                        {prod.code}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="py-4 px-6 font-semibold text-slate-800">
                      {prod.name}
                    </td>

                    {/* Category */}
                    <td className="py-4 px-6">
                      {prod.category ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          <Tag className="h-3 w-3" />
                          {prod.category}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">- Sem categoria -</span>
                      )}
                    </td>

                    {/* pr_cod */}
                    <td className="py-4 px-6 font-mono text-xs text-slate-600">
                      {prod.pr_cod !== undefined ? String(prod.pr_cod).padStart(5, '0') : <span className="text-slate-300">-</span>}
                    </td>

                    {/* codigo */}
                    <td className="py-4 px-6 font-mono text-xs text-slate-600">
                      {prod.codigo || <span className="text-slate-300">-</span>}
                    </td>

                    {/* Action buttons */}
                    {canManageProducts && (
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(prod)}
                            title="Editar produto"
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-all cursor-pointer"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(prod.code)}
                            title="Excluir produto"
                            className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-all cursor-pointer"
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
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="border-b border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">
                {editingProduct ? '📝 Editar Cadastro de Produto' : '📦 Cadastrar Novo Produto'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-md transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Product Code */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Código do Produto (SKU / Código Único) *
                </label>
                <input
                  type="text"
                  placeholder="Ex: PROD-001"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  disabled={!!editingProduct}
                  className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none transition-all ${
                    editingProduct 
                      ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed font-mono' 
                      : 'bg-white border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono'
                  }`}
                  required
                />
                {editingProduct && (
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    O código do produto não pode ser alterado após o cadastro.
                  </p>
                )}
              </div>

              {/* Product Description / Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nome do Produto / Descrição *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Teclado Mecânico RGB Wireless"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                  required
                />
              </div>

              {/* Grid: pr_cod & codigoStructured */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Código Interno (pr_cod)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="99999"
                    placeholder="Ex: 10001"
                    value={prCod}
                    onChange={(e) => setPrCod(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Cód. Estruturado (codigo)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Ex: PROD000001"
                    value={codigoStructured}
                    onChange={(e) => setCodigoStructured(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Grid: lote & category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Lote do Produto
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Ex: LOTE000001"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Eletrônicos..."
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    list="categories-datalist"
                  />
                  <datalist id="categories-datalist">
                    {categories.filter(c => c !== 'Todos').map((cat, idx) => (
                      <option key={idx} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Grid: avgQty1x & avgQty3x */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Qtd Média 1x
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder="Ex: 15"
                    value={avgQty1x}
                    onChange={(e) => setAvgQty1x(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Qtd Média 3x
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder="Ex: 45"
                    value={avgQty3x}
                    onChange={(e) => setAvgQty3x(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  {editingProduct ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-50 border border-red-100 text-red-600 flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              
              <div>
                <h3 className="font-bold text-slate-800 text-base">Excluir Produto do Catálogo</h3>
                <p className="text-xs text-slate-500 mt-2">
                  Você tem certeza que deseja excluir o produto <span className="font-bold text-slate-700">"{deletingCode}"</span>? Esta ação não pode ser desfeita.
                </p>
              </div>

              {deleteWarning && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg text-left flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{deleteWarning}</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg font-semibold text-sm transition-all cursor-pointer"
                >
                  Não, Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  Sim, Excluir Produto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL PRODUCTS CONFIRM MODAL */}
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="h-6 w-6 animate-pulse" />
              <h3 className="font-bold text-lg text-slate-800">Confirmar Limpeza Total do Catálogo</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-normal">
              Tem certeza que deseja <strong>excluir todos os produtos</strong> do catálogo? Esta ação removerá completamente todos os produtos cadastrados para que você possa importá-los novamente. 
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg space-y-1">
              <p className="font-semibold">Atenção:</p>
              <p className="leading-relaxed">
                A exclusão do catálogo não removerá saldos de estoque e pedidos, mas fará com que as referências a esses códigos percam a descrição do produto até que sejam recadastrados ou reimportados.
              </p>
            </div>

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
                id="btn-confirm-clear-all-products"
                onClick={handleClearAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Sim, Limpar Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Execution Logs Modal */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText className="text-indigo-600 h-5 w-5" />
                <span>Auditoria de Integração e Logs do Webhook de Produtos</span>
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
            <div className="p-6 overflow-y-auto space-y-5 animate-in fade-in zoom-in-95 duration-150">
              
              {updateStatus !== 'idle' && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  updateStatus === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <AlertCircle className={`h-5 w-5 shrink-0 ${updateStatus === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
                  <div>
                    <h4 className="font-bold text-sm">Status do Processamento</h4>
                    <p className="text-xs mt-0.5 leading-relaxed">{updateMessage}</p>
                  </div>
                </div>
              )}

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
                  <span className="block text-[10px] text-emerald-500 mt-1 font-medium">Gravados no Catálogo</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 text-center">
                  <span className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-0.5">Rejeitados</span>
                  <span className="text-2xl font-black text-rose-950">{logSummary.totalRejected}</span>
                  <span className="block text-[10px] text-rose-500 mt-1 font-medium">Sem SKU / Nome</span>
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
