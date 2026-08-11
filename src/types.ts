export interface StockBalance {
  id: string;
  productCode: string;
  productName: string;
  warehouse: string;
  quantity: number;
  pr_cod?: number;
  codigo?: string;
  lote?: string;
  pr_preco?: number;
  vlrest?: number;
}

export interface OrderItem {
  id: string;
  productCode: string;
  productName: string;
  quantityOrdered: number;
  unitPrice: number;
}

export interface OrderHeader {
  id: string;
  orderNumber: string;
  clientName: string;
  date: string;
  priority: 'Alta' | 'Média' | 'Baixa';
  items: OrderItem[];
  notes?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  isActive: boolean;
  groupName: string;
}

export interface Product {
  code: string;
  name: string;
  category?: string;
  pr_cod?: number;
  codigo?: string;
  lote?: string;
  avgQty1x?: number;
  avgQty3x?: number;
}

export type UserRole = 'admin' | 'vendedor' | 'almoxarife';

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string; // Simplified password string for local demo persistence
  createdAt: string;
  role: UserRole;
}

export interface WebhookConfig {
  id: string;
  seq: number;
  tableName: string;
  url: string;
  secretKey: string;
  filterCondition: string;
  createdAt: string;
  isActive: boolean;
  targetScreen?: string;
}

export interface FieldMapping {
  id: string;
  webhookId: string;
  systemTable: string;
  mappings: { [field: string]: string }; // e.g. { "productCode": "sku", "quantity": "stock" }
  updatedAt: string;
}


