import axios, { isAxiosError } from "axios";

export { isAxiosError };

import { REFRESH_TOKEN_KEY } from "@/api/constants";

// callback set by AuthContext to clear react auth state on 401
let onUnauthorized: (() => void) | null = null;
let unauthorizedFired = false;

export function setOnUnauthorized(callback: (() => void) | null) {
  onUnauthorized = callback;
  unauthorizedFired = false;
}

// callback to get current access token from react state (not localStorage)
let getAccessToken: (() => string | null) | null = null;

export function setGetAccessToken(callback: (() => string | null) | null) {
  getAccessToken = callback;
}

// callback to update access token in react state after a successful refresh
let setNewAccessToken: ((token: string) => void) | null = null;

export function setSetNewAccessToken(callback: ((token: string) => void) | null) {
  setNewAccessToken = callback;
}

const client = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// attach jwt from AuthContext (memory, not localStorage)
// skip if Authorization is already set - e.g. on a retry after token refresh
client.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const token = getAccessToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// flag to prevent concurrent refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  // refresh token stored in localStorage - XSS risk acknowledged; httpOnly cookie
  // preferred but requires reverse-proxy support. access token stays in memory only.
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const res = await axios.post("/api/v1/auth/refresh", {
      refresh_token: refreshToken,
    });

    // store rotated refresh token
    if (res.data.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refresh_token);
    }

    return res.data.access_token;
  } catch (err) {
    console.error("token refresh failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// handle errors with token refresh on 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && error.config && !error.config._retry) {
      error.config._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = attemptRefresh().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;

      if (newToken) {
        setNewAccessToken?.(newToken);
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return client(error.config);
      }

      // refresh failed - clear auth state once across concurrent 401s
      if (!unauthorizedFired) {
        unauthorizedFired = true;
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        onUnauthorized?.();
      }
    }

    if (error.response) {
      const status = error.response.status;
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        "An error occurred";
      console.error(`API error ${status}: ${message}`);
    }

    return Promise.reject(error);
  },
);

export default client;
