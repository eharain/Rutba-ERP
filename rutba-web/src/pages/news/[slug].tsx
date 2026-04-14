import LayoutMain from "@/components/layouts";
import Link from "next/link";
import CmsNewsPageContent from "@/components/cms/cms-news-page-content";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import useCmsPagesService, { getCmsPageBySlugSSR } from "@/services/cms-pages";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

const PAGE_TYPE = "news";

export const getServerSideProps: GetServerSideProps<{
  initialPage: CmsPageDetailInterface | null;
  slug: string;
}> = async (context) => {
  const slug = context.params?.slug as string;

  try {
    const page = await getCmsPageBySlugSSR(slug);
    if (page && page.page_type !== PAGE_TYPE) {
      return { notFound: true };
    }
    return { props: { initialPage: page, slug } };
  } catch {
    return { props: { initialPage: null, slug } };
  }
};

export default function NewsPageDetail({
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
          <h2 className="text-2xl font-bold mb-4">Article not found</h2>
          <Link href="/news" className="text-blue-600 hover:underline">
            Back to news
          </Link>
        </div>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain footer={page.footer}>
      <CmsNewsPageContent page={page} />
    </LayoutMain>
  );
}
