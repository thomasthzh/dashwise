
import { useParams } from "react-router-dom";

import PageNotFound from "@/components/errorPages/PageNotFound";
import DashboardLayoutTemplate from "@/components/dashboard/DashboardLayoutTemplate";
import { usePageConfig } from "@/hooks/usePageConfig";

export default function DashboardPageFromConfig() {
  const params = useParams();
  const pageName = (params?.page as string) || "home";
  const { pageConfig: config, loading } = usePageConfig({ pageName });

  if (!loading && !config) return <PageNotFound pageName={pageName} />;

  return (
    <DashboardLayoutTemplate
      config={config}
      pageName={pageName}
      isLoading={loading}
    />
  );
}
