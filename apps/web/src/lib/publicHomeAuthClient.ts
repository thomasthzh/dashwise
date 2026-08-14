import type { AuthUserRecord } from "@dashwise/types/sdk";

type ValidatedAuth = {
  success: true;
  token: string;
  user: AuthUserRecord;
};

export async function validateStoredAuthTokenWithoutRedirect(
  token: string,
  options?: {
    baseUrl?: string;
    fetch?: typeof fetch;
  },
): Promise<ValidatedAuth> {
  const baseUrl = options?.baseUrl || (typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin);
  const fetchImpl = options?.fetch || fetch;
  const response = await fetchImpl(new URL("/api/v1/auth/validate-auth", baseUrl), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json() as ValidatedAuth | { error?: string };
  if (!response.ok) {
    const error = new Error("error" in payload && payload.error ? payload.error : "Authentication validation failed") as Error & {
      status?: number;
      body?: unknown;
    };
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return payload as ValidatedAuth;
}
