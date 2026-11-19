import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api.ts';
import { readJsonResponse } from '../lib/jsonResponse.ts';
import { appFetch, isFirebaseMode } from '../lib/runtime.ts';
import type { OnboardingInput } from '../shared/validation.ts';
import type { AppUser, Department } from '../types/domain.ts';
import type { SharedWorkspaceSnapshot } from '../firebase/workspace.ts';

type Session = { user: AppUser; rbacToken: string };
interface AuthContextValue {
  appUser: AppUser | null;
  departments: Department[];
  idToken: string | null;
  rbacToken: string | null;
  loading: boolean;
  authError: string | null;
  sharedWorkspace: SharedWorkspaceSnapshot | null;
  sharedConnected: boolean;
  sharedError: string | null;
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
  const [sharedWorkspace, setSharedWorkspace] = useState<SharedWorkspaceSnapshot | null>(null);
  const [sharedConnected, setSharedConnected] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setAppUser(null); setIdToken(null); setDepartments([]); setSharedWorkspace(null); setSharedConnected(false); setSharedError(null);
  }, []);
  useEffect(() => {
    if (!isFirebaseMode || !appUser) return;
    let disposed = false; let stop: (() => void) | undefined;
    Promise.all([import('../firebase/client.ts'), import('../firebase/workspace.ts')]).then(async ([client, live]) => {
      const { db } = await client.firebaseClient(); if (disposed) return;
      stop = live.watchSharedWorkspace(db, appUser, {
        data: snapshot => { if (!disposed) { setSharedWorkspace(snapshot); setDepartments(snapshot.departments); setSharedError(null); } },
        connection: value => { if (!disposed) setSharedConnected(value); },
        profile: profile => {
          if (!disposed) setAppUser(current => current && Object.entries(profile).every(([key, value]) => current[key as keyof AppUser] === value) ? current : profile);
        },
        revoked: () => {
          if (disposed) return;
          clearSession();
          void appFetch('/api/auth/logout', { method: 'POST' }).finally(() => location.reload());
        },
        error: () => { if (!disposed) setSharedError('Não foi possível sincronizar os dados. Verifique a conexão e seu acesso.'); },
      });
    }).catch(() => { if (!disposed) setSharedError('Não foi possível iniciar a sincronização.'); });
    return () => { disposed = true; stop?.(); };
  }, [appUser?.uid, appUser?.departmentId, appUser?.role, clearSession]);
  const acceptSession = useCallback(async (session: Session) => {
    const depts = await apiFetch<Department[]>('/api/departments', session.rbacToken);
    setDepartments(depts); setIdToken(session.rbacToken); setAppUser(session.user); setAuthError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await appFetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
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
      const response = await appFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sector, password }) });
      const data = await readJsonResponse<Session>(response);
      await acceptSession(data);
    } catch (error) {
      const message = error instanceof TypeError ? 'Sem conexão com o servidor. Verifique sua conexão.' : error instanceof Error ? error.message : 'Não foi possível entrar.';
      setAuthError(message); throw new Error(message);
    }
  };
  const logout = async () => {
    try { await appFetch('/api/auth/logout', { method: 'POST', headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} }); }
    finally {
      clearSession();
      if (isFirebaseMode) location.reload();
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
  return <AuthContext.Provider value={{ appUser, departments, idToken, rbacToken: idToken, loading, authError, sharedWorkspace, sharedConnected, sharedError, loginWithPassword, logout, submitOnboarding, refreshProfile, changePassword }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  return value;
}
