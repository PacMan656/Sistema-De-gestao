import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api.ts';
import { readJsonResponse } from '../lib/jsonResponse.ts';
import type { OnboardingInput } from '../shared/validation.ts';
import type { AppUser, Department } from '../types/domain.ts';

type Session = { user: AppUser; rbacToken: string };
interface AuthContextValue {
  appUser: AppUser | null;
  departments: Department[];
  idToken: string | null;
  rbacToken: string | null;
  loading: boolean;
  authError: string | null;
  loginWithPassword: (sector: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  submitOnboarding: (data: OnboardingInput) => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (currentPassword: string, password: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setAppUser(null); setIdToken(null); setDepartments([]);
  }, []);
  const acceptSession = useCallback(async (session: Session) => {
    const depts = await apiFetch<Department[]>('/api/departments', session.rbacToken);
    setDepartments(depts); setIdToken(session.rbacToken); setAppUser(session.user); setAuthError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        if (response.ok) {
          const session = await readJsonResponse<Session>(response);
          if (!cancelled) await acceptSession(session);
        } else if (response.status !== 401) {
          throw new Error('Não foi possível restaurar sua sessão. Tente entrar novamente.');
        }
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Sem conexão com o servidor.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    const expired = () => {
      clearSession(); setAuthError('Sua sessão expirou ou foi revogada pelo TI. Entre novamente.');
    };
    window.addEventListener('patriti:unauthorized', expired);
    return () => { cancelled = true; window.removeEventListener('patriti:unauthorized', expired); };
  }, [acceptSession, clearSession]);

  const loginWithPassword = async (sector: string, password: string) => {
    setAuthError(null);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sector, password }) });
      const data = await readJsonResponse<Session>(response);
      await acceptSession(data);
    } catch (error) {
      const message = error instanceof TypeError ? 'Sem conexão com o servidor. Verifique sua conexão.' : error instanceof Error ? error.message : 'Não foi possível entrar.';
      setAuthError(message); throw new Error(message);
    }
  };
  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} }); }
    finally {
      clearSession();

    }
  };
  const refreshProfile = async () => {
    if (idToken) await acceptSession(await apiFetch<Session>('/api/auth/me', idToken));
  };
  const submitOnboarding = async (data: OnboardingInput) => {
    if (!idToken) throw new Error('Sessão não autenticada.');
    await acceptSession(await apiFetch<Session>('/api/auth/onboarding', idToken, { method: 'POST', body: JSON.stringify(data) }));
  };
  const changePassword = async (currentPassword: string, password: string) => {
    if (!idToken) throw new Error('Sessão não autenticada.');
    await acceptSession(await apiFetch<Session>('/api/auth/password', idToken, { method: 'POST', body: JSON.stringify({ currentPassword, password }) }));
  };
  return <AuthContext.Provider value={{ appUser, departments, idToken, rbacToken: idToken, loading, authError, loginWithPassword, logout, submitOnboarding, refreshProfile, changePassword }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return value;
}
