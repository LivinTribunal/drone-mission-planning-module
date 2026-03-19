import axios from "axios";

const TOKEN_KEY = "tarmacview_token";

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

// unwrap envelope for list responses, handle errors
client.interceptors.response.use(
  (response) => {
    // list endpoints return { data, meta } envelope
    if (response.data && "meta" in response.data && "data" in response.data) {
      return response;
    }
    return response;
  },
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        "An error occurred";

      if (status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (status === 409) {
        alert(message);
        return Promise.reject(error);
      }

      console.error(`API error ${status}: ${message}`);
    }
    return Promise.reject(error);
  },
);

export default client;
