import ExcelJS from 'exceljs';
import { StockBalance, Product } from '../types';

export interface ExportStockConsolidatedItem {
  productCode: string;
  productName: string;
  correlations?: { code: string; multiplier: number; description?: string }[];
  groups: {
    [groupName: string]: {
      quantity: number;
      sumPrPrecoTimesQty: number;
      sumVlrestTimesQty: number;
    };
  };
}

export interface ExportStockExcelParams {
  viewMode: 'consolidated' | 'detailed';
  groupedStock: ExportStockConsolidatedItem[];
  filteredStock: StockBalance[];
  displayedGroups: string[];
  groupTotals: { [groupName: string]: number };
  getProductOrdersSummary: (productCode: string) => { totalQtyOrdered: number; ordersCount: number };
  selectedWarehouseFilter: string;
  searchTerm?: string;
  products: Product[];
  getWarehouseGroup?: (whName: string) => string;
}

export async function exportStockToExcel(params: ExportStockExcelParams): Promise<void> {
  const {
    viewMode,
    groupedStock,
    filteredStock,
    displayedGroups,
    groupTotals,
    getProductOrdersSummary,
    selectedWarehouseFilter,
    searchTerm,
    products,
    getWarehouseGroup
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'App Notifier';
  workbook.created = new Date();

  const isConsolidated = viewMode === 'consolidated';

  if (isConsolidated) {
    // ----------------------------------------------------
    // CONSOLIDATED VIEW EXPORT (Default & Primary Grid)
    // ----------------------------------------------------
    const sheetName = selectedWarehouseFilter !== 'Todos'
      ? `Estoque - ${selectedWarehouseFilter}`.slice(0, 31)
      : 'Analise Estoque';

    const worksheet = workbook.addWorksheet(sheetName, {
      views: [
        {
          state: 'frozen',
          xSplit: 2, // Freeze columns A (SKU) and B (Description)
          ySplit: 2, // Freeze header rows (rows 1 and 2)
          activeCell: 'C3'
        }
      ]
    });

    // Determine columns structure
    // Col 1: SKU
    // Col 2: Product Name
    // Col 3: Pedidos em Aberto (A Sair)
    // Then for each group: Quantidade, Preço Unit Médio, Vr Total Médio
    interface ColDef {
      key: string;
      headerTop: string;
      headerSub: string;
      groupName?: string;
      width: number;
      align: 'left' | 'center' | 'right';
      isCurrency?: boolean;
      isQuantity?: boolean;
    }

    const colDefs: ColDef[] = [
      { key: 'sku', headerTop: 'CÓDIGO (SKU)', headerSub: 'CÓDIGO (SKU)', width: 18, align: 'left' },
      { key: 'product', headerTop: 'PRODUTO', headerSub: 'PRODUTO', width: 44, align: 'left' },
      { key: 'openOrders', headerTop: 'PEDIDOS EM ABERTO', headerSub: 'TOTAL A SAIR (UN)', width: 22, align: 'right', isQuantity: true }
    ];

    displayedGroups.forEach(grp => {
      const grpTotal = groupTotals[grp] || 0;
      const grpLabel = `${grp.toUpperCase()} = $ ${grpTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      colDefs.push({
        key: `qty_${grp}`,
        headerTop: grpLabel,
        headerSub: 'Quantidade',
        groupName: grp,
        width: 16,
        align: 'right',
        isQuantity: true
      });
      colDefs.push({
        key: `price_${grp}`,
        headerTop: grpLabel,
        headerSub: 'Preço Unit Médio',
        groupName: grp,
        width: 18,
        align: 'right',
        isCurrency: true
      });
      colDefs.push({
        key: `total_${grp}`,
        headerTop: grpLabel,
        headerSub: 'Vr Total Médio',
        groupName: grp,
        width: 20,
        align: 'right',
        isCurrency: true
      });
    });

    // Row 1: Top Headers
    const row1Values = colDefs.map(c => c.headerTop);
    const row1 = worksheet.addRow(row1Values);
    row1.height = 26;

    // Row 2: Sub Headers
    const row2Values = colDefs.map(c => c.headerSub);
    const row2 = worksheet.addRow(row2Values);
    row2.height = 24;

    // Merge A1:A2, B1:B2, C1:C2
    worksheet.mergeCells('A1:A2');
    worksheet.mergeCells('B1:B2');
    worksheet.mergeCells('C1:C2');

    // Merge group super headers in Row 1 (every 3 columns starting at column 4)
    displayedGroups.forEach((grp, idx) => {
      const colStart = 4 + idx * 3;
      worksheet.mergeCells(1, colStart, 1, colStart + 2);
    });

    // Styling Row 1
    row1.eachCell((cell, colNumber) => {
      let bg = 'FF1E293B'; // Slate 800
      if (colNumber === 3) {
        bg = 'FF78350F'; // Amber 900
      } else if (colNumber >= 4) {
        bg = 'FF312E81'; // Indigo 900
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bg }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center'
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'thin', color: { argb: 'FF334155' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    // Styling Row 2
    row2.eachCell((cell, colNumber) => {
      const def = colDefs[colNumber - 1];
      let bg = 'FF334155'; // Slate 700
      if (colNumber === 3) {
        bg = 'FF92400E'; // Amber 800
      } else if (colNumber >= 4) {
        if (def.isQuantity) bg = 'FF3730A3'; // Indigo 800
        else if (def.key.startsWith('price_')) bg = 'FF065F46'; // Emerald 800
        else if (def.key.startsWith('total_')) bg = 'FF1E3A8A'; // Blue 900
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bg }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 9.5,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: def.align
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        right: { style: 'thin', color: { argb: 'FF475569' } }
      };
    });

    // Column widths
    colDefs.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width;
    });

    // Accumulators for total row
    let totalOpenOrdersSum = 0;
    const groupTotalsAccum: {
      [grp: string]: {
        totalQty: number;
        totalValue: number;
      };
    } = {};

    displayedGroups.forEach(grp => {
      groupTotalsAccum[grp] = { totalQty: 0, totalValue: 0 };
    });

    // Data Rows
    groupedStock.forEach((row, rowIndex) => {
      const ordersSummary = getProductOrdersSummary(row.productCode);
      const openQty = ordersSummary.totalQtyOrdered || 0;
      totalOpenOrdersSum += openQty;

      const rowValues: (string | number | null)[] = [
        row.productCode,
        row.productName,
        openQty > 0 ? openQty : null
      ];

      displayedGroups.forEach(grp => {
        const data = row.groups[grp] || { quantity: 0, sumPrPrecoTimesQty: 0, sumVlrestTimesQty: 0 };
        const qty = data.quantity || 0;
        const avgPrice = qty > 0 ? data.sumPrPrecoTimesQty / qty : 0;
        const totalVal = avgPrice * qty;

        groupTotalsAccum[grp].totalQty += qty;
        groupTotalsAccum[grp].totalValue += totalVal;

        rowValues.push(qty > 0 ? qty : null);
        rowValues.push(qty > 0 ? avgPrice : null);
        rowValues.push(qty > 0 ? totalVal : null);
      });

      const dataRow = worksheet.addRow(rowValues);
      dataRow.height = 20;

      const isEven = rowIndex % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      dataRow.eachCell((cell, colNumber) => {
        const def = colDefs[colNumber - 1];

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 9.5,
          color: { argb: 'FF1E293B' },
          bold: colNumber === 1
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: def.align
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (def.isCurrency) {
          cell.numFmt = '"$ "#,##0.00';
        } else if (def.isQuantity) {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Total Row
    const totalRowValues: (string | number | null)[] = [
      'TOTAL GERAL',
      `${groupedStock.length} produtos filtrados`,
      totalOpenOrdersSum > 0 ? totalOpenOrdersSum : null
    ];

    displayedGroups.forEach(grp => {
      const accum = groupTotalsAccum[grp];
      const avgWeightedPrice = accum.totalQty > 0 ? accum.totalValue / accum.totalQty : 0;
      totalRowValues.push(accum.totalQty > 0 ? accum.totalQty : null);
      totalRowValues.push(accum.totalQty > 0 ? avgWeightedPrice : null);
      totalRowValues.push(accum.totalValue > 0 ? accum.totalValue : null);
    });

    const totalRow = worksheet.addRow(totalRowValues);
    totalRow.height = 24;

    totalRow.eachCell((cell, colNumber) => {
      const def = colDefs[colNumber - 1];

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
        horizontal: def.align
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF475569' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      if (def.isCurrency) {
        cell.numFmt = '"$ "#,##0.00';
      } else if (def.isQuantity) {
        cell.numFmt = '#,##0';
      }
    });

    // Autofilter on row 2
    worksheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: groupedStock.length + 2, column: colDefs.length }
    };
  } else {
    // ----------------------------------------------------
    // DETAILED VIEW EXPORT (Individual Stock Records)
    // ----------------------------------------------------
    const sheetName = 'Estoque Detalhado';
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [
        {
          state: 'frozen',
          xSplit: 2,
          ySplit: 1,
          activeCell: 'C2'
        }
      ]
    });

    interface DetailedColDef {
      key: string;
      header: string;
      width: number;
      align: 'left' | 'center' | 'right';
      isCurrency?: boolean;
      isQuantity?: boolean;
    }

    const detailedCols: DetailedColDef[] = [
      { key: 'code', header: 'CÓDIGO (SKU)', width: 18, align: 'left' },
      { key: 'name', header: 'PRODUTO', width: 40, align: 'left' },
      { key: 'openOrders', header: 'PEDIDOS EM ABERTO (UN)', width: 22, align: 'right', isQuantity: true },
      { key: 'warehouse', header: 'DEPÓSITO', width: 15, align: 'left' },
      { key: 'group', header: 'GRUPO', width: 16, align: 'left' },
      { key: 'pr_cod', header: 'CÓD. INTERNO', width: 16, align: 'left' },
      { key: 'codigo', header: 'CÓD. ESTRUTURADO', width: 18, align: 'left' },
      { key: 'lote', header: 'LOTE', width: 16, align: 'left' },
      { key: 'price', header: 'PREÇO UNIT ($)', width: 16, align: 'right', isCurrency: true },
      { key: 'vlrest', header: 'VL REST ($)', width: 16, align: 'right', isCurrency: true },
      { key: 'quantity', header: 'QUANTIDADE SALDO (UN)', width: 22, align: 'right', isQuantity: true },
      { key: 'totalVal', header: 'VR TOTAL SALDO ($)', width: 20, align: 'right', isCurrency: true }
    ];

    const headerRow = worksheet.addRow(detailedCols.map(c => c.header));
    headerRow.height = 26;

    headerRow.eachCell((cell, colNumber) => {
      const colDef = detailedCols[colNumber - 1];
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef.align
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        right: { style: 'thin', color: { argb: 'FF475569' } }
      };
    });

    detailedCols.forEach((c, idx) => {
      worksheet.getColumn(idx + 1).width = c.width;
    });

    let totalStockQty = 0;
    let totalStockVal = 0;

    filteredStock.forEach((item, rowIndex) => {
      const prod = products.find(p => p.code === item.productCode);
      const displayPrCod = item.pr_cod !== undefined ? item.pr_cod : prod?.pr_cod;
      const displayCodigo = item.codigo || prod?.codigo || '';
      const displayLote = item.lote || prod?.lote || '';
      const displayPrPreco = item.pr_preco !== undefined ? item.pr_preco : ((prod as any)?.pr_preco || 0);
      const displayVlrest = item.vlrest !== undefined ? item.vlrest : ((prod as any)?.vlrest || 0);

      const ordersSummary = getProductOrdersSummary(item.productCode);
      const itemGroup = getWarehouseGroup ? getWarehouseGroup(item.warehouse) : '';
      const rowTotalVal = (item.quantity || 0) * displayPrPreco;

      totalStockQty += item.quantity || 0;
      totalStockVal += rowTotalVal;

      const rowValues = [
        item.productCode,
        item.productName,
        ordersSummary.totalQtyOrdered > 0 ? ordersSummary.totalQtyOrdered : null,
        item.warehouse,
        itemGroup,
        displayPrCod ? String(displayPrCod) : '',
        displayCodigo,
        displayLote,
        displayPrPreco > 0 ? displayPrPreco : null,
        displayVlrest > 0 ? displayVlrest : null,
        item.quantity || 0,
        rowTotalVal > 0 ? rowTotalVal : null
      ];

      const dataRow = worksheet.addRow(rowValues);
      dataRow.height = 20;

      const isEven = rowIndex % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      dataRow.eachCell((cell, colNumber) => {
        const def = detailedCols[colNumber - 1];

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 9.5,
          color: { argb: 'FF1E293B' },
          bold: colNumber === 1
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: def.align
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if (def.isCurrency) {
          cell.numFmt = '"$ "#,##0.00';
        } else if (def.isQuantity) {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Total Row for Detailed
    const totalRowValues: (string | number | null)[] = [
      'TOTAL GERAL',
      `${filteredStock.length} lançamentos de estoque`,
      null,
      '',
      '',
      '',
      '',
      '',
      null,
      null,
      totalStockQty,
      totalStockVal
    ];

    const totalRow = worksheet.addRow(totalRowValues);
    totalRow.height = 24;

    totalRow.eachCell((cell, colNumber) => {
      const def = detailedCols[colNumber - 1];
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: true,
        color: { argb: 'FF0F172A' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: def.align
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF475569' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      if (def.isCurrency) {
        cell.numFmt = '"$ "#,##0.00';
      } else if (def.isQuantity) {
        cell.numFmt = '#,##0';
      }
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: filteredStock.length + 1, column: detailedCols.length }
    };
  }

  // Generate binary buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const dateSuffix = new Date().toISOString().slice(0, 10);
  const cleanFilterName = selectedWarehouseFilter !== 'Todos'
    ? `_${selectedWarehouseFilter.replace(/[^a-zA-Z0-9_-]/g, '_')}`
    : '';

  link.setAttribute('download', `Analise_Estoque${cleanFilterName}_${dateSuffix}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
