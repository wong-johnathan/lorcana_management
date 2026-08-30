import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { auth as authApi } from "../services/api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  linkGoogleAccount: (credential: string) => Promise<void>;
  deleteAccount: (confirmUsername: string, confirmText: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  registrationEnabled: boolean;
  googleClientId: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (savedToken && savedUser && !isTokenExpired(savedToken)) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    setIsLoading(false);
  }, []);

  // Auto-logout when token expires during a session
  useEffect(() => {
    const handleExpired = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  useEffect(() => {
    authApi
      .config()
      .then((res) => {
        setRegistrationEnabled(res.registrationEnabled);
        setGoogleClientId(res.googleClientId ?? null);
      })
      .catch(() => {
        setRegistrationEnabled(true);
        setGoogleClientId(null);
      });
  }, []);

  const persistSession = useCallback((authResult: { token: string; user: User }) => {
    localStorage.setItem("token", authResult.token);
    localStorage.setItem("user", JSON.stringify(authResult.user));
    setToken(authResult.token);
    setUser(authResult.user);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    persistSession(res);
  }, [persistSession]);

  const register = useCallback(async (username: string, password: string) => {
    const res = await authApi.register(username, password);
    persistSession(res);
  }, [persistSession]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await authApi.googleLogin(credential);
    persistSession(res);
  }, [persistSession]);

  const linkGoogleAccount = useCallback(async (credential: string) => {
    const res = await authApi.linkGoogle(credential);
    persistSession(res);
  }, [persistSession]);

  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (confirmUsername: string, confirmText: string) => {
    await authApi.deleteAccount(confirmUsername, confirmText);
    clearSession();
  }, [clearSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{ user, token, login, register, loginWithGoogle, linkGoogleAccount, deleteAccount, logout, isLoading, registrationEnabled, googleClientId }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
