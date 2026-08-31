import React, { useEffect, useState } from 'react';
import { ShieldCheck, LogIn, AlertCircle, RefreshCw, Lock } from 'lucide-react';
import { 
  SSO_CONFIG, 
  extractAndStoreTokenFromUrl, 
  getStoredSSOToken, 
  getCachedSSOUser, 
  setCachedSSOUser, 
  validateSSOToken, 
  redirectToSSOLogin,
  clearSSOSession
} from '../sso';
import { UserAccount } from '../types';

interface SSOGuardProps {
  children: (user: UserAccount) => React.ReactNode;
}

const DEV_FALLBACK_USER: UserAccount = {
  id: 'dev-user',
  username: 'dev_admin',
  fullName: 'Desenvolvedor (Modo Local/Dev)',
  email: 'dev@mifireapp.com.br',
  role: 'admin',
  portalAppId: SSO_CONFIG.appId,
  createdAt: new Date().toISOString()
};

export default function SSOGuard({ children }: SSOGuardProps) {
  // Detecta se estamos rodando em ambiente de desenvolvimento / preview do AI Studio
  const isDevelopment = 
    typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('run.app') ||
      window.location.hostname.includes('googleusercontent.com') ||
      process.env.NODE_ENV !== 'production'
    );

  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'error'>(() => {
    return isDevelopment ? 'authenticated' : 'checking';
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    return isDevelopment ? (getCachedSSOUser() || DEV_FALLBACK_USER) : null;
  });

  useEffect(() => {
    let isMounted = true;

    // Se estiver em modo de desenvolvimento/preview, permite navegar normalmente sem redirecionar
    if (isDevelopment) {
      const devUser = getCachedSSOUser() || DEV_FALLBACK_USER;
      setCurrentUser(devUser);
      setAuthState('authenticated');
      return;
    }

    const authenticate = async () => {
      // 1. Extrair token da URL (?sso_token=... ou ?token=...) ou pegar do localStorage
      const token = extractAndStoreTokenFromUrl() || getStoredSSOToken();

      if (!token) {
        if (isMounted) {
          setAuthState('unauthenticated');
          // Redirecionamento automático imediato para o Portal de Login MiFire
          redirectToSSOLogin();
        }
        return;
      }

      // 2. Se temos cache local de usuário com token salvo, inicializa mais rápido
      const cachedUser = getCachedSSOUser();
      if (cachedUser && isMounted) {
        setCurrentUser(cachedUser);
        setAuthState('authenticated');
      }

      // 3. Validação do Token junto à API Central do Portal MiFire
      try {
        const result = await validateSSOToken(token, SSO_CONFIG.appId);
        
        if (!isMounted) return;

        if (result.valid && result.user) {
          setCurrentUser(result.user);
          setCachedSSOUser(result.user);
          setAuthState('authenticated');
        } else {
          // Token expirou ou foi revogado
          clearSSOSession();
          setErrorMessage(result.error || 'Sua sessão expirou ou não possui autorização no Portal MiFire.');
          setAuthState('unauthenticated');
          // Redireciona para login
          setTimeout(() => {
            redirectToSSOLogin();
          }, 1500);
        }
      } catch (err: any) {
        if (!isMounted) return;
        // Se houver falha de rede/proxy mas tiver cache de usuário, permite continuar
        if (cachedUser) {
          setAuthState('authenticated');
        } else {
          setErrorMessage('Não foi possível verificar sua sessão com o Portal MiFire.');
          setAuthState('error');
        }
      }
    };

    authenticate();

    return () => {
      isMounted = false;
    };
  }, []);

  // Estado 1: Verificando / Redirecionando
  if (authState === 'checking') {
    return (
      <div id="sso-loading-screen" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl mb-4 animate-pulse">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Portal MiFire SSO</h2>
          <p className="text-sm text-slate-400 mt-2">
            Verificando credenciais e sessão ativa...
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-indigo-300 font-medium">
            <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
            Conectando ao serviço de autenticação
          </div>
        </div>
      </div>
    );
  }

  // Estado 2: Sem Sessão Ativa / Não Autenticado
  if (authState === 'unauthenticated') {
    return (
      <div id="sso-unauthorized-screen" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl mb-4">
            <Lock className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Acesso Restrito</h2>
          <p className="text-sm text-slate-400 mt-2">
            {errorMessage || 'É necessário ter uma sessão ativa no Portal MiFire para acessar esta aplicação.'}
          </p>

          <p className="text-xs text-slate-500 mt-4">
            Redirecionando automaticamente para a tela de login...
          </p>

          <button
            id="sso-redirect-button"
            onClick={() => redirectToSSOLogin()}
            className="mt-6 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30"
          >
            <LogIn className="h-4 w-4" />
            Fazer Login no Portal MiFire
          </button>
        </div>
      </div>
    );
  }

  // Estado 3: Erro de Comunicação
  if (authState === 'error' && !currentUser) {
    return (
      <div id="sso-error-screen" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center">
          <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl mb-4">
            <AlertCircle className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Falha de Autenticação</h2>
          <p className="text-sm text-slate-400 mt-2">
            {errorMessage || 'Não foi possível validar seu acesso com o Portal MiFire.'}
          </p>

          <button
            id="sso-retry-button"
            onClick={() => redirectToSSOLogin()}
            className="mt-6 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30"
          >
            <LogIn className="h-4 w-4" />
            Ir para Login MiFire
          </button>
        </div>
      </div>
    );
  }

  // Estado 4: Autenticado com sucesso - Renderiza a aplicação passando o usuário
  return <>{currentUser && children(currentUser)}</>;
}
