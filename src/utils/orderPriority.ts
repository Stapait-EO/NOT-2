import { OrderItem, StockBalance, Warehouse, Product, OrderPriority } from '../types';

export interface OrderPriorityEvaluation {
  priority: 'Alta' | 'Médio Alto' | 'Médio Baixo' | 'Baixo';
  spCount: number;
  miamiCount: number;
  semEstoqueCount: number;
  totalItems: number;
  summary: string;
  itemsDetails: {
    productCode: string;
    productName: string;
    status: 'SP' | 'MIAMI' | 'SEM_ESTOQUE';
    spStock: number;
    miamiStock: number;
  }[];
}

export function getWarehouseGroup(whName: string, warehouses: Warehouse[] = []): string {
  const cleanWh = (whName || '').trim().toLowerCase();
  if (!cleanWh) return "Outros";

  const wh = warehouses.find(w => {
    const wName = w.name.trim().toLowerCase();
    return wName === cleanWh || cleanWh.startsWith(wName) || wName.startsWith(cleanWh);
  });

  if (wh) {
    if (!wh.isActive) return "Inativo";
    if (wh.groupName?.trim()) return wh.groupName.trim();
  }

  if (cleanWh.startsWith('0002') || cleanWh.includes('são paulo') || cleanWh.includes('sao paulo') || cleanWh.includes('matriz')) {
    return "São Paulo";
  }
  if (cleanWh.startsWith('0004') || cleanWh.includes('miami')) {
    return "Miami";
  }
  return "Outros";
}

/**
 * Calcula a prioridade do pedido com base na disponibilidade de saldo de estoque nos grupos de depósitos:
 * 1 - "Alta" (Tom de Verde): Todos os itens do pedido possuem saldo de estoque no grupo "São Paulo".
 * 2 - "Médio Alto" (Tom de Laranja): Todos os itens possuem saldo, mas nem todos em São Paulo (recorrendo a Miami).
 * 3 - "Médio Baixo" (Tom de Amarelo): Pedido possui itens com saldo (SP/Miami) e itens sem saldo de estoque.
 * 4 - "Baixo" (Tom de Vermelho): Nenhum item do pedido possui saldo em nenhum grupo de depósitos.
 */
