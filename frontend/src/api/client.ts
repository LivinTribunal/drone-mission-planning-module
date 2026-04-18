import axios, { isAxiosError } from "axios";
import { getAccessToken, triggerLogout } from "@/contexts/AuthContext";

export { isAxiosError };

const REFRESH_TOKEN_KEY = "tarmacview_refresh_token";

const client = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/setup-password",
  "/auth/reset-password",
];

client.interceptors.request.use((config) => {
  const token = getAccessToken();
  const url = config.url ?? "";
  if (token && !PUBLIC_PATHS.some((p) => url.startsWith(p))) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(token: string | null, error: unknown) {
  for (const { resolve, reject } of refreshQueue) {
    if (token) resolve(token);
    else reject(error);
  }
  refreshQueue = [];
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const url = originalRequest.url ?? "";
      if (PUBLIC_PATHS.some((p) => url.startsWith(p))) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(client(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        isRefreshing = false;
        triggerLogout();
        return Promise.reject(error);
      }

      try {
        const res = await axios.post("/api/v1/auth/refresh", {
          refresh_token: refreshToken,
        });
        const newToken = res.data.access_token;

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(newToken, null);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(null, refreshError);
        triggerLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response) {
      const status = error.response.status;
      const detail =
        error.response.data?.detail ??
        error.response.data?.message ??
        "An error occurred";

      if (typeof detail === "string") {
        console.error(`API error ${status}: ${detail}`);
      } else {
        console.error(`API error ${status}:`, detail);
      }
    }
    return Promise.reject(error);
  },
);

export default client;
