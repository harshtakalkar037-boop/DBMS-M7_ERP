import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore, errMsg } from './api';
import type { AuthUser, LoginResult, Role } from './types';

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  has: (...roles: Role[]) => boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Restore a previous session (the JWT is kept in localStorage so a page
  // refresh does not bounce the user back to the login screen).
  useEffect(() => {
    const token = tokenStore.restore();
    if (!token) {
      setReady(true);
      return;
    }
    api
      .get<{ user_id: number; role_code: Role; email: string }>('/auth/me')
      .then(() => {
        // The access token is the source of truth for the session; `me` only
        // confirms it is still valid. Re-derive the profile from the token so we
        // keep the friendly display name.
        setUser(decodeUser(token));
      })
      .catch(() => {
        tokenStore.set(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  // A 401 on any request drops the session everywhere.
  useEffect(() => {
    tokenStore.onUnauthorized(() => {
      tokenStore.set(null);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResult>('/auth/login', { email, password });
    tokenStore.set(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => undefined);
    tokenStore.set(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login,
      logout,
      has: (...roles: Role[]) => !!user && roles.includes(user.role),
    }),
    [user, ready, login, logout],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function decodeUser(token: string): AuthUser {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      userId: Number(json.sub),
      role: json.role,
      email: json.email,
      name: json.name ?? json.email,
      studentId: json.studentId ?? null,
      facultyId: json.facultyId ?? null,
    };
  } catch {
    return { userId: 0, role: 'STUDENT', email: '', name: '' };
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export { errMsg };
