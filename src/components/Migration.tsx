import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { 
  DownloadCloud, 
  UploadCloud, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ArrowRight, 
  RefreshCw, 
  FileArchive,
  Layers,
  Building,
  Archive,
  FileText,
  User as UserIcon,
  Globe,
  Settings,
  TrendingUp
} from 'lucide-react';
import { StockBalance, OrderHeader, Product, UserAccount, WebhookConfig, FieldMapping, Warehouse, SaleRecord } from '../types';

interface MigrationProps {
  stock: StockBalance[];
  orders: OrderHeader[];
  products: Product[];
  users: UserAccount[];
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
  warehouses: Warehouse[];
  sales?: SaleRecord[];
  onOverwriteAll: (data: {
    stock: StockBalance[];
    orders: OrderHeader[];
    products: Product[];
    users: UserAccount[];
    webhooks: WebhookConfig[];
    fieldMappings: FieldMapping[];
    warehouses: Warehouse[];
    sales?: SaleRecord[];
  }) => void;
  onMergeAll: (data: {
    stock: StockBalance[];
    orders: OrderHeader[];
    products: Product[];
    users: UserAccount[];
    webhooks: WebhookConfig[];
    fieldMappings: FieldMapping[];
    warehouses: Warehouse[];
    sales?: SaleRecord[];
  }) => void;
}

interface BackupPayload {
  version: string;
  exportedAt: string;
  stock: StockBalance[];
  orders: OrderHeader[];
  products: Product[];
  users: UserAccount[];
  webhooks: WebhookConfig[];
  fieldMappings: FieldMapping[];
  warehouses: Warehouse[];
  sales?: SaleRecord[];
}

