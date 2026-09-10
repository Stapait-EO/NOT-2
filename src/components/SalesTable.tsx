import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  RefreshCw, 
  Download, 
  TrendingUp,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Edit2,
  Filter,
  Check,
  RotateCcw,
  ChevronDown,
  FileText,
  Loader2
} from 'lucide-react';
import { SaleRecord, Product, WebhookConfig, FieldMapping, StockBalance, Warehouse } from '../types';
import { exportSalesToExcel } from '../utils/exportSalesExcel';
import { executeProxyWebhook } from '../utils/proxyWebhook';

interface SalesTableProps {
  sales: SaleRecord[];
  products: Product[];
  stock?: StockBalance[];
  warehouses?: Warehouse[];
  onAddSale: (sale: Omit<SaleRecord, 'id'>) => void;
  onEditSale: (sale: SaleRecord) => void;
  onDeleteSale: (id: string) => void;
  onClearAllSales: () => void;
  onImportSales: (sales: SaleRecord[], overwrite?: boolean) => void;
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
  currentUserRole?: string;
}

interface MonthColumn {
  key: string; // e.g. "8/2025"
  month: number;
  year: number;
  label: string; // e.g. "8/2025"
}

// Categorias de Cobertura para filtro de múltipla escolha
export interface CoverageCategoryDef {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  badgeClass: string;
  dotClass: string;
  btnBg: string;
  btnActiveBg: string;
}

export const COVERAGE_CATEGORIES: CoverageCategoryDef[] = [
  {
    id: 'zero',
    name: 'Ruptura (0 dias)',
    shortName: 'Ruptura (0d)',
    subtitle: 'Estoque zerado',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    dotClass: 'bg-rose-500',
    btnBg: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
    btnActiveBg: 'bg-rose-600 text-white border-rose-600'
  },
  {
    id: 'critical',
    name: 'Crítico (1 a 30 dias)',
    shortName: '1 a 30 dias',
    subtitle: 'Risco iminente de ruptura',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    dotClass: 'bg-red-500',
    btnBg: 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100',
    btnActiveBg: 'bg-red-600 text-white border-red-600'
  },
  {
    id: 'warning',
    name: 'Atenção (31 a 60 dias)',
    shortName: '31 a 60 dias',
    subtitle: 'Giro rápido / reposição',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    dotClass: 'bg-amber-500',
    btnBg: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    btnActiveBg: 'bg-amber-600 text-white border-amber-600'
  },
  {
    id: 'healthy',
    name: 'Adequado (61 a 120 dias)',
    shortName: '61 a 120 dias',
    subtitle: 'Estoque equilibrado',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dotClass: 'bg-emerald-500',
    btnBg: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
    btnActiveBg: 'bg-emerald-600 text-white border-emerald-600'
  },
  {
    id: 'excess',
    name: 'Excesso (121 a 365 dias)',
    shortName: '121 a 365 dias',
    subtitle: 'Giro lento / capital retido',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    dotClass: 'bg-blue-500',
    btnBg: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
    btnActiveBg: 'bg-blue-600 text-white border-blue-600'
  },
  {
    id: 'very_high',
    name: 'Longa Cobertura (> 365 dias)',
    shortName: '> 365 dias',
    subtitle: 'Mais de 1 ano de estoque',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    dotClass: 'bg-indigo-500',
    btnBg: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100',
    btnActiveBg: 'bg-indigo-600 text-white border-indigo-600'
  },
  {
    id: 'no_sales',
    name: 'Sem Saída (9999 dias)',
    shortName: 'Sem Saída',
    subtitle: 'Tem estoque sem vendas',
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    dotClass: 'bg-zinc-400',
    btnBg: 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200',
    btnActiveBg: 'bg-zinc-700 text-white border-zinc-700'
  }
];

