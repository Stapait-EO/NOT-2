import ExcelJS from 'exceljs';
import { Product, StockBalance } from '../types';

export interface ExportSalesExcelParams {
  skus: string[];
  monthColumns: { key: string; label: string }[];
  salesBySku: Map<string, Record<string, number>>;
  skuTotals: Record<string, {
    last12: number;
    grandTotal: number;
    monthsCount12: number;
    monthsCountAll: number;
    projectedPace: number;
    proj30: number;
    proj60: number;
    proj90: number;
    proj120: number;
  }>;
  getSkuStock: (sku: string) => { quantity: number; value: number };
  getSkuCoverage: (sku: string) => number;
  getSkuTurnoverClass: (sku: string) => string;
  products: Product[];
  stock?: StockBalance[];
  viewPeriod: 'last12closed' | 'all';
  stockGroupFilter: string;
  columnTotals: {
    sumPeriodTotal: number;
    sumPaceTotal: number;
    sumProj30Total: number;
    sumProj60Total: number;
    sumProj90Total: number;
    sumProj120Total: number;
    sumStockQty: number;
    sumStockValue: number;
    sumCoverage: number;
    colSums: Record<string, number>;
  };
}

// Estilos de preenchimento e cores ARGB para Cobertura
function getCoverageExcelStyle(coverage: number): { fill: string; fontColor: string } {
  if (coverage === 0) {
    // Ruptura (0 dias) - Rosa/Vermelho
    return { fill: 'FFFFE4E6', fontColor: 'FF9F1239' };
  }
  if (coverage >= 1 && coverage <= 30) {
    // Crítico (1 a 30 dias) - Vermelho claro
    return { fill: 'FFFEE2E2', fontColor: 'FF991B1B' };
  }
  if (coverage >= 31 && coverage <= 60) {
    // Atenção (31 a 60 dias) - Âmbar
    return { fill: 'FFFEF3C7', fontColor: 'FF92400E' };
  }
  if (coverage >= 61 && coverage <= 120) {
    // Adequado (61 a 120 dias) - Esmeralda
    return { fill: 'FFD1FAE5', fontColor: 'FF065F46' };
  }
  if (coverage >= 121 && coverage <= 365) {
    // Excesso (121 a 365 dias) - Azul
    return { fill: 'FFDBEAFE', fontColor: 'FF1E40AF' };
  }
  if (coverage === 9999) {
    // Sem Saída (9999 dias) - Cinza
    return { fill: 'FFF4F4F5', fontColor: 'FF52525B' };
  }
  // > 365 dias (Longa Cobertura) - Índigo
  return { fill: 'FFE0E7FF', fontColor: 'FF3730A3' };
}

// Estilos de preenchimento e cores ARGB para Classe de Giro
function getTurnoverExcelStyle(turnoverClass: string): { fill: string; fontColor: string } {
  const norm = (turnoverClass || '').toUpperCase();
  if (norm.includes('CLASSE A') || norm === 'A') {
    return { fill: 'FFD1FAE5', fontColor: 'FF065F46' };
  }
  if (norm.includes('CLASSE B') || norm === 'B') {
    return { fill: 'FFDBEAFE', fontColor: 'FF1E40AF' };
  }
  if (norm.includes('CLASSE C') || norm === 'C') {
    return { fill: 'FFFEF3C7', fontColor: 'FF92400E' };
  }
  if (norm.includes('CLASSE D') || norm === 'D') {
    return { fill: 'FFF1F5F9', fontColor: 'FF475569' };
  }
  // Sem Saída ou outro
  return { fill: 'FFF4F4F5', fontColor: 'FF71717A' };
}

