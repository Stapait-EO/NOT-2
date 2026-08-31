import { UserAccount, SSOValidateResponse } from './types';

export const SSO_CONFIG = {
  portalUrl: 'https://mifireapp.com.br/login/',
  loginUrl: 'https://mifireapp.com.br/login/',
  appId: 'app_notifier',
  validateEndpoint: 'https://mifireapp.com.br/login/api/auth/validate'
};

const STORAGE_TOKEN_KEY = 'sso_token';
const STORAGE_USER_KEY = 'sso_user_cached';
const STORAGE_LEGACY_KEY = 'expedicao_session_user';

/**
 * Extracts and stores the SSO token from the URL query string (?token=...)
 * Removes the token parameter from the browser address bar for security.
 */
export function extractAndStoreTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const url = new URL(window.location.href);
    console.log('[SSO Debug] Current Full URL:', window.location.href);
    console.log('[SSO Debug] Pathname:', window.location.pathname);
    console.log('[SSO Debug] Search Params:', window.location.search);

    // Support both ?sso_token=..., ?token=..., ?access_token=...
    const token = url.searchParams.get('sso_token') || 
                  url.searchParams.get('token') || 
                  url.searchParams.get('access_token') ||
                  url.searchParams.get('auth_token');

    if (token) {
      console.log('[SSO Debug] Successfully extracted token:', token.substring(0, 10) + '...');
      // Store token safely in localStorage
      localStorage.setItem(STORAGE_TOKEN_KEY, token);

      // Clean the URL without triggering a page reload
      url.searchParams.delete('sso_token');
      url.searchParams.delete('token');
      url.searchParams.delete('access_token');
      url.searchParams.delete('auth_token');
      const cleanUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
      window.history.replaceState({}, document.title, cleanUrl || '/');

      return token;
    }
  } catch (err) {
    console.error('[SSO] Erro ao extrair token da URL:', err);
  }

  const stored = getStoredSSOToken();
  if (stored) {
    console.log('[SSO Debug] Using stored token from localStorage:', stored.substring(0, 10) + '...');
  }
  return stored;
}

/**
 * Returns the currently stored SSO token from localStorage.
 */
export function getStoredSSOToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_TOKEN_KEY);
}

/**
 * Returns the cached SSO user profile from localStorage if present.
 */
export function getCachedSSOUser(): UserAccount | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_USER_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

/**
 * Saves the authenticated SSO user profile into localStorage cache.
 */
export function setCachedSSOUser(user: UserAccount): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

/**
 * Clears all SSO and local session credentials from the browser.
 */
export function clearSSOSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_LEGACY_KEY);
}

/**
 * Validates the SSO token against the Central SSO Portal.
 * Tries direct GET request to the Portal first, with automatic fallback to server proxy.
 */
export async function validateSSOToken(
  token: string,
  appId: string = SSO_CONFIG.appId
): Promise<{ valid: boolean; user?: UserAccount; error?: string }> {
  if (!token) {
    return { valid: false, error: 'Token não fornecido' };
  }

  // 1. Try Direct request to Portal
  try {
    const directUrl = `${SSO_CONFIG.validateEndpoint}?app_id=${encodeURIComponent(appId)}`;
    const response = await fetch(directUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data: SSOValidateResponse = await response.json();
      if (data.valid && data.user) {
        const userAccount: UserAccount = normalizeSSOUser(data.user);
        setCachedSSOUser(userAccount);
        return { valid: true, user: userAccount };
      } else {
        return { valid: false, error: data.error || data.message || 'Token inválido ou sem permissão para esta aplicação.' };
      }
    }
  } catch (directErr) {
    console.warn('[SSO] Chamada direta ao Portal falhou (possível CORS ou rede), tentando via proxy do servidor...', directErr);
  }

  // 2. Fallback to Server-Side Proxy Endpoint
  try {
    const proxyResponse = await fetch('/api/auth/sso-validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        appId,
        portalUrl: SSO_CONFIG.validateEndpoint
      })
    });

    if (proxyResponse.ok) {
      const data: SSOValidateResponse = await proxyResponse.json();
      if (data.valid && data.user) {
        const userAccount: UserAccount = normalizeSSOUser(data.user);
        setCachedSSOUser(userAccount);
        return { valid: true, user: userAccount };
      } else {
        return { valid: false, error: data.error || data.message || 'Token inválido ou sem permissão.' };
      }
    } else {
      const errData = await proxyResponse.json().catch(() => ({}));
      return { valid: false, error: errData.error || `Erro de validação (${proxyResponse.status})` };
    }
  } catch (proxyErr: any) {
    console.error('[SSO] Erro ao validar token via proxy:', proxyErr);
    return { valid: false, error: 'Falha de comunicação com o servidor de autenticação.' };
  }
}

/**
 * Normalizes user payload from SSO Portal into standard UserAccount structure.
 */
export function normalizeSSOUser(rawUser: any): UserAccount {
  const username = rawUser.username || rawUser.login || rawUser.email?.split('@')[0] || 'usuario';
  const fullName = rawUser.fullName || rawUser.name || rawUser.nome || username;
  const email = rawUser.email || '';
  const role = (rawUser.role || rawUser.perfil || 'user').toLowerCase();
  const id = rawUser.id || rawUser.userId || `sso-${username}`;

  return {
    id: String(id),
    username,
    fullName,
    email,
    role,
    avatar: rawUser.avatar || '',
    ssoId: String(id),
    portalAppId: SSO_CONFIG.appId,
    createdAt: rawUser.createdAt || new Date().toISOString()
  };
}

/**
 * Redirects the user to the Central SSO Portal login page.
 */
export function redirectToSSOLogin(customRedirectUrl?: string): void {
  if (typeof window === 'undefined') return;

  const currentUrl = customRedirectUrl || window.location.href;
  const loginUrl = `${SSO_CONFIG.loginUrl}?redirect=${encodeURIComponent(currentUrl)}&app_id=${encodeURIComponent(SSO_CONFIG.appId)}`;
  
  console.log('[SSO] Redirecionando para login central:', loginUrl);
  window.location.href = loginUrl;
}

/**
 * Returns to the Central SSO Portal dashboard/hub, clearing local session.
 */
export function logoutSSO(): void {
  if (typeof window === 'undefined') return;
  clearSSOSession();
  window.location.href = `${SSO_CONFIG.portalUrl}?logout=true`;
}

/**
 * Navigates back to the Central SSO Portal hub dashboard.
 */
export function returnToPortalHub(): void {
  if (typeof window === 'undefined') return;
  window.location.href = SSO_CONFIG.portalUrl;
}