export const SalesTable: React.FC<SalesTableProps> = ({
  sales,
  products,
  stock = [],
  warehouses = [],
  onAddSale,
  onEditSale,
  onDeleteSale,
  onClearAllSales,
  onImportSales,
  webhooks,
  fieldMappings,
  currentUserRole
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);

  // Form state for "Lançar"
  const [formData, setFormData] = useState({
    sku: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    quantity: 1,
    notes: ''
  });

  const canManage = currentUserRole === 'admin' || currentUserRole === 'vendedor' || !currentUserRole;

  // Determinação do mês corrente de referência (ex: Setembro de 2026 -> 9/2026) a ser desconsiderado
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentSerial = currentYear * 12 + currentMonth;
  const currentMonthLabel = `${currentMonth}/${currentYear}`;

  // Modo de exibição: 'last12closed' (padrão - 12 meses anteriores fechados) ou 'all' (todos os meses importados)
  const [viewPeriod, setViewPeriod] = useState<'last12closed' | 'all'>('last12closed');

  // Filtro de Grupo de Estoque: 'all' (todos os grupos) ou nome de um grupo específico
  const [stockGroupFilter, setStockGroupFilter] = useState<'all' | string>('all');
  const [specificStockGroup, setSpecificStockGroup] = useState<string>('São Paulo');

  // Ordenação de colunas da tabela
  const [sortField, setSortField] = useState<string>('sku');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Inclusão automática de itens do Saldo de Estoque sem faturamento (padrão: true)
  const [includeStockWithoutSales, setIncludeStockWithoutSales] = useState<boolean>(true);

  // Filtros em coluna: Classe de Giro
  const [turnoverClassFilter, setTurnoverClassFilter] = useState<string[]>([]);
  const [isTurnoverFilterOpen, setIsTurnoverFilterOpen] = useState<boolean>(false);
  const turnoverFilterRef = useRef<HTMLDivElement>(null);

  // Filtros em coluna: Cobertura (dias) - Múltipla Escolha
  const [coverageFilter, setCoverageFilter] = useState<string[]>([]);
  const [coverageCustomMin, setCoverageCustomMin] = useState<string>('');
  const [coverageCustomMax, setCoverageCustomMax] = useState<string>('');
  const [isCoverageFilterOpen, setIsCoverageFilterOpen] = useState<boolean>(false);
  const coverageFilterRef = useRef<HTMLDivElement>(null);

  // Exportação Excel formatado & CSV
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Fechar dropdowns de filtro e exportação ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (turnoverFilterRef.current && !turnoverFilterRef.current.contains(event.target as Node)) {
        setIsTurnoverFilterOpen(false);
      }
      if (coverageFilterRef.current && !coverageFilterRef.current.contains(event.target as Node)) {
        setIsCoverageFilterOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Identificação e normalização do grupo do armazém/depósito
  const getWarehouseGroup = React.useCallback((whName: string) => {
    const cleanWh = (whName || '').trim();
    const wh = warehouses.find(w => w.name.trim().toLowerCase() === cleanWh.toLowerCase());
    if (!wh) {
      if (cleanWh.startsWith('0002')) return "São Paulo";
      if (cleanWh.startsWith('0004')) return "Miami";
      return "Outros";
    }
    if (!wh.isActive) return "Inativo";
    return wh.groupName?.trim() || "Outros";
  }, [warehouses]);

  // Product correlations lookup:
  // Maps child product codes to their parent product code and multiplier,
  // and parent product codes to their list of children with multipliers.
  const correlationMaps = useMemo(() => {
    const childToParent = new Map<string, { parentCode: string; multiplier: number }>();
    const parentToChildren = new Map<string, { code: string; multiplier: number; description?: string }[]>();

    products.forEach(p => {
      const parentKey = (p.code || '').trim().toUpperCase();
      if (!parentKey) return;

      const corrs: { code: string; multiplier: number; description?: string }[] = [];
      if (Array.isArray(p.correlations)) {
        p.correlations.forEach(c => {
          const cCode = (c.code || '').trim().toUpperCase();
          const mult = Number(c.multiplier) || 1;
          if (cCode && cCode !== parentKey && mult > 0) {
            corrs.push({ code: cCode, multiplier: mult, description: c.description });
          }
        });
      }
      if (p.correlationCode) {
        const cCode = p.correlationCode.trim().toUpperCase();
        const mult = Number(p.correlationMultiplier) || 1;
        if (cCode && cCode !== parentKey && mult > 0 && !corrs.some(c => c.code === cCode)) {
          corrs.push({ code: cCode, multiplier: mult });
        }
      }

      if (corrs.length > 0) {
        parentToChildren.set(parentKey, corrs);
        corrs.forEach(c => {
          childToParent.set(c.code, { parentCode: parentKey, multiplier: c.multiplier });
        });
      }
    });

    return { childToParent, parentToChildren };
  }, [products]);

  // Todos os meses únicos presentes na base de vendas (ordenados cronologicamente)
  const allSalesMonths = useMemo<MonthColumn[]>(() => {
    const map = new Map<string, { month: number; year: number }>();
    sales.forEach(s => {
      if (s.month && s.year && Number(s.quantity) > 0) {
        const key = `${s.month}/${s.year}`;
        if (!map.has(key)) {
          map.set(key, { month: s.month, year: s.year });
        }
      }
    });

    return Array.from(map.entries()).map(([key, val]) => ({
      key,
      month: val.month,
      year: val.year,
      label: key
    })).sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
  }, [sales]);

  // Os 12 meses anteriores fechados (imediatamente anteriores ao mês corrente)
  // Exemplo para 9/2026: 9/2025 até 8/2026
  const target12ClosedMonths = useMemo<MonthColumn[]>(() => {
    const cols: MonthColumn[] = [];
    for (let i = 12; i >= 1; i--) {
      const serial = currentSerial - i;
      const y = Math.floor((serial - 1) / 12);
      const m = ((serial - 1) % 12) + 1;
      const key = `${m}/${y}`;
      cols.push({
        key,
        month: m,
        year: y,
        label: key
      });
    }
    return cols;
  }, [currentSerial]);

  // Colunas de meses ativas na tabela (12 meses anteriores fechados ou todos)
  const monthColumns = useMemo<MonthColumn[]>(() => {
    if (viewPeriod === 'all') {
      return allSalesMonths;
    }
    return target12ClosedMonths;
  }, [viewPeriod, allSalesMonths, target12ClosedMonths]);

  // Conjunto de chaves dos 12 meses anteriores fechados
  const last12MonthKeys = useMemo<Set<string>>(() => {
    return new Set(target12ClosedMonths.map(c => c.key));
  }, [target12ClosedMonths]);

  // Grupos de meses para o cálculo do "Ritmo proj./mês" baseado nos 12 meses fechados
  const paceMonthGroups = useMemo(() => {
    if (target12ClosedMonths.length < 12) {
      return { last3: [], mid3: [], prior6: [] };
    }
    // target12ClosedMonths está ordenado cronologicamente (índice 0: mais antigo -> índice 11: mais recente fechado)
    // 1. Últimos 3 meses (ex: Ago/2026, Jul/2026, Jun/2026) -> índices 9, 10, 11
    const last3 = target12ClosedMonths.slice(9, 12).map(c => c.key);
    // 2. 3 meses subsequentes/anteriores (ex: Mai/2026, Abr/2026, Mar/2026) -> índices 6, 7, 8
    const mid3 = target12ClosedMonths.slice(6, 9).map(c => c.key);
    // 3. 6 meses anteriores restantes (ex: Fev/2026, Jan/2026, Dez/2025, Nov/2025, Out/2025, Set/2025) -> índices 0 a 5
    const prior6 = target12ClosedMonths.slice(0, 6).map(c => c.key);

    return { last3, mid3, prior6 };
  }, [target12ClosedMonths]);

  // Group sales by SKU, consolidating correlated child items into their parent item
  const salesBySku = useMemo(() => {
    const skuMap = new Map<string, { [monthKey: string]: number }>();

    sales.forEach(s => {
      const rawSku = (s.sku || '').trim();
      if (!rawSku) return;
      const skuUpper = rawSku.toUpperCase();

      // Verifica se o SKU vendido é um item correlacionado (filho)
      const childRel = correlationMaps.childToParent.get(skuUpper);
      const effectiveParentCode = childRel ? childRel.parentCode : rawSku;
      const multiplier = childRel ? childRel.multiplier : 1;

      // Identifica o código canônico do produto pai
      const canonicalProd = products.find(p => p.code.trim().toUpperCase() === effectiveParentCode.toUpperCase());
      const targetSku = canonicalProd ? canonicalProd.code : effectiveParentCode;

      if (!skuMap.has(targetSku)) {
        skuMap.set(targetSku, {});
      }
      const record = skuMap.get(targetSku)!;
      const key = `${s.month}/${s.year}`;
      const convertedQty = (Number(s.quantity) || 0) * multiplier;
      record[key] = (record[key] || 0) + convertedQty;
    });

    return skuMap;
  }, [sales, correlationMaps, products]);

  // Conjunto de SKUs que tiveram faturamento no período ativo (apenas itens pais consolidados)
  const skusWithSalesSet = useMemo(() => {
    const set = new Set<string>();
    if (viewPeriod === 'all') {
      salesBySku.forEach((_, sku) => {
        const clean = sku.trim();
        if (clean) set.add(clean);
      });
    } else {
      sales.forEach(s => {
        const rawSku = (s.sku || '').trim();
        if (!rawSku) return;
        const skuUpper = rawSku.toUpperCase();
        const childRel = correlationMaps.childToParent.get(skuUpper);
        const effectiveParentCode = childRel ? childRel.parentCode : rawSku;
        const canonicalProd = products.find(p => p.code.trim().toUpperCase() === effectiveParentCode.toUpperCase());
        const targetSku = canonicalProd ? canonicalProd.code : effectiveParentCode;

        const key = `${s.month}/${s.year}`;
        if (last12MonthKeys.has(key) && Number(s.quantity) > 0 && targetSku) {
          set.add(targetSku);
        }
      });
    }
    return set;
  }, [salesBySku, viewPeriod, last12MonthKeys, sales, correlationMaps, products]);

  // SKUs presentes na tabela de Saldo de Estoque que NÃO tiveram faturamento no período
  // Apenas itens pais consolidados
  const stockOnlySkusSet = useMemo(() => {
    const set = new Set<string>();
    const salesLower = new Set(Array.from(skusWithSalesSet).map((s: string) => s.toLowerCase()));

    stock.forEach(item => {
      const itemGroup = getWarehouseGroup(item.warehouse);
      if (itemGroup === 'Inativo') return;
      if (stockGroupFilter !== 'all' && itemGroup.toLowerCase() !== stockGroupFilter.toLowerCase()) {
        return;
      }

      const rawSku = (item.productCode || item.codigo || '').trim();
      if (!rawSku) return;
      const skuUpper = rawSku.toUpperCase();

      const childRel = correlationMaps.childToParent.get(skuUpper);
      const effectiveParentCode = childRel ? childRel.parentCode : rawSku;
      const canonicalProd = products.find(p => p.code.trim().toUpperCase() === effectiveParentCode.toUpperCase());
      const targetSku = canonicalProd ? canonicalProd.code : effectiveParentCode;

      if (targetSku && !salesLower.has(targetSku.toLowerCase())) {
        set.add(targetSku);
      }
    });

    return set;
  }, [stock, skusWithSalesSet, stockGroupFilter, correlationMaps, products, getWarehouseGroup]);

  // Lista de todos os SKUs consolidados (Vendas + Saldo de Estoque automático)
  const allSkus = useMemo(() => {
    const combined = new Set<string>(skusWithSalesSet);
    if (includeStockWithoutSales) {
      stockOnlySkusSet.forEach(sku => combined.add(sku));
    }
    return Array.from(combined).sort((a: string, b: string) => a.localeCompare(b));
  }, [skusWithSalesSet, stockOnlySkusSet, includeStockWithoutSales]);

  // Filtered SKUs based on search (pesquisa por código do pai, código de item filho correlacionado ou nome)
  const filteredSkus = useMemo(() => {
    if (!searchTerm.trim()) return allSkus;
    const term = searchTerm.trim().toLowerCase();

    return allSkus.filter((sku: string) => {
      const skuLower = sku.toLowerCase();
      if (skuLower.includes(term)) return true;

      // Verifica se a busca corresponde a algum item filho correlacionado
      const children = correlationMaps.parentToChildren.get(sku.trim().toUpperCase()) || [];
      if (children.some(c => 
        c.code.toLowerCase().includes(term) || 
        (c.description && c.description.toLowerCase().includes(term))
      )) {
        return true;
      }

      const matchedProd = products.find(p => 
        p.code.toLowerCase() === skuLower ||
        p.codigo?.toLowerCase() === skuLower ||
        (p.pr_cod !== undefined && String(p.pr_cod).toLowerCase() === skuLower)
      );
      if (matchedProd && matchedProd.name.toLowerCase().includes(term)) return true;

      const matchedStock = stock.find(stk => (stk.productCode || stk.codigo || '').toLowerCase() === skuLower);
      if (matchedStock && matchedStock.productName?.toLowerCase().includes(term)) return true;

      return false;
    }).sort((a: string, b: string) => a.localeCompare(b));
  }, [allSkus, searchTerm, products, stock, correlationMaps]);

  // Calculate totals per SKU
  const skuTotals = useMemo(() => {
    const totals: { 
      [sku: string]: { 
        last12: number; 
        grandTotal: number; 
        monthsCount12: number; 
        monthsCountAll: number;
        projectedPace: number;
        proj30: number;
        proj60: number;
        proj90: number;
        proj120: number;
      } 
    } = {};
    const skusToProcess = Array.from(new Set([...allSkus, ...filteredSkus]));
    skusToProcess.forEach((sku: string) => {
      const monthData = salesBySku.get(sku) || {};
      let sum12 = 0;
      let sumGrand = 0;
      let monthsCount12 = 0;
      let monthsCountAll = 0;

      // 12 meses fechados
      target12ClosedMonths.forEach(col => {
        const numQty = Number(monthData[col.key]) || 0;
        if (numQty > 0) {
          sum12 += numQty;
          monthsCount12++;
        }
      });

      // Todos os meses
      Object.entries(monthData).forEach(([_, qty]) => {
        const numQty = Number(qty) || 0;
        if (numQty > 0) {
          sumGrand += numQty;
          monthsCountAll++;
        }
      });

      // Ritmo projetado por mês (Fórmula ponderada):
      // 0,5 * soma dos Últimos 3 meses / 3
      // + 0,3 * soma dos 3 meses subsequentes / 3
      // + 0,2 * soma dos últimos 6 meses / 6
      const sumLast3 = paceMonthGroups.last3.reduce((acc, k) => acc + (Number(monthData[k]) || 0), 0);
      const sumMid3 = paceMonthGroups.mid3.reduce((acc, k) => acc + (Number(monthData[k]) || 0), 0);
      const sumPrior6 = paceMonthGroups.prior6.reduce((acc, k) => acc + (Number(monthData[k]) || 0), 0);

      const part1 = paceMonthGroups.last3.length > 0 ? (0.5 * (sumLast3 / paceMonthGroups.last3.length)) : 0;
      const part2 = paceMonthGroups.mid3.length > 0 ? (0.3 * (sumMid3 / paceMonthGroups.mid3.length)) : 0;
      const part3 = paceMonthGroups.prior6.length > 0 ? (0.2 * (sumPrior6 / paceMonthGroups.prior6.length)) : 0;
      const rawProjectedPace = part1 + part2 + part3;
      // Arredonda SEMPRE para cima para peças inteiras
      const projectedPace = Math.ceil(rawProjectedPace);

      // Projeções futuras (30d, 60d, 90d, 120d)
      const proj30 = projectedPace * 1;
      const proj60 = projectedPace * 2;
      const proj90 = projectedPace * 3;
      const proj120 = projectedPace * 4;

      totals[sku] = { 
        last12: sum12, 
        grandTotal: sumGrand, 
        monthsCount12, 
        monthsCountAll, 
        projectedPace,
        proj30,
        proj60,
        proj90,
        proj120
      };
    });
    return totals;
  }, [allSkus, filteredSkus, salesBySku, target12ClosedMonths, paceMonthGroups]);

  // Lista de grupos de estoque disponíveis
  const activeStockGroups = useMemo(() => {
    const groups = new Set<string>();
    warehouses.forEach(w => {
      if (w.isActive && w.groupName?.trim()) {
        groups.add(w.groupName.trim());
      }
    });
    stock.forEach(item => {
      const grp = getWarehouseGroup(item.warehouse);
      if (grp && grp !== 'Inativo') {
        groups.add(grp);
      }
    });
    if (groups.size === 0) {
      groups.add("São Paulo");
      groups.add("Miami");
    }
    return Array.from(groups).sort();
  }, [warehouses, stock, getWarehouseGroup]);

  // Mapa com o saldo físico e valor financeiro de estoque por SKU considerando o filtro de grupo ativo
  // Consolida o estoque de itens filhos no item pai correspondente com a conversão de multiplicador
  const skuStockData = useMemo(() => {
    const map: { [sku: string]: { quantity: number; value: number } } = {};

    stock.forEach(item => {
      const itemGroup = getWarehouseGroup(item.warehouse);
      if (itemGroup === 'Inativo') return;

      // Se filtro de grupo específico ativo, ignora itens de outros grupos
      if (stockGroupFilter !== 'all' && itemGroup.toLowerCase() !== stockGroupFilter.toLowerCase()) {
        return;
      }

      const rawSku = (item.productCode || item.codigo || '').trim();
      if (!rawSku) return;
      const skuUpper = rawSku.toUpperCase();

      // Verifica se é item correlacionado filho
      const childRel = correlationMaps.childToParent.get(skuUpper);
      const effectiveParentCode = childRel ? childRel.parentCode : rawSku;
      const multiplier = childRel ? childRel.multiplier : 1;

      // Identifica o código canônico do produto pai
      const canonicalProd = products.find(p => p.code.trim().toUpperCase() === effectiveParentCode.toUpperCase());
      const targetSku = canonicalProd ? canonicalProd.code : effectiveParentCode;

      // Identifica preço unitário para cálculo do valor do estoque do item atual
      const prod = products.find(p => 
        p.code.trim().toLowerCase() === rawSku.toLowerCase() ||
        p.codigo?.trim().toLowerCase() === rawSku.toLowerCase() ||
        (p.pr_cod !== undefined && String(p.pr_cod).toLowerCase() === rawSku.toLowerCase())
      );
      const unitPrice = (item.pr_preco !== undefined && item.pr_preco > 0)
        ? item.pr_preco
        : ((prod as any)?.pr_preco !== undefined && (prod as any)?.pr_preco > 0)
          ? (prod as any)?.pr_preco
          : (item.vlrest !== undefined && item.vlrest > 0)
            ? item.vlrest
            : 0;

      let itemTotalVal = item.quantity * unitPrice;
      if (itemTotalVal === 0 && item.vlrest !== undefined && item.vlrest > 0) {
        itemTotalVal = item.vlrest;
      }

      // Quantidade convertida com o multiplicador
      const convertedQty = item.quantity * multiplier;

      if (!map[targetSku]) {
        map[targetSku] = { quantity: 0, value: 0 };
      }

      map[targetSku].quantity += convertedQty;
      map[targetSku].value += itemTotalVal;
    });

    return map;
  }, [stock, stockGroupFilter, products, correlationMaps, getWarehouseGroup]);

  // Busca do saldo e valor de estoque por SKU com suporte insensível a maiúsculas/minúsculas
  const getSkuStock = React.useCallback((sku: string) => {
    if (!sku) return { quantity: 0, value: 0 };
    const direct = skuStockData[sku];
    if (direct) return direct;
    const matchKey = Object.keys(skuStockData).find(k => k.toLowerCase() === sku.toLowerCase());
    return matchKey ? skuStockData[matchKey] : { quantity: 0, value: 0 };
  }, [skuStockData]);

  // Cálculo da Cobertura (dias):
  // Verifica se "Ritmo proj./mês" é igual a zero:
  // - Se for, verifica se Estoque > 0: se for, imputa 9999, senão 0.
  // - Se não for zero, divide (Estoque / Ritmo proj./mês) * 30.
  const getSkuCoverage = React.useCallback((sku: string): number => {
    const pace = skuTotals[sku]?.projectedPace || 0;
    const stockQty = getSkuStock(sku).quantity;

    if (pace === 0) {
      return stockQty > 0 ? 9999 : 0;
    }
    return Math.round((stockQty / pace) * 30);
  }, [skuTotals, getSkuStock]);

  // Cálculo da Classe giro (baseado na coluna "Meses c/ Venda"):
  // 0 = "Sem Saída"
  // 1 até 3 = "Baixa Saída"
  // 4 até 7 = "Média Saída"
  // 8 ou mais = "Quente"
  const getSkuTurnoverClass = React.useCallback((sku: string): 'Sem Saída' | 'Baixa Saída' | 'Média Saída' | 'Quente' => {
    const monthsWithSales = skuTotals[sku]?.monthsCount12 || 0;

    if (monthsWithSales >= 8) {
      return 'Quente';
    }
    if (monthsWithSales >= 4) {
      return 'Média Saída';
    }
    if (monthsWithSales >= 1) {
      return 'Baixa Saída';
    }
    return 'Sem Saída';
  }, [skuTotals]);

  // Categoria de Cobertura de um SKU para fins de filtro e classificação
  const getSkuCoverageCategory = React.useCallback((sku: string): string => {
    const cov = getSkuCoverage(sku);
    if (cov === 0) return 'zero';
    if (cov >= 1 && cov <= 30) return 'critical';
    if (cov >= 31 && cov <= 60) return 'warning';
    if (cov >= 61 && cov <= 120) return 'healthy';
    if (cov >= 121 && cov <= 365) return 'excess';
    if (cov === 9999) return 'no_sales';
    return 'very_high'; // > 365
  }, [getSkuCoverage]);

  // Indicadores se há filtros ativos nas colunas
  const isTurnoverFiltered = turnoverClassFilter.length > 0;
  const isCoverageFiltered = coverageFilter.length > 0 || coverageCustomMin.trim() !== '' || coverageCustomMax.trim() !== '';

  // Contagem de SKUs por Classe de Giro (baseado nos SKUs filtrados pela busca geral)
  const turnoverClassCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Quente': 0,
      'Média Saída': 0,
      'Baixa Saída': 0,
      'Sem Saída': 0
    };
    filteredSkus.forEach(sku => {
      const cls = getSkuTurnoverClass(sku);
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return counts;
  }, [filteredSkus, getSkuTurnoverClass]);

  // Contagem de SKUs por categoria de cobertura (para badges do filtro de múltipla escolha)
  const coverageCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      zero: 0,
      critical: 0,
      warning: 0,
      healthy: 0,
      excess: 0,
      very_high: 0,
      no_sales: 0
    };
    filteredSkus.forEach(sku => {
      const cat = getSkuCoverageCategory(sku);
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [filteredSkus, getSkuCoverageCategory]);

  // Lista final de SKUs após aplicação dos filtros de coluna (Classe de Giro e Cobertura)
  const displaySkus = useMemo(() => {
    return filteredSkus.filter(sku => {
      // 1. Filtro de Classe de Giro (múltipla escolha)
      if (turnoverClassFilter.length > 0) {
        const cls = getSkuTurnoverClass(sku);
        if (!turnoverClassFilter.includes(cls)) {
          return false;
        }
      }

      // 2. Filtro de Cobertura (múltipla escolha)
      if (coverageFilter.length > 0) {
        const cat = getSkuCoverageCategory(sku);
        if (!coverageFilter.includes(cat)) {
          return false;
        }
      }

      // Filtro adicional de faixa personalizada (dias mín / máx)
      if (coverageCustomMin.trim() !== '' || coverageCustomMax.trim() !== '') {
        const cov = getSkuCoverage(sku);
        const minVal = coverageCustomMin.trim() !== '' ? Number(coverageCustomMin) : null;
        const maxVal = coverageCustomMax.trim() !== '' ? Number(coverageCustomMax) : null;
        if (minVal !== null && !isNaN(minVal) && cov < minVal) return false;
        if (maxVal !== null && !isNaN(maxVal) && cov > maxVal) return false;
      }

      return true;
    });
  }, [filteredSkus, turnoverClassFilter, coverageFilter, coverageCustomMin, coverageCustomMax, getSkuTurnoverClass, getSkuCoverageCategory, getSkuCoverage]);

  // Column totals
  const columnTotals = useMemo(() => {
    const colSums: { [monthKey: string]: number } = {};
    monthColumns.forEach(col => {
      let sum = 0;
      displaySkus.forEach(sku => {
        const monthData = salesBySku.get(sku) || {};
        sum += monthData[col.key] || 0;
      });
      colSums[col.key] = sum;
    });

    let sumPeriodTotal = 0;
    let sumPaceTotal = 0;
    let sumProj30Total = 0;
    let sumProj60Total = 0;
    let sumProj90Total = 0;
    let sumProj120Total = 0;
    let sumStockQty = 0;
    let sumStockValue = 0;

    displaySkus.forEach(sku => {
      const val = viewPeriod === 'last12closed'
        ? (skuTotals[sku]?.last12 || 0)
        : (skuTotals[sku]?.grandTotal || 0);
      sumPeriodTotal += val;
      sumPaceTotal += (skuTotals[sku]?.projectedPace || 0);
      sumProj30Total += (skuTotals[sku]?.proj30 || 0);
      sumProj60Total += (skuTotals[sku]?.proj60 || 0);
      sumProj90Total += (skuTotals[sku]?.proj90 || 0);
      sumProj120Total += (skuTotals[sku]?.proj120 || 0);

      const stk = getSkuStock(sku);
      sumStockQty += stk.quantity;
      sumStockValue += stk.value;
    });

    const sumCoverage = sumPaceTotal === 0
      ? (sumStockQty > 0 ? 9999 : 0)
      : Math.round((sumStockQty / sumPaceTotal) * 30);

    return { 
      colSums, 
      sumPeriodTotal, 
      sumPaceTotal,
      sumProj30Total,
      sumProj60Total,
      sumProj90Total,
      sumProj120Total,
      sumStockQty,
      sumStockValue,
      sumCoverage
    };
  }, [monthColumns, displaySkus, salesBySku, skuTotals, viewPeriod, getSkuStock]);

  // Alternador de ordenação de colunas
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'sku' ? 'asc' : 'desc');
    }
  };

  // Lista ordenada de SKUs
  const sortedFilteredSkus = useMemo(() => {
    return [...displaySkus].sort((a, b) => {
      let comp = 0;
      if (sortField === 'sku') {
        comp = a.localeCompare(b);
      } else if (sortField === 'total') {
        const valA = viewPeriod === 'last12closed' ? (skuTotals[a]?.last12 || 0) : (skuTotals[a]?.grandTotal || 0);
        const valB = viewPeriod === 'last12closed' ? (skuTotals[b]?.last12 || 0) : (skuTotals[b]?.grandTotal || 0);
        comp = valA - valB;
      } else if (sortField === 'monthsCount') {
        const valA = viewPeriod === 'last12closed' ? (skuTotals[a]?.monthsCount12 || 0) : (skuTotals[a]?.monthsCountAll || 0);
        const valB = viewPeriod === 'last12closed' ? (skuTotals[b]?.monthsCount12 || 0) : (skuTotals[b]?.monthsCountAll || 0);
        comp = valA - valB;
      } else if (sortField === 'pace') {
        comp = (skuTotals[a]?.projectedPace || 0) - (skuTotals[b]?.projectedPace || 0);
      } else if (sortField === 'proj30') {
        comp = (skuTotals[a]?.proj30 || 0) - (skuTotals[b]?.proj30 || 0);
      } else if (sortField === 'proj60') {
        comp = (skuTotals[a]?.proj60 || 0) - (skuTotals[b]?.proj60 || 0);
      } else if (sortField === 'proj90') {
        comp = (skuTotals[a]?.proj90 || 0) - (skuTotals[b]?.proj90 || 0);
      } else if (sortField === 'proj120') {
        comp = (skuTotals[a]?.proj120 || 0) - (skuTotals[b]?.proj120 || 0);
      } else if (sortField === 'stock') {
        comp = getSkuStock(a).quantity - getSkuStock(b).quantity;
      } else if (sortField === 'stockValue') {
        comp = getSkuStock(a).value - getSkuStock(b).value;
      } else if (sortField === 'coverage') {
        comp = getSkuCoverage(a) - getSkuCoverage(b);
      } else if (sortField === 'turnoverClass') {
        const TURNOVER_RANK: Record<string, number> = {
          'Quente': 4,
          'Média Saída': 3,
          'Baixa Saída': 2,
          'Sem Saída': 1,
        };
        const rankA = TURNOVER_RANK[getSkuTurnoverClass(a)] || 0;
        const rankB = TURNOVER_RANK[getSkuTurnoverClass(b)] || 0;
        comp = rankA - rankB;
      } else if (sortField.startsWith('month_')) {
        const monthKey = sortField.replace('month_', '');
        const qtyA = salesBySku.get(a)?.[monthKey] || 0;
        const qtyB = salesBySku.get(b)?.[monthKey] || 0;
        comp = qtyA - qtyB;
      } else {
        comp = a.localeCompare(b);
      }
      return sortDirection === 'asc' ? comp : -comp;
    });
  }, [displaySkus, sortField, sortDirection, skuTotals, viewPeriod, getSkuStock, getSkuCoverage, getSkuTurnoverClass, salesBySku]);

  // 1. Atualizar - Webhook API execution
  const handleUpdateFromWebhook = async () => {
    setIsUpdating(true);
    setUpdateStatus('idle');
    setUpdateMessage('');
    const logsList: string[] = [];

    const addLog = (msg: string) => {
      const timestamp = new Date().toLocaleTimeString('pt-BR');
      const logEntry = `[${timestamp}] ${msg}`;
      logsList.push(logEntry);
      console.log(`[SalesTable Webhook] ${logEntry}`);
    };

    addLog('O usuário clicou no botão "Atualizar" na tela de Vendas.');

    // Find active webhook for 'sales' or 'vendas'
    let webhook = webhooks.find(wh => wh.isActive && wh.targetScreen === 'sales');
    if (!webhook) {
      webhook = webhooks.find(wh => wh.isActive && (
        wh.tableName.trim().toLowerCase() === 'sales' ||
        wh.tableName.trim().toLowerCase() === 'vendas' ||
        wh.tableName.trim().toLowerCase() === 'salerecord'
      ));
    }

    if (!webhook) {
      addLog('ERRO: Nenhum webhook ativo associado à tela de Vendas ou à tabela Vendas/Sales.');
      setUpdateStatus('error');
      setUpdateMessage('Nenhum webhook ativo configurado para Vendas. Configure um webhook com esta tela em "Configurações de Webhook".');
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

      addLog(`Enviando requisição POST para o Webhook através do servidor proxy local...`);
      addLog(`Parâmetros enviados (POST Body): ${JSON.stringify(requestBody)}`);

      const data = await executeProxyWebhook({
        url: webhook.url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${webhook.secretKey || ''}`,
          "X-API-Key": `${webhook.secretKey || ''}`
        },
        body: requestBody
      });

      if (!data.ok) {
        throw new Error(`Erro na resposta do servidor do Webhook (Status: ${data.status} ${data.statusText || ''}).`);
      }

      addLog(`Chamada do Webhook concluída com sucesso (Status: ${data.status}, Duração: ${data.duration}ms).`);

      let parsedPayload: any;
      try {
        parsedPayload = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
      } catch (jsonErr) {
        throw new Error(`A API respondeu mas o corpo retornado não é um JSON válido: ${data.body?.substring(0, 100)}`);
      }

      // Extract array of records
      let rawItems: any[] = [];
      if (Array.isArray(parsedPayload)) {
        rawItems = parsedPayload;
      } else if (parsedPayload && typeof parsedPayload === 'object') {
        const potentialKeys = ['vendas', 'sales', 'data', 'dados', 'items', 'registros', 'resultado', 'rows'];
        for (const key of potentialKeys) {
          if (Array.isArray(parsedPayload[key])) {
            rawItems = parsedPayload[key];
            addLog(`Lista de itens identificada na chave: "${key}" com ${rawItems.length} registros.`);
            break;
          }
        }
        if (rawItems.length === 0) {
          const values = Object.values(parsedPayload);
          const firstArray = values.find(v => Array.isArray(v));
          if (firstArray) {
            rawItems = firstArray as any[];
            addLog(`Lista de itens identificada no primeiro array encontrado com ${rawItems.length} registros.`);
          }
        }
      }

      if (rawItems.length === 0) {
        addLog('Aviso: Nenhum registro de venda retornado pelo webhook.');
        setUpdateStatus('success');
        setUpdateMessage('Webhook executado, mas nenhum registro de venda foi retornado.');
        setIsUpdating(false);
        setExecutionLogs(logsList);
        setIsLogModalOpen(true);
        return;
      }

      addLog(`Total de registros brutos recebidos: ${rawItems.length}. Iniciando mapeamento e processamento...`);

      // Find field mapping
      const mapping = fieldMappings.find(m => m.webhookId === webhook!.id) || 
                      fieldMappings.find(m => m.systemTable === 'SaleRecord' || m.systemTable === 'Vendas' || m.systemTable === 'sales');
      const mapConfig = mapping?.mappings || {};

      if (mapping) {
        addLog(`Mapeamento De/Para localizado (ID: ${mapping.id}, Tabela: ${mapping.systemTable}):`);
        if (mapConfig.sku) addLog(`   • SKU: "${mapConfig.sku}"`);
        if (mapConfig.month) addLog(`   • Mês: "${mapConfig.month}"`);
        if (mapConfig.year) addLog(`   • Ano: "${mapConfig.year}"`);
        if (mapConfig.quantity) addLog(`   • Quantidade: "${mapConfig.quantity}"`);
      } else {
        addLog('Nenhum mapeamento De/Para manual específico encontrado. Aplicando detecção automática de campos (modelo/sku, mes, 2ano/ano, qtdest/quantidade).');
      }

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

      const consolidatedSales = new Map<string, SaleRecord>();
      let rawValidCount = 0;

      rawItems.forEach((raw) => {
        // Resolve SKU (prioritizes configured mapping, then modelo, sku, productCode, codigo, pr_cod)
        const rawSku = resolveWebhookField(raw, mapConfig.sku, ['modelo', 'sku', 'productCode', 'codigo', 'cod', 'cd_produto', 'pr_cod']);
        const sku = rawSku ? String(rawSku).trim() : '';
        if (!sku) return;

        // Check if item is wide format (has month columns like "8/2025": 12 or "08/2025": 12)
        let foundWideColumns = false;
        Object.keys(raw).forEach(k => {
          const match = k.match(/^(\d{1,2})[\/\-](\d{4})$/);
          if (match) {
            foundWideColumns = true;
            const m = parseInt(match[1], 10);
            const y = parseInt(match[2], 10);
            const qty = parseFloat(String(raw[k]).replace(',', '.')) || 0;
            if (qty > 0) {
              rawValidCount++;
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

        // Otherwise, resolve granular fields (month, year, quantity)
        let month = 0;
        const rawMonth = resolveWebhookField(raw, mapConfig.month, ['mes', 'month', 'nu_mes', 'MES']);
        if (rawMonth !== undefined && rawMonth !== null && String(rawMonth).trim() !== '') {
          month = parseInt(String(rawMonth).trim(), 10) || 0;
        }

        let year = 0;
        const rawYear = resolveWebhookField(raw, mapConfig.year, ['2ano', 'ano', 'year', 'nu_ano', 'ANO']);
        if (rawYear !== undefined && rawYear !== null && String(rawYear).trim() !== '') {
          const parsedYear = parseInt(String(rawYear).trim(), 10) || 0;
          if (parsedYear >= 1900) {
            year = parsedYear;
          }
        }
        
        // Try resolving from date field if month or year is still missing or invalid
        if (!month || !year || month < 1 || month > 12 || year < 1900) {
          const rawDate = resolveWebhookField(raw, mapConfig.date, ['data', 'dataref', 'date', 'periodo', 'DATA']);
          if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
            const dateStr = String(rawDate).trim();
            // Formato 1: YYYYMMDD (ex: "20251016" ou "20251031")
            if (/^\d{8}$/.test(dateStr)) {
              const y = parseInt(dateStr.substring(0, 4), 10);
              const m = parseInt(dateStr.substring(4, 6), 10);
              if (y >= 1900 && m >= 1 && m <= 12) {
                if (!year) year = y;
                if (!month) month = m;
              }
            } else if (dateStr.includes('-')) {
              // Formato 2: YYYY-MM ou YYYY-MM-DD
              const parts = dateStr.split('-');
              if (parts.length >= 2) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                if (y >= 1900 && m >= 1 && m <= 12) {
                  if (!year) year = y;
                  if (!month) month = m;
                }
              }
            } else if (dateStr.includes('/')) {
              // Formato 3: DD/MM/YYYY ou MM/YYYY
              const parts = dateStr.split('/');
              if (parts.length === 2) {
                const m = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                if (y >= 1900 && m >= 1 && m <= 12) {
                  if (!year) year = y;
                  if (!month) month = m;
                }
              } else if (parts.length === 3) {
                const m = parseInt(parts[1], 10);
                const y = parseInt(parts[2], 10);
                if (y >= 1900 && m >= 1 && m <= 12) {
                  if (!year) year = y;
                  if (!month) month = m;
                }
              }
            }
          }
        }

        const rawQty = resolveWebhookField(raw, mapConfig.quantity, ['qtdest', 'qtd', 'quantidade', 'quant', 'quantity', 'total', 'qtd_venda', 'qtde']);
        let quantity = 0;
        if (rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '') {
          quantity = typeof rawQty === 'number' ? rawQty : (parseFloat(String(rawQty).replace(',', '.')) || 0);
        }

        if (sku && month >= 1 && month <= 12 && year >= 1900 && quantity > 0) {
          rawValidCount++;
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

      addLog(`Processamento concluído: ${rawValidCount} registros válidos processados, consolidados em ${importedSales.length} registros mensais por SKU.`);

      // Overwrite current sales with imported sales
      onImportSales(importedSales, true);
      addLog(`Tabela de Vendas atualizada com sucesso no banco de dados local com ${importedSales.length} registros.`);

      setUpdateStatus('success');
      setUpdateMessage(`Sucesso! ${importedSales.length} registros consolidados de vendas por SKU e mês foram atualizados.`);
    } catch (err: any) {
      addLog(`ERRO durante a execução da integração: ${err.message || 'Falha desconhecida'}`);
      setUpdateStatus('error');
      setUpdateMessage(`Falha ao atualizar vendas: ${err.message || 'Erro inesperado'}`);
    } finally {
      setIsUpdating(false);
      setExecutionLogs(logsList);
      setIsLogModalOpen(true);
    }
  };

  // 2. Excluir - Confirm & Clear all sales
  const handleConfirmClearAll = () => {
    onClearAllSales();
    setIsClearConfirmOpen(false);
  };

  // 3. Lançar - Open modal & submit
  const handleOpenAddModal = (skuPrefill = '') => {
    setEditingSale(null);
    setFormData({
      sku: skuPrefill,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      quantity: 1,
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditSale = (sale: SaleRecord) => {
    setEditingSale(sale);
    setFormData({
      sku: sale.sku,
      month: sale.month,
      year: sale.year,
      quantity: sale.quantity,
      notes: sale.notes || ''
    });
    setIsAddModalOpen(true);
  };

  const handleSubmitAddOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sku.trim()) return;

    if (editingSale) {
      onEditSale({
        ...editingSale,
        sku: formData.sku.trim(),
        month: Number(formData.month),
        year: Number(formData.year),
        quantity: Number(formData.quantity),
        notes: formData.notes
      });
    } else {
      onAddSale({
        sku: formData.sku.trim(),
        month: Number(formData.month),
        year: Number(formData.year),
        quantity: Number(formData.quantity),
        notes: formData.notes
      });
    }

    setIsAddModalOpen(false);
  };

  // Export to Excel with full screen styles and formatting
  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      await exportSalesToExcel({
        skus: sortedFilteredSkus,
        monthColumns,
        salesBySku,
        skuTotals,
        getSkuStock,
        getSkuCoverage,
        getSkuTurnoverClass,
        products,
        stock,
        viewPeriod,
        stockGroupFilter,
        columnTotals
      });
    } catch (err: any) {
      console.error('Erro ao exportar Excel formatado:', err);
    } finally {
      setIsExportingExcel(false);
      setIsExportMenuOpen(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const totalColHeader = viewPeriod === 'last12closed' ? 'Total nos Ultimos 12 Meses' : 'Total Geral';
    const monthsColHeader = viewPeriod === 'last12closed' ? 'Meses com Venda (de 12)' : 'Meses com Venda';
    const stockColHeader = stockGroupFilter === 'all' ? 'Estoque (Todos os Grupos)' : `Estoque (${stockGroupFilter})`;
    const stockValColHeader = stockGroupFilter === 'all' ? 'Valor estoque (Todos os Grupos)' : `Valor estoque (${stockGroupFilter})`;

    const headers = [
      'CODIGO (SKU)', 
      ...monthColumns.map(c => c.label), 
      totalColHeader, 
      monthsColHeader, 
      'Ritmo proj./mes',
      'Proj. 30d',
      'Proj. 60d',
      'Proj. 90d',
      'Proj. 120d',
      stockColHeader,
      stockValColHeader,
      'Cobertura (dias)',
      'Classe giro'
    ];
    const rows = sortedFilteredSkus.map(sku => {
      const monthData = salesBySku.get(sku) || {};
      const cols = monthColumns.map(c => (monthData[c.key] !== undefined && monthData[c.key] > 0 ? monthData[c.key] : ''));
      const rowPeriodTotal = viewPeriod === 'last12closed'
        ? (skuTotals[sku]?.last12 || 0)
        : (skuTotals[sku]?.grandTotal || 0);
      const rowMonthsCount = viewPeriod === 'last12closed'
        ? (skuTotals[sku]?.monthsCount12 || 0)
        : (skuTotals[sku]?.monthsCountAll || 0);
      const paceVal = skuTotals[sku]?.projectedPace || 0;
      const rowPace = paceVal.toLocaleString('pt-BR');
      const rowProj30 = (skuTotals[sku]?.proj30 || 0).toLocaleString('pt-BR');
      const rowProj60 = (skuTotals[sku]?.proj60 || 0).toLocaleString('pt-BR');
      const rowProj90 = (skuTotals[sku]?.proj90 || 0).toLocaleString('pt-BR');
      const rowProj120 = (skuTotals[sku]?.proj120 || 0).toLocaleString('pt-BR');
      const stk = getSkuStock(sku);
      const rowStock = stk.quantity.toLocaleString('pt-BR');
      const rowStockVal = `$ ${stk.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const cov = getSkuCoverage(sku);
      const rowCoverage = cov === 9999 ? '9999' : cov.toLocaleString('pt-BR');
      const turnoverClass = getSkuTurnoverClass(sku);

      return [sku, ...cols, rowPeriodTotal, rowMonthsCount, rowPace, rowProj30, rowProj60, rowProj90, rowProj120, rowStock, rowStockVal, rowCoverage, turnoverClass];
    });

    // Add total row
    const totalCoverage = columnTotals.sumCoverage === 9999 ? '9999' : columnTotals.sumCoverage.toLocaleString('pt-BR');
    const totalRow = [
      'TOTAL GERAL',
      ...monthColumns.map(c => columnTotals.colSums[c.key] || 0),
      columnTotals.sumPeriodTotal,
      '-',
      columnTotals.sumPaceTotal.toLocaleString('pt-BR'),
      columnTotals.sumProj30Total.toLocaleString('pt-BR'),
      columnTotals.sumProj60Total.toLocaleString('pt-BR'),
      columnTotals.sumProj90Total.toLocaleString('pt-BR'),
      columnTotals.sumProj120Total.toLocaleString('pt-BR'),
      columnTotals.sumStockQty.toLocaleString('pt-BR'),
      `$ ${columnTotals.sumStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalCoverage,
      '-'
    ];
    rows.push(totalRow);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Vendas_Mensal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar Card */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Title and stats */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl border border-amber-200 shadow-2xs">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">Analise Consumo</h1>
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-2 py-0.5 rounded-full">
                  {displaySkus.length < allSkus.length ? `${displaySkus.length} de ${allSkus.length} SKUs` : `${allSkus.length} SKUs`}
                </span>
                {includeStockWithoutSales && stockOnlySkusSet.size > 0 && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    ({skusWithSalesSet.size} com faturamento + {stockOnlySkusSet.size} em estoque)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento mensal de vendas por código de produto (SKU) e saldo de estoque para planejamento.
              </p>
            </div>
          </div>

          {/* Action Buttons: Atualizar, Excluir, Lançar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1 - Botão "Atualizar" */}
            <button
              id="btn-update-sales"
              onClick={handleUpdateFromWebhook}
              disabled={isUpdating}
              className={`flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer border ${
                isUpdating 
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 hover:shadow-emerald-500/10'
              }`}
              title="Executar API cadastrada para atualizar as vendas"
            >
              <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            {/* 2 - Botão "Excluir" */}
            {canManage && (
              <button
                id="btn-clear-sales"
                onClick={() => setIsClearConfirmOpen(true)}
                disabled={sales.length === 0}
                className="flex items-center justify-center gap-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 px-3.5 py-2 text-sm font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Apagar todos os registros de vendas"
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
                <span>Excluir</span>
              </button>
            )}

            {/* 3 - Botão "Lançar" */}
            {canManage && (
              <button
                id="btn-add-sale"
                onClick={() => handleOpenAddModal()}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
                title="Incluir lançamento de venda manualmente"
              >
                <Plus className="h-4 w-4" />
                <span>Lançar</span>
              </button>
            )}

            {/* Export button group: Excel (.xlsx formatado) + Dropdown opções */}
            <div className="relative inline-flex items-stretch shadow-2xs rounded-lg" ref={exportMenuRef}>
              <button
                id="btn-export-sales-csv"
                onClick={handleExportExcel}
                disabled={allSkus.length === 0 || isExportingExcel}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-3.5 py-2 text-sm rounded-l-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar planilha Excel (.xlsx) com todas as formatações, cores e badges da tela"
              >
                {isExportingExcel ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
                )}
                <span>{isExportingExcel ? 'Gerando...' : 'Exportar'}</span>
              </button>

              <button
                type="button"
                id="btn-export-sales-menu"
                onClick={() => setIsExportMenuOpen(prev => !prev)}
                disabled={allSkus.length === 0 || isExportingExcel}
                className="flex items-center justify-center px-2 bg-emerald-700 hover:bg-emerald-800 text-emerald-100 hover:text-white border-l border-emerald-500 rounded-r-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mais opções de exportação (Excel ou CSV)"
              >
                <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Menu de opções de formato */}
              {isExportMenuOpen && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 text-left text-slate-800 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Formato de Exportação
                  </div>

                  {/* Opção 1: Excel com estilos da tela */}
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={isExportingExcel}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-emerald-50/70 transition-colors cursor-pointer group border-b border-slate-50"
                  >
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5 group-hover:bg-emerald-200">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-950 flex items-center gap-1.5">
                        <span>Excel (.xlsx)</span>
                        <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-300">Formatado</span>
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                        Planilha completa com cores, células destacadas, badges de ruptura/cobertura e colunas fixadas
                      </div>
                    </div>
                  </button>

                  {/* Opção 2: CSV texto simples */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      handleExportCSV();
                    }}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg shrink-0 mt-0.5 group-hover:bg-slate-200">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-slate-900">
                        CSV (.csv)
                      </div>
                      <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                        Arquivo de dados puro delimitado por ponto e vírgula, sem formatação visual
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar and Period Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por código (SKU) ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* View period switch buttons */}
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                id="btn-view-last12"
                onClick={() => setViewPeriod('last12closed')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  viewPeriod === 'last12closed'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Exibir apenas os 12 meses anteriores fechados, desconsiderando o mês corrente"
              >
                12 Meses Anteriores
              </button>
              <button
                type="button"
                id="btn-view-all"
                onClick={() => setViewPeriod('all')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  viewPeriod === 'all'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Exibir todos os meses importados na base de dados"
              >
                Todos ({allSalesMonths.length})
              </button>
            </div>

            {/* Divisor vertical */}
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            {/* Fleg de Grupo de Estoque: Todos os Grupos vs Grupo Específico */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider px-1.5 hidden md:inline">
                Estoque:
              </span>
              <button
                type="button"
                id="btn-stock-group-all"
                onClick={() => setStockGroupFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  stockGroupFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Usar o saldo de estoque de todos os grupos"
              >
                Todos os Grupos
              </button>
              <button
                type="button"
                id="btn-stock-group-specific"
                onClick={() => {
                  if (stockGroupFilter === 'all') {
                    const targetGroup = specificStockGroup || activeStockGroups[0] || 'São Paulo';
                    setSpecificStockGroup(targetGroup);
                    setStockGroupFilter(targetGroup);
                  }
                }}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  stockGroupFilter !== 'all'
                    ? 'bg-white text-indigo-900 shadow-xs border border-indigo-200 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Filtrar estoque por um grupo específico"
              >
                Grupo Específico
              </button>

              {/* Se optar por específico, dropdown indicando qual */}
              {stockGroupFilter !== 'all' && (
                <select
                  id="select-stock-group"
                  value={stockGroupFilter}
                  onChange={(e) => {
                    setSpecificStockGroup(e.target.value);
                    setStockGroupFilter(e.target.value);
                  }}
                  className="bg-white border border-indigo-300 text-indigo-900 font-bold text-xs rounded-md px-2 py-1 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs ml-1"
                  title="Indique qual grupo de estoque considerar"
                >
                  {activeStockGroups.map(grp => (
                    <option key={grp} value={grp}>{grp}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Divisor vertical */}
            <div className="h-5 w-px bg-slate-200 hidden lg:block" />

            {/* Checkbox para inclusão automática de itens do estoque sem faturamento */}
            <label 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 cursor-pointer transition-colors select-none"
              title="Inclui automaticamente na grade os itens da tabela de Saldo de Estoque mesmo que não possuam faturamento"
            >
              <input
                type="checkbox"
                id="chk-include-stock-without-sales"
                checked={includeStockWithoutSales}
                onChange={(e) => setIncludeStockWithoutSales(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Incluir estoque sem faturamento</span>
              {stockOnlySkusSet.size > 0 && (
                <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                  +{stockOnlySkusSet.size}
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Linha de filtros de coluna ativos com botão para remoção rápida */}
        {(isTurnoverFiltered || isCoverageFiltered) && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 mt-3">
            <span className="text-xs font-semibold text-slate-500">Filtros de coluna ativos:</span>
            
            {/* Chip de Classe de Giro */}
            {isTurnoverFiltered && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                <span>Classe Giro: <strong className="text-amber-950">{turnoverClassFilter.join(', ')}</strong></span>
                <button
                  type="button"
                  onClick={() => setTurnoverClassFilter([])}
                  className="hover:bg-amber-200 rounded p-0.5 text-amber-800 transition-colors cursor-pointer"
                  title="Remover filtro de classe de giro"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Chip de Cobertura */}
            {isCoverageFiltered && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-300 shadow-2xs">
                <span>Cobertura: <strong className="text-blue-950">{
                  coverageFilter.length > 0
                    ? coverageFilter.map(k => {
                        const item = COVERAGE_CATEGORIES.find(c => c.id === k);
                        return item ? item.shortName : k;
                      }).join(', ')
                    : `${coverageCustomMin || '0'} a ${coverageCustomMax || '∞'} dias`
                }{coverageFilter.length > 0 && (coverageCustomMin || coverageCustomMax) ? ` (${coverageCustomMin || '0'}-${coverageCustomMax || '∞'}d)` : ''}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setCoverageFilter([]);
                    setCoverageCustomMin('');
                    setCoverageCustomMax('');
                  }}
                  className="hover:bg-blue-200 rounded p-0.5 text-blue-800 transition-colors cursor-pointer"
                  title="Remover filtro de cobertura"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setTurnoverClassFilter([]);
                setCoverageFilter([]);
                setCoverageCustomMin('');
                setCoverageCustomMax('');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline ml-1"
            >
              Limpar filtros de coluna
            </button>
          </div>
        )}
      </div>

      {/* Modern Analytical Data Grid */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto max-h-[72vh]">
          <table className="w-full border-collapse text-xs font-sans">
            {/* Header: Two-tier Dark Slate Analytical Header */}
            <thead className="sticky top-0 z-20 shadow-xs">
              {/* Row 1: Logical Category Groups */}
              <tr className="bg-slate-900 text-slate-300 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800 select-none">
                {/* 1st group: Identificação (SKU) */}
                <th 
                  scope="col"
                  className="px-3 py-1.5 text-left sticky left-0 z-30 bg-slate-900 text-slate-300 border-r border-slate-800 min-w-[140px] max-w-[180px] shadow-[2px_0_5px_rgba(0,0,0,0.2)]"
                >
                  Identificação
                </th>

                {/* 2nd group: Histórico Mensal */}
                <th 
                  scope="col"
                  colSpan={monthColumns.length}
                  className="px-3 py-1.5 text-center bg-slate-900 text-slate-300 border-r border-slate-800"
                >
                  Histórico de Vendas Mensais ({monthColumns.length}m)
                </th>

                {/* 3rd group: Desempenho & Ritmo */}
                <th 
                  scope="col"
                  colSpan={3}
                  className="px-3 py-1.5 text-center bg-slate-900 text-indigo-300 border-r border-slate-800"
                >
                  Desempenho & Ritmo
                </th>

                {/* 4th group: Projeções Futuras */}
                <th 
                  scope="col"
                  colSpan={4}
                  className="px-3 py-1.5 text-center bg-slate-900 text-blue-300 border-r border-slate-800"
                >
                  Projeções de Demanda
                </th>

                {/* 5th group: Posição de Estoque */}
                <th 
                  scope="col"
                  colSpan={2}
                  className="px-3 py-1.5 text-center bg-slate-900 text-emerald-300 border-r border-slate-800"
                >
                  Posição de Estoque
                </th>

                {/* 6th group: Análise de Giro */}
                <th 
                  scope="col"
                  colSpan={2}
                  className="px-3 py-1.5 text-center bg-slate-900 text-amber-300"
                >
                  Análise de Giro
                </th>
              </tr>

              {/* Row 2: Detailed Column Titles */}
              <tr className="bg-slate-800 text-slate-200 font-bold border-b border-slate-700 divide-x divide-slate-700/60 text-[11px]">
                {/* 1st column: CODIGO (SKU) */}
                <th 
                  scope="col" 
                  className="px-3 py-2.5 text-left uppercase tracking-wider font-extrabold text-[11px] text-white bg-slate-800 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.2)] border-r border-slate-700 min-w-[140px] max-w-[180px]"
                >
                  CÓDIGO (SKU)
                </th>

                {/* Month columns */}
                {monthColumns.map(col => (
                  <th 
                    key={col.key}
                    scope="col"
                    className="px-3 py-2 text-center font-semibold text-[11px] text-slate-200 whitespace-nowrap min-w-[70px] bg-slate-800"
                  >
                    {col.label}
                  </th>
                ))}

                {/* Total dinâmico */}
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-extrabold text-[11px] text-white whitespace-nowrap min-w-[115px] bg-slate-800 border-l border-slate-700"
                >
                  {viewPeriod === 'last12closed' ? (
                    <>Total 12 Meses</>
                  ) : (
                    <>Total Geral</>
                  )}
                </th>

                {/* Meses com Vendas */}
                <th 
                  scope="col" 
                  className="px-3 py-2 text-center font-bold text-[11px] text-slate-200 whitespace-nowrap min-w-[95px] bg-slate-800"
                  title="Quantidade de meses com registro de vendas no período"
                >
                  Meses c/ Venda
                </th>

                {/* Ritmo proj./mês */}
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-extrabold text-[11px] text-indigo-300 whitespace-nowrap min-w-[110px] bg-slate-800"
                  title="Ritmo projetado/mês = 0,5*(Últimos 3 meses/3) + 0,3*(3 meses subsequentes/3) + 0,2*(Últimos 6 meses/6)"
                >
                  Ritmo proj./mês
                </th>

                {/* Proj 30d, 60d, 90d, 120d */}
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-bold text-[11px] text-blue-200 whitespace-nowrap min-w-[85px] bg-slate-800 border-l border-slate-700"
                  title="Proj. 30d = Ritmo proj./mês * 1"
                >
                  Proj. 30d
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-bold text-[11px] text-blue-200 whitespace-nowrap min-w-[85px] bg-slate-800"
                  title="Proj. 60d = Ritmo proj./mês * 2"
                >
                  Proj. 60d
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-bold text-[11px] text-blue-200 whitespace-nowrap min-w-[85px] bg-slate-800"
                  title="Proj. 90d = Ritmo proj./mês * 3"
                >
                  Proj. 90d
                </th>
                <th 
                  scope="col" 
                  className="px-3 py-2 text-right font-bold text-[11px] text-blue-200 whitespace-nowrap min-w-[85px] bg-slate-800"
                  title="Proj. 120d = Ritmo proj./mês * 4"
                >
                  Proj. 120d
                </th>

                {/* Estoque (Sortable) */}
                <th 
                  scope="col" 
                  onClick={() => handleSort('stock')}
                  className="px-3 py-2 text-right font-extrabold text-[11px] text-emerald-200 whitespace-nowrap min-w-[100px] bg-slate-800 border-l border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors select-none group"
                  title={`Saldo físico de estoque ${stockGroupFilter === 'all' ? '(Todos os Grupos)' : `(Grupo: ${stockGroupFilter})`}. Clique para ordenar.`}
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span>Estoque</span>
                    {sortField === 'stock' ? (
                      <span className="text-amber-400 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-60 text-[10px]">↕</span>
                    )}
                  </div>
                </th>

                {/* Valor estoque (Sortable) */}
                <th 
                  scope="col" 
                  onClick={() => handleSort('stockValue')}
                  className="px-3 py-2 text-right font-extrabold text-[11px] text-emerald-300 whitespace-nowrap min-w-[125px] bg-slate-800 cursor-pointer hover:bg-slate-700 transition-colors select-none group"
                  title={`Valor financeiro do estoque calculado a partir do saldo ${stockGroupFilter === 'all' ? '(Todos os Grupos)' : `(Grupo: ${stockGroupFilter})`}. Clique para ordenar.`}
                >
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span>Valor estoque</span>
                    {sortField === 'stockValue' ? (
                      <span className="text-amber-400 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-60 text-[10px]">↕</span>
                    )}
                  </div>
                </th>

                {/* Cobertura (dias) (Sortable + In-Column Filter) */}
                <th 
                  scope="col" 
                  className={`px-3 py-2 text-right font-extrabold text-[11px] whitespace-nowrap min-w-[155px] bg-slate-800 border-l border-slate-700 select-none relative group ${
                    isCoverageFiltered ? 'text-amber-300' : 'text-amber-200'
                  }`}
                  title="Cobertura em dias = (Estoque / Ritmo proj./mês) * 30"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    {/* Header text and sort trigger */}
                    <div 
                      onClick={() => handleSort('coverage')}
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                      title="Clique para ordenar por Cobertura"
                    >
                      <span>Cobertura (dias)</span>
                      {sortField === 'coverage' ? (
                        <span className="text-amber-400 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-60 text-[10px]">↕</span>
                      )}
                    </div>

                    {/* In-column filter button */}
                    <div className="relative inline-flex items-center" ref={coverageFilterRef}>
                      <button
                        type="button"
                        id="btn-filter-coverage-column"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsCoverageFilterOpen(prev => !prev);
                          setIsTurnoverFilterOpen(false);
                        }}
                        title={isCoverageFiltered ? "Filtro ativo em Cobertura. Clique para alterar." : "Filtrar por Cobertura (dias)"}
                        className={`p-1 rounded transition-all cursor-pointer flex items-center justify-center ${
                          isCoverageFiltered 
                            ? 'bg-amber-400 text-slate-950 font-bold ring-2 ring-amber-300 shadow-xs' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>

                      {/* Dropdown Popover */}
                      {isCoverageFilterOpen && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 text-slate-800 p-3.5 z-50 text-left normal-case font-normal"
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                              <Filter className="h-3.5 w-3.5 text-indigo-600" />
                              <span>Filtrar Cobertura (dias)</span>
                            </div>
                            {isCoverageFiltered && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCoverageFilter([]);
                                  setCoverageCustomMin('');
                                  setCoverageCustomMax('');
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Limpar
                              </button>
                            )}
                          </div>

                          {/* Quick 1-Click Filter buttons */}
                          <div className="mb-2.5 pb-2 border-b border-slate-100">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">
                              Filtro Rápido (1 clique):
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {COVERAGE_CATEGORIES.map(cat => {
                                const isSelectedOnly = coverageFilter.length === 1 && coverageFilter[0] === cat.id;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                      setCoverageFilter(prev => prev.length === 1 && prev[0] === cat.id ? [] : [cat.id]);
                                      setCoverageCustomMin('');
                                      setCoverageCustomMax('');
                                    }}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                                      isSelectedOnly ? cat.btnActiveBg : cat.btnBg
                                    }`}
                                  >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${cat.dotClass}`} />
                                    <span className="truncate">{cat.shortName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Multi-selection checklist with SKU count */}
                          <div className="space-y-1.5 text-xs">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                              Seleção múltipla:
                            </div>
                            <div className="max-h-56 overflow-y-auto pr-0.5 space-y-1.5">
                              {COVERAGE_CATEGORIES.map(item => {
                                const isChecked = coverageFilter.includes(item.id);
                                const count = coverageCategoryCounts[item.id] || 0;
                                return (
                                  <label
                                    key={item.id}
                                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                                      isChecked 
                                        ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-medium' 
                                        : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          setCoverageFilter(prev => {
                                            if (prev.includes(item.id)) {
                                              return prev.filter(c => c !== item.id);
                                            } else {
                                              return [...prev, item.id];
                                            }
                                          });
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                      />
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-xs text-slate-800">{item.name}</span>
                                        <span className="text-[10px] text-slate-400">{item.subtitle}</span>
                                      </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${item.badgeClass}`}>
                                      {count} SKUs
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          {/* Custom range input */}
                          <div className="pt-2 mt-2 border-t border-slate-100">
                            <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                              Faixa personalizada em dias:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                placeholder="Mín"
                                value={coverageCustomMin}
                                onChange={(e) => setCoverageCustomMin(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-slate-400 text-xs">até</span>
                              <input
                                type="number"
                                placeholder="Máx"
                                value={coverageCustomMax}
                                onChange={(e) => setCoverageCustomMax(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setCoverageFilter([]);
                                setCoverageCustomMin('');
                                setCoverageCustomMax('');
                              }}
                              className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                            >
                              Mostrar todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsCoverageFilterOpen(false)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>

                {/* Classe giro (Sortable + In-Column Filter) */}
                <th 
                  scope="col" 
                  className={`px-3 py-2 text-center font-extrabold text-[11px] whitespace-nowrap min-w-[155px] bg-slate-800 select-none relative group ${
                    isTurnoverFiltered ? 'text-amber-300' : 'text-amber-300'
                  }`}
                  title="Classe giro calculada pela quantidade de Meses com Vendas: 0 = Sem Saída, 1 a 3 = Baixa Saída, 4 a 7 = Média Saída, 8 ou mais = Quente."
                >
                  <div className="inline-flex items-center gap-1.5 justify-center w-full">
                    {/* Header text and sort trigger */}
                    <div 
                      onClick={() => handleSort('turnoverClass')}
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                      title="Clique para ordenar por Classe de Giro"
                    >
                      <span>Classe giro</span>
                      {sortField === 'turnoverClass' ? (
                        <span className="text-amber-400 text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-60 text-[10px]">↕</span>
                      )}
                    </div>

                    {/* In-column filter button */}
                    <div className="relative inline-flex items-center" ref={turnoverFilterRef}>
                      <button
                        type="button"
                        id="btn-filter-turnover-column"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTurnoverFilterOpen(prev => !prev);
                          setIsCoverageFilterOpen(false);
                        }}
                        title={isTurnoverFiltered ? `Filtro ativo: ${turnoverClassFilter.join(', ')}. Clique para alterar.` : "Filtrar por Classe de Giro (ex: apenas Quente)"}
                        className={`p-1 rounded transition-all cursor-pointer flex items-center justify-center ${
                          isTurnoverFiltered 
                            ? 'bg-amber-400 text-slate-950 font-bold ring-2 ring-amber-300 shadow-xs' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>

                      {/* Dropdown Popover */}
                      {isTurnoverFilterOpen && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 text-slate-800 p-3.5 z-50 text-left normal-case font-normal"
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                              <Filter className="h-3.5 w-3.5 text-indigo-600" />
                              <span>Filtrar Classe de Giro</span>
                            </div>
                            {isTurnoverFiltered && (
                              <button
                                type="button"
                                onClick={() => setTurnoverClassFilter([])}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Limpar
                              </button>
                            )}
                          </div>

                          {/* Quick 1-Click Filter buttons (e.g. "Apenas Quente") */}
                          <div className="mb-2.5 pb-2 border-b border-slate-100">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">
                              Filtro Rápido (1 clique):
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setTurnoverClassFilter(['Quente'])}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                                  turnoverClassFilter.length === 1 && turnoverClassFilter[0] === 'Quente'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="truncate">Apenas Quente</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setTurnoverClassFilter(['Média Saída'])}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                                  turnoverClassFilter.length === 1 && turnoverClassFilter[0] === 'Média Saída'
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                <span className="truncate">Apenas Média</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setTurnoverClassFilter(['Baixa Saída'])}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                                  turnoverClassFilter.length === 1 && turnoverClassFilter[0] === 'Baixa Saída'
                                    ? 'bg-slate-700 text-white border-slate-700'
                                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                <span className="truncate">Apenas Baixa</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setTurnoverClassFilter(['Sem Saída'])}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
                                  turnoverClassFilter.length === 1 && turnoverClassFilter[0] === 'Sem Saída'
                                    ? 'bg-zinc-700 text-white border-zinc-700'
                                    : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
                                <span className="truncate">Sem Saída</span>
                              </button>
                            </div>
                          </div>

                          {/* Multi-selection checklist with SKU count */}
                          <div className="space-y-1.5 text-xs">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                              Seleção múltipla:
                            </div>
                            {[
                              { 
                                name: 'Quente', 
                                subtitle: '≥ 8 meses c/ venda', 
                                count: turnoverClassCounts['Quente'] || 0,
                                badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              },
                              { 
                                name: 'Média Saída', 
                                subtitle: '4 a 7 meses c/ venda', 
                                count: turnoverClassCounts['Média Saída'] || 0,
                                badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
                              },
                              { 
                                name: 'Baixa Saída', 
                                subtitle: '1 a 3 meses c/ venda', 
                                count: turnoverClassCounts['Baixa Saída'] || 0,
                                badgeClass: 'bg-slate-200 text-slate-700 border-slate-300'
                              },
                              { 
                                name: 'Sem Saída', 
                                subtitle: '0 meses c/ venda', 
                                count: turnoverClassCounts['Sem Saída'] || 0,
                                badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200'
                              }
                            ].map(item => {
                              const isChecked = turnoverClassFilter.includes(item.name);
                              return (
                                <label
                                  key={item.name}
                                  className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                                    isChecked 
                                      ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-medium' 
                                      : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setTurnoverClassFilter(prev => {
                                          if (prev.includes(item.name)) {
                                            return prev.filter(c => c !== item.name);
                                          } else {
                                            return [...prev, item.name];
                                          }
                                        });
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-xs text-slate-800">{item.name}</span>
                                      <span className="text-[10px] text-slate-400">{item.subtitle}</span>
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${item.badgeClass}`}>
                                    {item.count} SKUs
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setTurnoverClassFilter([])}
                              className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                            >
                              Mostrar todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsTurnoverFilterOpen(false)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-slate-100">
              {sortedFilteredSkus.length === 0 ? (
                <tr>
                  <td 
                    colSpan={monthColumns.length + 12} 
                    className="px-6 py-12 text-center text-slate-400 bg-slate-50/50"
                  >
                    <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-sm">Nenhum registro de venda encontrado</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Clique em <strong className="text-slate-700">"Atualizar"</strong> para sincronizar via API ou em <strong className="text-slate-700">"Lançar"</strong> para registrar vendas manualmente.
                    </p>
                    {canManage && (
                      <button
                        onClick={() => handleOpenAddModal()}
                        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Lançar Primeira Venda
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                sortedFilteredSkus.map((sku, rowIdx) => {
                  const monthData = salesBySku.get(sku) || {};
                  const rowPeriodTotal = viewPeriod === 'last12closed'
                    ? (skuTotals[sku]?.last12 || 0)
                    : (skuTotals[sku]?.grandTotal || 0);
                  const rowMonthsCount = viewPeriod === 'last12closed'
                    ? (skuTotals[sku]?.monthsCount12 || 0)
                    : (skuTotals[sku]?.monthsCountAll || 0);
                  const rowProjectedPace = skuTotals[sku]?.projectedPace || 0;
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr 
                      key={sku}
                      className={`hover:bg-indigo-50/30 transition-colors border-b border-slate-100 divide-x divide-slate-100 group ${
                        isEven ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      {/* SKU cell - Sticky left */}
                      <td className="px-3 py-2 font-medium text-slate-900 sticky left-0 z-10 bg-inherit border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)] flex items-center justify-between gap-1.5">
                        <div className="flex flex-col min-w-0 pr-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold font-mono text-[12px] text-slate-900 select-all group-hover:text-indigo-600 transition-colors">
                              {sku}
                            </span>
                          </div>
                          {(() => {
                            const corrs = correlationMaps.parentToChildren.get(sku.trim().toUpperCase());
                            if (corrs && corrs.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {corrs.map(c => (
                                    <span 
                                      key={c.code}
                                      title={`Item correlacionado consolidado no consumo e estoque: ${c.code} (${c.multiplier}x)`}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                    >
                                      <span>🔗 {c.code} ({c.multiplier}x)</span>
                                    </span>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {(() => {
                            const pName = products.find(p => 
                              p.code.toLowerCase() === sku.toLowerCase() ||
                              p.codigo?.toLowerCase() === sku.toLowerCase() ||
                              (p.pr_cod !== undefined && String(p.pr_cod).toLowerCase() === sku.toLowerCase())
                            )?.name || 
                            stock.find(s => (s.productCode || s.codigo || '').toLowerCase() === sku.toLowerCase())?.productName;
                            return pName ? (
                              <span className="text-[10px] text-slate-400 truncate max-w-[170px]" title={pName}>
                                {pName}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {canManage && (
                          <button
                            onClick={() => handleOpenAddModal(sku)}
                            title={`Lançar venda manual para ${sku}`}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 text-slate-500 rounded transition-opacity shrink-0 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </td>

                      {/* Month cells */}
                      {monthColumns.map(col => {
                        const qty = monthData[col.key];
                        const hasVal = qty !== undefined && qty > 0;
                        return (
                          <td 
                            key={col.key}
                            className={`px-3 py-2 text-right font-mono text-[12px] tabular-nums ${
                              hasVal ? 'text-slate-800 font-semibold' : 'text-slate-300'
                            }`}
                          >
                            {hasVal ? qty.toLocaleString('pt-BR') : '-'}
                          </td>
                        );
                      })}

                      {/* Total da Linha */}
                      <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-slate-900 bg-slate-100/50 border-l border-slate-200 tabular-nums">
                        {rowPeriodTotal.toLocaleString('pt-BR')}
                      </td>

                      {/* Quantidade de meses com vendas */}
                      <td 
                        className="px-3 py-2 text-center font-mono text-[12px] font-semibold text-slate-700 bg-slate-50/40 tabular-nums"
                        title={`${rowMonthsCount} ${rowMonthsCount === 1 ? 'mês com venda' : 'meses com vendas'}`}
                      >
                        {rowMonthsCount}
                      </td>

                      {/* Ritmo proj./mês */}
                      <td 
                        className="px-3 py-2 text-right font-mono text-[12px] font-bold text-indigo-700 bg-indigo-50/20 tabular-nums"
                        title={`Ritmo projetado arredondado: ${rowProjectedPace.toLocaleString('pt-BR')} un/mês`}
                      >
                        {rowProjectedPace.toLocaleString('pt-BR')}
                      </td>

                      {/* Proj. 30d */}
                      <td 
                        className="px-3 py-2 text-right font-mono text-[12px] font-medium text-slate-700 bg-slate-50/30 border-l border-slate-200 tabular-nums"
                        title={`Proj. 30d: ${(skuTotals[sku]?.proj30 || 0).toLocaleString('pt-BR')} peças`}
                      >
                        {(skuTotals[sku]?.proj30 || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Proj. 60d */}
                      <td 
                        className="px-3 py-2 text-right font-mono text-[12px] font-medium text-slate-700 bg-slate-50/30 tabular-nums"
                        title={`Proj. 60d: ${(skuTotals[sku]?.proj60 || 0).toLocaleString('pt-BR')} peças`}
                      >
                        {(skuTotals[sku]?.proj60 || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Proj. 90d */}
                      <td 
                        className="px-3 py-2 text-right font-mono text-[12px] font-medium text-slate-700 bg-slate-50/30 tabular-nums"
                        title={`Proj. 90d: ${(skuTotals[sku]?.proj90 || 0).toLocaleString('pt-BR')} peças`}
                      >
                        {(skuTotals[sku]?.proj90 || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Proj. 120d */}
                      <td 
                        className="px-3 py-2 text-right font-mono text-[12px] font-medium text-slate-700 bg-slate-50/30 tabular-nums"
                        title={`Proj. 120d: ${(skuTotals[sku]?.proj120 || 0).toLocaleString('pt-BR')} peças`}
                      >
                        {(skuTotals[sku]?.proj120 || 0).toLocaleString('pt-BR')}
                      </td>

                      {/* Coluna Estoque */}
                      {(() => {
                        const stk = getSkuStock(sku);
                        const isZeroStock = stk.quantity === 0;
                        return (
                          <>
                            <td 
                              className={`px-3 py-2 text-right font-mono text-[12px] font-bold border-l border-slate-200 tabular-nums ${
                                isZeroStock ? 'text-slate-400' : 'text-slate-900'
                              }`}
                              title={`Estoque (${stockGroupFilter === 'all' ? 'Todos os Grupos' : stockGroupFilter}): ${stk.quantity.toLocaleString('pt-BR')} peças`}
                            >
                              {stk.quantity.toLocaleString('pt-BR')}
                            </td>

                            {/* Coluna Valor estoque */}
                            <td 
                              className={`px-3 py-2 text-right font-mono text-[12px] font-bold border-l border-slate-100 tabular-nums ${
                                isZeroStock ? 'text-slate-400' : 'text-emerald-700 bg-emerald-50/20'
                              }`}
                              title={`Valor estoque calculado: $ ${stk.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            >
                              $ {stk.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            {/* Coluna Cobertura (dias) */}
                            {(() => {
                              const cov = getSkuCoverage(sku);
                              const isInfinite = cov === 9999;
                              const isZero = cov === 0;

                              return (
                                <td 
                                  className="px-3 py-2 text-right font-mono text-[12px] font-bold border-l border-slate-200 tabular-nums"
                                  title={
                                    isInfinite 
                                      ? 'Ritmo proj./mês = 0 e Estoque > 0: 9999 dias de cobertura' 
                                      : isZero 
                                        ? 'Sem cobertura estimada (0 dias)' 
                                        : `${cov.toLocaleString('pt-BR')} dias de cobertura de estoque`
                                  }
                                >
                                  {isInfinite ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">
                                      9999
                                    </span>
                                  ) : isZero ? (
                                    <span className="text-slate-300">0</span>
                                  ) : cov <= 30 ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                                      {cov.toLocaleString('pt-BR')}d
                                    </span>
                                  ) : (
                                    <span className="text-slate-800">
                                      {cov.toLocaleString('pt-BR')}
                                    </span>
                                  )}
                                </td>
                              );
                            })()}

                            {/* Coluna Classe giro */}
                            {(() => {
                              const turnoverClass = getSkuTurnoverClass(sku);
                              const badgeStyle = 
                                turnoverClass === 'Quente'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : turnoverClass === 'Média Saída'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : turnoverClass === 'Baixa Saída'
                                      ? 'bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-zinc-100 text-zinc-500 border-zinc-200';

                              return (
                                <td 
                                  className="px-3 py-2 text-center text-[12px] font-bold border-l border-slate-100 whitespace-nowrap"
                                  title={`Classe giro: ${turnoverClass}`}
                                >
                                  <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeStyle}`}>
                                    {turnoverClass}
                                  </span>
                                </td>
                              );
                            })()}
                          </>
                        );
                      })()}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Total Row: Executive Dark Analytics Summary */}
            {sortedFilteredSkus.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-mono font-bold text-[12px] shadow-[0_-4px_12px_rgba(0,0,0,0.2)] divide-x divide-slate-800">
                <tr>
                  <td className="px-3 py-2.5 text-left font-black tracking-wider text-[11px] sticky left-0 z-30 bg-slate-900 text-amber-400 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">
                    TOTAL GERAL
                  </td>
                  {monthColumns.map(col => (
                    <td 
                      key={col.key}
                      className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-slate-200 tabular-nums"
                    >
                      {(columnTotals.colSums[col.key] || 0).toLocaleString('pt-BR')}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono font-black text-[12px] text-white bg-slate-850 border-l border-slate-800 tabular-nums">
                    {columnTotals.sumPeriodTotal.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-[12px] bg-slate-850 text-slate-400">
                    -
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-[12px] text-indigo-300 bg-slate-850 tabular-nums">
                    {columnTotals.sumPaceTotal.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-blue-200 bg-slate-850 border-l border-slate-800 tabular-nums">
                    {columnTotals.sumProj30Total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-blue-200 bg-slate-850 tabular-nums">
                    {columnTotals.sumProj60Total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-blue-200 bg-slate-850 tabular-nums">
                    {columnTotals.sumProj90Total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-blue-200 bg-slate-850 tabular-nums">
                    {columnTotals.sumProj120Total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-[12px] text-emerald-300 bg-slate-850 border-l border-slate-800 tabular-nums">
                    {columnTotals.sumStockQty.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-[12px] text-emerald-400 bg-slate-850 tabular-nums">
                    $ {columnTotals.sumStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-[12px] text-amber-300 bg-slate-850 border-l border-slate-800 tabular-nums">
                    {columnTotals.sumCoverage === 9999 ? '9999' : columnTotals.sumCoverage.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-[12px] bg-slate-850 text-slate-400">
                    -
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Confirmation Modal for "Excluir Todos os Registros" */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-100 rounded-full">
                <Trash2 className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Excluir Todas as Vendas?</h3>
                <p className="text-xs text-slate-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Você tem certeza que deseja excluir todos os <strong className="text-slate-900">{sales.length} lançamentos de vendas</strong> cadastrados? Os dados locais serão completamente apagados.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsClearConfirmOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmClearAll}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Sim, Excluir Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for "Lançar" / Incluir Venda Manualmente */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  {editingSale ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingSale ? 'Editar Lançamento de Venda' : 'Lançar Venda'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingSale ? 'Atualize os dados da venda selecionada' : 'Adicione manualmente a quantidade vendida de um SKU'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddOrEdit} className="space-y-4">
              {/* SKU selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Código (SKU) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    list="available-skus-list"
                    placeholder="Ex: 2W-B, 302-AW-135..."
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 uppercase font-mono"
                  />
                  <datalist id="available-skus-list">
                    {products.map(p => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                    {allSkus.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Month and Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Mês *
                  </label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                      <option key={m} value={m}>
                        {m} - {new Date(2025, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Ano *
                  </label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value, 10) })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white font-mono"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Quantidade Vendida *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="Ex: 15"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Venda avulsa, cliente X..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  {editingSale ? 'Salvar Alterações' : 'Confirmar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execution Logs Modal (same standard as StockTable) */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                {updateStatus === 'success' ? (
                  <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                ) : updateStatus === 'error' ? (
                  <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {updateStatus === 'success' ? 'Atualização Concluída' : updateStatus === 'error' ? 'Falha na Atualização' : 'Executando Integração...'}
                  </h3>
                  <p className="text-xs text-slate-500">{updateMessage || 'Log de execução da API de Vendas'}</p>
                </div>
              </div>
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Terminal log box */}
            <div className="flex-1 overflow-y-auto bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-200 space-y-1.5 shadow-inner">
              {executionLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={
                    log.includes('ERRO') 
                      ? 'text-rose-400 font-semibold' 
                      : log.includes('Aviso') || log.includes('AVISO')
                      ? 'text-amber-400 font-semibold'
                      : log.includes('sucesso') || log.includes('concluída')
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                  }
                >
                  {log}
                </div>
              ))}
            </div>

            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="px-5 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