export async function exportSalesToExcel(params: ExportSalesExcelParams): Promise<void> {
  const {
    skus,
    monthColumns,
    salesBySku,
    skuTotals,
    getSkuStock,
    getSkuCoverage,
    getSkuTurnoverClass,
    products,
    stock = [],
    viewPeriod,
    stockGroupFilter,
    columnTotals,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'App Notifier';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Analise Consumo', {
    views: [
      {
        state: 'frozen',
        xSplit: 2, // Fixa as colunas A (SKU) e B (Descrição)
        ySplit: 1, // Fixa o cabeçalho (linha 1)
        activeCell: 'C2'
      }
    ]
  });

  const totalColHeader = viewPeriod === 'last12closed' ? 'Total (Últimos 12m)' : 'Total Geral';
  const monthsColHeader = viewPeriod === 'last12closed' ? 'Meses c/ Venda (de 12)' : 'Meses c/ Venda';
  const stockColHeader = stockGroupFilter === 'all' ? 'Estoque (Qtd)' : `Estoque (${stockGroupFilter})`;
  const stockValColHeader = stockGroupFilter === 'all' ? 'Valor Estoque ($)' : `Valor Estoque (${stockGroupFilter})`;

  // Definição das colunas
  const columnsDef = [
    { key: 'sku', header: 'CÓDIGO (SKU)', width: 16, align: 'left' },
    { key: 'description', header: 'DESCRIÇÃO DO PRODUTO', width: 34, align: 'left' },
    ...monthColumns.map(c => ({
      key: `m_${c.key}`,
      header: c.label,
      width: 12,
      align: 'right'
    })),
    { key: 'periodTotal', header: totalColHeader, width: 16, align: 'right' },
    { key: 'monthsCount', header: monthsColHeader, width: 14, align: 'center' },
    { key: 'pace', header: 'Ritmo Proj./mês', width: 15, align: 'right' },
    { key: 'proj30', header: 'Proj. 30d', width: 12, align: 'right' },
    { key: 'proj60', header: 'Proj. 60d', width: 12, align: 'right' },
    { key: 'proj90', header: 'Proj. 90d', width: 12, align: 'right' },
    { key: 'proj120', header: 'Proj. 120d', width: 12, align: 'right' },
    { key: 'stockQty', header: stockColHeader, width: 14, align: 'right' },
    { key: 'stockVal', header: stockValColHeader, width: 17, align: 'right' },
    { key: 'coverage', header: 'Cobertura (dias)', width: 16, align: 'center' },
    { key: 'turnover', header: 'Classe Giro', width: 16, align: 'center' },
  ];

  // Adiciona a linha de cabeçalho
  const headerRowValues = columnsDef.map(c => c.header);
  const headerRow = worksheet.addRow(headerRowValues);
  headerRow.height = 28;

  // Formatação rica dos cabeçalhos com cores de grupo temático
  headerRow.eachCell((cell, colNumber) => {
    const colDef = columnsDef[colNumber - 1];
    let headerFill = 'FF1E293B'; // Default Slate 800

    if (colNumber <= 2) {
      // Identificação (SKU e Descrição)
      headerFill = 'FF1E293B'; // Slate 800
    } else if (colNumber <= 2 + monthColumns.length) {
      // Meses de histórico de vendas
      headerFill = 'FF334155'; // Slate 700
    } else if (colDef.key === 'periodTotal' || colDef.key === 'monthsCount') {
      // Totais de período
      headerFill = 'FF312E81'; // Indigo 900
    } else if (colDef.key.startsWith('proj') || colDef.key === 'pace') {
      // Projeções futuras
      headerFill = 'FF1E40AF'; // Blue 800
    } else if (colDef.key === 'stockQty' || colDef.key === 'stockVal') {
      // Estoque e Valor
      headerFill = 'FF065F46'; // Emerald 800
    } else if (colDef.key === 'coverage' || colDef.key === 'turnover') {
      // Indicadores analíticos
      headerFill = 'FF4C1D95'; // Purple 900
    }

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: headerFill }
    };
    cell.font = {
      name: 'Segoe UI',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colDef.align as any,
      wrapText: false
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } }
    };
  });

  // Linhas de dados
  skus.forEach((sku, rowIndex) => {
    const pName = products.find(p => 
      p.code.toLowerCase() === sku.toLowerCase() ||
      p.codigo?.toLowerCase() === sku.toLowerCase() ||
      (p.pr_cod !== undefined && String(p.pr_cod).toLowerCase() === sku.toLowerCase())
    )?.name || 
    stock.find(s => (s.productCode || s.codigo || '').toLowerCase() === sku.toLowerCase())?.productName || '';

    const monthData = salesBySku.get(sku) || {};
    const rowPeriodTotal = viewPeriod === 'last12closed'
      ? (skuTotals[sku]?.last12 || 0)
      : (skuTotals[sku]?.grandTotal || 0);

    const rowMonthsCount = viewPeriod === 'last12closed'
      ? (skuTotals[sku]?.monthsCount12 || 0)
      : (skuTotals[sku]?.monthsCountAll || 0);

    const paceVal = skuTotals[sku]?.projectedPace || 0;
    const proj30 = skuTotals[sku]?.proj30 || 0;
    const proj60 = skuTotals[sku]?.proj60 || 0;
    const proj90 = skuTotals[sku]?.proj90 || 0;
    const proj120 = skuTotals[sku]?.proj120 || 0;

    const stk = getSkuStock(sku);
    const cov = getSkuCoverage(sku);
    const turnoverClass = getSkuTurnoverClass(sku);

    const rowValues: (string | number | null)[] = [
      sku,
      pName,
      ...monthColumns.map(c => {
        const val = monthData[c.key];
        return val !== undefined && val > 0 ? val : null;
      }),
      rowPeriodTotal,
      rowMonthsCount,
      paceVal,
      proj30,
      proj60,
      proj90,
      proj120,
      stk.quantity,
      stk.value,
      cov === 9999 ? 'Sem Saída' : cov,
      turnoverClass
    ];

    const dataRow = worksheet.addRow(rowValues);
    dataRow.height = 20;

    const isEven = rowIndex % 2 === 1;
    const defaultBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    dataRow.eachCell((cell, colNumber) => {
      const colDef = columnsDef[colNumber - 1];

      // Fonte base
      cell.font = {
        name: 'Segoe UI',
        size: 9.5,
        color: { argb: 'FF1E293B' }
      };

      // Alinhamento
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef.align as any
      };

      // Fundo padrão
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: defaultBg }
      };

      // Borda sutil
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
      };

      // Formatação específica por coluna:
      if (colDef.key === 'sku') {
        cell.font = { name: 'Consolas', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      } else if (colDef.key === 'description') {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF475569' } };
      } else if (colDef.key.startsWith('m_')) {
        cell.numFmt = '#,##0';
        if (cell.value === null || cell.value === undefined) {
          cell.value = '-';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF94A3B8' } };
        }
      } else if (colDef.key === 'periodTotal') {
        cell.numFmt = '#,##0';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E1B4B' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFEEF2FF' : 'FFF5F7FF' }
        };
      } else if (colDef.key === 'monthsCount') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF475569' } };
      } else if (colDef.key === 'pace') {
        cell.numFmt = '#,##0';
        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E40AF' } };
      } else if (colDef.key.startsWith('proj')) {
        cell.numFmt = '#,##0';
      } else if (colDef.key === 'stockQty') {
        cell.numFmt = '#,##0';
        if (stk.quantity <= 0) {
          // Destaque de Ruptura / Estoque zerado
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' }
          };
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF991B1B' } };
        } else {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF065F46' } };
        }
      } else if (colDef.key === 'stockVal') {
        cell.numFmt = '"$ "#,##0.00';
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF065F46' } };
      } else if (colDef.key === 'coverage') {
        const covStyle = getCoverageExcelStyle(cov);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: covStyle.fill }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 9,
          bold: true,
          color: { argb: covStyle.fontColor }
        };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0" d"';
        }
      } else if (colDef.key === 'turnover') {
        const turnStyle = getTurnoverExcelStyle(turnoverClass);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: turnStyle.fill }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 9,
          bold: true,
          color: { argb: turnStyle.fontColor }
        };
      }
    });
  });

  // Linha de TOTAL GERAL
  const totalCoverage = columnTotals.sumCoverage === 9999 ? 'Sem Saída' : columnTotals.sumCoverage;
  const totalRowValues: (string | number | null)[] = [
    'TOTAL GERAL',
    `${skus.length} SKUs listados`,
    ...monthColumns.map(c => columnTotals.colSums[c.key] || 0),
    columnTotals.sumPeriodTotal,
    '-',
    columnTotals.sumPaceTotal,
    columnTotals.sumProj30Total,
    columnTotals.sumProj60Total,
    columnTotals.sumProj90Total,
    columnTotals.sumProj120Total,
    columnTotals.sumStockQty,
    columnTotals.sumStockValue,
    totalCoverage,
    '-'
  ];

  const totalRow = worksheet.addRow(totalRowValues);
  totalRow.height = 24;

  totalRow.eachCell((cell, colNumber) => {
    const colDef = columnsDef[colNumber - 1];

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' } // Slate 200
    };
    cell.font = {
      name: 'Segoe UI',
      size: 10,
      bold: true,
      color: { argb: 'FF0F172A' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colDef.align as any
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };

    if (colDef.key === 'stockVal') {
      cell.numFmt = '"$ "#,##0.00';
    } else if (typeof cell.value === 'number') {
      cell.numFmt = '#,##0';
    }
  });

  // Ajuste fino das larguras de coluna
  columnsDef.forEach((col, idx) => {
    const sheetCol = worksheet.getColumn(idx + 1);
    sheetCol.width = col.width;
  });

  // Ativa AutoFiltro em toda a tabela
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: skus.length + 1, column: columnsDef.length }
  };

  // Gerar e disparar download do arquivo .xlsx
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Analise_Consumo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
