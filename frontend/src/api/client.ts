import axios, { isAxiosError } from "axios";

export { isAxiosError };

const TOKEN_KEY = "tarmacview_token";

// callback set by AuthContext to clear react auth state on 401
export let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: (() => void) | null) {
  onUnauthorized = callback;
}

const client = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// attach jwt from localStorage
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// handle errors - let callers deal with response data
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail ?? error.response.data?.message ?? "An error occurred";

      if (status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        onUnauthorized?.();
      }

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
