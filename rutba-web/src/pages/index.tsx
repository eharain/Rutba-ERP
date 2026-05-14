import LayoutMain from "@/components/layouts";
import CmsPageContent from "@/components/cms/cms-page-content";
import { useQuery } from "@tanstack/react-query";
// Thin path, not the @/services barrel — the home page is the cold-compile
// root and pulling the barrel here drags in cart/checkout/orders/reviews
// modules transitively, ballooning the compile time.
import { createWebCmsPagesService, getCmsPageBySlugSSR } from "@/services/cms-pages";
import { SkeletonBanner } from "@/components/skeleton";
import { ErrorCard } from "@/components/errors/error-card";
import { BASE_URL } from "@/static/const";
import { CmsPageDetailInterface } from "@/types/api/cms-page";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";

// Fail-fast SSR fetch: never let a hung Strapi block the home page render.
// If the call doesn't resolve within 3s we hydrate with a null initialPage and
// let the client-side useQuery (which already exists below) retry on its own
// schedule. The page still renders — just without server-side data.
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T | null;
  } finally {
    // @ts-expect-error timer is assigned by the promise above
    clearTimeout(timer);
  }
}

export const getServerSideProps: GetServerSideProps<{
  initialPage: CmsPageDetailInterface | null;
}> = async () => {
  try {
    const page = await withTimeout(getCmsPageBySlugSSR("index"), 3000);
    return { props: { initialPage: page ?? null } };
  } catch {
    return { props: { initialPage: null } };
  }
};

export default function Home({
  initialPage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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
    initialData: initialPage ?? undefined,
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

