import { StockBalance, OrderHeader, Product, UserAccount, WebhookConfig, FieldMapping, Warehouse, SaleRecord } from './types';

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_WAREHOUSES: Warehouse[] = [
  { id: 'wh-1', name: '0002.001', isActive: true, groupName: 'São Paulo' },
  { id: 'wh-2', name: '0002.004', isActive: true, groupName: 'São Paulo' },
  { id: 'wh-3', name: '0004.001', isActive: true, groupName: 'Miami' },
  { id: 'wh-4', name: '0004.003', isActive: true, groupName: 'Miami' },
  { id: 'wh-5', name: '0004.002', isActive: true, groupName: 'Miami' },
  { id: 'wh-6', name: 'DEP01 - Depósito Central', isActive: true, groupName: 'São Paulo' },
  { id: 'wh-7', name: 'DEP02 - Depósito Auxiliar', isActive: true, groupName: 'São Paulo' },
  { id: 'wh-8', name: 'DEP03 - Logística Reversa/Rápida', isActive: true, groupName: 'São Paulo' },
];

export const INITIAL_STOCK: StockBalance[] = [];

export const INITIAL_ORDERS: OrderHeader[] = [];

export function getStoredStock(): StockBalance[] {
  const data = localStorage.getItem('expedicao_stock');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_STOCK;
    }
  }
  return INITIAL_STOCK;
}

export function setStoredStock(stock: StockBalance[]): void {
  localStorage.setItem('expedicao_stock', JSON.stringify(stock));
}

export function getStoredOrders(): OrderHeader[] {
  const data = localStorage.getItem('expedicao_orders');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_ORDERS;
    }
  }
  return INITIAL_ORDERS;
}

export function setStoredOrders(orders: OrderHeader[]): void {
  localStorage.setItem('expedicao_orders', JSON.stringify(orders));
}

export function getStoredProducts(): Product[] {
  const data = localStorage.getItem('expedicao_products');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_PRODUCTS;
    }
  }
  return INITIAL_PRODUCTS;
}

export function setStoredProducts(products: Product[]): void {
  localStorage.setItem('expedicao_products', JSON.stringify(products));
}


export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'user-admin',
    username: 'admin',
    fullName: 'Administrador Geral',
    passwordHash: 'admin',
    createdAt: '2026-07-14T00:00:00.000Z',
    role: 'admin'
  },
  {
    id: 'user-vendedor',
    username: 'vendedor',
    fullName: 'Carlos Vendedor',
    passwordHash: 'vendedor',
    createdAt: '2026-07-14T00:00:00.000Z',
    role: 'vendedor'
  },
  {
    id: 'user-almoxarife',
    username: 'almoxarife',
    fullName: 'João Almoxarife',
    passwordHash: 'almoxarife',
    createdAt: '2026-07-14T00:00:00.000Z',
    role: 'almoxarife'
  }
];

export function getStoredUsers(): UserAccount[] {
  const data = localStorage.getItem('expedicao_users');
  if (data) {
    try {
      const parsed = JSON.parse(data) as any[];
      return parsed.map(user => ({
        ...user,
        role: user.role || 'admin' // Safe migration fallback
      })) as UserAccount[];
    } catch {
      return INITIAL_USERS;
    }
  }
  // Store the initial list if not already present
  localStorage.setItem('expedicao_users', JSON.stringify(INITIAL_USERS));
  return INITIAL_USERS;
}

export function setStoredUsers(users: UserAccount[]): void {
  localStorage.setItem('expedicao_users', JSON.stringify(users));
}

export const INITIAL_WEBHOOKS: WebhookConfig[] = [
  {
    id: 'wh-1',
    seq: 1,
    tableName: 'StockBalance',
    url: 'https://api.empresa.com/v1/stock-updates',
    secretKey: 'sec_stock_123456789',
    filterCondition: 'quantity > 0',
    createdAt: '2026-07-14T09:00:00.000Z',
    isActive: true
  },
  {
    id: 'wh-2',
    seq: 2,
    tableName: 'OrderHeader',
    url: 'https://api.empresa.com/v1/new-orders',
    secretKey: 'sec_orders_987654321',
    filterCondition: 'priority == "Alta"',
    createdAt: '2026-07-14T09:10:00.000Z',
    isActive: true
  },
  {
    id: 'wh-3',
    seq: 3,
    tableName: 'ProdutosSistema',
    url: 'https://api.empresa.com/v1/sistema-products',
    secretKey: 'sec_sistema_333333333',
    filterCondition: 'status == "active"',
    createdAt: '2026-07-14T09:20:00.000Z',
    isActive: true
  }
];

export function getStoredWebhooks(): WebhookConfig[] {
  const data = localStorage.getItem('expedicao_webhooks');
  if (data) {
    try {
      const parsed = JSON.parse(data) as any[];
      return parsed.map(w => ({
        ...w,
        isActive: w.isActive !== undefined ? w.isActive : true
      })) as WebhookConfig[];
    } catch {
      return INITIAL_WEBHOOKS;
    }
  }
  localStorage.setItem('expedicao_webhooks', JSON.stringify(INITIAL_WEBHOOKS));
  return INITIAL_WEBHOOKS;
}

