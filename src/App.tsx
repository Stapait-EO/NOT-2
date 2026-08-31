import { useState, useEffect } from 'react';
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
  LayoutGrid,
  ArrowUpRight,
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
  setStoredWarehouses
} from './data';
import { StockBalance, OrderHeader, Product, UserAccount, WebhookConfig, FieldMapping, Warehouse } from './types';
import { 
  SSO_CONFIG, 
  extractAndStoreTokenFromUrl, 
  getStoredSSOToken, 
  getCachedSSOUser, 
  setCachedSSOUser, 
  clearSSOSession, 
  validateSSOToken, 
  redirectToSSOLogin, 
  logoutSSO, 
  returnToPortalHub 
} from './sso';
import Dashboard from './components/Dashboard';
import StockTable from './components/StockTable';
import OrdersTable from './components/OrdersTable';
import WebhookTable from './components/WebhookTable';
import ProductsTable from './components/ProductsTable';
import Migration from './components/Migration';
import SSOGuard from './components/SSOGuard';

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

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'products' | 'orders' | 'webhook' | 'migration'>('dashboard');

  // Track if initial load from the backend has completed
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // 1. Initial Load from Backend Database File
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/db');
        if (response.ok) {
          const data = await response.json();
          if (data) {
            if (data.stock) {
              setStock(data.stock);
              setStoredStock(data.stock);
            }
            if (data.orders) {
              setOrders(data.orders);
              setStoredOrders(data.orders);
            }
            if (data.products) {
              setProducts(data.products);
              setStoredProducts(data.products);
            }
            if (data.users) {
              setUsers(data.users);
              setStoredUsers(data.users);
            }
            if (data.webhooks) {
              setWebhooks(data.webhooks);
              setStoredWebhooks(data.webhooks);
            }
            if (data.fieldMappings) {
              setFieldMappings(data.fieldMappings);
              setStoredFieldMappings(data.fieldMappings);
            }
            if (data.warehouses) {
              setWarehouses(data.warehouses);
              setStoredWarehouses(data.warehouses);
            }
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados do servidor:", err);
      } finally {
        setInitialLoadDone(true);
      }
    };
    loadData();
  }, []);

  // 2. Synchronize to Backend Database File on Any State Changes
  useEffect(() => {
    if (!initialLoadDone) return;

    const syncToBackend = async () => {
      try {
        await fetch('/api/db', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stock,
            orders,
            products,
            users,
            webhooks,
            fieldMappings,
            warehouses
          })
        });
      } catch (err) {
        console.error("Erro ao sincronizar dados com o servidor:", err);
      }
    };

    // Debounce to prevent hammering the server during multi-edits or fast inputs
    const timeoutId = setTimeout(syncToBackend, 500);
    return () => clearTimeout(timeoutId);
  }, [stock, orders, products, users, webhooks, fieldMappings, warehouses, initialLoadDone]);

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
    const updated = [...products, newProd];
    setProducts(updated);
    setStoredProducts(updated);
  };

  const handleEditProduct = (oldCode: string, editedProd: Product) => {
    const updated = products.map(p => p.code === oldCode ? editedProd : p);
    setProducts(updated);
    setStoredProducts(updated);
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
  }) => {
    setStock(data.stock || []);
    setStoredStock(data.stock || []);
    
    setOrders(data.orders || []);
    setStoredOrders(data.orders || []);
    
    setProducts(data.products || []);
    setStoredProducts(data.products || []);
    
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
  };

  // STATISTICS COMPUTATION for top metrics banner
  const stats = {
    totalStockUnits: stock.reduce((acc, curr) => acc + curr.quantity, 0),
    uniqueProductsInStock: new Set(stock.filter(s => s.quantity > 0).map(s => s.productCode)).size,
    totalOrdersValue: orders.reduce((acc, order) => {
      return acc + order.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitPrice), 0);
    }, 0),
    activeWarehouses: new Set(stock.map(s => s.warehouse)).size,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      
      {/* Premium Header Bar */}
      <header className="bg-indigo-950 text-white shrink-0 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo and title */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-xs">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                  Gerenciador de Expedição
                  <span className="hidden sm:inline-flex items-center gap-1 text-[9px] bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 font-semibold px-2 py-0.5 rounded-full">
                    <ShieldCheck className="h-3 w-3 text-indigo-400" />
                    SSO Ativo
                  </span>
                </h1>
                <p className="text-[10px] text-indigo-200 uppercase font-bold tracking-widest -mt-0.5">
                  Pedido x Saldo de Estoque
                </p>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <nav className="flex space-x-1 items-center">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Painel Analítico</span>
              </button>
              
              <button
                onClick={() => setActiveTab('stock')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'stock'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <Building className="h-4 w-4" />
                <span>Saldo de Estoque</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'products'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <Archive className="h-4 w-4" />
                <span>Produtos</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Pedidos em Aberto</span>
              </button>

              <button
                onClick={() => setActiveTab('webhook')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'webhook'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <Globe className="h-4 w-4" />
                <span>Webhook</span>
              </button>

              <button
                onClick={() => setActiveTab('migration')}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'migration'
                    ? 'bg-indigo-850 text-white shadow-xs'
                    : 'text-indigo-200 hover:text-white hover:bg-indigo-900'
                }`}
              >
                <DownloadCloud className="h-4 w-4 text-indigo-400" />
                <span>Migrar / Backup</span>
              </button>

              {/* Separator */}
              <span className="h-6 w-px bg-indigo-800 mx-2 block" />

              {/* Back to Portal SSO Button */}
              <button
                onClick={returnToPortalHub}
                title="Voltar ao Painel do Portal SSO"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/80 hover:bg-indigo-850 text-indigo-100 hover:text-white border border-indigo-700/60 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-indigo-300" />
                <span className="hidden md:inline">Portal SSO</span>
                <ArrowUpRight className="h-3 w-3 text-indigo-400" />
              </button>

              {/* User badge and SSO Return */}
              <div className="flex items-center gap-2.5 pl-1">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold text-white leading-none">{currentUser.fullName}</span>
                  <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider mt-0.5">
                    @{currentUser.username} • {currentUser.role}
                  </span>
                </div>
                <div className="h-8 w-8 bg-indigo-800 border border-indigo-700/80 rounded-full flex items-center justify-center text-indigo-100 font-bold text-xs select-none shadow-xs">
                  {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <button
                  onClick={logoutSSO}
                  title="Voltar ao Painel do Portal SSO"
                  className="flex items-center gap-1 p-1.5 text-indigo-300 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-all cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </nav>

          </div>
        </div>
      </header>

      {/* Dynamic Summary Banner */}
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

        {activeTab === 'webhook' && (
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
          />
        )}

        {activeTab === 'migration' && (
          <Migration 
            stock={stock}
            orders={orders}
            products={products}
            users={users}
            webhooks={webhooks}
            fieldMappings={fieldMappings}
            warehouses={warehouses}
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
