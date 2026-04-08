const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export const API_BASE_URL =
  configuredApiBaseUrl ??
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000/api" : "/api");
