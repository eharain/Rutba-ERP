import { WebCmsPageGroupsEndpoints } from '@rutba/api-provider/endpoints/web/cms-page-groups.js';
import { CmsPageGroupInterface } from '@/types/api/cms-page';

export function createWebCmsPageGroupsService(config: { baseURL?: string } = {}) {
  void config;
  const proxy = WebCmsPageGroupsEndpoints;

  const getCmsPageGroupBySlug = async (
    slug: string,
  ): Promise<CmsPageGroupInterface | null> => {
    const res = await proxy.bySlug(slug);
    return (res?.data ?? null) as CmsPageGroupInterface | null;
  };

  return {
    endpoints: proxy,
    getCmsPageGroupBySlug,
  };
}

export async function getCmsPageGroupBySlugSSR(
  slug: string,
): Promise<CmsPageGroupInterface | null> {
  const res = await WebCmsPageGroupsEndpoints.bySlug(slug);
  return (res?.data ?? null) as CmsPageGroupInterface | null;
}
