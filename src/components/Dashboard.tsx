import { useState, useMemo, useCallback } from 'react';
import { 
  Package, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Building, 
  Calendar, 
  User, 
  TrendingUp, 
  Layers, 
  ArrowRight, 
  Info,
  Clock,
  ShieldCheck,
  Search,
  X,
  ChevronDown,
  ArrowLeftRight,
  Truck
} from 'lucide-react';
import { OrderHeader, StockBalance, OrderItem, Warehouse, Product } from '../types';

// Helper function to classify orders under an allocation mapping
function classifyOrders(
  ordersList: OrderHeader[], 
  allocationMap: Record<string, Record<string, { allocated: number; fromWarehouses: { warehouse: string; qty: number }[]; missing: number }>>
) {
  const complete: OrderHeader[] = [];
  const partial: OrderHeader[] = [];
  const blocked: OrderHeader[] = [];

  ordersList.forEach(order => {
    const alloc = allocationMap[order.id];
    if (!alloc) {
      blocked.push(order);
      return;
    }

    let fullySatisfied = true;
    let zeroSatisfied = true;

    order.items.forEach(item => {
      const itemAlloc = alloc[item.productCode];
      if (itemAlloc) {
        if (itemAlloc.missing > 0) {
          fullySatisfied = false;
        }
        if (itemAlloc.allocated > 0) {
          zeroSatisfied = false;
        }
      } else {
        fullySatisfied = false;
      }
    });

    if (fullySatisfied) {
      complete.push(order);
    } else if (zeroSatisfied) {
      blocked.push(order);
    } else {
      partial.push(order);
    }
  });

  return { complete, partial, blocked };
}

// Helper function to find order status under an allocation map
function getOrderStatus(
  order: OrderHeader, 
  allocationMap: Record<string, Record<string, { allocated: number; fromWarehouses: { warehouse: string; qty: number }[]; missing: number }>>
): 'complete' | 'partial' | 'blocked' {
  const alloc = allocationMap[order.id];
  if (!alloc) {
    return 'blocked';
  }

  let fullySatisfied = true;
  let zeroSatisfied = true;

  order.items.forEach(item => {
    const itemAlloc = alloc[item.productCode];
    if (itemAlloc) {
      if (itemAlloc.missing > 0) {
        fullySatisfied = false;
      }
      if (itemAlloc.allocated > 0) {
        zeroSatisfied = false;
      }
    } else {
      fullySatisfied = false;
    }
  });

  if (fullySatisfied) {
    return 'complete';
  } else if (zeroSatisfied) {
    return 'blocked';
  } else {
    return 'partial';
  }
}

// Helper function to calculate chronological simulated allocation
function calculateSimulatedAllocation(ordersSorted: OrderHeader[], stockList: StockBalance[], isSpWarehouse?: (whName: string) => boolean) {
  const runningStock = stockList.map(s => ({ ...s }));
  const allocationMap: Record<string, Record<string, { allocated: number; fromWarehouses: { warehouse: string; qty: number }[]; missing: number }>> = {};

  ordersSorted.forEach(order => {
    allocationMap[order.id] = {};

    order.items.forEach(item => {
      let remainingToAllocate = item.quantityOrdered;
      const fromWarehouses: { warehouse: string; qty: number }[] = [];

      const productStockEntries = runningStock.filter(s => s.productCode === item.productCode && s.quantity > 0);
      productStockEntries.sort((a, b) => {
        if (isSpWarehouse) {
          const aSp = isSpWarehouse(a.warehouse);
          const bSp = isSpWarehouse(b.warehouse);
          if (aSp && !bSp) return -1;
          if (!aSp && bSp) return 1;
        }
        return b.quantity - a.quantity;
      });

      productStockEntries.forEach(stockEntry => {
        if (remainingToAllocate <= 0) return;

        const allocateQty = Math.min(stockEntry.quantity, remainingToAllocate);
        if (allocateQty > 0) {
          stockEntry.quantity -= allocateQty;
          remainingToAllocate -= allocateQty;
          
          fromWarehouses.push({
            warehouse: stockEntry.warehouse,
            qty: allocateQty
          });
        }
      });

      allocationMap[order.id][item.productCode] = {
        allocated: item.quantityOrdered - remainingToAllocate,
        fromWarehouses,
        missing: remainingToAllocate
      };
    });
  });

  return allocationMap;
}

// Helper function to calculate independent static allocation
function calculateStaticAllocation(ordersList: OrderHeader[], stockList: StockBalance[], isSpWarehouse?: (whName: string) => boolean) {
  const allocationMap: Record<string, Record<string, { allocated: number; fromWarehouses: { warehouse: string; qty: number }[]; missing: number }>> = {};

  ordersList.forEach(order => {
    allocationMap[order.id] = {};

    order.items.forEach(item => {
      const localStock = stockList.map(s => ({ ...s })).filter(s => s.productCode === item.productCode);
      let remainingToAllocate = item.quantityOrdered;
      const fromWarehouses: { warehouse: string; qty: number }[] = [];

      localStock.sort((a, b) => {
        if (isSpWarehouse) {
          const aSp = isSpWarehouse(a.warehouse);
          const bSp = isSpWarehouse(b.warehouse);
          if (aSp && !bSp) return -1;
          if (!aSp && bSp) return 1;
        }
        return b.quantity - a.quantity;
      });

      localStock.forEach(stockEntry => {
        if (remainingToAllocate <= 0) return;

        const allocateQty = Math.min(stockEntry.quantity, remainingToAllocate);
        if (allocateQty > 0) {
          remainingToAllocate -= allocateQty;
          fromWarehouses.push({
            warehouse: stockEntry.warehouse,
            qty: allocateQty
          });
        }
      });

      allocationMap[order.id][item.productCode] = {
        allocated: item.quantityOrdered - remainingToAllocate,
        fromWarehouses,
        missing: remainingToAllocate
      };
    });
  });

  return allocationMap;
}

interface DashboardProps {
  orders: OrderHeader[];
  stock: StockBalance[];
  warehouses: Warehouse[];
  products?: Product[];
}