export function setStoredWebhooks(webhooks: WebhookConfig[]): void {
  localStorage.setItem('expedicao_webhooks', JSON.stringify(webhooks));
}

export const INITIAL_MAPPINGS: FieldMapping[] = [
  {
    id: 'map-stock-wh3',
    webhookId: 'wh-3',
    systemTable: 'StockBalance',
    mappings: {
      productCode: 'modelo',
      productName: 'descricao',
      warehouse: 'cdgrupo',
      quantity: 'qtdest',
      pr_cod: 'pr_cod',
      codigo: 'codigo',
      lote: 'marca',
      pr_preco: 'pr_preco',
      vlrest: 'vlrest'
    },
    updatedAt: '2026-09-02T18:51:11.437Z'
  },
  {
    id: 'map-1',
    webhookId: 'wh-1',
    systemTable: 'StockBalance',
    mappings: {
      id: 'id_estoque',
      productCode: 'codigo_produto',
      productName: 'nome_produto',
      warehouse: 'deposito',
      quantity: 'quantidade_atual'
    },
    updatedAt: '2026-07-14T09:00:00.000Z'
  },
  {
    id: 'map-2',
    webhookId: 'wh-2',
    systemTable: 'OrderHeader',
    mappings: {
      id: 'id_pedido',
      orderNumber: 'numero_controle',
      clientName: 'cliente',
      date: 'data_criacao',
      priority: 'prioridade_envio',
      notes: 'observacao_pedido'
    },
    updatedAt: '2026-07-14T09:10:00.000Z'
  },
  {
    id: 'map-3',
    webhookId: 'wh-3',
    systemTable: 'ProdutosSistema',
    mappings: {
      orderNumber: 'numero_pedido',
      itemProductCode: 'codigo_produto',
      itemQuantity: 'quantidade',
      itemUnitPrice: 'preco_unitario'
    },
    updatedAt: '2026-07-14T09:20:00.000Z'
  }
];

export function getStoredFieldMappings(): FieldMapping[] {
  const data = localStorage.getItem('expedicao_field_mappings');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_MAPPINGS;
    }
  }
  localStorage.setItem('expedicao_field_mappings', JSON.stringify(INITIAL_MAPPINGS));
  return INITIAL_MAPPINGS;
}

export function setStoredFieldMappings(mappings: FieldMapping[]): void {
  localStorage.setItem('expedicao_field_mappings', JSON.stringify(mappings));
}

export function getStoredWarehouses(): Warehouse[] {
  const data = localStorage.getItem('expedicao_warehouses');
  let parsed: any[] = [];
  if (data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = INITIAL_WAREHOUSES;
    }
  } else {
    parsed = INITIAL_WAREHOUSES;
  }

  // Migrate string array or incomplete objects to full Warehouse objects
  const migrated: Warehouse[] = parsed.map((item, idx) => {
    if (typeof item === 'string') {
      let groupName = '';
      if (item.includes('0002.001') || item.includes('0002.004') || item.includes('Central') || item.includes('DEP01')) {
        groupName = 'Deposito Central';
      } else if (item.includes('0004.001') || item.includes('0004.003') || item.includes('0004.0004') || item.includes('Sul')) {
        groupName = 'Deposito Sul';
      }
      return {
        id: `wh-${idx}-${Date.now()}`,
        name: item,
        isActive: true,
        groupName: groupName
      };
    } else {
      return {
        id: item.id || `wh-${idx}-${Date.now()}`,
        name: item.name || String(item),
        isActive: item.isActive !== undefined ? item.isActive : true,
        groupName: item.groupName || ''
      };
    }
  });

  localStorage.setItem('expedicao_warehouses', JSON.stringify(migrated));
  return migrated;
}

export function setStoredWarehouses(warehouses: Warehouse[]): void {
  localStorage.setItem('expedicao_warehouses', JSON.stringify(warehouses));
}

