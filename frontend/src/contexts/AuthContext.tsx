import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { REFRESH_TOKEN_KEY } from "@/api/constants";
import { setOnUnauthorized, setGetAccessToken, setSetNewAccessToken } from "@/api/client";
import type { UserRole } from "@/types/enums";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  assigned_airport_ids: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);

  // keep ref in sync for the interceptor
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // register token getter for axios interceptor
  useEffect(() => {
    setGetAccessToken(() => accessTokenRef.current);
    return () => setGetAccessToken(null);
  }, []);

  // register token setter so interceptor can update state after refresh
  useEffect(() => {
    setSetNewAccessToken((token: string) => {
      accessTokenRef.current = token;
      setAccessToken(token);
    });
    return () => setSetNewAccessToken(null);
  }, []);

  // register 401 handler
  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessToken(null);
      setUser(null);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    });
    return () => setOnUnauthorized(null);
  }, []);

  // attempt refresh on mount
  useEffect(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("refresh failed");
        const data = await res.json();
        setAccessToken(data.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

        // always fetch user from server to prevent localStorage tampering
        const meRes = await fetch("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${data.access_token}` },
          signal: controller.signal,
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("silent session restore failed:", err);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "login failed");
    }

    const data = await res.json();
    // sync ref before state so api calls on the navigated-to page see the token
    accessTokenRef.current = data.access_token;
    setAccessToken(data.access_token);
    setUser(data.user);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
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
