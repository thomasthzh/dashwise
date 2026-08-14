import { expect, test } from "bun:test";

import {
  classifyPublicHomeValidation,
  resolvePublicHomeAuthState,
  shouldRetryPublicHomeValidation,
} from "./publicHomeAuth";
import { validateStoredAuthTokenWithoutRedirect } from "./publicHomeAuthClient";

test("redirects only after the stored session has been validated", () => {
  expect(resolvePublicHomeAuthState({ token: null })).toBe("anonymous");
  expect(resolvePublicHomeAuthState({ token: "expired", validationStatus: "pending" })).toBe("validating");
  expect(resolvePublicHomeAuthState({ token: "expired", validationStatus: "invalid" })).toBe("anonymous");
  expect(resolvePublicHomeAuthState({ token: "valid", validationStatus: "valid" })).toBe("authenticated");
});

test("requires a fresh validation result and retries only transient failures", () => {
  expect(classifyPublicHomeValidation({
    token: "cached-token",
    isFetchedAfterMount: false,
    isFetching: false,
    hasUser: true,
    hasError: false,
  })).toBe("pending");
  expect(classifyPublicHomeValidation({
    token: "revoked-token",
    isFetchedAfterMount: true,
    isFetching: false,
    hasUser: true,
    hasError: true,
    errorStatus: 401,
  })).toBe("invalid");
  expect(classifyPublicHomeValidation({
    token: "valid-token",
    isFetchedAfterMount: true,
    isFetching: false,
    hasUser: false,
    hasError: true,
    errorStatus: 503,
  })).toBe("unavailable");
  expect(classifyPublicHomeValidation({
    token: "cached-token",
    isFetchedAfterMount: true,
    isFetching: false,
    hasUser: true,
    hasError: true,
  })).toBe("unavailable");
  expect(shouldRetryPublicHomeValidation(0, 503)).toBe(true);
  expect(shouldRetryPublicHomeValidation(0, 401)).toBe(false);
});

test("reports an invalid stored token without invoking the global login redirect", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }, { preconnect: fetch.preconnect });

  let error: (Error & { status?: number }) | undefined;
  try {
    await validateStoredAuthTokenWithoutRedirect("expired", {
      baseUrl: "https://dashboard.example.invalid",
      fetch: fetchImpl,
    });
  } catch (caught) {
    error = caught as Error & { status?: number };
  }

  expect(error?.status).toBe(401);
  expect(requestUrl).toBe("https://dashboard.example.invalid/api/v1/auth/validate-auth");
  expect(requestInit).toMatchObject({ method: "POST", credentials: "omit" });
});
