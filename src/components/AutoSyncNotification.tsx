import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, X, Zap } from 'lucide-react';

export interface AutoSyncState {
  isRunning: boolean;
  executedCount: number;
  successfulCount: number;
  failedCount: number;
  details: {
    name: string;
    target: string;
    count: number;
    success: boolean;
    error?: string;
  }[];
  completedAt?: string;
  visible: boolean;
}

interface AutoSyncNotificationProps {
  status: AutoSyncState;
  onClose: () => void;
  onRetry?: () => void;
}

export const AutoSyncNotification: React.FC<AutoSyncNotificationProps> = ({
  status,
  onClose,
  onRetry
}) => {
  if (!status.visible) return null;

  // Running state
  if (status.isRunning) {
    return (
      <div 
        id="auto-sync-running-banner"
        className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-blue-900 transition-all duration-300 shadow-2xs"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1 bg-blue-600 text-white rounded-md animate-pulse shrink-0">
              <Zap className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-blue-950">Sincronização Automática:</span>
              <span className="text-blue-800">
                Executando {status.executedCount} {status.executedCount === 1 ? 'API configurada como "Automática"' : 'APIs configuradas como "Automática"'} no login...
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
            <span className="text-xs font-semibold text-blue-700 hidden sm:inline">Processando</span>
          </div>
        </div>
      </div>
    );
  }

  // All successful
  if (status.failedCount === 0 && status.successfulCount > 0) {
    return (
      <div 
        id="auto-sync-success-banner"
        className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 text-emerald-900 transition-all duration-300 shadow-2xs"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-bold text-emerald-950">Sincronização Automática Concluída:</span>
              <span className="text-emerald-800">
                {status.successfulCount} {status.successfulCount === 1 ? 'API atualizada' : 'APIs atualizadas'} com sucesso
                {status.completedAt ? ` às ${status.completedAt}` : ''}
                {status.details.length > 0 && (
                  <span className="ml-1 text-emerald-700 font-medium">
                    ({status.details.map(d => `${d.target}: ${d.count} un`).join(', ')})
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetry && (
              <button
                id="btn-auto-sync-resync"
                onClick={onRetry}
                className="px-2 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded transition cursor-pointer"
                title="Executar novamente a sincronização automática"
              >
                Sincronizar novamente
              </button>
            )}
            <button
              id="btn-auto-sync-close"
              onClick={onClose}
              className="p-1 text-emerald-500 hover:text-emerald-800 hover:bg-emerald-100 rounded transition cursor-pointer"
              title="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Partial failure
  if (status.failedCount > 0 && status.successfulCount > 0) {
    return (
      <div 
        id="auto-sync-partial-banner"
        className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-amber-900 transition-all duration-300 shadow-2xs"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-bold text-amber-950">Sincronização Parcial:</span>
              <span className="text-amber-800">
                {status.successfulCount} com sucesso e {status.failedCount} com falha. Dados anteriores mantidos.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetry && (
              <button
                id="btn-auto-sync-retry"
                onClick={onRetry}
                className="px-2 py-1 text-xs font-medium text-amber-800 hover:text-amber-950 hover:bg-amber-100 rounded transition cursor-pointer"
              >
                Tentar novamente
              </button>
            )}
            <button
              id="btn-auto-sync-close-amber"
              onClick={onClose}
              className="p-1 text-amber-600 hover:text-amber-900 hover:bg-amber-100 rounded transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Total failure
  if (status.failedCount > 0 && status.successfulCount === 0) {
    return (
      <div 
        id="auto-sync-failed-banner"
        className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-rose-900 transition-all duration-300 shadow-2xs"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-bold text-rose-950">Aviso na Sincronização Automática:</span>
              <span className="text-rose-800">
                Não foi possível conectar às APIs automáticas. Os dados salvos no banco de dados foram mantidos.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetry && (
              <button
                id="btn-auto-sync-retry-failed"
                onClick={onRetry}
                className="px-2 py-1 text-xs font-medium text-rose-800 hover:text-rose-950 hover:bg-rose-100 rounded transition cursor-pointer"
              >
                Tentar novamente
              </button>
            )}
            <button
              id="btn-auto-sync-close-rose"
              onClick={onClose}
              className="p-1 text-rose-600 hover:text-rose-900 hover:bg-rose-100 rounded transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
