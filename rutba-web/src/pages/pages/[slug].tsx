import LayoutMain from "@/components/layouts";
import Link from "next/link";
import CmsPageContent from "@/components/cms/cms-page-content";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import useCmsPagesService from "@/services/cms-pages";

export default function CmsPageDetail() {
  const router = useRouter();
  const { slug } = router.query;
  const { getCmsPageBySlug } = useCmsPagesService();

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page", slug],
    queryFn: () => getCmsPageBySlug(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <LayoutMain>
        <SkeletonProductDetail />
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
          <h2 className="text-2xl font-bold mb-4">Page not found</h2>
          <Link href="/pages" className="text-blue-600 hover:underline">
            Back to pages
          </Link>
        </div>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain>
      <CmsPageContent page={page} />
    </LayoutMain>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