export const INITIAL_SALES: SaleRecord[] = [
  // 2W-B (Total: 154)
  { id: 'sale-1', sku: '2W-B', month: 8, year: 2025, quantity: 12 },
  { id: 'sale-2', sku: '2W-B', month: 9, year: 2025, quantity: 5 },
  { id: 'sale-3', sku: '2W-B', month: 10, year: 2025, quantity: 15 },
  { id: 'sale-4', sku: '2W-B', month: 12, year: 2025, quantity: 24 },
  { id: 'sale-5', sku: '2W-B', month: 1, year: 2026, quantity: 15 },
  { id: 'sale-6', sku: '2W-B', month: 2, year: 2026, quantity: 17 },
  { id: 'sale-7', sku: '2W-B', month: 3, year: 2026, quantity: 21 },
  { id: 'sale-8', sku: '2W-B', month: 5, year: 2026, quantity: 8 },
  { id: 'sale-9', sku: '2W-B', month: 6, year: 2026, quantity: 14 },
  { id: 'sale-10', sku: '2W-B', month: 7, year: 2026, quantity: 11 },
  { id: 'sale-11', sku: '2W-B', month: 8, year: 2026, quantity: 12 },

  // 2WT-B (Total: 10)
  { id: 'sale-12', sku: '2WT-B', month: 10, year: 2025, quantity: 1 },
  { id: 'sale-13', sku: '2WT-B', month: 3, year: 2026, quantity: 3 },
  { id: 'sale-14', sku: '2WT-B', month: 5, year: 2026, quantity: 2 },
  { id: 'sale-15', sku: '2WT-B', month: 7, year: 2026, quantity: 4 },

  // 302-AW-135 (Total: 1)
  { id: 'sale-16', sku: '302-AW-135', month: 11, year: 2025, quantity: 1 },

  // 302-AW-194 (Total: 45)
  { id: 'sale-17', sku: '302-AW-194', month: 9, year: 2025, quantity: 32 },
  { id: 'sale-18', sku: '302-AW-194', month: 1, year: 2026, quantity: 1 },
  { id: 'sale-19', sku: '302-AW-194', month: 5, year: 2026, quantity: 5 },
  { id: 'sale-20', sku: '302-AW-194', month: 6, year: 2026, quantity: 6 },
  { id: 'sale-21', sku: '302-AW-194', month: 7, year: 2026, quantity: 1 },

  // 302-EPM-135 (Total: 13)
  { id: 'sale-22', sku: '302-EPM-135', month: 8, year: 2026, quantity: 13 },

  // 302-EPM-194 (Total: 91)
  { id: 'sale-23', sku: '302-EPM-194', month: 8, year: 2025, quantity: 10 },
  { id: 'sale-24', sku: '302-EPM-194', month: 9, year: 2025, quantity: 3 },
  { id: 'sale-25', sku: '302-EPM-194', month: 10, year: 2025, quantity: 2 },
  { id: 'sale-26', sku: '302-EPM-194', month: 2, year: 2026, quantity: 2 },
  { id: 'sale-27', sku: '302-EPM-194', month: 3, year: 2026, quantity: 12 },
  { id: 'sale-28', sku: '302-EPM-194', month: 8, year: 2026, quantity: 62 },

  // 302-ET-135 (Total: 7)
  { id: 'sale-29', sku: '302-ET-135', month: 9, year: 2025, quantity: 7 },

  // 302-ET-194 (Total: 23)
  { id: 'sale-30', sku: '302-ET-194', month: 8, year: 2025, quantity: 12 },
  { id: 'sale-31', sku: '302-ET-194', month: 10, year: 2025, quantity: 4 },
  { id: 'sale-32', sku: '302-ET-194', month: 12, year: 2025, quantity: 7 },

  // 50160636-001 (Total: 8)
  { id: 'sale-33', sku: '50160636-001', month: 9, year: 2025, quantity: 1 },
  { id: 'sale-34', sku: '50160636-001', month: 10, year: 2025, quantity: 3 },
  { id: 'sale-35', sku: '50160636-001', month: 11, year: 2025, quantity: 2 },
  { id: 'sale-36', sku: '50160636-001', month: 3, year: 2026, quantity: 1 },
  { id: 'sale-37', sku: '50160636-001', month: 5, year: 2026, quantity: 1 },

  // 5151 (Total: 4)
  { id: 'sale-38', sku: '5151', month: 10, year: 2025, quantity: 1 },
  { id: 'sale-39', sku: '5151', month: 7, year: 2026, quantity: 3 },

  // 75554 (Total: 1)
  { id: 'sale-40', sku: '75554', month: 1, year: 2026, quantity: 1 },

  // ABF-1DB (Total: 9)
  { id: 'sale-41', sku: 'ABF-1DB', month: 9, year: 2025, quantity: 2 },
  { id: 'sale-42', sku: 'ABF-1DB', month: 10, year: 2025, quantity: 2 },
  { id: 'sale-43', sku: 'ABF-1DB', month: 3, year: 2026, quantity: 4 },
  { id: 'sale-44', sku: 'ABF-1DB', month: 5, year: 2026, quantity: 1 },

  // ABS-2D (Total: 7)
  { id: 'sale-45', sku: 'ABS-2D', month: 10, year: 2025, quantity: 2 },
  { id: 'sale-46', sku: 'ABS-2D', month: 11, year: 2025, quantity: 2 },
  { id: 'sale-47', sku: 'ABS-2D', month: 12, year: 2025, quantity: 2 },
  { id: 'sale-48', sku: 'ABS-2D', month: 4, year: 2026, quantity: 1 },
];

export function getStoredSales(): SaleRecord[] {
  const data = localStorage.getItem('expedicao_sales');
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_SALES;
    }
  }
  localStorage.setItem('expedicao_sales', JSON.stringify(INITIAL_SALES));
  return INITIAL_SALES;
}

export function setStoredSales(sales: SaleRecord[]): void {
  localStorage.setItem('expedicao_sales', JSON.stringify(sales));
}


