const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export const API_BASE_URL = configuredApiBaseUrl || "/api";
