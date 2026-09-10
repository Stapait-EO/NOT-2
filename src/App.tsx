import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Layers, 
  Building, 
  FileText, 
  TrendingUp, 
  Package, 
  Database,
  Truck,
  DollarSign,
  Briefcase,
  LogOut,
  ShieldAlert,
  Globe,
  Archive,
  DownloadCloud,
  ShieldCheck
} from 'lucide-react';
import { 
  getStoredStock, 
  setStoredStock, 
  getStoredOrders, 
  setStoredOrders, 
  getStoredProducts, 
  setStoredProducts,
  getStoredUsers,
  setStoredUsers,
  getStoredWebhooks,
  setStoredWebhooks,
  getStoredFieldMappings,
  setStoredFieldMappings,
  getStoredWarehouses,
  setStoredWarehouses,
  getStoredSales,
  setStoredSales
} from './data';
import { StockBalance, OrderHeader, Product, UserAccount, WebhookConfig, FieldMapping, Warehouse, SaleRecord } from './types';
import { 
  SSO_CONFIG, 
  extractAndStoreTokenFromUrl, 
  getStoredSSOToken, 
  getCachedSSOUser, 
  setCachedSSOUser, 
  clearSSOSession, 
  validateSSOToken, 
  redirectToSSOLogin, 
  logoutSSO 
} from './sso';
import Dashboard from './components/Dashboard';
import StockTable from './components/StockTable';
import OrdersTable from './components/OrdersTable';
import WebhookTable from './components/WebhookTable';
import ProductsTable from './components/ProductsTable';
import { SalesTable } from './components/SalesTable';
import Migration from './components/Migration';
import SSOGuard from './components/SSOGuard';
import { AutoSyncNotification, AutoSyncState } from './components/AutoSyncNotification';
import { executeAutomaticWebhooks } from './utils/webhookSync';

export default function App() {
  return (
    <SSOGuard>
      {(authenticatedUser) => <MainApplication initialUser={authenticatedUser} />}
    </SSOGuard>
  );
}

