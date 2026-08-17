import LayoutMain from "@/components/layouts";
import Link from "next/link";
import CmsPageGroup from "@/components/cms/cms-page-group";
import Seo from "@/components/seo/seo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { SkeletonProductDetail } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import {
  createWebCmsPageGroupsService,
  getCmsPageGroupBySlugSSR,
} from "@/services/cms-page-groups";
import { CmsPageGroupInterface } from "@/types/api/cms-page";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { BASE_URL } from "@/static/const";
import { resolveMediaUrl } from "@/lib/media-url";

/**
 * Standalone route for a curated CMS page-group (the flip-card grid). Linked
 * from menu items with link_kind = page_group.
 */
export const getServerSideProps: GetServerSideProps<{
  initialGroup: CmsPageGroupInterface | null;
  slug: string;
}> = async (context) => {
  const slug = context.params?.slug as string;

  try {
    const group = await getCmsPageGroupBySlugSSR(slug);
    return { props: { initialGroup: group, slug } };
  } catch {
    return { props: { initialGroup: null, slug } };
  }
};

export default function PageGroupRoute({
  initialGroup,
  slug: ssrSlug,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const slug = (router.query.slug as string) ?? ssrSlug;
  const service = createWebCmsPageGroupsService({ baseURL: BASE_URL });

  const {
    data: group,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["cms-page-group", slug],
    queryFn: () => service.getCmsPageGroupBySlug(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
    initialData: initialGroup ?? undefined,
  });

  if (isLoading) {
    return (
      <LayoutMain>
        <SkeletonProductDetail />
      </LayoutMain>
    );
  }

  if (isError && !group) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20">
          <ErrorCard message={(error as Error).message} />
        </div>
      </LayoutMain>
    );
  }

  if (!group) {
    return (
      <LayoutMain>
        <div className="container-fluid my-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Collection not found</h2>
          <Link href="/" className="text-brand hover:underline">
            Back to home
          </Link>
        </div>
      </LayoutMain>
    );
  }

  const coverUrl = group.cover_image?.url
    ? resolveMediaUrl(group.cover_image.url)
    : null;

  return (
    <LayoutMain>
      <>
        <Seo
          title={group.seo_meta?.meta_title || group.title || group.name}
          description={group.seo_meta?.meta_description}
          image={group.seo_meta?.og_image?.url || group.cover_image?.url}
        />
        {coverUrl && (
          <section className="relative w-full overflow-hidden h-[40vh] md:h-[52vh] bg-secondary">
            <img
              src={coverUrl}
              className="absolute inset-0 w-full h-full object-cover"
              alt={group.title || group.name}
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10"
            />
            <div className="relative h-full container-fluid flex flex-col justify-end pb-10 md:pb-16">
              <h1 className="font-display text-white text-4xl md:text-6xl font-bold leading-[1.02] max-w-3xl drop-shadow-sm">
                {group.title || group.name}
              </h1>
            </div>
          </section>
        )}
        <CmsPageGroup group={group} />
      </>
    </LayoutMain>
  );
}
