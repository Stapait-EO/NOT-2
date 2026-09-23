import { FC, useState, useEffect } from 'react';
import { 
  Building, 
  TrendingUp, 
  FileText, 
  Layers, 
  Menu, 
  X, 
  Archive, 
  Globe, 
  DownloadCloud, 
  LogOut, 
  User, 
  Monitor, 
  Smartphone,
  ChevronRight
} from 'lucide-react';
import { UserRole } from '../types';

interface MobileNavigationProps {
  activeTab: 'stock' | 'sales' | 'dashboard' | 'products' | 'orders' | 'webhook' | 'migration';
  setActiveTab: (tab: 'stock' | 'sales' | 'dashboard' | 'products' | 'orders' | 'webhook' | 'migration') => void;
  ordersCount: number;
  currentUser: { fullName: string; role: UserRole };
  isMasterOrAdmin: boolean;
  logoutSSO: () => void;
  layoutOverride: 'auto' | 'mobile' | 'desktop';
  setLayoutPreference: (mode: 'auto' | 'mobile' | 'desktop') => void;
}

export const MobileNavigation: FC<MobileNavigationProps> = ({
  activeTab,
  setActiveTab,
  ordersCount,
  currentUser,
  isMasterOrAdmin,
  logoutSSO,
  layoutOverride,
  setLayoutPreference,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Prevent background scrolling and enable Escape key to close drawer smoothly
  useEffect(() => {
    if (isDrawerOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsDrawerOpen(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isDrawerOpen]);

  const handleSelectTab = (tab: 'stock' | 'sales' | 'dashboard' | 'products' | 'orders' | 'webhook' | 'migration') => {
    setActiveTab(tab);
    setIsDrawerOpen(false);
  };

  // Nav item definition with calibrated icons for subpixel crispness
  const navTabs: Array<{
    id: 'stock' | 'sales' | 'orders' | 'dashboard';
    label: string;
    icon: typeof Building;
    badgeCount?: number;
  }> = [
    { id: 'stock', label: 'Estoque', icon: Building },
    { id: 'sales', label: 'Consumo', icon: TrendingUp },
    { id: 'orders', label: 'Pedidos', icon: FileText, badgeCount: ordersCount },
    { id: 'dashboard', label: 'Painel', icon: Layers },
  ];

  return (
    <>
      {/* 
        Fixed Bottom Navigation Bar for Mobile:
        - Uses safe-area-inset-bottom for notch / home indicator devices
        - Hardware accelerated with translateZ(0) to avoid subpixel blur across screen densities (mdpi, hdpi, xhdpi, xxhdpi)
        - Strict 48dp+ interactive touch area per Material Design & Apple HIG
      */}
      <nav 
        role="navigation"
        aria-label="Navegação Inferior Mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[max(0.35rem,env(safe-area-inset-bottom,0.5rem))] pt-1 px-1.5 [transform:translateZ(0)] will-change-transform select-none"
      >
        <div className="grid grid-cols-5 items-center w-full max-w-lg mx-auto">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelectTab(tab.id)}
                className={`relative group flex flex-col items-center justify-center min-h-[48px] py-1 px-0.5 rounded-xl transition-all duration-200 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:scale-[0.96] touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                  isActive
                    ? 'text-indigo-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {/* Visual active indicator pill behind or above the icon */}
                <span 
                  aria-hidden="true"
                  className={`absolute top-0.5 w-8 h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isActive 
                      ? 'bg-indigo-600 scale-x-100 opacity-100' 
                      : 'bg-transparent scale-x-0 opacity-0'
                  }`}
                />

                {/* 
                  Icon Container:
                  - Fixed bounding box prevents jitter or subpixel shift
                  - vector-effect non-scaling-stroke & geometricPrecision guarantee crisp edges on any pixel ratio (1x, 2x, 3x, 4x)
                */}
                <div className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-transform duration-200 ${
                  isActive ? 'scale-105 bg-indigo-50/80 text-indigo-600' : 'group-hover:bg-slate-50 text-slate-500'
                }`}>
                  <Icon 
                    className="w-[20px] h-[20px] shrink-0 [shape-rendering:geometricPrecision] [vector-effect:non-scaling-stroke]" 
                    strokeWidth={isActive ? 2.3 : 1.8}
                  />

                  {/* Badge count indicator */}
                  {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                    <span 
                      className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold font-mono flex items-center justify-center ring-[1.5px] ring-white shadow-2xs leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </span>
                  )}
                </div>

                {/* Tab Label */}
                <span 
                  className={`text-[10.5px] tracking-tight mt-0.5 truncate max-w-full text-center leading-none transition-colors duration-150 ${
                    isActive ? 'font-bold text-indigo-700' : 'font-medium text-slate-500'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* 5. Menu Completo (Drawer Toggle Button) */}
          <button
            type="button"
            role="button"
            aria-label="Abrir Menu Completo de Ferramentas"
            aria-expanded={isDrawerOpen}
            onClick={() => setIsDrawerOpen(true)}
            className={`relative group flex flex-col items-center justify-center min-h-[48px] py-1 px-0.5 rounded-xl transition-all duration-200 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:scale-[0.96] touch-manipulation [-webkit-tap-highlight-color:transparent] ${
              isDrawerOpen
                ? 'text-indigo-600 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {/* Visual active indicator pill for menu when open */}
            <span 
              aria-hidden="true"
              className={`absolute top-0.5 w-8 h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isDrawerOpen 
                  ? 'bg-indigo-600 scale-x-100 opacity-100' 
                  : 'bg-transparent scale-x-0 opacity-0'
              }`}
            />

            <div className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-transform duration-200 ${
              isDrawerOpen ? 'scale-105 bg-indigo-50/80 text-indigo-600' : 'group-hover:bg-slate-50 text-slate-500'
            }`}>
              <Menu 
                className="w-[20px] h-[20px] shrink-0 [shape-rendering:geometricPrecision] [vector-effect:non-scaling-stroke]" 
                strokeWidth={isDrawerOpen ? 2.3 : 1.8}
              />
            </div>

            <span 
              className={`text-[10.5px] tracking-tight mt-0.5 truncate max-w-full text-center leading-none transition-colors duration-150 ${
                isDrawerOpen ? 'font-bold text-indigo-700' : 'font-medium text-slate-500'
              }`}
            >
              Mais
            </span>
          </button>
        </div>
      </nav>

      {/* 
        Drawer & Backdrop Overlay:
        - Smooth CSS opacity & translate transition for 60/120fps entry and exit
        - pointer-events toggled to prevent phantom clicks when closed
      */}
      <div 
        aria-hidden={!isDrawerOpen}
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${
          isDrawerOpen 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Dark Backdrop with blur */}
        <div 
          onClick={() => setIsDrawerOpen(false)}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        />

        {/* Drawer Sliding Content Container */}
        <div 
          onClick={(e) => e.stopPropagation()}
          className={`fixed inset-y-0 right-0 w-[84%] max-w-xs bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
            isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Drawer Header with #0c396b Brand Tone */}
          <div className="p-4 bg-[#0c396b] text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="min-w-0 pr-2">
              <h3 className="font-bold text-sm tracking-wide">Menu do Sistema</h3>
              <span className="text-xs text-blue-200 flex items-center gap-1.5 mt-0.5 truncate">
                <User className="w-3.5 h-3.5 shrink-0 [vector-effect:non-scaling-stroke]" />
                <span className="truncate">{currentUser.fullName}</span>
              </span>
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setIsDrawerOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5 [vector-effect:non-scaling-stroke]" />
            </button>
          </div>

          {/* Navigation Links Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
              Navegação Geral
            </span>

            <button
              type="button"
              onClick={() => handleSelectTab('stock')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'stock' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100/60 text-indigo-600 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                </div>
                <span>Análise de Estoque</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('sales')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'sales' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100/60 text-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                </div>
                <span>Análise de Consumo</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('dashboard')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-100/60 text-amber-600 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                </div>
                <span>Painel Analítico</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('products')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'products' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                </div>
                <span>Produtos & Itens</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('orders')}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'orders' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                </div>
                <span>Pedidos em Aberto</span>
              </div>
              {ordersCount > 0 ? (
                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded-full">
                  {ordersCount}
                </span>
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {isMasterOrAdmin && (
              <>
                <div className="pt-2 border-t border-slate-100" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                  Administração
                </span>

                <button
                  type="button"
                  onClick={() => handleSelectTab('webhook')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'webhook' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100/60 text-indigo-600 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
                    </div>
                    <span>Configurações Webhook</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('migration')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'migration' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-blue-600 flex items-center justify-center shrink-0">
                      <DownloadCloud className="w-4 h-4 text-blue-600 [vector-effect:non-scaling-stroke]" />
                    </div>
                    <span>Migrar / Backup de Dados</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </>
            )}

            {/* Layout Mode Switcher */}
            <div className="pt-3 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                Modo de Visualização
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setLayoutPreference('mobile')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    layoutOverride === 'mobile' || layoutOverride === 'auto'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 [vector-effect:non-scaling-stroke]" />
                  <span>Mobile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutPreference('desktop')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    layoutOverride === 'desktop'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 [vector-effect:non-scaling-stroke]" />
                  <span>Desktop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={logoutSSO}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 [vector-effect:non-scaling-stroke]" />
              <span>Voltar ao Portal SSO</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
