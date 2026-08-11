import { StockBalance, OrderHeader, Product, UserAccount, WebhookConfig, FieldMapping, Warehouse } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  { code: 'PROD001', name: 'Notebook Dell Inspiron 15', category: 'Informática', pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', avgQty1x: 12, avgQty3x: 36 },
  { code: 'PROD002', name: 'Monitor LG UltraWide 29"', category: 'Monitores', pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', avgQty1x: 8, avgQty3x: 24 },
  { code: 'PROD003', name: 'Teclado Mecânico Keychron K2', category: 'Acessórios', pr_cod: 10003, codigo: 'PROD000003', lote: 'LOTE000003', avgQty1x: 25, avgQty3x: 75 },
  { code: 'PROD004', name: 'Mouse Sem Fio Logitech MX Master 3', category: 'Acessórios', pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', avgQty1x: 40, avgQty3x: 120 },
  { code: 'PROD005', name: 'Headset Gamer HyperX Cloud II', category: 'Áudio', pr_cod: 10005, codigo: 'PROD000005', lote: 'LOTE000005', avgQty1x: 15, avgQty3x: 45 },
  { code: 'PROD006', name: 'Smartphone Samsung Galaxy S23', category: 'Celulares', pr_cod: 10006, codigo: 'PROD000006', lote: 'LOTE000006', avgQty1x: 10, avgQty3x: 30 },
];

export const INITIAL_WAREHOUSES: Warehouse[] = [
  { id: 'wh-1', name: '0002.001', isActive: true, groupName: 'Deposito Central' },
  { id: 'wh-2', name: '0002.004', isActive: true, groupName: 'Deposito Central' },
  { id: 'wh-3', name: '0004.001', isActive: true, groupName: 'Deposito Sul' },
  { id: 'wh-4', name: '0004.003', isActive: true, groupName: 'Deposito Sul' },
  { id: 'wh-5', name: '0004.0004', isActive: true, groupName: 'Deposito Sul' },
  { id: 'wh-6', name: 'DEP01 - Depósito Central', isActive: true, groupName: 'Deposito Central' },
  { id: 'wh-7', name: 'DEP02 - Depósito Auxiliar', isActive: true, groupName: '' },
  { id: 'wh-8', name: 'DEP03 - Logística Reversa/Rápida', isActive: true, groupName: '' },
];

export const INITIAL_STOCK: StockBalance[] = [
  { id: 'stk-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', warehouse: 'DEP01 - Depósito Central', quantity: 12, pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', pr_preco: 3899.9000, vlrest: 3899.9000 },
  { id: 'stk-2', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 5, pr_cod: 10001, codigo: 'PROD000001', lote: 'LOTE000001', pr_preco: 3899.9000, vlrest: 3899.9000 },
  { id: 'stk-3', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', warehouse: 'DEP01 - Depósito Central', quantity: 4, pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', pr_preco: 1299.0000, vlrest: 1299.0000 },
  { id: 'stk-4', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', warehouse: 'DEP03 - Logística Reversa/Rápida', quantity: 6, pr_cod: 10002, codigo: 'PROD000002', lote: 'LOTE000002', pr_preco: 1299.0000, vlrest: 1299.0000 },
  { id: 'stk-5', productCode: 'PROD003', productName: 'Teclado Mecânico Keychron K2', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 18, pr_cod: 10003, codigo: 'PROD000003', lote: 'LOTE000003', pr_preco: 650.0000, vlrest: 650.0000 },
  { id: 'stk-6', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', warehouse: 'DEP01 - Depósito Central', quantity: 45, pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', pr_preco: 499.0000, vlrest: 499.0000 },
  { id: 'stk-7', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', warehouse: 'DEP02 - Depósito Auxiliar', quantity: 15, pr_cod: 10004, codigo: 'PROD000004', lote: 'LOTE000004', pr_preco: 499.0000, vlrest: 499.0000 },
  { id: 'stk-8', productCode: 'PROD005', productName: 'Headset Gamer HyperX Cloud II', warehouse: 'DEP03 - Logística Reversa/Rápida', quantity: 2, pr_cod: 10005, codigo: 'PROD000005', lote: 'LOTE000005', pr_preco: 549.9000, vlrest: 549.9000 },
  { id: 'stk-9', productCode: 'PROD006', productName: 'Smartphone Samsung Galaxy S23', warehouse: 'DEP01 - Depósito Central', quantity: 0, pr_cod: 10006, codigo: 'PROD000006', lote: 'LOTE000006', pr_preco: 4200.0000, vlrest: 4200.0000 },
];

export const INITIAL_ORDERS: OrderHeader[] = [
  {
    id: 'ord-1001',
    orderNumber: 'PED-1001',
    clientName: 'Tech Solutions Paulista Ltda',
    date: '2026-07-10',
    priority: 'Alta',
    items: [
      { id: 'itm-1-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', quantityOrdered: 8, unitPrice: 3899.90 },
      { id: 'itm-1-2', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', quantityOrdered: 10, unitPrice: 499.00 },
    ],
    notes: 'Cliente solicitou entrega prioritária no período da manhã.',
  },
  {
    id: 'ord-1002',
    orderNumber: 'PED-1002',
    clientName: 'Distribuidora Global Varejo',
    date: '2026-07-12',
    priority: 'Média',
    items: [
      { id: 'itm-2-1', productCode: 'PROD001', productName: 'Notebook Dell Inspiron 15', quantityOrdered: 10, unitPrice: 3899.90 },
      { id: 'itm-2-2', productCode: 'PROD005', productName: 'Headset Gamer HyperX Cloud II', quantityOrdered: 12, unitPrice: 549.90 },
      { id: 'itm-2-3', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', quantityOrdered: 5, unitPrice: 1299.00 },
    ],
    notes: 'Aguardando liberação de crédito para despacho completo.',
  },
  {
    id: 'ord-1003',
    orderNumber: 'PED-1003',
    clientName: 'Mariana Silva de Souza',
    date: '2026-07-13',
    priority: 'Baixa',
    items: [
      { id: 'itm-3-1', productCode: 'PROD003', productName: 'Teclado Mecânico Keychron K2', quantityOrdered: 3, unitPrice: 650.00 },
      { id: 'itm-3-2', productCode: 'PROD002', productName: 'Monitor LG UltraWide 29"', quantityOrdered: 8, unitPrice: 1299.00 },
    ],
    notes: 'Compra via e-commerce.',
  },
  {
    id: 'ord-1004',
    orderNumber: 'PED-1004',
    clientName: 'Alfa Engenharia e Sistemas',
    date: '2026-07-14',
    priority: 'Alta',
    items: [
      { id: 'itm-4-1', productCode: 'PROD006', productName: 'Smartphone Samsung Galaxy S23', quantityOrdered: 2, unitPrice: 4200.00 },
      { id: 'itm-4-2', productCode: 'PROD004', productName: 'Mouse Sem Fio Logitech MX Master 3', quantityOrdered: 5, unitPrice: 499.00 },
    ],
    notes: 'Retirada agendada pelo cliente.',
  }
];

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


