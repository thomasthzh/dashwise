export type PublicHomeValidationStatus = "pending" | "valid" | "invalid" | "unavailable";

export function classifyPublicHomeValidation({
  token,
  isFetchedAfterMount,
  isFetching,
  hasUser,
  hasError,
  errorStatus,
}: {
  token: string | null;
  isFetchedAfterMount: boolean;
  isFetching: boolean;
  hasUser: boolean;
  hasError: boolean;
  errorStatus?: number;
}): PublicHomeValidationStatus | undefined {
  if (!token) return undefined;
  if (!isFetchedAfterMount) return "pending";
  if (isFetching) return "pending";
  if (errorStatus === 401) return "invalid";
  if (hasError) return "unavailable";
  return hasUser ? "valid" : "pending";
}

export function shouldRetryPublicHomeValidation(failureCount: number, errorStatus?: number) {
  return errorStatus !== 401 && failureCount < 2;
}

export function resolvePublicHomeAuthState({
  token,
  validationStatus,
}: {
  token: string | null;
  validationStatus?: PublicHomeValidationStatus;
}) {
  if (!token || validationStatus === "invalid" || validationStatus === "unavailable") return "anonymous" as const;
  if (validationStatus === "valid") return "authenticated" as const;
  return "validating" as const;
}
