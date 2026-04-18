import LayoutMain from "@/components/layouts";
import Link from "next/link";
import CmsPageContent from "@/components/cms/cms-page-content";
import CmsBlogPageContent from "@/components/cms/cms-blog-page-content";
import CmsNewsPageContent from "@/components/cms/cms-news-page-content";
import CmsInfoPageContent from "@/components/cms/cms-info-page-content";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import useCmsPagesService, { getCmsPageBySlugSSR } from "@/services/cms-pages";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

/**
 * Compatibility route for /page/:slug links.
 * Renders the page directly using the appropriate content component
 * based on the page's page_type.
 */
export const getServerSideProps: GetServerSideProps<{
  initialPage: CmsPageDetailInterface | null;
  slug: string;
}> = async (context) => {
  const slug = context.params?.slug as string;

  try {
    const page = await getCmsPageBySlugSSR(slug);
    return { props: { initialPage: page, slug } };
  } catch {
    return { props: { initialPage: null, slug } };
  }
};

export default function PageCompatibility({
  initialPage,
  slug: ssrSlug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const slug = (router.query.slug as string) ?? ssrSlug;
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
    initialData: initialPage ?? undefined,
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
          <h2 className="text-2xl font-bold mb-4">Page not found</h2>
          <Link href="/" className="text-blue-600 hover:underline">
            Back to home
          </Link>
        </div>
      </LayoutMain>
    );
  }

  const contentByType: Record<string, React.ReactNode> = {
    blog: <CmsBlogPageContent page={page} />,
    news: <CmsNewsPageContent page={page} />,
    info: <CmsInfoPageContent page={page} />,
  };

  return (
    <LayoutMain footer={page.footer}>
      {contentByType[page.page_type] ?? <CmsPageContent page={page} />}
    </LayoutMain>
  );
}
