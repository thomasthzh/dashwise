import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayoutTemplate from "@/components/dashboard/DashboardLayoutTemplate";
import { ActivityProvider } from "@/context/ActivityContext";
import { LocalizationProvider } from "@/context/LocalizationContext";
import useAuth from "@/context/useAuth";
import {
  classifyPublicHomeValidation,
  resolvePublicHomeAuthState,
  shouldRetryPublicHomeValidation,
} from "@/lib/publicHomeAuth";
import { validateStoredAuthTokenWithoutRedirect } from "@/lib/publicHomeAuthClient";

const PUBLIC_HOME_CONFIG = {
  instance_name: "126f",
  template: "main",
  columns: {
    left: { "home-server-activity": { index: 0 } },
    middle: {
      "main-clock": { index: 0, glanceables: { date: null, "day-progress": null } },
      "search-bar": { index: 1 },
      "home-server-services": { index: 2 },
    },
    right: { "home-server-host": { index: 0 } },
  },
};

export default function Page() {
  const navigate = useNavigate();
  const { token, setAuth, logout } = useAuth();
  const authValidation = useQuery({
    queryKey: ["auth", "validate", token],
    enabled: Boolean(token),
    retry: (failureCount, error) => shouldRetryPublicHomeValidation(
      failureCount,
      (error as Error & { status?: number }).status,
    ),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () => validateStoredAuthTokenWithoutRedirect(token as string),
  });
  const validationStatus = classifyPublicHomeValidation({
    token,
    isFetchedAfterMount: authValidation.isFetchedAfterMount,
    isFetching: authValidation.isFetching,
    hasUser: Boolean(authValidation.data?.user),
    hasError: authValidation.isError,
    errorStatus: authValidation.isError
      ? (authValidation.error as Error & { status?: number }).status
      : undefined,
  });
  const authState = resolvePublicHomeAuthState({ token, validationStatus });

  useEffect(() => {
    if (!authValidation.data?.user || !token || !authValidation.isFetchedAfterMount || authValidation.isFetching || authValidation.isError) return;
    setAuth(authValidation.data.user, authValidation.data.token ?? token);
    navigate("/home", { replace: true });
  }, [authValidation.data, authValidation.isError, authValidation.isFetchedAfterMount, authValidation.isFetching, navigate, setAuth, token]);

  useEffect(() => {
    if (!authValidation.error) return;
    const status = (authValidation.error as Error & { status?: number }).status;
    if (status === 401) logout();
  }, [authValidation.error, logout]);

  if (authState === "authenticated") return null;

  return (
    <LocalizationProvider>
      <ActivityProvider disabled>
        <DashboardLayoutTemplate config={PUBLIC_HOME_CONFIG} pageName="home" readOnly />
      </ActivityProvider>
    </LocalizationProvider>
  );
}
