import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import client from "@/api/client";

const REFRESH_TOKEN_KEY = "tarmacview_refresh_token";

interface AirportSummary {
  id: string;
  icao_code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  assigned_airports: AirportSummary[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let globalAccessToken: string | null = null;
let globalLogout: (() => void) | null = null;

export function getAccessToken(): string | null {
  return globalAccessToken;
}

export function triggerLogout(): void {
  globalLogout?.();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);

  const logout = useCallback(() => {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
    globalAccessToken = null;
  }, []);

  useEffect(() => {
    globalLogout = logout;
    return () => {
      globalLogout = null;
    };
  }, [logout]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setIsLoading(false);
      return;
    }

    client
      .post("/auth/refresh", { refresh_token: refreshToken })
      .then((res) => {
        const token = res.data.access_token;
        setAccessToken(token);
        globalAccessToken = token;
        return client.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await client.post("/auth/login", { email, password });
      const { access_token, refresh_token, user: userData } = res.data;

      localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
      setAccessToken(access_token);
      globalAccessToken = access_token;
      setUser(userData);
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        login,
        logout,
        isAuthenticated: !!accessToken && !!user,
        isLoading,
      }}
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