function MainApplication({ initialUser }: { initialUser: UserAccount }) {
  // Current authenticated user (validated from Portal MiFire SSO)
  const [currentUser, setCurrentUser] = useState<UserAccount>(initialUser);
  const [isSSOConnected, setIsSSOConnected] = useState<boolean>(true);

  // Load initial persistent states
  const [stock, setStock] = useState<StockBalance[]>(getStoredStock);
  const [orders, setOrders] = useState<OrderHeader[]>(getStoredOrders);
  const [products, setProducts] = useState<Product[]>(getStoredProducts);
  const [users, setUsers] = useState<UserAccount[]>(getStoredUsers);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(getStoredWebhooks);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(getStoredFieldMappings);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(getStoredWarehouses);
  const [sales, setSales] = useState<SaleRecord[]>(getStoredSales);

  // Active navigation tab (Analise Estoque as initial screen)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'sales' | 'products' | 'orders' | 'webhook' | 'migration'>('stock');

  // Role permissions check (Master and Admin only for system/settings tools)
  const userRoleLower = (currentUser?.role || '').toLowerCase();
  const isMasterOrAdmin = userRoleLower === 'master' || userRoleLower === 'admin';

  useEffect(() => {
    if (!isMasterOrAdmin && (activeTab === 'webhook' || activeTab === 'migration')) {
      setActiveTab('stock');
    }
  }, [isMasterOrAdmin, activeTab]);

  // Track if initial load from the backend has completed
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [activeApiEndpoint, setActiveApiEndpoint] = useState<string>('api/db');

  // 1. Initial Load from Backend Database File (with multi-path fallback for cPanel subfolders)
  useEffect(() => {
    const loadData = async () => {
      const candidateEndpoints = [
        'api/db',
        '/api/db',
        'api/db.php',
        '/api/db.php',
        'api/db/index.php',
        '/api/db/index.php'
      ];

      const token = getStoredSSOToken();
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let loadedData: any = null;
      let workingEndpoint = 'api/db';

      for (const endpoint of candidateEndpoints) {
        try {
          const response = await fetch(endpoint, {
            headers,
            cache: 'no-cache'
          });

          const contentType = response.headers.get('content-type') || '';
          if (response.ok && contentType.includes('json')) {
            const data = await response.json();
            // Verify it's a valid database payload
            if (data && typeof data === 'object') {
              loadedData = data;
              workingEndpoint = endpoint;
              break;
            }
          }
        } catch (e) {
          // continue to next candidate
        }
      }

      setActiveApiEndpoint(workingEndpoint);

      if (loadedData) {
        if (Array.isArray(loadedData.stock) && loadedData.stock.length > 0) {
          setStock(loadedData.stock);
          setStoredStock(loadedData.stock);
        }
        if (Array.isArray(loadedData.orders) && loadedData.orders.length > 0) {
          setOrders(loadedData.orders);
          setStoredOrders(loadedData.orders);
        }
        if (Array.isArray(loadedData.products) && loadedData.products.length > 0) {
          const seen = new Set<string>();
          const dedupedProducts: Product[] = [];
          for (const p of loadedData.products) {
            const key = (p.code || '').trim().toUpperCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            dedupedProducts.push(p);
          }
          setProducts(dedupedProducts);
          setStoredProducts(dedupedProducts);
        }
        if (Array.isArray(loadedData.users) && loadedData.users.length > 0) {
          setUsers(loadedData.users);
          setStoredUsers(loadedData.users);
        }
        if (Array.isArray(loadedData.webhooks) && loadedData.webhooks.length > 0) {
          setWebhooks(loadedData.webhooks);
          setStoredWebhooks(loadedData.webhooks);
        }
        if (Array.isArray(loadedData.fieldMappings) && loadedData.fieldMappings.length > 0) {
          setFieldMappings(loadedData.fieldMappings);
          setStoredFieldMappings(loadedData.fieldMappings);
        }
        if (Array.isArray(loadedData.warehouses) && loadedData.warehouses.length > 0) {
          setWarehouses(loadedData.warehouses);
          setStoredWarehouses(loadedData.warehouses);
        }
        if (Array.isArray(loadedData.sales) && loadedData.sales.length > 0) {
          setSales(loadedData.sales);
          setStoredSales(loadedData.sales);
        }
      }
      setInitialLoadDone(true);
    };

    loadData();
  }, []);

  // 2. Synchronize to Backend Database File on Any State Changes
  useEffect(() => {
    if (!initialLoadDone) return;
    // CRITICAL: Never overwrite server database with empty lists
    if (stock.length === 0 && products.length === 0 && webhooks.length === 0) return;

    const syncToBackend = async () => {
      try {
        const token = getStoredSSOToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        await fetch(activeApiEndpoint || 'api/db', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            stock,
            orders,
            products,
            users,
            webhooks,
            fieldMappings,
            warehouses,
            sales
          })
        });
      } catch (err) {
        console.error("Erro ao sincronizar dados com o servidor:", err);
      }
    };

    // Debounce to prevent hammering the server during multi-edits or fast inputs
    const timeoutId = setTimeout(syncToBackend, 600);
    return () => clearTimeout(timeoutId);
  }, [stock, orders, products, users, webhooks, fieldMappings, warehouses, sales, initialLoadDone, activeApiEndpoint]);

  const handleUpdateWarehouses = (updatedWarehouses: Warehouse[]) => {
    setWarehouses(updatedWarehouses);
    setStoredWarehouses(updatedWarehouses);
  };

  // STATE UPDATE WRAPPERS (with localStorage auto-sync)
  
  // Stock Balance Handlers
  const handleAddStock = (newStockItem: Omit<StockBalance, 'id'>) => {
    const item: StockBalance = {
      id: `stk-${Date.now()}`,
      ...newStockItem
    };
    const updated = [item, ...stock];
    setStock(updated);
    setStoredStock(updated);
  };

  const handleEditStock = (editedStockItem: StockBalance) => {
    const updated = stock.map(s => s.id === editedStockItem.id ? editedStockItem : s);
    setStock(updated);
    setStoredStock(updated);
  };

  const handleDeleteStock = (id: string) => {
    const updated = stock.filter(s => s.id !== id);
    setStock(updated);
    setStoredStock(updated);
  };

  const handleClearAllStock = () => {
    setStock([]);
    setStoredStock([]);
  };

  // Orders Handlers
  const handleAddOrder = (newOrderHeader: Omit<OrderHeader, 'id'>) => {
    const order: OrderHeader = {
      id: `ord-${Date.now()}`,
      ...newOrderHeader
    };
    const updated = [order, ...orders];
    setOrders(updated);
    setStoredOrders(updated);
  };

  const handleEditOrder = (editedOrderHeader: OrderHeader) => {
    const updated = orders.map(o => o.id === editedOrderHeader.id ? editedOrderHeader : o);
    setOrders(updated);
    setStoredOrders(updated);
  };

  const handleDeleteOrder = (id: string) => {
    const updated = orders.filter(o => o.id !== id);
    setOrders(updated);
    setStoredOrders(updated);
  };

  const handleClearAllOrders = () => {
    setOrders([]);
    setStoredOrders([]);
  };

  // Dynamically add a product when launching a stock balance of an unlisted product code
  const handleAddProduct = (newProd: Product) => {
    const key = newProd.code.trim().toUpperCase();
    const existingIndex = products.findIndex(p => p.code.trim().toUpperCase() === key);
    let updated: Product[];
    if (existingIndex >= 0) {
      updated = products.map((p, i) => i === existingIndex ? { ...p, ...newProd } : p);
    } else {
      updated = [...products, newProd];
    }
    setProducts(updated);
    setStoredProducts(updated);
  };

  const handleEditProduct = (oldCode: string, editedProd: Product) => {
    const normOldCode = oldCode.trim().toUpperCase();
    const updated = products.map(p => p.code.trim().toUpperCase() === normOldCode ? editedProd : p);
    // Ensure uniqueness
    const seen = new Set<string>();
    const deduped: Product[] = [];
    for (const p of updated) {
      const key = (p.code || '').trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }
    setProducts(deduped);
    setStoredProducts(deduped);
  };

  const handleDeleteProduct = (code: string) => {
    const updated = products.filter(p => p.code !== code);
    setProducts(updated);
    setStoredProducts(updated);
  };

  const handleClearAllProducts = () => {
    setProducts([]);
    setStoredProducts([]);
  };

  // Sales Handlers
  const handleAddSale = (newSale: Omit<SaleRecord, 'id'>) => {
    const sale: SaleRecord = {
      id: `sale-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...newSale
    };
    const updated = [...sales, sale];
    setSales(updated);
    setStoredSales(updated);
  };

  const handleEditSale = (editedSale: SaleRecord) => {
    const updated = sales.map(s => s.id === editedSale.id ? editedSale : s);
    setSales(updated);
    setStoredSales(updated);
  };

  const handleDeleteSale = (id: string) => {
    const updated = sales.filter(s => s.id !== id);
    setSales(updated);
    setStoredSales(updated);
  };

  const handleClearAllSales = () => {
    setSales([]);
    setStoredSales([]);
  };

  const handleImportSales = (imported: SaleRecord[], overwrite = false) => {
    const updated = overwrite ? imported : [...sales, ...imported];
    setSales(updated);
    setStoredSales(updated);
  };

  // User Management Handlers
  const handleAddUser = (newUserFields: Omit<UserAccount, 'id' | 'createdAt'>) => {
    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...newUserFields
    };
    const updated = [...users, newUser];
    setUsers(updated);
    setStoredUsers(updated);
  };

  const handleEditUser = (editedUser: UserAccount) => {
    const updated = users.map(u => u.id === editedUser.id ? editedUser : u);
    setUsers(updated);
    setStoredUsers(updated);
    
    // If the active logged-in user is updated, sync their local session too
    if (currentUser && currentUser.id === editedUser.id) {
      setCurrentUser(editedUser);
      localStorage.setItem('expedicao_session_user', JSON.stringify(editedUser));
    }
  };

  const handleDeleteUser = (id: string) => {
    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    setStoredUsers(updated);
  };

  // Webhook Management Handlers
  const handleAddWebhook = (newWebhookFields: Omit<WebhookConfig, 'id' | 'createdAt'>) => {
    const newWebhook: WebhookConfig = {
      id: `wh-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...newWebhookFields
    };
    const updated = [...webhooks, newWebhook];
    setWebhooks(updated);
    setStoredWebhooks(updated);
  };

  const handleEditWebhook = (editedWebhook: WebhookConfig) => {
    const updated = webhooks.map(w => w.id === editedWebhook.id ? editedWebhook : w);
    setWebhooks(updated);
    setStoredWebhooks(updated);
  };

  const handleDeleteWebhook = (id: string) => {
    const updated = webhooks.filter(w => w.id !== id);
    setWebhooks(updated);
    setStoredWebhooks(updated);
  };

  // Field Mappings Management Handlers
  const handleSaveFieldMapping = (webhookId: string, systemTable: string, mappings: { [field: string]: string }) => {
    const existingIndex = fieldMappings.findIndex(
      m => m.webhookId === webhookId && m.systemTable === systemTable
    );

    let updated: FieldMapping[];
    if (existingIndex >= 0) {
      updated = [...fieldMappings];
      updated[existingIndex] = {
        ...updated[existingIndex],
        mappings,
        updatedAt: new Date().toISOString()
      };
    } else {
      const newMapping: FieldMapping = {
        id: `map-${Date.now()}`,
        webhookId,
        systemTable,
        mappings,
        updatedAt: new Date().toISOString()
      };
      updated = [...fieldMappings, newMapping];
    }
    setFieldMappings(updated);
    setStoredFieldMappings(updated);
  };

  const handleDeleteFieldMapping = (id: string) => {
    const updated = fieldMappings.filter(m => m.id !== id);
    setFieldMappings(updated);
    setStoredFieldMappings(updated);
  };

  // Excel / CSV Import Handlers
  const handleImportStock = (imported: Omit<StockBalance, 'id'>[], overwrite = false) => {
    const newItems: StockBalance[] = imported.map((item, index) => ({
      id: `stk-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
      ...item
    }));
    const updated = overwrite ? newItems : [...newItems, ...stock];
    setStock(updated);
    setStoredStock(updated);
  };

  const handleImportOrders = (imported: Omit<OrderHeader, 'id'>[], overwrite = false) => {
    const newItems: OrderHeader[] = imported.map((item, index) => ({
      id: `ord-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
      ...item
    }));
    const updated = overwrite ? newItems : [...newItems, ...orders];
    setOrders(updated);
    setStoredOrders(updated);
  };

  const handleImportProducts = (imported: Product[], overwrite = false) => {
    // Avoid code duplicates
    const existingCodes = overwrite ? new Set<string>() : new Set(products.map(p => p.code));
    const uniqueImported = imported.filter(p => p.code && !existingCodes.has(p.code));
    const updated = overwrite ? uniqueImported : [...products, ...uniqueImported];
    setProducts(updated);
    setStoredProducts(updated);
  };

  const handleImportUsers = (imported: Omit<UserAccount, 'id' | 'createdAt'>[]) => {
    const newItems: UserAccount[] = imported.map((item, index) => ({
      id: `user-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...item
    }));
    const updated = [...users, ...newItems];
    setUsers(updated);
    setStoredUsers(updated);
  };

   const handleOverwriteAllData = (data: {
    stock: StockBalance[];
    orders: OrderHeader[];
    products: Product[];
    users: UserAccount[];
    webhooks: WebhookConfig[];
    fieldMappings: FieldMapping[];
    warehouses: Warehouse[];
    sales?: SaleRecord[];
  }) => {
    setStock(data.stock || []);
    setStoredStock(data.stock || []);
    
    setOrders(data.orders || []);
    setStoredOrders(data.orders || []);
    
    setProducts(data.products || []);
    setStoredProducts(data.products || []);

    if (data.sales) {
      setSales(data.sales);
      setStoredSales(data.sales);
    }
    
    setUsers(data.users || []);
    setStoredUsers(data.users || []);
    
    setWebhooks(data.webhooks || []);
    setStoredWebhooks(data.webhooks || []);
    
    setFieldMappings(data.fieldMappings || []);
    setStoredFieldMappings(data.fieldMappings || []);
    
    // Normalize in case backup has string warehouses
    const normalized: Warehouse[] = (data.warehouses || []).map((item: any, idx: number) => {
      if (typeof item === 'string') {
        return {
          id: `wh-${idx}-${Date.now()}`,
          name: item,
          isActive: true,
          groupName: ''
        };
      }
      return {
        id: item.id || `wh-${idx}-${Date.now()}`,
        name: item.name || String(item),
        isActive: item.isActive !== undefined ? item.isActive : true,
        groupName: item.groupName || ''
      };
    });
    setWarehouses(normalized);
    setStoredWarehouses(normalized);
  };

  const handleMergeAllData = (data: {
    stock: StockBalance[];
    orders: OrderHeader[];
    products: Product[];
    users: UserAccount[];
    webhooks: WebhookConfig[];
    fieldMappings: FieldMapping[];
    warehouses: Warehouse[];
    sales?: SaleRecord[];
  }) => {
    // Stock merge
    const newStock = [...(data.stock || []), ...stock];
    setStock(newStock);
    setStoredStock(newStock);

    // Orders merge
    const newOrders = [...(data.orders || []), ...orders];
    setOrders(newOrders);
    setStoredOrders(newOrders);

    // Products merge: filter out duplicates by product code
    const existingProductCodes = new Set(products.map(p => p.code));
    const uniqueProducts = (data.products || []).filter(p => !existingProductCodes.has(p.code));
    const newProducts = [...products, ...uniqueProducts];
    setProducts(newProducts);
    setStoredProducts(newProducts);

    // Users merge: filter out duplicates by username
    const existingUsernames = new Set(users.map(u => u.username));
    const uniqueUsers = (data.users || []).filter(u => !existingUsernames.has(u.username));
    const newUsers = [...users, ...uniqueUsers];
    setUsers(newUsers);
    setStoredUsers(newUsers);

    // Webhooks merge: filter out duplicates by URL + TableName
    const existingWebhookKeys = new Set(webhooks.map(w => `${w.url}-${w.tableName}`));
    const uniqueWebhooks = (data.webhooks || []).filter(w => !existingWebhookKeys.has(`${w.url}-${w.tableName}`));
    const newWebhooks = [...webhooks, ...uniqueWebhooks];
    setWebhooks(newWebhooks);
    setStoredWebhooks(newWebhooks);

    // Field Mappings merge
    const newMappings = [...(data.fieldMappings || []), ...fieldMappings];
    setFieldMappings(newMappings);
    setStoredFieldMappings(newMappings);

    // Warehouses merge: filter out duplicates by name
    const existingNames = new Set(warehouses.map(w => w.name));
    const normalizedImported: Warehouse[] = (data.warehouses || []).map((item: any, idx: number) => {
      if (typeof item === 'string') {
        return {
          id: `wh-${idx}-${Date.now()}`,
          name: item,
          isActive: true,
          groupName: ''
        };
      }
      return {
        id: item.id || `wh-${idx}-${Date.now()}`,
        name: item.name || String(item),
        isActive: item.isActive !== undefined ? item.isActive : true,
        groupName: item.groupName || ''
      };
    });
    const uniqueWarehouses = normalizedImported.filter(w => !existingNames.has(w.name));
    const newWarehouses = [...warehouses, ...uniqueWarehouses];
    setWarehouses(newWarehouses);
    setStoredWarehouses(newWarehouses);

    // Sales merge
    if (data.sales && data.sales.length > 0) {
      const mergedSales = [...sales, ...data.sales];
      setSales(mergedSales);
      setStoredSales(mergedSales);
    }
  };

  // Reference container for latest state values to avoid stale closures during async sync
  const latestDataRef = useRef({
    webhooks,
    fieldMappings,
    products,
    warehouses,
    stock,
    orders,
    sales
  });

  useEffect(() => {
    latestDataRef.current = {
      webhooks,
      fieldMappings,
      products,
      warehouses,
      stock,
      orders,
      sales
    };
  }, [webhooks, fieldMappings, products, warehouses, stock, orders, sales]);

  // Automatic webhook execution state
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncState>({
    isRunning: false,
    executedCount: 0,
    successfulCount: 0,
    failedCount: 0,
    details: [],
    visible: false
  });

  const autoSyncDoneRef = useRef(false);

  // Reset auto-sync flag if user logs out or switches
  useEffect(() => {
    autoSyncDoneRef.current = false;
  }, [currentUser?.id]);

  const runAutomaticSync = useCallback(async (customWebhooks?: WebhookConfig[]) => {
    const targetWebhooks = customWebhooks || latestDataRef.current.webhooks;
    const autoWebhooks = targetWebhooks.filter(wh => wh.isActive && wh.execution === 'Automática');

    if (autoWebhooks.length === 0) {
      return;
    }

    setAutoSyncStatus({
      isRunning: true,
      executedCount: autoWebhooks.length,
      successfulCount: 0,
      failedCount: 0,
      details: [],
      visible: true
    });

    try {
      const summary = await executeAutomaticWebhooks({
        webhooks: targetWebhooks,
        fieldMappings: latestDataRef.current.fieldMappings,
        currentProducts: latestDataRef.current.products,
        currentWarehouses: latestDataRef.current.warehouses,
        onImportProducts: (imported, overwrite) => handleImportProducts(imported, overwrite),
        onImportOrders: (imported, overwrite) => handleImportOrders(imported, overwrite),
        onImportStock: (imported, overwrite) => handleImportStock(imported, overwrite),
        onUpdateWarehouses: (whs) => handleUpdateWarehouses(whs),
        onImportSales: (imported, overwrite) => handleImportSales(imported, overwrite)
      });

      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setAutoSyncStatus({
        isRunning: false,
        executedCount: summary.executedCount,
        successfulCount: summary.successfulCount,
        failedCount: summary.failedCount,
        details: summary.results.map(r => ({
          name: r.webhookName,
          target: r.target,
          count: r.count,
          success: r.success,
          error: r.error
        })),
        completedAt: timeStr,
        visible: true
      });

      // Auto dismiss if all succeeded after 8 seconds
      if (summary.failedCount === 0) {
        setTimeout(() => {
          setAutoSyncStatus(prev => ({ ...prev, visible: false }));
        }, 8000);
      }
    } catch (err: any) {
      setAutoSyncStatus({
        isRunning: false,
        executedCount: autoWebhooks.length,
        successfulCount: 0,
        failedCount: autoWebhooks.length,
        details: [{
          name: 'Sincronização Automática',
          target: 'APIs',
          count: 0,
          success: false,
          error: err.message || 'Falha de comunicação com o servidor'
        }],
        visible: true
      });
    }
  }, []);

  // Trigger automatic sync once the initial database load is done
  useEffect(() => {
    if (!initialLoadDone || autoSyncDoneRef.current) return;

    const hasAuto = webhooks.some(wh => wh.isActive && wh.execution === 'Automática');
    if (hasAuto) {
      autoSyncDoneRef.current = true;
      const timer = setTimeout(() => {
        runAutomaticSync();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialLoadDone, webhooks, runAutomaticSync]);

  // STATISTICS COMPUTATION for top metrics banner
  const stats = {
    totalStockUnits: stock.reduce((acc, curr) => acc + curr.quantity, 0),
    uniqueProductsInStock: new Set(stock.filter(s => s.quantity > 0).map(s => s.productCode)).size,
    totalOrdersValue: orders.reduce((acc, order) => {
      return acc + order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);
    }, 0),
    activeWarehouses: new Set(stock.map(s => s.warehouse)).size,
  };

  if (!initialLoadDone && stock.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-white mb-1">Carregando base de dados Notifier...</h2>
        <p className="text-sm text-slate-400 max-w-sm">
          Sincronizando produtos, saldos de estoque e pedidos com o servidor.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      
      {/* Premium Header Bar in #0c396b Deep Navy Tone */}
      <header className="bg-[#0c396b] text-white shrink-0 shadow-md border-b border-[#082b52]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Main Tabs Navigation */}
            <nav className="flex space-x-1 items-center">
              <button
                id="nav-tab-stock"
                onClick={() => setActiveTab('stock')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'stock'
                    ? 'bg-black/25 text-white shadow-xs border border-white/15'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Building className="h-4 w-4" />
                <span>Analise Estoque</span>
              </button>

              <button
                id="nav-tab-sales"
                onClick={() => setActiveTab('sales')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'sales'
                    ? 'bg-black/25 text-white shadow-xs border border-white/15'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span>Analise Consumo</span>
              </button>

              <button
                id="nav-tab-dashboard"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-black/25 text-white shadow-xs border border-white/15'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Painel Analítico</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'products'
                    ? 'bg-black/25 text-white shadow-xs border border-white/15'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Archive className="h-4 w-4" />
                <span>Produtos</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-black/25 text-white shadow-xs border border-white/15'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Pedidos em Aberto</span>
              </button>

              {isMasterOrAdmin && (
                <>
                  <button
                    id="nav-tab-webhook"
                    onClick={() => setActiveTab('webhook')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'webhook'
                        ? 'bg-black/25 text-white shadow-xs border border-white/15'
                        : 'text-blue-100 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    <span>Webhook</span>
                  </button>

                  <button
                    id="nav-tab-migration"
                    onClick={() => setActiveTab('migration')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'migration'
                        ? 'bg-black/25 text-white shadow-xs border border-white/15'
                        : 'text-blue-100 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <DownloadCloud className="h-4 w-4 text-blue-200" />
                    <span>Migrar / Backup</span>
                  </button>
                </>
              )}

              {/* Separator */}
              <span className="h-6 w-px bg-white/20 mx-2 block" />

              {/* User badge and SSO Return */}
              <div className="flex items-center gap-2.5 pl-1">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold text-white leading-none">{currentUser.fullName}</span>
                </div>
                <button
                  onClick={logoutSSO}
                  title="Voltar ao Painel do Portal SSO"
                  className="flex items-center gap-1 p-1.5 text-blue-200 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </nav>

          </div>
        </div>
      </header>

      {/* Automatic Webhook Sync Status Notification Banner */}
      <AutoSyncNotification
        status={autoSyncStatus}
        onClose={() => setAutoSyncStatus(prev => ({ ...prev, visible: false }))}
        onRetry={() => runAutomaticSync()}
      />

      {/* Dynamic Summary Banner - Visible only on Dashboard */}
      {activeTab === 'dashboard' && (
        <section className="bg-white border-b border-slate-200 py-4 shadow-2xs shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:divide-x md:divide-slate-100">
              
              {/* Stat 1: Total Stock Units */}
              <div className="flex items-center gap-3 px-2">
                <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Package className="h-5 w-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Unidades em Estoque</span>
                  <span className="font-mono text-lg font-extrabold text-slate-800">{stats.totalStockUnits} un</span>
                </div>
              </div>

              {/* Stat 2: Active Warehouses */}
              <div className="flex items-center gap-3 px-2 md:pl-6">
                <span className="p-2.5 bg-slate-50 text-slate-600 rounded-xl">
                  <Building className="h-5 w-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Depósitos Ativos</span>
                  <span className="font-mono text-lg font-extrabold text-slate-800">{stats.activeWarehouses} depósitos</span>
                </div>
              </div>

              {/* Stat 3: Unique Products */}
              <div className="flex items-center gap-3 px-2 md:pl-6">
                <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Database className="h-5 w-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Catálogo Ativo</span>
                  <span className="font-mono text-lg font-extrabold text-slate-800">{stats.uniqueProductsInStock} produtos</span>
                </div>
              </div>

              {/* Stat 4: Total Orders Value */}
              <div className="flex items-center gap-3 px-2 md:pl-6">
                <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider font-sans">Carteira Total</span>
                  <span className="font-mono text-lg font-extrabold text-slate-800">
                    $ {stats.totalOrdersValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Active Tab View Rendering */}
        {activeTab === 'dashboard' && (
          <Dashboard 
            orders={orders} 
            stock={stock} 
            warehouses={warehouses}
            products={products}
          />
        )}

        {activeTab === 'stock' && (
          <StockTable 
            stock={stock} 
            products={products}
            orders={orders}
            onAddStock={handleAddStock}
            onEditStock={handleEditStock}
            onDeleteStock={handleDeleteStock}
            onClearAllStock={handleClearAllStock}
            onAddProduct={handleAddProduct}
            currentUserRole={currentUser.role}
            warehouses={warehouses}
            onUpdateWarehouses={handleUpdateWarehouses}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
            onImportStock={handleImportStock}
            onNavigateToOrders={() => setActiveTab('orders')}
          />
        )}

        {activeTab === 'sales' && (
          <SalesTable
            sales={sales}
            products={products}
            stock={stock}
            warehouses={warehouses}
            onAddSale={handleAddSale}
            onEditSale={handleEditSale}
            onDeleteSale={handleDeleteSale}
            onClearAllSales={handleClearAllSales}
            onImportSales={handleImportSales}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
            currentUserRole={currentUser.role}
          />
        )}

        {activeTab === 'products' && (
          <ProductsTable 
            products={products}
            onAddProduct={handleAddProduct}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onClearAllProducts={handleClearAllProducts}
            currentUserRole={currentUser.role}
            stock={stock}
            orders={orders}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
            onImportProducts={handleImportProducts}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersTable 
            orders={orders} 
            products={products}
            onAddOrder={handleAddOrder}
            onEditOrder={handleEditOrder}
            onDeleteOrder={handleDeleteOrder}
            onClearAllOrders={handleClearAllOrders}
            onImportOrders={handleImportOrders}
            currentUserRole={currentUser.role}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
          />
        )}

        {isMasterOrAdmin && activeTab === 'webhook' && (
          <WebhookTable 
            currentUser={currentUser}
            webhooks={webhooks}
            onAddWebhook={handleAddWebhook}
            onEditWebhook={handleEditWebhook}
            onDeleteWebhook={handleDeleteWebhook}
            fieldMappings={fieldMappings}
            onSaveFieldMapping={handleSaveFieldMapping}
            onDeleteFieldMapping={handleDeleteFieldMapping}
            onImportStock={handleImportStock}
            onImportOrders={handleImportOrders}
            onImportProducts={handleImportProducts}
            onImportUsers={handleImportUsers}
            stock={stock}
            orders={orders}
            products={products}
            users={users}
            isAutoSyncRunning={autoSyncStatus.isRunning}
            onTriggerAutoSync={() => runAutomaticSync()}
          />
        )}

        {isMasterOrAdmin && activeTab === 'migration' && (
          <Migration 
            stock={stock}
            orders={orders}
            products={products}
            users={users}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
            warehouses={warehouses}
            sales={sales}
            onOverwriteAll={handleOverwriteAllData}
            onMergeAll={handleMergeAllData}
          />
        )}

      </main>

      {/* Simple Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400 shrink-0">
        <p>Gerenciador de Expedição • Integrado ao Portal Central SSO • {new Date().getFullYear()}</p>
      </footer>

    </div>
  );
}