export default function Migration({
  stock,
  orders,
  products,
  users,
  webhooks,
  fieldMappings,
  warehouses,
  sales = [],
  onOverwriteAll,
  onMergeAll
}: MigrationProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BackupPayload | null>(null);
  const [importStrategy, setImportStrategy] = useState<'overwrite' | 'merge'>('overwrite');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger whole state ZIP download
  const handleExport = async () => {
    setIsExporting(true);
    setSuccessMessage('');
    setErrorMessage('');
    try {
      const dataToExport: BackupPayload = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        stock,
        orders,
        products,
        users,
        webhooks,
        fieldMappings,
        warehouses,
        sales
      };

      const zip = new JSZip();
      zip.file("backup_gerenciador_expedicao.json", JSON.stringify(dataToExport, null, 2));
      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_sistema_expedicao_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessMessage("Backup do ambiente gerado e baixado como ZIP com sucesso!");
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Erro ao criar arquivo ZIP de exportação: " + (err.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setSuccessMessage('');
    setErrorMessage('');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processZipFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuccessMessage('');
    setErrorMessage('');
    const files = e.target.files;
    if (files && files.length > 0) {
      processZipFile(files[0]);
    }
  };

  // Unpack and validate uploaded ZIP
  const processZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setErrorMessage("O arquivo enviado não é um arquivo ZIP válido.");
      setImportFile(null);
      setParsedData(null);
      return;
    }

    setIsImporting(true);
    setImportFile(file);
    try {
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file("backup_gerenciador_expedicao.json");
      if (!jsonFile) {
        throw new Error("O arquivo 'backup_gerenciador_expedicao.json' não foi encontrado dentro do arquivo ZIP.");
      }

      const jsonText = await jsonFile.async("string");
      const backupObj = JSON.parse(jsonText) as BackupPayload;

      // Basic validation
      if (!backupObj || typeof backupObj !== 'object') {
        throw new Error("Estrutura do backup em JSON inválida.");
      }

      setParsedData(backupObj);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Falha ao processar arquivo de backup: " + (err.message || "Erro de decodificação de ZIP"));
      setImportFile(null);
      setParsedData(null);
    } finally {
      setIsImporting(false);
    }
  };

  // Perform actual import
  const handleImportExecute = () => {
    if (!parsedData) return;

    try {
      if (importStrategy === 'overwrite') {
        onOverwriteAll(parsedData);
        setSuccessMessage("Backup importado com sucesso! Todos os dados anteriores foram substituídos.");
      } else {
        onMergeAll(parsedData);
        setSuccessMessage("Backup mesclado com sucesso! Os novos registros foram adicionados à sua conta.");
      }
      // Reset after success
      setImportFile(null);
      setParsedData(null);
    } catch (err: any) {
      setErrorMessage("Erro ao efetivar a importação: " + (err.message || err));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-3xs">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Database className="h-6 w-6 text-indigo-600" />
          Backup &amp; Migração de Ambiente
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Esta ferramenta permite baixar todo o estado atual da sua conta do Gerenciador de Expedição em um <strong>arquivo ZIP compactado</strong>. 
          Você pode usar este arquivo para migrar seu ambiente completo para outra conta do AI Studio de forma rápida e segura.
        </p>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* EXPORT CARD */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-150 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <DownloadCloud className="h-5 w-5 text-indigo-600" />
              1. Exportar Ambiente Atual
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Gere e baixe o pacote compactado contendo todos os dados do sistema.
            </p>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
            
            {/* Display inventory of what is being exported */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conteúdo do Pacote de Backup</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Building className="h-4.5 w-4.5 text-indigo-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{stock.length}</span>
                    <span className="text-slate-400">Saldos de Estoque</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Archive className="h-4.5 w-4.5 text-emerald-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{products.length}</span>
                    <span className="text-slate-400">Produtos</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <FileText className="h-4.5 w-4.5 text-blue-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{orders.length}</span>
                    <span className="text-slate-400">Pedidos em Aberto</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{sales.length}</span>
                    <span className="text-slate-400">Vendas</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <UserIcon className="h-4.5 w-4.5 text-amber-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{users.length}</span>
                    <span className="text-slate-400">Contas de Usuário</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Globe className="h-4.5 w-4.5 text-pink-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{webhooks.length}</span>
                    <span className="text-slate-400">Webhooks API</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Settings className="h-4.5 w-4.5 text-teal-500" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 font-mono block">{fieldMappings.length}</span>
                    <span className="text-slate-400">Mapeamentos</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Gerando ZIP...
                  </>
                ) : (
                  <>
                    <DownloadCloud className="h-5 w-5" />
                    Baixar como Arquivo ZIP
                  </>
                )}
              </button>
              <span className="block text-[10px] text-slate-400 text-center mt-2">
                O arquivo ZIP gerado pode ser carregado diretamente na aba de importação de sua nova conta.
              </span>
            </div>
          </div>
        </div>

        {/* IMPORT CARD */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-150 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-indigo-600" />
              2. Importar Ambiente / Backup
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Faça upload do arquivo ZIP baixado da conta anterior para restaurar os dados.
            </p>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
            
            {!parsedData ? (
              /* Drag and Drop Zone */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all min-h-[220px] ${
                  isDragOver
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/30'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".zip"
                  className="hidden"
                />
                
                {isImporting ? (
                  <div className="space-y-2">
                    <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">Processando arquivo compactado...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-indigo-50 rounded-full text-indigo-600 inline-block">
                      <FileArchive className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Arraste o arquivo ZIP de backup aqui</p>
                      <p className="text-xs text-slate-400 mt-1">ou clique para selecionar o arquivo em seu computador</p>
                    </div>
                    <span className="inline-block px-2.5 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg">
                      Suporta apenas .ZIP de migração
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Backup Data Preview & Confirmation Options */
              <div className="space-y-4 flex-1">
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                      <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600" />
                      Backup Carregado com Sucesso!
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportFile(null);
                        setParsedData(null);
                      }}
                      className="text-[10px] text-red-600 hover:underline font-bold cursor-pointer"
                    >
                      Remover arquivo
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                    Nome: <span className="font-mono text-slate-800 font-bold">{importFile?.name}</span> <br/>
                    Exportado em: <span className="font-mono text-slate-800 font-bold">{new Date(parsedData.exportedAt).toLocaleString()}</span>
                  </div>

                  {/* Summary of items in backup */}
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-600">
                    <div>📦 Estoque: <strong className="text-slate-800">{parsedData.stock?.length || 0}</strong></div>
                    <div>📈 Vendas: <strong className="text-slate-800">{parsedData.sales?.length || 0}</strong></div>
                    <div>🏷️ Produtos: <strong className="text-slate-800">{parsedData.products?.length || 0}</strong></div>
                    <div>📄 Pedidos: <strong className="text-slate-800">{parsedData.orders?.length || 0}</strong></div>
                    <div>👥 Usuários: <strong className="text-slate-800">{parsedData.users?.length || 0}</strong></div>
                    <div>🌐 Webhooks: <strong className="text-slate-800">{parsedData.webhooks?.length || 0}</strong></div>
                  </div>
                </div>

                {/* Import Strategy Selectors */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Selecione o Modo de Importação</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label 
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-1.5 cursor-pointer select-none transition-all ${
                        importStrategy === 'overwrite'
                          ? 'border-indigo-600 bg-indigo-50/30'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <input
                          type="radio"
                          name="importStrategy"
                          checked={importStrategy === 'overwrite'}
                          onChange={() => setImportStrategy('overwrite')}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        Substituir Tudo
                      </div>
                      <span className="text-[10px] text-slate-400 leading-snug font-medium">
                        Apaga o estado local atual e restaura exatamente os dados do backup. <strong>(Recomendado para migração de conta nova)</strong>
                      </span>
                    </label>

                    <label 
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-1.5 cursor-pointer select-none transition-all ${
                        importStrategy === 'merge'
                          ? 'border-indigo-600 bg-indigo-50/30'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <input
                          type="radio"
                          name="importStrategy"
                          checked={importStrategy === 'merge'}
                          onChange={() => setImportStrategy('merge')}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        Mesclar Registros
                      </div>
                      <span className="text-[10px] text-slate-400 leading-snug font-medium">
                        Mantém os seus dados atuais locais intactos e apenas adiciona os novos dados sem duplicar chaves existentes.
                      </span>
                    </label>
                  </div>
                </div>

                {/* Strategy alert */}
                {importStrategy === 'overwrite' ? (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 flex items-start gap-1.5 leading-relaxed">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Atenção: Ação Destrutiva</span>
                      Todos os saldos de estoque, produtos, pedidos, usuários e webhooks configurados nesta aba local atualmente <strong>serão permanentemente apagados</strong> e substituídos pelo backup.
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-[11px] text-blue-800 flex items-start gap-1.5 leading-relaxed">
                    <Info className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Modo de Concatenação Seguro</span>
                      Apenas novos produtos, webhooks e usuários serão adicionados. Saldos de estoque e pedidos serão agregados ao seu painel local sem limpar o histórico atual.
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleImportExecute}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <span>Finalizar Importação do Backup</span>
                    <ArrowRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="text-[10px] text-slate-400 text-center select-none leading-relaxed">
              O arquivo importado precisa ser um ZIP estruturado válido contendo o arquivo de dados gerado pela ferramenta de exportação.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
