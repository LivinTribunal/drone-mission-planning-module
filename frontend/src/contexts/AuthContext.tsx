import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { setOnUnauthorized } from "@/api/client";

const TOKEN_KEY = "tarmacview_token";
const USER_KEY = "tarmacview_user";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // rehydrate from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        // validate shape - reset if stale schema
        if (parsed?.id && parsed?.email && Array.isArray(parsed?.roles)) {
          setToken(savedToken);
          setUser(parsed as AuthUser);
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
  }, []);

  // register 401 handler so axios interceptor can clear react state
  useEffect(() => {
    setOnUnauthorized(() => {
      setToken(null);
      setUser(null);
      localStorage.removeItem(USER_KEY);
    });
    return () => setOnUnauthorized(null);
  }, []);

  // TODO: replace with real JWT auth when backend auth endpoints are implemented
  const login = useCallback(async (email: string, password: string) => {
    // mock auth - any credentials succeed, token is not a real JWT
    void password;
    const mockUser: AuthUser = {
      id: "00000000-0000-0000-0000-000000000001",
      email,
      name: "Stefan Moravik",
      roles: ["OPERATOR", "COORDINATOR"],
    };
    const mockToken = btoa(
      JSON.stringify({ sub: mockUser.id, email: mockUser.email }),
    );

    localStorage.setItem(TOKEN_KEY, mockToken);
    localStorage.setItem(USER_KEY, JSON.stringify(mockUser));
    setToken(mockToken);
    setUser(mockUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
