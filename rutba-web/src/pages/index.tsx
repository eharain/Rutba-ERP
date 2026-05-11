import LayoutMain from "@/components/layouts";
import CmsPageContent from "@/components/cms/cms-page-content";
import { useQuery } from "@tanstack/react-query";
import { createWebCmsPagesService } from "@/services";
import { SkeletonBanner } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { BASE_URL } from "@/static/const";

export default function Home() {
  const cmsPagesService = createWebCmsPagesService({ baseURL: BASE_URL });

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page", "index"],
    queryFn: () => cmsPagesService.getCmsPageBySlug("index"),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <LayoutMain>
        <SkeletonBanner />
      </LayoutMain>
    );
  }

  if (isError) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20">
          <ErrorCard message={(error as Error).message} />
        </div>
      </LayoutMain>
    );
  }

  if (!page) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20 text-center">
          <p className="text-slate-500">
            Create a CMS page with slug <code>home</code> to configure this
            page.
          </p>
        </div>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain footer={page.footer}>
      <CmsPageContent page={page} />
    </LayoutMain>
  );
}