export default function Dashboard({ orders, stock, warehouses, products }: DashboardProps) {
  // Scenario Toggle: 'orders' | 'items' | 'transfer'
  const [activeScenario, setActiveScenario] = useState<'orders' | 'items' | 'transfer'>('orders');
  
  // Expanded Order ID in list
  const [expandedOrderId, setExpandedOrderId] = useState<string>('');

  // Enable/Disable Chronological Reservation Simulation
  const [useReservationMode, setUseReservationMode] = useState<boolean>(true);

  // Search filter for Scenario 2 (Items view)
  const [itemSearch, setItemSearch] = useState<string>('');

  // Search filter for Miami transfer suggestions
  const [transferSearch, setTransferSearch] = useState<string>('');
  const [expandedTransferProducts, setExpandedTransferProducts] = useState<Record<string, boolean>>({});

  // Search filter for Unfulfilled items (no stock in SP nor Miami)
  const [unfulfilledSearch, setUnfulfilledSearch] = useState<string>('');
  const [expandedUnfulfilledProducts, setExpandedUnfulfilledProducts] = useState<Record<string, boolean>>({});

  // Selected filter for KPI click modal
  const [selectedFilterModal, setSelectedFilterModal] = useState<{
    row: 1 | 2;
    type: 'all' | 'complete' | 'partial' | 'blocked';
  } | null>(null);

  // Define warehouse group matches
  const isSaoPaulo = useCallback((group: string) => {
    const g = (group || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return g === 'sao paulo';
  }, []);

  const isMiami = useCallback((group: string) => {
    const g = (group || '').toLowerCase().trim();
    return g === 'miami';
  }, []);

  const isSpWarehouse = useCallback((whName: string) => {
    const wh = warehouses.find(w => w.name.toLowerCase().trim() === whName.toLowerCase().trim());
    return wh ? isSaoPaulo(wh.groupName) : false;
  }, [warehouses, isSaoPaulo]);

  // Filter stock for São Paulo group
  const spStock = useMemo(() => {
    return stock.filter(s => {
      const wh = warehouses.find(w => w.name.toLowerCase().trim() === s.warehouse.toLowerCase().trim());
      if (!wh) return false;
      return isSaoPaulo(wh.groupName);
    });
  }, [stock, warehouses, isSaoPaulo]);

  // Filter stock for São Paulo + Miami group combined
  const spMiamiStock = useMemo(() => {
    return stock.filter(s => {
      const wh = warehouses.find(w => w.name.toLowerCase().trim() === s.warehouse.toLowerCase().trim());
      if (!wh) return false;
      const g = wh.groupName;
      return isSaoPaulo(g) || isMiami(g);
    });
  }, [stock, warehouses, isSaoPaulo, isMiami]);

  const hasSpWarehouses = useMemo(() => warehouses.some(w => isSaoPaulo(w.groupName)), [warehouses, isSaoPaulo]);
  const hasMiamiWarehouses = useMemo(() => warehouses.some(w => isMiami(w.groupName)), [warehouses, isMiami]);

  // 1. Sort orders for simulation: Priority (Alta > Média > Baixa) and then Date (oldest first)
  const sortedOrdersForSimulation = useMemo(() => {
    const priorityWeight = { Alta: 3, Média: 2, Baixa: 1 };
    return [...orders].sort((a, b) => {
      // First by date (oldest first is fairest)
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Then by priority weight (higher first)
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });
  }, [orders]);

  // Sort orders by orderNumber for analytical board display
  const sortedOrdersByNumber = useMemo(() => {
    return [...orders].sort((a, b) => {
      return String(a.orderNumber).localeCompare(String(b.orderNumber), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [orders]);

  // 2. Allocation maps under São Paulo (Row 1)
  const spAllocation = useMemo(() => {
    return useReservationMode 
      ? calculateSimulatedAllocation(sortedOrdersForSimulation, spStock, isSpWarehouse) 
      : calculateStaticAllocation(orders, spStock, isSpWarehouse);
  }, [useReservationMode, sortedOrdersForSimulation, orders, spStock, isSpWarehouse]);

  // 3. Allocation maps under São Paulo + Miami (Row 2)
  const spMiamiAllocation = useMemo(() => {
    return useReservationMode 
      ? calculateSimulatedAllocation(sortedOrdersForSimulation, spMiamiStock, isSpWarehouse) 
      : calculateStaticAllocation(orders, spMiamiStock, isSpWarehouse);
  }, [useReservationMode, sortedOrdersForSimulation, orders, spMiamiStock, isSpWarehouse]);

  // Classify all orders using São Paulo (Row 1)
  const l1Classification = useMemo(() => {
    return classifyOrders(orders, spAllocation);
  }, [orders, spAllocation]);

  // Orders for Row 2 are those that are NOT complete in L1 (Partial + Blocked in SP)
  const ordersL2 = useMemo(() => {
    return [...l1Classification.partial, ...l1Classification.blocked];
  }, [l1Classification]);

  // Classify those pending orders using São Paulo + Miami (Row 2)
  const l2Classification = useMemo(() => {
    return classifyOrders(ordersL2, spMiamiAllocation);
  }, [ordersL2, spMiamiAllocation]);

  // Helper to compute total value of an array of orders
  const getOrdersTotalVal = useCallback((ordersList: OrderHeader[]) => {
    return ordersList.reduce((acc, order) => {
      const orderTotal = order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);
      return acc + orderTotal;
    }, 0);
  }, []);

  const l1Totals = useMemo(() => {
    return {
      all: getOrdersTotalVal(orders),
      complete: getOrdersTotalVal(l1Classification.complete),
      partial: getOrdersTotalVal(l1Classification.partial),
      blocked: getOrdersTotalVal(l1Classification.blocked),
    };
  }, [orders, l1Classification, getOrdersTotalVal]);

  const l2Totals = useMemo(() => {
    return {
      all: getOrdersTotalVal(ordersL2),
      complete: getOrdersTotalVal(l2Classification.complete),
      partial: getOrdersTotalVal(l2Classification.partial),
      blocked: getOrdersTotalVal(l2Classification.blocked),
    };
  }, [ordersL2, l2Classification, getOrdersTotalVal]);

  // Calculations for Scenario 2: Item aggregation (uses overall/total stock)
  const itemAggregation = useMemo(() => {
    const map: Record<string, { 
      productCode: string; 
      productName: string; 
      demanded: number; 
      stockByWarehouse: Record<string, number>;
      totalStock: number;
      ordersDemanding: { orderNumber: string; client: string; qty: number; priority: string }[];
    }> = {};

    // Get all unique products demanded in orders
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!map[item.productCode]) {
          map[item.productCode] = {
            productCode: item.productCode,
            productName: item.productName,
            demanded: 0,
            stockByWarehouse: {},
            totalStock: 0,
            ordersDemanding: []
          };
        }
        map[item.productCode].demanded += item.quantityOrdered;
        map[item.productCode].ordersDemanding.push({
          orderNumber: order.orderNumber,
          client: order.clientName,
          qty: item.quantityOrdered,
          priority: order.priority
        });
      });
    });

    // Match with current stock
    stock.forEach(s => {
      if (map[s.productCode]) {
        map[s.productCode].stockByWarehouse[s.warehouse] = (map[s.productCode].stockByWarehouse[s.warehouse] || 0) + s.quantity;
        map[s.productCode].totalStock += s.quantity;
      } else {
        map[s.productCode] = {
          productCode: s.productCode,
          productName: s.productName,
          demanded: 0,
          stockByWarehouse: { [s.warehouse]: s.quantity },
          totalStock: s.quantity,
          ordersDemanding: []
        };
      }
    });

    return Object.values(map);
  }, [orders, stock]);

  // Filtered items for Scenario 2
  const filteredItemAggregation = useMemo(() => {
    return itemAggregation.filter(item => 
      item.productName.toLowerCase().includes(itemSearch.toLowerCase()) ||
      item.productCode.toLowerCase().includes(itemSearch.toLowerCase())
    );
  }, [itemAggregation, itemSearch]);

  // Orders filtered for the details modal when clicking KPI cards
  const filteredOrdersForModal = useMemo(() => {
    if (!selectedFilterModal) return [];

    const { row, type } = selectedFilterModal;
    const classification = row === 1 ? l1Classification : l2Classification;

    let list: OrderHeader[] = [];
    if (type === 'all') {
      list = row === 1 ? orders : ordersL2;
    } else {
      list = classification[type] || [];
    }

    return [...list].sort((a, b) => {
      return String(a.orderNumber).localeCompare(String(b.orderNumber), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [orders, ordersL2, l1Classification, l2Classification, selectedFilterModal]);

  const modalTotalValue = useMemo(() => {
    return filteredOrdersForModal.reduce((sum, order) => {
      const orderTotal = order.items.reduce((acc, item) => acc + (item.quantityOrdered * item.unitPrice), 0);
      return sum + orderTotal;
    }, 0);
  }, [filteredOrdersForModal]);

  // Shared metrics for all products, computing stock coverage deficits, miami stock, and orders demand
  const productStockMetrics = useMemo<Record<string, {
    productCode: string;
    productName: string;
    saldoSP: number;
    avgQty3x: number;
    coverageQty: number;
    miamiStock: number;
    orderDemandQty: number;
    actualCoverageTransfer: number;
    coverageDeficit: number;
    totalToTransfer: number;
  }>>(() => {
    const metrics: Record<string, {
      productCode: string;
      productName: string;
      saldoSP: number;
      avgQty3x: number;
      coverageQty: number;
      miamiStock: number;
      orderDemandQty: number;
      actualCoverageTransfer: number;
      coverageDeficit: number;
      totalToTransfer: number;
    }> = {};

    const productsList = products || [];

    // 1. Get SP stock and Miami stock for each product code
    const getSaldoSP = (prodCode: string) => {
      return spStock
        .filter(s => s.productCode === prodCode)
        .reduce((sum, s) => sum + s.quantity, 0);
    };

    const getMiamiStock = (prodCode: string) => {
      return stock
        .filter(s => {
          if (s.productCode !== prodCode) return false;
          const wh = warehouses.find(w => w.name.toLowerCase().trim() === s.warehouse.toLowerCase().trim());
          return wh ? isMiami(wh.groupName) : false;
        })
        .reduce((sum, s) => sum + s.quantity, 0);
    };

    // Initialize metrics for all registered products
    productsList.forEach(product => {
      const sSP = getSaldoSP(product.code);
      const avg = product.avgQty3x || 0;
      const cov = sSP < avg ? (avg - sSP) : 0;
      const mMiami = getMiamiStock(product.code);

      metrics[product.code] = {
        productCode: product.code,
        productName: product.name,
        saldoSP: sSP,
        avgQty3x: avg,
        coverageQty: cov,
        miamiStock: mMiami,
        orderDemandQty: 0,
        actualCoverageTransfer: 0,
        coverageDeficit: 0,
        totalToTransfer: 0
      };
    });

    // 2. Compute orderDemandQty (how much is allocated from Miami for orders in L2)
    ordersL2.forEach(order => {
      const orderId = order.id;
      const itemAllocations = spMiamiAllocation[orderId] as Record<string, any>;
      if (!itemAllocations) return;

      Object.entries(itemAllocations).forEach(([productCode, alloc]) => {
        const miamiFws = alloc.fromWarehouses.filter((fw: any) => {
          const wh = warehouses.find(w => w.name.toLowerCase().trim() === fw.warehouse.toLowerCase().trim());
          return wh ? isMiami(wh.groupName) : false;
        });

        const qtyAllocated = miamiFws.reduce((sum: number, fw: any) => sum + fw.qty, 0);
        if (qtyAllocated > 0) {
          // If product wasn't initialized (e.g. not in products list), initialize it now
          if (!metrics[productCode]) {
            const sSP = getSaldoSP(productCode);
            const mMiami = getMiamiStock(productCode);
            
            // Find name
            let pName = productCode;
            const stockItem = stock.find(s => s.productCode === productCode);
            if (stockItem) pName = stockItem.productName;

            metrics[productCode] = {
              productCode,
              productName: pName,
              saldoSP: sSP,
              avgQty3x: 0,
              coverageQty: 0,
              miamiStock: mMiami,
              orderDemandQty: 0,
              actualCoverageTransfer: 0,
              coverageDeficit: 0,
              totalToTransfer: 0
            };
          }
          metrics[productCode].orderDemandQty += qtyAllocated;
        }
      });
    });

    // 3. Compute final coverage metrics and totals
    Object.keys(metrics).forEach(code => {
      const m = metrics[code];
      const remainingMiami = Math.max(0, m.miamiStock - m.orderDemandQty);
      m.actualCoverageTransfer = Math.min(remainingMiami, m.coverageQty);
      m.coverageDeficit = m.coverageQty - m.actualCoverageTransfer;
      m.totalToTransfer = m.orderDemandQty + m.actualCoverageTransfer;
    });

    return metrics;
  }, [products, stock, warehouses, spStock, ordersL2, spMiamiAllocation, isMiami, isSaoPaulo]);

  // List of Miami transfers required to fulfill Linha 2 (total or partial)
  const miamiTransfers = useMemo(() => {
    const map: Record<string, {
      productCode: string;
      productName: string;
      totalToTransfer: number;
      totalValue: number;
      unitPrice: number;
      byOrder: {
        orderId: string;
        orderNumber: string;
        clientName: string;
        qtyDemanded: number;
        qtyAllocatedFromMiami: number;
        unitPrice: number;
        totalPrice: number;
        orderStatusInSP: 'complete' | 'partial' | 'blocked';
        orderStatusWithMiami: 'complete' | 'partial' | 'blocked';
        priority: 'Alta' | 'Média' | 'Baixa';
      }[];
      saldoSP?: number;
      avgQty3x?: number;
      coverageQty?: number;
      orderDemandQty?: number;
    }> = {};

    // Helper to find unitPrice
    const getProductUnitPrice = (prodCode: string) => {
      let unitPrice = 0;
      const miamiStockItem = stock.find(s => {
        if (s.productCode !== prodCode || s.pr_preco === undefined) return false;
        const wh = warehouses.find(w => w.name.toLowerCase().trim() === s.warehouse.toLowerCase().trim());
        return wh ? isMiami(wh.groupName) : false;
      });

      if (miamiStockItem && miamiStockItem.pr_preco !== undefined) {
        unitPrice = miamiStockItem.pr_preco;
      } else {
        const anyStockItem = stock.find(s => s.productCode === prodCode && s.pr_preco !== undefined);
        if (anyStockItem && anyStockItem.pr_preco !== undefined) {
          unitPrice = anyStockItem.pr_preco;
        } else {
          // Find any order item
          for (const ord of orders) {
            const item = ord.items.find(i => i.productCode === prodCode);
            if (item) {
              unitPrice = item.unitPrice;
              break;
            }
          }
        }
      }
      return unitPrice;
    };

    // Populate using our pre-computed metrics
    Object.keys(productStockMetrics).forEach(code => {
      const m = productStockMetrics[code];
      if (m.totalToTransfer > 0) {
        const unitPrice = getProductUnitPrice(m.productCode);
        map[m.productCode] = {
          productCode: m.productCode,
          productName: m.productName,
          totalToTransfer: m.totalToTransfer,
          totalValue: m.totalToTransfer * unitPrice,
          unitPrice,
          byOrder: [],
          saldoSP: m.saldoSP,
          avgQty3x: m.avgQty3x,
          coverageQty: m.actualCoverageTransfer, // Only suggest what we can actually transfer
          orderDemandQty: m.orderDemandQty
        };
      }
    });

    // Second pass: Add active orders to `byOrder` array for products in the map
    ordersL2.forEach(order => {
      const orderId = order.id;
      const itemAllocations = spMiamiAllocation[orderId] as Record<string, any>;
      if (!itemAllocations) return;

      const statusSP = getOrderStatus(order, spAllocation);
      const statusSPMiami = getOrderStatus(order, spMiamiAllocation);

      Object.entries(itemAllocations).forEach(([productCode, alloc]) => {
        const miamiFws = alloc.fromWarehouses.filter((fw: any) => {
          const wh = warehouses.find(w => w.name.toLowerCase().trim() === fw.warehouse.toLowerCase().trim());
          return wh ? isMiami(wh.groupName) : false;
        });

        miamiFws.forEach((fw: any) => {
          const qty = fw.qty;
          if (qty > 0 && map[productCode]) {
            const orderItem = order.items.find(i => i.productCode === productCode);
            map[productCode].byOrder.push({
              orderId,
              orderNumber: order.orderNumber,
              clientName: order.clientName,
              qtyDemanded: orderItem ? orderItem.quantityOrdered : 0,
              qtyAllocatedFromMiami: qty,
              unitPrice: map[productCode].unitPrice,
              totalPrice: qty * map[productCode].unitPrice,
              orderStatusInSP: statusSP,
              orderStatusWithMiami: statusSPMiami,
              priority: order.priority as 'Alta' | 'Média' | 'Baixa'
            });
          }
        });
      });
    });

    return Object.values(map);
  }, [productStockMetrics, spMiamiAllocation, orders, ordersL2, spAllocation, warehouses, isMiami, stock]);

  // Filtered transfer suggestions based on transferSearch
  const filteredMiamiTransfers = useMemo(() => {
    return miamiTransfers.filter(item => 
      item.productName.toLowerCase().includes(transferSearch.toLowerCase()) ||
      item.productCode.toLowerCase().includes(transferSearch.toLowerCase())
    );
  }, [miamiTransfers, transferSearch]);

  // Totals for transfers summary cards
  const transferSummaryTotals = useMemo(() => {
    let uniqueProductsCount = miamiTransfers.length;
    let totalQty = 0;
    let totalVal = 0;
    const uniqueOrders = new Set<string>();

    miamiTransfers.forEach(t => {
      totalQty += t.totalToTransfer;
      totalVal += t.totalValue;
      t.byOrder.forEach(o => uniqueOrders.add(o.orderId));
    });

    return {
      uniqueProductsCount,
      totalQty,
      totalVal,
      uniqueOrdersCount: uniqueOrders.size
    };
  }, [miamiTransfers]);

  // Calculations for completely Unfulfilled Items (no stock in SP and no stock in Miami)
  const unfulfilledItems = useMemo(() => {
    const map: Record<string, {
      productCode: string;
      productName: string;
      totalMissing: number;
      totalValue: number;
      unitPrice: number;
      byOrder: {
        orderId: string;
        orderNumber: string;
        clientName: string;
        qtyDemanded: number;
        qtyMissing: number;
        unitPrice: number;
        totalPrice: number;
        orderStatusInSP: 'complete' | 'partial' | 'blocked';
        orderStatusWithMiami: 'complete' | 'partial' | 'blocked';
        priority: 'Alta' | 'Média' | 'Baixa';
      }[];
      coverageDeficit?: number;
      saldoSP?: number;
      avgQty3x?: number;
    }> = {};

    // Helper to find unitPrice
    const getProductUnitPrice = (prodCode: string) => {
      let unitPrice = 0;
      const anyStockItem = stock.find(s => s.productCode === prodCode && s.pr_preco !== undefined);
      if (anyStockItem && anyStockItem.pr_preco !== undefined) {
        unitPrice = anyStockItem.pr_preco;
      } else {
        for (const ord of orders) {
          const item = ord.items.find(i => i.productCode === prodCode);
          if (item) {
            unitPrice = item.unitPrice;
            break;
          }
        }
      }
      return unitPrice;
    };

    // First: Populate map with items that have a coverageDeficit (preventive coverage shortage not coverable by Miami)
    Object.keys(productStockMetrics).forEach(code => {
      const m = productStockMetrics[code];
      if (m.coverageDeficit > 0) {
        const unitPrice = getProductUnitPrice(m.productCode);
        map[m.productCode] = {
          productCode: m.productCode,
          productName: m.productName,
          totalMissing: m.coverageDeficit,
          totalValue: m.coverageDeficit * unitPrice,
          unitPrice,
          byOrder: [],
          coverageDeficit: m.coverageDeficit,
          saldoSP: m.saldoSP,
          avgQty3x: m.avgQty3x
        };
      }
    });

    // Second: Add actual unfulfilled order quantities
    ordersL2.forEach(order => {
      const orderId = order.id;
      const itemAllocations = spMiamiAllocation[orderId] as Record<string, any>;
      if (!itemAllocations) return;

      const statusSP = getOrderStatus(order, spAllocation);
      const statusSPMiami = getOrderStatus(order, spMiamiAllocation);

      Object.entries(itemAllocations).forEach(([productCode, alloc]) => {
        const qty = alloc.missing;
        if (qty > 0) {
          const unitPrice = getProductUnitPrice(productCode);
          
          if (!map[productCode]) {
            const metrics = productStockMetrics[productCode];
            map[productCode] = {
              productCode,
              productName: metrics?.productName || productCode,
              totalMissing: 0,
              totalValue: 0,
              unitPrice,
              byOrder: [],
              coverageDeficit: metrics?.coverageDeficit || 0,
              saldoSP: metrics?.saldoSP,
              avgQty3x: metrics?.avgQty3x
            };
          }

          map[productCode].totalMissing += qty;
          map[productCode].totalValue += (qty * unitPrice);
          map[productCode].byOrder.push({
            orderId,
            orderNumber: order.orderNumber,
            clientName: order.clientName,
            qtyDemanded: order.items.find(i => i.productCode === productCode)?.quantityOrdered || 0,
            qtyMissing: qty,
            unitPrice,
            totalPrice: qty * unitPrice,
            orderStatusInSP: statusSP,
            orderStatusWithMiami: statusSPMiami,
            priority: order.priority as 'Alta' | 'Média' | 'Baixa'
          });
        }
      });
    });

    return Object.values(map);
  }, [productStockMetrics, spMiamiAllocation, orders, ordersL2, spAllocation, stock]);

  // Filtered unfulfilled items based on unfulfilledSearch
  const filteredUnfulfilledItems = useMemo(() => {
    return unfulfilledItems.filter(item => 
      item.productName.toLowerCase().includes(unfulfilledSearch.toLowerCase()) ||
      item.productCode.toLowerCase().includes(unfulfilledSearch.toLowerCase())
    );
  }, [unfulfilledItems, unfulfilledSearch]);

  // Totals for unfulfilled summary cards
  const unfulfilledSummaryTotals = useMemo(() => {
    let uniqueProductsCount = unfulfilledItems.length;
    let totalQty = 0;
    let totalVal = 0;
    const uniqueOrders = new Set<string>();

    unfulfilledItems.forEach(t => {
      totalQty += t.totalMissing;
      totalVal += t.totalValue;
      t.byOrder.forEach(o => uniqueOrders.add(o.orderId));
    });

    return {
      uniqueProductsCount,
      totalQty,
      totalVal,
      uniqueOrdersCount: uniqueOrders.size
    };
  }, [unfulfilledItems]);

  return (
    <div className="space-y-6">
      {/* Upper Navigation and Description */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            Dashboard de Expedição
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Análise dinâmica de saldo de estoque por depósito vs. pedidos em carteira para liberação.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-100 p-1 rounded-lg self-start md:self-center">
          <button
            onClick={() => setActiveScenario('orders')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeScenario === 'orders'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            Cenário 1: Visão por Pedido
          </button>
          <button
            onClick={() => setActiveScenario('items')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeScenario === 'items'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="h-4 w-4" />
            Cenário 2: Visão por Item
          </button>
          <button
            onClick={() => setActiveScenario('transfer')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeScenario === 'transfer'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="h-4 w-4" />
            Transferência de Miami
          </button>
        </div>
      </div>      {/* Informative Escalated Allocation Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
            <Building className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Modelo de Distribuição de Estoque Escalonado</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              <strong>Linha 1 (São Paulo):</strong> Analisa a liberação dos pedidos usando apenas o estoque do grupo de São Paulo.<br />
              <strong>Linha 2 (São Paulo + Miami):</strong> Analisa o atendimento dos pedidos pendentes somando o grupo de Miami ao estoque.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-xs text-slate-600 max-w-sm">
          <Info className="h-4 w-4 text-indigo-500 shrink-0" />
          <span>Filtro manual de grupos removido. A escala logística é encadeada e automatizada por padrão.</span>
        </div>
      </div>

      {/* Warning banner if São Paulo or Miami have no stock/warehouses linked yet */}
      {(!hasSpWarehouses || !hasMiamiWarehouses) && (
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Aviso de Configuração de Depósitos</h4>
            <p className="text-xs text-amber-700 leading-normal">
              Para o correto funcionamento do escalonamento de estoque, associe os depósitos ativos aos seus respectivos grupos:
            </p>
            <ul className="text-xs text-amber-700 list-disc pl-4 space-y-1 mt-1">
              {!hasSpWarehouses && (
                <li>Nenhum depósito associado ao grupo <strong className="text-amber-900">"São Paulo"</strong> (Linha 1).</li>
              )}
              {!hasMiamiWarehouses && (
                <li>Nenhum depósito associado ao grupo <strong className="text-amber-900">"Miami"</strong> (Linha 2).</li>
              )}
            </ul>
            <p className="text-xs text-amber-600/90 mt-1.5 pt-1.5 border-t border-amber-200/50">
              💡 Para ajustar, acesse a aba <strong>Estoque e Depósitos</strong>, clique em <strong>"Gerenciar Depósitos"</strong> e configure a coluna <strong>Grupo de Depósito</strong> exatamente como "São Paulo" ou "Miami".
            </p>
          </div>
        </div>
      )}

      {/* KPI mini-cards double row */}
      <div className="space-y-6">
        {/* Row 1: São Paulo KPIs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
              Linha 1: Atendidos p/ São Paulo (Estoque Local)
            </span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 1, type: 'all' })}
              className="bg-white hover:bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Pedidos</span>
                <span className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">{orders.length}</span>
                  <span className="text-xs text-slate-400">em carteira</span>
                </div>
                <div className="text-xs font-bold text-slate-600">
                  $ {l1Totals.all.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 1, type: 'complete' })}
              className="bg-emerald-50 hover:bg-emerald-100/70 rounded-xl border border-emerald-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Prontos p/ Liberar</span>
                <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-800">{l1Classification.complete.length}</span>
                  <span className="text-xs text-emerald-600 font-medium">
                    {orders.length ? Math.round((l1Classification.complete.length / orders.length) * 100) : 0}% do total
                  </span>
                </div>
                <div className="text-xs font-bold text-emerald-700">
                  $ {l1Totals.complete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 1, type: 'partial' })}
              className="bg-amber-50 hover:bg-amber-100/70 rounded-xl border border-amber-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Atendimento Parcial</span>
                <span className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-800">{l1Classification.partial.length}</span>
                  <span className="text-xs text-amber-600 font-medium">
                    {orders.length ? Math.round((l1Classification.partial.length / orders.length) * 100) : 0}% do total
                  </span>
                </div>
                <div className="text-xs font-bold text-amber-700">
                  $ {l1Totals.partial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 1, type: 'blocked' })}
              className="bg-rose-50 hover:bg-rose-100/70 rounded-xl border border-rose-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Bloqueados/Falta</span>
                <span className="p-1.5 bg-rose-100 rounded-lg text-rose-700">
                  <XCircle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-800">{l1Classification.blocked.length}</span>
                  <span className="text-xs text-rose-600 font-medium">
                    {orders.length ? Math.round((l1Classification.blocked.length / orders.length) * 100) : 0}% do total
                  </span>
                </div>
                <div className="text-xs font-bold text-rose-700">
                  $ {l1Totals.blocked.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Row 2: Combined SP + Miami KPIs */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-md">
              Linha 2: Atendidos c/ Miami (Escalonamento de Pendentes da Linha 1)
            </span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 2, type: 'all' })}
              className="bg-white hover:bg-slate-50 rounded-xl border border-slate-200 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Pedidos Pendentes</span>
                <span className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">{ordersL2.length}</span>
                  <span className="text-xs text-slate-400">da Linha 1</span>
                </div>
                <div className="text-xs font-bold text-slate-600">
                  $ {l2Totals.all.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 2, type: 'complete' })}
              className="bg-emerald-50 hover:bg-emerald-100/70 rounded-xl border border-emerald-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Prontos p/ Liberar (c/ Miami)</span>
                <span className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-800">{l2Classification.complete.length}</span>
                  <span className="text-xs text-emerald-600 font-medium">
                    {ordersL2.length ? Math.round((l2Classification.complete.length / ordersL2.length) * 100) : 0}% dos pendentes
                  </span>
                </div>
                <div className="text-xs font-bold text-emerald-700">
                  $ {l2Totals.complete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 2, type: 'partial' })}
              className="bg-amber-50 hover:bg-amber-100/70 rounded-xl border border-amber-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Atendimento Parcial (c/ Miami)</span>
                <span className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-800">{l2Classification.partial.length}</span>
                  <span className="text-xs text-amber-600 font-medium">
                    {ordersL2.length ? Math.round((l2Classification.partial.length / ordersL2.length) * 100) : 0}% dos pendentes
                  </span>
                </div>
                <div className="text-xs font-bold text-amber-700">
                  $ {l2Totals.partial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedFilterModal({ row: 2, type: 'blocked' })}
              className="bg-rose-50 hover:bg-rose-100/70 rounded-xl border border-rose-100 p-4 shadow-2xs text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Bloqueados/Falta (c/ Miami)</span>
                <span className="p-1.5 bg-rose-100 rounded-lg text-rose-700">
                  <XCircle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-800">{l2Classification.blocked.length}</span>
                  <span className="text-xs text-rose-600 font-medium">
                    {ordersL2.length ? Math.round((l2Classification.blocked.length / ordersL2.length) * 100) : 0}% dos pendentes
                  </span>
                </div>
                <div className="text-xs font-bold text-rose-700">
                  $ {l2Totals.blocked.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Scenario 1: Visão por Pedido (Unified Expandable List) */}
      {activeScenario === 'orders' && (
        <div className="space-y-4">
          
          {/* Header Controls and Simulation Toggle */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Lista de Pedidos e Disponibilidade Escalonada</h3>
              <p className="text-xs text-slate-500">
                Selecione ou clique em qualquer pedido para expandir e conferir as guias de picking detalhadas em São Paulo vs. Miami.
              </p>
            </div>

            {/* Chronological Toggle Card */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs flex items-center gap-4 max-w-sm shrink-0">
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-700 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                  Reserva Cronológica
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  {useReservationMode ? "Simula ordem sequencial por prioridade." : "Modo isolado sem dedução."}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  type="checkbox" 
                  checked={useReservationMode} 
                  onChange={(e) => setUseReservationMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:width-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Unified Expandable Orders List */}
          {sortedOrdersByNumber.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
              Nenhum pedido cadastrado em carteira no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedOrdersByNumber.map((ord) => {
                const isExpanded = expandedOrderId === ord.id;
                
                // Get Status SP (Row 1)
                const statusSP = getOrderStatus(ord, spAllocation);
                // Get Status SP + Miami (Row 2)
                const statusSPMiami = getOrderStatus(ord, spMiamiAllocation);

                const ordTotal = ord.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);

                return (
                  <div 
                    key={ord.id} 
                    id={`order-card-${ord.id}`}
                    className={`bg-white rounded-xl border transition-all duration-200 overflow-hidden ${
                      isExpanded 
                        ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/20' 
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Clickable Card Header */}
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(prev => prev === ord.id ? '' : ord.id)}
                      className="w-full text-left p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/20 transition-colors"
                    >
                      {/* Left Block: Meta */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-slate-900 text-sm">{ord.orderNumber}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            ord.priority === 'Alta' 
                              ? 'bg-rose-100 text-rose-700' 
                              : ord.priority === 'Média' 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            Prioridade {ord.priority}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(ord.date).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md font-mono flex items-center gap-1 shrink-0">
                            Total: $ {ordTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 truncate max-w-lg">
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                          {ord.clientName}
                        </h4>
                      </div>

                      {/* Middle Block: Status Comparison */}
                      <div className="flex items-center gap-3 shrink-0 flex-wrap">
                        {/* Status SP (L1) */}
                        <div className="flex flex-col items-start md:items-end">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Atendimento SP (L1)</span>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                            statusSP === 'complete' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : statusSP === 'partial' 
                                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            <span>
                              {statusSP === 'complete' && '✓ Completo SP'}
                              {statusSP === 'partial' && '⚠ Parcial SP'}
                              {statusSP === 'blocked' && '✗ Falta SP'}
                            </span>
                          </span>
                        </div>

                        {/* Arrow */}
                        <span className="text-slate-300 hidden md:inline">➔</span>

                        {/* Status SP + Miami (L2) */}
                        <div className="flex flex-col items-start md:items-end">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Com Miami (L2)</span>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                            statusSP === 'complete'
                              ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 line-through'
                              : statusSPMiami === 'complete' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold shadow-xs' 
                                : statusSPMiami === 'partial' 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            <span>
                              {statusSP === 'complete' ? 'Resolvido em SP' : (
                                <>
                                  {statusSPMiami === 'complete' && '✓ Pronto (SP+M)'}
                                  {statusSPMiami === 'partial' && '⚠ Parcial (SP+M)'}
                                  {statusSPMiami === 'blocked' && '✗ Falta (SP+M)'}
                                </>
                              )}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Right Block: Expansion indicator */}
                      <div className="shrink-0 pl-1">
                        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Expandable Content Area */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/40 p-5 space-y-4">
                        {ord.notes && (
                          <div className="p-3 bg-white border border-slate-100 rounded-lg text-xs text-slate-600">
                            <strong className="text-slate-700 font-semibold">Observações do Pedido:</strong> {ord.notes}
                          </div>
                        )}

                        {/* Items List Section */}
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Detalhamento e Alocação dos Itens ({ord.items.length})</h5>
                          <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                            Demanda: {ord.items.reduce((sum, item) => sum + item.quantityOrdered, 0)} un
                          </span>
                        </div>

                        {/* Items Grid/List */}
                        <div className="space-y-4">
                          {ord.items.map((item) => {
                            const allocSPItem = spAllocation[ord.id]?.[item.productCode];
                            const allocSPMiamiItem = spMiamiAllocation[ord.id]?.[item.productCode];

                            const missingSP = allocSPItem ? allocSPItem.missing : item.quantityOrdered;
                            const allocatedSP = allocSPItem ? allocSPItem.allocated : 0;

                            const missingSPM = allocSPMiamiItem ? allocSPMiamiItem.missing : item.quantityOrdered;
                            const allocatedSPM = allocSPMiamiItem ? allocSPMiamiItem.allocated : 0;

                            const overallStock = stock
                              .filter(s => s.productCode === item.productCode)
                              .reduce((sum, curr) => sum + curr.quantity, 0);

                            return (
                              <div key={item.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-2xs space-y-3">
                                {/* Item Metadata */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-50 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{item.productCode}</span>
                                    <span className="text-sm font-semibold text-slate-800">{item.productName}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                    <span>Pedida: <strong className="text-slate-700">{item.quantityOrdered} un</strong></span>
                                    <span>Total: <strong className="text-slate-800">$ {(item.quantityOrdered * item.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                                  </div>
                                </div>

                                {/* SP vs SP+Miami Escalation Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Step 1: SP Group */}
                                  <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-150 space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Etapa 1: Estoque São Paulo</span>
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        missingSP === 0 
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                          : allocatedSP > 0 
                                            ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                                      }`}>
                                        {missingSP === 0 ? 'Disponível' : (allocatedSP > 0 ? 'Parcial' : 'Sem Saldo')}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-slate-500">Reservado em SP:</span>
                                      <strong className={missingSP === 0 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                                        {allocatedSP} de {item.quantityOrdered} un
                                      </strong>
                                    </div>

                                    {/* Picking instructions SP */}
                                    {allocatedSP > 0 && allocSPItem && (
                                      <div className="bg-white p-2 rounded border border-slate-100 font-mono text-[10px] text-slate-600 space-y-1">
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Picking São Paulo:</div>
                                        {allocSPItem.fromWarehouses.map((wh, idx) => (
                                          <div key={idx} className="flex justify-between">
                                            <span className="truncate max-w-[120px]">{wh.warehouse.split(' - ')[0]}:</span>
                                            <strong>Retirar {wh.qty} un</strong>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {missingSP > 0 && (
                                      <div className="text-[10px] text-rose-600 font-medium pt-1">
                                        ⚠ Faltam {missingSP} un neste grupo.
                                      </div>
                                    )}
                                  </div>

                                  {/* Step 2: SP + Miami Combined */}
                                  <div className={`rounded-lg p-3 border space-y-2 ${
                                    missingSP === 0 
                                      ? 'bg-slate-100/30 border-slate-200 opacity-65' 
                                      : 'bg-indigo-50/20 border-indigo-100'
                                  }`}>
                                    <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5">
                                      <span className="text-[10px] font-bold text-indigo-950 uppercase tracking-wider">Etapa 2: Estoque SP + Miami</span>
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        missingSP === 0
                                          ? 'bg-slate-200 text-slate-600'
                                          : missingSPM === 0 
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold' 
                                            : allocatedSPM > 0 
                                              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                              : 'bg-rose-50 text-rose-700 border border-rose-100'
                                      }`}>
                                        {missingSP === 0 ? 'Resolvido em SP' : (missingSPM === 0 ? 'Disponível c/ Miami' : (allocatedSPM > 0 ? 'Parcial c/ Miami' : 'Sem Saldo'))}
                                      </span>
                                    </div>

                                    {missingSP === 0 ? (
                                      <div className="text-xs text-slate-400 italic py-2">
                                        Liberado totalmente em São Paulo. Não requer saldo complementar de Miami.
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-slate-500">Reservado Total (SP+M):</span>
                                          <strong className={missingSPM === 0 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                                            {allocatedSPM} de {item.quantityOrdered} un
                                          </strong>
                                        </div>

                                        {/* Picking instructions SP + Miami combined */}
                                        {allocatedSPM > 0 && allocSPMiamiItem && (
                                          <div className="bg-white p-2 rounded border border-slate-150 font-mono text-[10px] text-slate-600 space-y-1">
                                            <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-wide">Picking Combinado (SP + Miami):</div>
                                            {allocSPMiamiItem.fromWarehouses.map((wh, idx) => (
                                              <div key={idx} className="flex justify-between">
                                                <span className="truncate max-w-[120px]">{wh.warehouse.split(' - ')[0]}:</span>
                                                <strong>Retirar {wh.qty} un</strong>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {missingSPM > 0 && (
                                          <div className="text-[10px] text-rose-600 font-medium pt-1">
                                            ⚠ Faltam {missingSPM} un mesmo combinando o estoque de Miami.
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scenario 2: Visão por Itens */}
      {activeScenario === 'items' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          
          {/* Header Controls for Item Scenario */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Demanda Consolidada de Itens</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Relação de todos os produtos exigidos nos pedidos abertos e sua cobertura total de estoque geral.
              </p>
            </div>
            
            {/* Search Input */}
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Buscar por item ou código..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
              />
            </div>
          </div>

          {/* Aggregated Items Table */}
          <div className="overflow-x-auto">
            {filteredItemAggregation.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Nenhum item localizado com os filtros aplicados.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                    <th className="px-6 py-3">Produto</th>
                    <th className="px-6 py-3 text-center">Demanda Total Pedida</th>
                    <th className="px-6 py-3 text-center">Saldo Estoque Total</th>
                    <th className="px-6 py-3 text-center">Balanço Geral (Saldo - Pedido)</th>
                    <th className="px-6 py-3">Distribuição por Depósito / Pedidos Solicitantes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredItemAggregation.map((agg) => {
                    const balance = agg.totalStock - agg.demanded;
                    const coveragePct = agg.demanded > 0 ? Math.min(100, Math.round((agg.totalStock / agg.demanded) * 100)) : 100;
                    
                    let balanceStatus: 'success' | 'warning' | 'error' = 'success';
                    if (balance < 0) {
                      balanceStatus = agg.totalStock > 0 ? 'warning' : 'error';
                    }

                    return (
                      <tr key={agg.productCode} className="hover:bg-slate-50/50 transition-colors align-top">
                        {/* Column 1: Product info */}
                        <td className="px-6 py-4">
                          <div className="font-mono text-xs font-bold text-indigo-600">{agg.productCode}</div>
                          <div className="font-semibold text-slate-800 mt-0.5">{agg.productName}</div>
                        </td>

                        {/* Column 2: Total Demanded */}
                        <td className="px-6 py-4 text-center font-bold text-slate-700">
                          {agg.demanded} <span className="text-xs font-normal text-slate-400">un</span>
                        </td>

                        {/* Column 3: Total Stock */}
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-slate-700">{agg.totalStock} <span className="text-xs font-normal text-slate-400">un</span></span>
                          {agg.demanded > 0 && (
                            <div className="w-24 mx-auto mt-1.5">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                                <span>Atendimento:</span>
                                <span className={coveragePct === 100 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{coveragePct}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    coveragePct === 100 
                                      ? 'bg-emerald-500' 
                                      : coveragePct > 0 
                                        ? 'bg-amber-500' 
                                        : 'bg-rose-500'
                                  }`} 
                                  style={{ width: `${coveragePct}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Column 4: Balance */}
                        <td className="px-6 py-4 text-center">
                          {balance >= 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 font-semibold text-xs px-2.5 py-1 rounded-md border border-emerald-200">
                              +{balance} un sobressalente
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 font-semibold text-xs px-2.5 py-1 rounded-md border ${
                              balanceStatus === 'warning'
                                ? 'text-amber-700 bg-amber-50 border-amber-200'
                                : 'text-rose-700 bg-rose-50 border-rose-200'
                            }`}>
                              {balance} un (FALTA)
                            </span>
                          )}
                        </td>

                        {/* Column 5: Warehouse breakdown + orders */}
                        <td className="px-6 py-4 space-y-3">
                          {/* Warehouse inventory distribution */}
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Building className="h-3 w-3 text-slate-400" />
                              Saldos por Depósito
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(agg.stockByWarehouse).length === 0 ? (
                                <span className="text-xs text-slate-400 italic">Sem saldo cadastrado em depósitos.</span>
                              ) : (
                                Object.entries(agg.stockByWarehouse).map(([wh, qty]) => (
                                  <span key={wh} className="inline-flex items-center text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                    {wh.split(' - ')[0]}: <strong className="text-slate-800 ml-1">{qty} un</strong>
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Orders demanding this item */}
                          {agg.ordersDemanding.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <FileText className="h-3 w-3 text-slate-400" />
                                Pedidos Necessitados ({agg.ordersDemanding.length})
                              </div>
                              <div className="space-y-1">
                                {agg.ordersDemanding.map((ord, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs bg-indigo-50/40 p-1.5 rounded border border-indigo-100 max-w-md">
                                    <span className="font-mono font-bold text-indigo-950">{ord.orderNumber}</span>
                                    <span className="text-slate-600 text-[11px] truncate max-w-[150px]">{ord.client}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] font-semibold px-1.5 rounded ${
                                        ord.priority === 'Alta' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                                      }`}>{ord.priority}</span>
                                      <strong className="text-indigo-900 font-mono">{ord.qty} un</strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Scenario 3: Miami Transfer Suggestions */}
      {activeScenario === 'transfer' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Produtos Distintos</span>
                <span className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Package className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-800">{transferSummaryTotals.uniqueProductsCount}</div>
                <div className="text-xs text-slate-500 mt-1">itens ativos para transferência</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Quantidade Geral</span>
                <span className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <ArrowLeftRight className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-800">{transferSummaryTotals.totalQty} <span className="text-xs font-normal text-slate-400">un</span></div>
                <div className="text-xs text-slate-500 mt-1">total de unidades físicas a mover</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Valor Estimado</span>
                <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-emerald-700">
                  $ {transferSummaryTotals.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div className="text-xs text-slate-500 mt-1">valor fob estimado do estoque</div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Pedidos Beneficiados</span>
                <span className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-800">{transferSummaryTotals.uniqueOrdersCount}</div>
                <div className="text-xs text-slate-500 mt-1">pedidos que serão faturados</div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header / Search / Copy-CSV */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Plano de Picking e Transferência de Miami</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consulte a lista exata de itens e quantidades para expedir de Miami e receber em São Paulo para atender os pedidos.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Search */}
                <div className="relative max-w-xs w-full">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Filtrar item de Miami..."
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                  />
                </div>

                {/* CSV / Copy Button */}
                <button
                  type="button"
                  onClick={() => {
                    const csvRows = [];
                    // Adiciona BOM UTF-8 para o Excel reconhecer acentuação corretamente em português
                    csvRows.push("\uFEFF");
                    
                    // Cabeçalho da planilha
                    csvRows.push("Código Produto;Nome Produto;Quantidade a Transferir;Preço Unitário FOB ($);Valor FOB Estimado ($);Pedidos Impactados\n");
                    
                    miamiTransfers.forEach(item => {
                      const ordersStr = item.byOrder.map(o => `${o.orderNumber} (${o.qtyAllocatedFromMiami}un)`).join(', ');
                      // Limpar possíveis pontos-e-vírgula nos nomes para não quebrar colunas
                      const cleanName = item.productName.replace(/;/g, ' ');
                      const cleanOrders = ordersStr.replace(/;/g, ' ');
                      const formattedUnitPrice = item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                      const formattedValue = item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                      csvRows.push(`${item.productCode};${cleanName};${item.totalToTransfer};${formattedUnitPrice};${formattedValue};${cleanOrders}\n`);
                    });
                    
                    const csvContent = csvRows.join("");
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `transferencia_miami_sp_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Baixar Planilha Excel (.csv)
                </button>
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto">
              {filteredMiamiTransfers.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  {transferSearch ? "Nenhum item com esse filtro na lista de transferência." : "Nenhum item de Miami precisa ser transferido nas simulações atuais."}
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                      <th className="px-6 py-3">Produto</th>
                      <th className="px-6 py-3 text-center">Quantidade Necessária de Miami</th>
                      <th className="px-6 py-3 text-center">Preço Unitário FOB</th>
                      <th className="px-6 py-3 text-center">Valor Estimado FOB</th>
                      <th className="px-6 py-3">Breakdown do Atendimento de Pedidos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredMiamiTransfers.map((item) => {
                      const isProductExpanded = !!expandedTransferProducts[item.productCode];
                      return (
                        <tr key={item.productCode} className="hover:bg-slate-50/20 transition-colors align-top">
                          {/* Column 1: Product description */}
                          <td className="px-6 py-4">
                            <div className="font-mono text-xs font-bold text-indigo-600">{item.productCode}</div>
                            <div className="font-semibold text-slate-800 mt-0.5">{item.productName}</div>
                            {(item.coverageQty !== undefined && item.coverageQty > 0) && (
                              <div className="mt-1 text-[11px] text-slate-600 bg-amber-50/75 border border-amber-100 p-1.5 rounded-lg max-w-sm">
                                💡 <span className="font-semibold text-amber-900">Cobertura de Estoque:</span> Saldo SP ({item.saldoSP || 0}) &lt; Qtd Média 3x ({item.avgQty3x || 0}) ➔ <strong className="text-amber-800">+{item.coverageQty} un</strong>
                              </div>
                            )}
                          </td>

                          {/* Column 2: Total Quantity to Transfer */}
                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-base font-bold text-slate-800 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg">
                                {item.totalToTransfer} <span className="text-xs font-normal text-slate-500">un</span>
                              </span>
                              <span className="text-[10px] text-indigo-600 mt-1 font-semibold uppercase tracking-wider">Pick de Miami ➔ SP</span>
                              {(item.coverageQty !== undefined && item.coverageQty > 0 && item.orderDemandQty !== undefined && item.orderDemandQty > 0) && (
                                <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">
                                  Pedidos ({item.orderDemandQty}) + Cobertura ({item.coverageQty})
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Column: Unit Price */}
                          <td className="px-6 py-4 text-center">
                            <div className="font-bold text-slate-700">
                              $ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">FOB unitário médio</div>
                          </td>

                          {/* Column 3: Value */}
                          <td className="px-6 py-4 text-center">
                            <div className="font-bold text-slate-700">
                              $ {item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">FOB total estimado</div>
                          </td>

                          {/* Column 4: Orders Breakdown */}
                          <td className="px-6 py-4">
                            <div className="space-y-2 max-w-xl">
                              {item.byOrder.length === 0 ? (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1.5 rounded-lg font-medium block w-fit">
                                  🛡️ Reposição preventiva de estoque (Sem pedidos ativos de Miami)
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTransferProducts(prev => ({
                                      ...prev,
                                      [item.productCode]: !isProductExpanded
                                    }))}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                  >
                                    {isProductExpanded ? "Recolher detalhes" : `Ver breakdown por pedido (${item.byOrder.length})`}
                                    <ChevronDown className={`h-3 w-3 transform transition-transform ${isProductExpanded ? 'rotate-180' : ''}`} />
                                  </button>

                                  {isProductExpanded ? (
                                    <div className="space-y-1.5 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                                      {item.byOrder.map((o, idx) => {
                                        // Determine the visual state improvement
                                        let statusBadge = "";
                                        let statusColor = "";
                                        if (o.orderStatusInSP === 'blocked' && o.orderStatusWithMiami === 'complete') {
                                          statusBadge = "Fila SP Bloqueada ➔ Completo com Miami!";
                                          statusColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
                                        } else if (o.orderStatusInSP === 'partial' && o.orderStatusWithMiami === 'complete') {
                                          statusBadge = "Faturamento Parcial ➔ Completo!";
                                          statusColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
                                        } else if (o.orderStatusInSP === 'blocked' && o.orderStatusWithMiami === 'partial') {
                                          statusBadge = "Bloqueado total ➔ Atendimento Parcial";
                                          statusColor = "text-amber-700 bg-amber-50 border-amber-100";
                                        } else {
                                          statusBadge = "Melhora saldo no faturamento";
                                          statusColor = "text-indigo-700 bg-indigo-50 border-indigo-100";
                                        }

                                        return (
                                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200 shadow-3xs text-xs">
                                            <div>
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono font-bold text-slate-900">{o.orderNumber}</span>
                                                <span className="text-slate-500 truncate max-w-[120px]">({o.clientName})</span>
                                                <span className={`text-[9px] px-1 rounded ${
                                                  o.priority === 'Alta' ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-slate-100 text-slate-500'
                                                }`}>{o.priority}</span>
                                              </div>
                                              <div className="mt-1">
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-medium border px-1.5 py-0.5 rounded ${statusColor}`}>
                                                  {statusBadge}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                              <span className="font-bold text-indigo-950 font-mono text-xs">{o.qtyAllocatedFromMiami} un</span>
                                              <span className="text-[10px] text-slate-400 block">$ {(o.qtyAllocatedFromMiami * o.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {item.byOrder.slice(0, 3).map((o, idx) => (
                                        <span key={idx} className="inline-flex items-center text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                                          {o.orderNumber}: <strong className="text-slate-800 ml-1">{o.qtyAllocatedFromMiami} un</strong>
                                        </span>
                                      ))}
                                      {item.byOrder.length > 3 && (
                                        <span className="inline-flex items-center text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-semibold">
                                          +{item.byOrder.length - 3} mais
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Section 3.2: Completely Unfulfilled Items */}
          <div className="border-t border-slate-200 pt-8 mt-10 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Itens Não Atendidos (Falta de Saldo SP & Miami)
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Lista de produtos e quantidades que não puderam ser atendidos por nenhum dos depósitos (saldo totalmente esgotado).
              </p>
            </div>

            {/* Unfulfilled Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Produtos Distintos</span>
                  <span className="p-2 bg-rose-50 rounded-lg text-rose-600">
                    <XCircle className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-800">{unfulfilledSummaryTotals.uniqueProductsCount}</div>
                  <div className="text-xs text-slate-500 mt-1">itens sem saldo disponível</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Quantidade em Falta</span>
                  <span className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-800">{unfulfilledSummaryTotals.totalQty} <span className="text-xs font-normal text-slate-400">un</span></div>
                  <div className="text-xs text-slate-500 mt-1">total de unidades não atendidas</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Valor em Falta</span>
                  <span className="p-2 bg-rose-50 rounded-lg text-rose-700">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-rose-700">
                    $ {unfulfilledSummaryTotals.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">fob estimado não atendido</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Pedidos Afetados</span>
                  <span className="p-2 bg-slate-50 rounded-lg text-slate-600">
                    <FileText className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-800">{unfulfilledSummaryTotals.uniqueOrdersCount}</div>
                  <div className="text-xs text-slate-500 mt-1">pedidos com ruptura de estoque</div>
                </div>
              </div>
            </div>

            {/* Unfulfilled Table Container */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Relação de Itens em Falta de Estoque</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Estes itens possuem demanda de pedidos pendentes, mas não há saldo físico livre disponível em nenhum depósito.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  {/* Search */}
                  <div className="relative max-w-xs w-full">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </span>
                    <input
                      type="text"
                      placeholder="Filtrar item em falta..."
                      value={unfulfilledSearch}
                      onChange={(e) => setUnfulfilledSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all"
                    />
                  </div>

                  {/* CSV Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const csvRows = [];
                      csvRows.push("\uFEFF");
                      csvRows.push("Código Produto;Nome Produto;Quantidade em Falta;Preço Unitário FOB ($);Valor Total em Falta ($);Pedidos Afetados\n");

                      unfulfilledItems.forEach(item => {
                        const ordersStr = item.byOrder.map(o => `${o.orderNumber} (${o.qtyMissing}un)`).join(', ');
                        const cleanName = item.productName.replace(/;/g, ' ');
                        const cleanOrders = ordersStr.replace(/;/g, ' ');
                        const formattedUnitPrice = item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                        const formattedValue = item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                        csvRows.push(`${item.productCode};${cleanName};${item.totalMissing};${formattedUnitPrice};${formattedValue};${cleanOrders}\n`);
                      });

                      const csvContent = csvRows.join("");
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `itens_sem_saldo_sp_miami_${new Date().toISOString().split('T')[0]}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Baixar Planilha Falta (.csv)
                  </button>
                </div>
              </div>

              {/* Unfulfilled Table */}
              <div className="overflow-x-auto">
                {filteredUnfulfilledItems.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    {unfulfilledSearch ? "Nenhum item com esse filtro na lista de ruptura." : "Excelente! Nenhum item com ruptura de estoque total nesta simulação."}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase bg-slate-50">
                        <th className="px-6 py-3">Produto</th>
                        <th className="px-6 py-3 text-center">Quantidade Total em Falta</th>
                        <th className="px-6 py-3 text-center">Preço Unitário FOB</th>
                        <th className="px-6 py-3 text-center">Valor Total em Falta</th>
                        <th className="px-6 py-3">Breakdown do Atendimento de Pedidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredUnfulfilledItems.map((item) => {
                        const isProductExpanded = !!expandedUnfulfilledProducts[item.productCode];
                        return (
                          <tr key={item.productCode} className="hover:bg-slate-50/20 transition-colors align-top">
                            {/* Column 1: Product description */}
                            <td className="px-6 py-4">
                              <div className="font-mono text-xs font-bold text-rose-600">{item.productCode}</div>
                              <div className="font-semibold text-slate-800 mt-0.5">{item.productName}</div>
                              {item.coverageDeficit !== undefined && item.coverageDeficit > 0 && (
                                <div className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg max-w-xs flex items-center gap-1">
                                  <span>🛡️</span>
                                  <span>Reposição: Saldo SP ({item.saldoSP || 0}) &lt; Média ({item.avgQty3x || 0})</span>
                                </div>
                              )}
                            </td>

                            {/* Column 2: Total Quantity Missing */}
                            <td className="px-6 py-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className="text-base font-bold text-rose-700 bg-rose-50 border border-rose-100 px-3 py-1 rounded-lg">
                                  {item.totalMissing} <span className="text-xs font-normal text-slate-500">un</span>
                                </span>
                                {item.coverageDeficit !== undefined && item.coverageDeficit > 0 && item.totalMissing - item.coverageDeficit > 0 ? (
                                  <span className="text-[9px] text-slate-400 mt-1 font-semibold uppercase tracking-wider text-center">
                                    Pedidos ({item.totalMissing - item.coverageDeficit}) + Reposição ({item.coverageDeficit})
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-rose-600 mt-1 font-semibold uppercase tracking-wider">Sem Saldo</span>
                                )}
                              </div>
                            </td>

                            {/* Column: Unit Price */}
                            <td className="px-6 py-4 text-center">
                              <div className="font-bold text-slate-700">
                                $ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">FOB unitário médio</div>
                            </td>

                            {/* Column 3: Value */}
                            <td className="px-6 py-4 text-center">
                              <div className="font-bold text-rose-700">
                                $ {item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">FOB total em falta</div>
                            </td>

                            {/* Column 4: Orders Breakdown */}
                            <td className="px-6 py-4">
                              <div className="space-y-2 max-w-xl">
                                {item.byOrder.length === 0 ? (
                                  <div className="text-xs font-medium text-amber-700 bg-amber-50/50 border border-amber-100 p-2.5 rounded-lg flex items-center gap-1.5">
                                    <span>🛡️</span>
                                    <span>Compra sugerida puramente para segurança de estoque (Falta de saldo SP & Miami para atingir estoque mínimo, sem pedidos ativos).</span>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedUnfulfilledProducts(prev => ({
                                        ...prev,
                                        [item.productCode]: !isProductExpanded
                                      }))}
                                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                                    >
                                      {isProductExpanded ? "Recolher detalhes" : `Ver breakdown por pedido (${item.byOrder.length})`}
                                      <ChevronDown className={`h-3 w-3 transform transition-transform ${isProductExpanded ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isProductExpanded ? (
                                      <div className="space-y-1.5 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-150">
                                        {item.byOrder.map((o, idx) => {
                                          let statusBadge = "Bloqueado SP + Miami";
                                          let statusColor = "text-rose-700 bg-rose-50 border-rose-100";
                                          if (o.orderStatusInSP === 'partial') {
                                            statusBadge = "Faturamento SP Parcial - Falta Restante";
                                            statusColor = "text-amber-700 bg-amber-50 border-amber-100";
                                          }

                                          return (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200 shadow-3xs text-xs">
                                              <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-mono font-bold text-slate-900">{o.orderNumber}</span>
                                                  <span className="text-slate-500 truncate max-w-[120px]">({o.clientName})</span>
                                                  <span className={`text-[9px] px-1 rounded ${
                                                    o.priority === 'Alta' ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-slate-100 text-slate-500'
                                                  }`}>{o.priority}</span>
                                                </div>
                                                <div className="mt-1">
                                                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium border px-1.5 py-0.5 rounded ${statusColor}`}>
                                                    {statusBadge}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="text-right shrink-0">
                                                <span className="font-bold text-rose-700 font-mono text-xs">{o.qtyMissing} un</span>
                                                <span className="text-[10px] text-slate-400 block">$ {(o.qtyMissing * o.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {item.byOrder.slice(0, 3).map((o, idx) => (
                                          <span key={idx} className="inline-flex items-center text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                                            {o.orderNumber}: <strong className="text-rose-700 ml-1">{o.qtyMissing} un</strong>
                                          </span>
                                        ))}
                                        {item.byOrder.length > 3 && (
                                          <span className="inline-flex items-center text-[11px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded font-semibold">
                                            +{item.byOrder.length - 3} mais
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI FILTERS DETAILS MODAL */}
      {selectedFilterModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className={`px-6 py-4 border-b border-slate-200 flex items-center justify-between ${
              selectedFilterModal.type === 'complete' ? 'bg-emerald-50 text-emerald-950' :
              selectedFilterModal.type === 'partial' ? 'bg-amber-50 text-amber-950' :
              selectedFilterModal.type === 'blocked' ? 'bg-rose-50 text-rose-950' :
              'bg-slate-50 text-slate-950'
            }`}>
              <h3 className="font-bold text-base flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex items-center gap-2">
                  {selectedFilterModal.type === 'complete' && <CheckCircle2 className="text-emerald-600 h-5 w-5" />}
                  {selectedFilterModal.type === 'partial' && <AlertTriangle className="text-amber-600 h-5 w-5" />}
                  {selectedFilterModal.type === 'blocked' && <XCircle className="text-rose-600 h-5 w-5" />}
                  {selectedFilterModal.type === 'all' && <FileText className="text-indigo-600 h-5 w-5" />}
                  <span>
                    {selectedFilterModal.type === 'complete' && 'Pedidos: Prontos para Liberar'}
                    {selectedFilterModal.type === 'partial' && 'Pedidos: Atendimento Parcial'}
                    {selectedFilterModal.type === 'blocked' && 'Pedidos: Bloqueados (Falta)'}
                    {selectedFilterModal.type === 'all' && 'Todos os Pedidos do Filtro'}
                  </span>
                </div>
                <div className="flex gap-2.5 mt-1 md:mt-0 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    selectedFilterModal.row === 1 
                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                      : 'bg-teal-100 text-teal-800 border border-teal-200'
                  }`}>
                    {selectedFilterModal.row === 1 ? 'Grupo: São Paulo' : 'Estoque Combinado: SP + Miami'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    selectedFilterModal.type === 'complete' ? 'bg-emerald-100 text-emerald-800' :
                    selectedFilterModal.type === 'partial' ? 'bg-amber-100 text-amber-800' :
                    selectedFilterModal.type === 'blocked' ? 'bg-rose-100 text-rose-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {filteredOrdersForModal.length} {filteredOrdersForModal.length === 1 ? 'pedido' : 'pedidos'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                    selectedFilterModal.type === 'complete' ? 'bg-emerald-200/50 text-emerald-900 border-emerald-300/40' :
                    selectedFilterModal.type === 'partial' ? 'bg-amber-200/50 text-amber-900 border-amber-300/40' :
                    selectedFilterModal.type === 'blocked' ? 'bg-rose-200/50 text-rose-900 border-rose-300/40' :
                    'bg-slate-200 text-slate-900 border-slate-300'
                  }`}>
                    $ {modalTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </h3>
              <button 
                type="button"
                onClick={() => setSelectedFilterModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500 leading-normal">
                {selectedFilterModal.type === 'complete' && 'Estes pedidos possuem saldo suficiente em estoque no grupo ativo para atendimento integral de todos os seus itens.'}
                {selectedFilterModal.type === 'partial' && 'Estes pedidos possuem saldo suficiente para parte dos seus itens, mas possuem falta parcial em outros.'}
                {selectedFilterModal.type === 'blocked' && 'Estes pedidos não possuem saldo em estoque para atender a nenhum de seus itens no momento.'}
                {selectedFilterModal.type === 'all' && 'Lista completa de todos os pedidos avaliados sob esta regra.'}
              </p>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {filteredOrdersForModal.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm italic">
                    Nenhum pedido nesta classificação no momento.
                  </div>
                ) : (
                  filteredOrdersForModal.map((order) => {
                    const activeAllocationScope = selectedFilterModal.row === 1 ? spAllocation : spMiamiAllocation;
                    const alloc = activeAllocationScope[order.id];
                    const orderTotal = order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);

                    return (
                      <div 
                        key={order.id} 
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-indigo-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-800 text-sm">{order.orderNumber}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              order.priority === 'Alta' 
                                ? 'bg-rose-100 text-rose-700' 
                                : order.priority === 'Média' 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-slate-100 text-slate-600'
                            }`}>
                              {order.priority}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(order.date).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded font-mono">
                              $ {orderTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          
                          <div className="text-xs font-semibold text-slate-700">{order.clientName}</div>

                          {/* Items inline summary */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {order.items.map((it) => {
                              const itAlloc = alloc ? alloc[it.productCode] : null;
                              const missing = itAlloc ? itAlloc.missing : it.quantityOrdered;
                              const isItOk = missing === 0;

                              return (
                                <span 
                                  key={it.id} 
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono border flex items-center gap-1 ${
                                    isItOk 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                      : missing < it.quantityOrdered 
                                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                                        : 'bg-rose-50 text-rose-700 border-rose-100'
                                  }`}
                                >
                                  {it.productCode}: {it.quantityOrdered} un
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 self-end md:self-center">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedOrderId(order.id);
                              setActiveScenario('orders');
                              setSelectedFilterModal(null);
                              setTimeout(() => {
                                document.getElementById(`order-card-${order.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 150);
                            }}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                          >
                            <span>Expandir Detalhes</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedFilterModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
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
