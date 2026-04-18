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
import {
  setAccessToken as setGlobalAccessToken,
  setLogoutHandler,
} from "@/auth/tokenStore";
import type { AuthUser } from "@/types/auth";

export type { AuthUser };

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setGlobalAccessToken(null);
    client.post("/auth/logout").catch(() => {});
  }, []);

  useEffect(() => {
    setLogoutHandler(logout);
    return () => {
      setLogoutHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    client
      .post("/auth/refresh")
      .then((res) => {
        const token = res.data.access_token;
        setAccessToken(token);
        setGlobalAccessToken(token);
        return client.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        // no valid refresh cookie - stay logged out
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await client.post("/auth/login", { email, password });
    const { access_token, user: userData } = res.data;

    setAccessToken(access_token);
    setGlobalAccessToken(access_token);
    setUser(userData);
  }, []);

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
