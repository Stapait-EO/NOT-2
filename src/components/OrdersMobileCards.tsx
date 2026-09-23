import { FC, useState } from 'react';
import { 
  FileText, 
  Calendar, 
  User, 
  ChevronDown, 
  Edit2, 
  Trash2, 
  Package, 
  Layers 
} from 'lucide-react';
import { OrderHeader } from '../types';
import { getPriorityBadgeClasses, OrderPriorityEvaluation } from '../utils/orderPriority';

interface OrdersMobileCardsProps {
  orders: OrderHeader[];
  orderEvaluations: Map<string, OrderPriorityEvaluation>;
  canManageOrders: boolean;
  onEditOrder: (order: OrderHeader) => void;
  onDeleteOrder: (id: string) => void;
}

export const OrdersMobileCards: FC<OrdersMobileCardsProps> = ({
  orders,
  orderEvaluations,
  canManageOrders,
  onEditOrder,
  onDeleteOrder,
}) => {
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
          <FileText className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Nenhum pedido encontrado</p>
        <p className="text-xs text-slate-400 mt-1">
          Tente alterar o filtro de prioridade ou a busca acima.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      {orders.map((order) => {
        const isExpanded = !!expandedOrders[order.id];
        const evalInfo = orderEvaluations.get(order.id || order.orderNumber);
        const effectivePriority = evalInfo?.priority || order.priority;
        const badgeCfg = getPriorityBadgeClasses(effectivePriority);

        const totalQty = order.items.reduce((sum, item) => sum + item.quantityOrdered, 0);
        const totalValue = order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);

        return (
          <div
            key={order.id}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden"
          >
            {/* Card Header: Order Number, Date and Priority */}
            <div className="p-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                  #{order.orderNumber}
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(order.date).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {/* Priority badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs ${badgeCfg.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${badgeCfg.dot}`} />
                {badgeCfg.label}
              </span>
            </div>

            {/* Client and Financial Values */}
            <div className="p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-slate-800">
                <User className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-semibold text-sm leading-snug break-words">
                  {order.clientName}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  <span>Itens: </span>
                  <strong className="text-slate-800 font-mono">{order.items.length} itens ({totalQty} un)</strong>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase">Valor Total</span>
                  <strong className="font-mono text-sm text-slate-900 font-bold">
                    $ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {/* Evaluation summary explanation */}
              {evalInfo && (
                <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100/80 leading-relaxed">
                  <span className="font-semibold text-indigo-900">Análise de Atendimento: </span>
                  {evalInfo.summary}
                </div>
              )}

              {/* Actions & Expansion Button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => toggleExpand(order.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 active:scale-95 transition-all cursor-pointer"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>{isExpanded ? 'Ocultar Itens' : `Ver ${order.items.length} Itens`}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {canManageOrders && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditOrder(order)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar Pedido"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteOrder(order.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir Pedido"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Collapsed items breakdown */}
              {isExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Detalhamento dos Itens
                  </span>
                  <div className="space-y-1.5">
                    {order.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="p-2 rounded-lg bg-slate-50 text-xs flex items-center justify-between gap-2 border border-slate-100"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-mono font-bold text-indigo-700 block text-[11px]">
                            {item.productCode}
                          </span>
                          <span className="text-slate-700 truncate block text-[11px]">
                            {item.productName}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-slate-800">
                            {item.quantityOrdered} un
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            $ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
