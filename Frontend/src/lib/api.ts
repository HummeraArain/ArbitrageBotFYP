const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const normalizeBase = (value: string) => value.replace(/\/+$/, "");

export const API_BASE_URL = normalizeBase(rawApiBase || "http://127.0.0.1:8000");
export const WS_BASE_URL = API_BASE_URL.startsWith("https://")
  ? API_BASE_URL.replace("https://", "wss://")
  : API_BASE_URL.replace("http://", "ws://");

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

export function wsUrl(path: string, query?: Record<string, string | undefined | null>): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${WS_BASE_URL}${cleanPath}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.toString();
}
