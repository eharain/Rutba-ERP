import LayoutMain from "@/components/layouts";
import Link from "next/link";
import CmsBlogPageContent from "@/components/cms/cms-blog-page-content";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import {
  createWebCmsPagesService,
  getCmsPageBySlugSSR,
} from "@/services";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { BASE_URL } from "@/static/const";

const PAGE_TYPE = "blog";

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

export default function BlogPageDetail({
  initialPage,
  slug: ssrSlug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const slug = (router.query.slug as string) ?? ssrSlug;
  const cmsPagesService = createWebCmsPagesService({ baseURL: BASE_URL });

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page", slug],
    queryFn: () => cmsPagesService.getCmsPageBySlug(slug as string),
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

  if (isError && !page) {
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
          <h2 className="text-2xl font-bold mb-4">Post not found</h2>
          <Link href="/blog" className="text-blue-600 hover:underline">
            Back to blog
          </Link>
        </div>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain footer={page.footer} menus={page.menus}>
      <CmsBlogPageContent page={page} />
    </LayoutMain>
  );
}
