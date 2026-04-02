import LayoutMain from "@/components/layouts";
import CmsPageContent from "@/components/cms/cms-page-content";
import { useQuery } from "@tanstack/react-query";
import useCmsPagesService from "@/services/cms-pages";
import { SkeletonBanner } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";

export default function Home() {
  const { getCmsPageBySlug } = useCmsPagesService();

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page", "index"],
    queryFn: () => getCmsPageBySlug("index"),
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
        <div className="container mx-auto my-20">
          <ErrorCard message={(error as Error).message} />
        </div>
      </LayoutMain>
    );
  }

  if (!page) {
    return (
      <LayoutMain>
        <div className="container mx-auto my-20 text-center">
          <p className="text-slate-500">
            Create a CMS page with slug <code>index</code> to configure this
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

