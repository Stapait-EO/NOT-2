import { FC } from 'react';
import { 
  Building, 
  Truck, 
  Layers, 
  AlertCircle, 
  ArrowUpRight, 
  Tag, 
  ChevronRight 
} from 'lucide-react';

interface CorrelatedInfo {
  code: string;
  multiplier: number;
}

interface GroupedStockRow {
  productCode: string;
  productName: string;
  correlations?: CorrelatedInfo[];
  groups: {
    [groupName: string]: {
      quantity: number;
      sumPrPrecoTimesQty: number;
      sumVlrestTimesQty: number;
    };
  };
}

interface StockMobileCardsProps {
  groupedStock: GroupedStockRow[];
  displayedGroups: string[];
  groupTotals: Record<string, number>;
  showProjectedStock: boolean;
  getProjectedStockQty: (row: GroupedStockRow, groupName: string, totalOrdersQty: number) => number;
  getProductOrdersSummary: (productCode: string) => { totalQtyOrdered: number; ordersCount: number };
  onOpenBatchModal: (productCode: string, productName: string, groupName: string) => void;
  onOpenOrdersModal: (productCode: string, productName: string) => void;
}

export const StockMobileCards: FC<StockMobileCardsProps> = ({
  groupedStock,
  displayedGroups,
  showProjectedStock,
  getProjectedStockQty,
  getProductOrdersSummary,
  onOpenBatchModal,
  onOpenOrdersModal,
}) => {
  if (groupedStock.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
          <Layers className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Nenhum produto encontrado</p>
        <p className="text-xs text-slate-400 mt-1">
          Tente ajustar sua busca ou limpar os filtros de grupos e pedidos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      {groupedStock.map((row) => {
        const ordersSummary = getProductOrdersSummary(row.productCode);
        const hasOrders = ordersSummary.totalQtyOrdered > 0;

        return (
          <div
            key={row.productCode}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden"
          >
            {/* Header: SKU, Correlations and Open Orders Action */}
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-100 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                    {row.productCode}
                  </span>

                  {row.correlations && row.correlations.length > 0 && (
                    <span 
                      title={row.correlations.map(c => `${c.code} (${c.multiplier}x)`).join(', ')}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      <span>+{row.correlations.length} correlações</span>
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-slate-900 text-sm mt-1.5 leading-snug break-words">
                  {row.productName}
                </h3>
              </div>

              {/* Open Orders Chip Button */}
              {hasOrders ? (
                <button
                  type="button"
                  onClick={() => onOpenOrdersModal(row.productCode, row.productName)}
                  className="shrink-0 inline-flex flex-col items-end px-2.5 py-1 rounded-xl bg-amber-100/90 hover:bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs active:scale-95 transition-all text-right"
                  title="Clique para ver os pedidos em aberto"
                >
                  <div className="flex items-center gap-1 font-mono font-bold text-xs text-amber-950">
                    <Truck className="h-3 w-3 text-amber-700" />
                    <span>{ordersSummary.totalQtyOrdered.toLocaleString('pt-BR')} un</span>
                  </div>
                  <span className="text-[10px] font-medium text-amber-800 flex items-center gap-0.5">
                    <span>{ordersSummary.ordersCount} {ordersSummary.ordersCount === 1 ? 'pedido' : 'pedidos'}</span>
                    <ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
                  </span>
                </button>
              ) : (
                <span className="text-[11px] font-mono text-slate-300 px-2 py-1">
                  0 pedidos
                </span>
              )}
            </div>

            {/* Warehouse Groups Grid */}
            <div className="p-3.5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Grupos de Estoque</span>
                <span className="text-[9px] text-slate-400 font-normal">Toque no grupo para ver lotes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {displayedGroups.map((grp) => {
                  const data = row.groups[grp] || { quantity: 0, sumPrPrecoTimesQty: 0, sumVlrestTimesQty: 0 };
                  const avgPrice = data.quantity > 0 ? data.sumPrPrecoTimesQty / data.quantity : 0;
                  const totalVal = avgPrice * data.quantity;
                  const hasQty = data.quantity > 0;
                  const projQty = getProjectedStockQty(row, grp, ordersSummary.totalQtyOrdered);

                  return (
                    <div
                      key={grp}
                      onClick={() => {
                        if (hasQty) {
                          onOpenBatchModal(row.productCode, row.productName, grp);
                        }
                      }}
                      className={`p-2.5 rounded-xl border transition-all select-none ${
                        hasQty
                          ? 'border-indigo-100 bg-indigo-50/20 active:bg-indigo-100/50 cursor-pointer shadow-2xs'
                          : 'border-slate-100 bg-slate-50/50 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building className={`h-3.5 w-3.5 shrink-0 ${hasQty ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <span className={`text-xs font-bold truncate ${hasQty ? 'text-indigo-950' : 'text-slate-500'}`}>
                            {grp}
                          </span>
                        </div>

                        {hasQty && (
                          <span className="text-[10px] text-indigo-600 font-medium inline-flex items-center gap-0.5 shrink-0">
                            <span>Lotes</span>
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>

                      {/* Quantities & Values */}
                      <div className="flex items-end justify-between gap-2 pt-1 border-t border-slate-100">
                        {/* Physical and Average values */}
                        <div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Físico: <strong className="font-mono text-slate-800">{data.quantity.toLocaleString('pt-BR')} un</strong>
                          </div>
                          {data.quantity > 0 && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Total: $ {totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          )}
                        </div>

                        {/* Projected / Available Stock Badge */}
                        {showProjectedStock ? (
                          <div className="shrink-0">
                            {projQty > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                                <span>{projQty.toLocaleString('pt-BR')} un</span>
                                <span className="text-[9px] font-normal text-emerald-700">disp.</span>
                              </span>
                            ) : projQty < 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-black bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs">
                                <AlertCircle className="h-3 w-3 text-rose-700 shrink-0" />
                                <span>{projQty.toLocaleString('pt-BR')} un</span>
                              </span>
                            ) : hasQty && ordersSummary.totalQtyOrdered > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                                <span>0 un</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono text-xs">0 un</span>
                            )}
                          </div>
                        ) : (
                          <div className="shrink-0 text-right">
                            <span className="font-mono font-bold text-xs text-indigo-900 bg-white border border-indigo-200/80 px-2 py-0.5 rounded-md shadow-2xs inline-block">
                              {data.quantity.toLocaleString('pt-BR')} un
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