export function calculateOrderPriority(
  items: OrderItem[] = [],
  stock: StockBalance[] = [],
  warehouses: Warehouse[] = [],
  products: Product[] = []
): OrderPriorityEvaluation {
  if (!items || items.length === 0) {
    return {
      priority: 'Baixo',
      spCount: 0,
      miamiCount: 0,
      semEstoqueCount: 0,
      totalItems: 0,
      summary: 'Pedido sem itens cadastrados',
      itemsDetails: []
    };
  }

  // Pre-build product correlation maps (children to parent and parent to children)
  const childToParent = new Map<string, { parentCode: string; multiplier: number }>();
  const parentToChildren = new Map<string, { code: string; multiplier: number }[]>();

  products.forEach(p => {
    const parentKey = (p.code || '').trim().toUpperCase();
    if (!parentKey) return;

    const corrs: { code: string; multiplier: number }[] = [];
    if (Array.isArray(p.correlations)) {
      p.correlations.forEach(c => {
        const cCode = (c.code || '').trim().toUpperCase();
        const mult = Number(c.multiplier) || 1;
        if (cCode && cCode !== parentKey && mult > 0) {
          corrs.push({ code: cCode, multiplier: mult });
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

  let spCount = 0;
  let miamiCount = 0;
  let semEstoqueCount = 0;

  const itemsDetails = items.map(item => {
    const pCode = (item.productCode || '').trim().toUpperCase();
    const pName = (item.productName || '').trim().toLowerCase();

    // Find all related codes for correlation
    const relatedCodes = new Set<string>();
    if (pCode) {
      relatedCodes.add(pCode);
    }

    // Check if it is a child item
    const childRel = childToParent.get(pCode);
    if (childRel) {
      relatedCodes.add(childRel.parentCode);
      const siblings = parentToChildren.get(childRel.parentCode) || [];
      siblings.forEach(s => relatedCodes.add(s.code));
    }

    // Check if it is a parent item
    const children = parentToChildren.get(pCode) || [];
    children.forEach(c => relatedCodes.add(c.code));

    // Also look up in products by name/codigo if code differs
    const matchedProd = products.find(p => 
      p.code.toUpperCase() === pCode ||
      p.codigo?.toUpperCase() === pCode ||
      (p.pr_cod !== undefined && String(p.pr_cod).toUpperCase() === pCode) ||
      (pName && p.name && p.name.trim().toLowerCase() === pName)
    );
    if (matchedProd) {
      relatedCodes.add(matchedProd.code.toUpperCase());
      if (matchedProd.codigo) relatedCodes.add(matchedProd.codigo.toUpperCase());
      if (matchedProd.pr_cod !== undefined) relatedCodes.add(String(matchedProd.pr_cod).toUpperCase());
    }

    // Calculate available stock in São Paulo and Miami/Other
    let spStock = 0;
    let miamiStock = 0;

    stock.forEach(stk => {
      const whGroup = getWarehouseGroup(stk.warehouse, warehouses);
      if (whGroup === 'Inativo') return;

      const stkProductCode = (stk.productCode || '').trim().toUpperCase();
      const stkCodigo = (stk.codigo || '').trim().toUpperCase();
      const stkPrCod = stk.pr_cod !== undefined ? String(stk.pr_cod).trim().toUpperCase() : '';
      const stkProdName = (stk.productName || '').trim().toLowerCase();

      const matchesStock = (stkProductCode && relatedCodes.has(stkProductCode)) ||
                           (stkCodigo && relatedCodes.has(stkCodigo)) ||
                           (stkPrCod && relatedCodes.has(stkPrCod)) ||
                           (pName && stkProdName && stkProdName === pName);

      if (!matchesStock) return;

      const qty = Number(stk.quantity || (stk as any).saldo || 0);
      if (qty <= 0) return;

      const groupLower = whGroup.toLowerCase();
      const isSP = groupLower.includes('são paulo') || groupLower.includes('sao paulo') || groupLower.startsWith('sp');
      const isMiami = groupLower.includes('miami') || groupLower.startsWith('mia');

      if (isSP) {
        spStock += qty;
      } else if (isMiami) {
        miamiStock += qty;
      }
    });

    let status: 'SP' | 'MIAMI' | 'SEM_ESTOQUE';
    if (spStock > 0) {
      status = 'SP';
      spCount++;
    } else if (miamiStock > 0) {
      status = 'MIAMI';
      miamiCount++;
    } else {
      status = 'SEM_ESTOQUE';
      semEstoqueCount++;
    }

    return {
      productCode: item.productCode,
      productName: item.productName || item.productCode,
      status,
      spStock,
      miamiStock
    };
  });

  const totalItems = items.length;
  let priority: 'Alta' | 'Médio Alto' | 'Médio Baixo' | 'Baixo';
  let summary = '';

  // Regra 4: Sem saldo em nenhum grupo de depósitos -> "Baixo" (Vermelho)
  if (semEstoqueCount === totalItems) {
    priority = 'Baixo';
    summary = `Nenhum dos ${totalItems} itens possui saldo em estoque`;
  }
  // Regra 1: Todos os itens com saldo em São Paulo -> "Alta" (Verde)
  else if (spCount === totalItems) {
    priority = 'Alta';
    summary = `Todos os ${totalItems} itens com saldo no grupo São Paulo`;
  }
  // Regra 2: Todos os itens possuem saldo, mas nem todos em São Paulo (recorrendo a Miami) -> "Médio Alto" (Laranja)
  else if (semEstoqueCount === 0) {
    priority = 'Médio Alto';
    summary = `${spCount} itens com saldo em São Paulo e ${miamiCount} no grupo Miami (sem faltas)`;
  }
  // Regra 3: Itens com saldo em SP/Miami e itens sem saldo de estoque -> "Médio Baixo" (Amarelo)
  else {
    priority = 'Médio Baixo';
    summary = `${spCount} em São Paulo, ${miamiCount} em Miami e ${semEstoqueCount} sem saldo de estoque`;
  }

  return {
    priority,
    spCount,
    miamiCount,
    semEstoqueCount,
    totalItems,
    summary,
    itemsDetails
  };
}

export function getPriorityBadgeClasses(priority: OrderPriority | string): {
  badge: string;
  dot: string;
  text: string;
  label: string;
} {
  const p = (priority || '').trim().toLowerCase();
  if (p === 'alta') {
    return {
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
      label: 'Alta'
    };
  }
  if (p === 'médio alto' || p === 'medio alto') {
    return {
      badge: 'bg-orange-100 text-orange-800 border-orange-300',
      dot: 'bg-orange-500',
      text: 'text-orange-700',
      label: 'Médio Alto'
    };
  }
  if (p === 'médio baixo' || p === 'medio baixo') {
    return {
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      label: 'Médio Baixo'
    };
  }
  if (p === 'baixo' || p === 'baixa') {
    return {
      badge: 'bg-rose-100 text-rose-800 border-rose-300',
      dot: 'bg-rose-500',
      text: 'text-rose-700',
      label: 'Baixo'
    };
  }
  // Fallback (Média)
  return {
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    label: priority || 'Média'
  };
}
