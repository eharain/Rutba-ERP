import { WebCmsPagesEndpoints } from '@rutba/api-provider/endpoints/web/cms-pages.js';

export function createWebCmsPagesService(config = {}) {
  void config;
  const proxy = WebCmsPagesEndpoints;

  const getCmsPages = async () => {
    const res = await proxy.list();
    return res?.data ?? [];
  };

  const getCmsPagesByType = async (pageType) => {
    const res = await proxy.listByType(pageType);
    return res?.data ?? [];
  };

  // The page detail endpoint is now built server-side and returns a single
  // record (or null). Pass { draft: true } to preview the draft document —
  // requires an authenticated CMS editor session.
  const getCmsPageBySlug = async (slug, options = {}) => {
    const res = await proxy.bySlug(slug, options);
    return res?.data ?? null;
  };

  const getCmsHeaderData = async () => {
    const res = await proxy.header();
    return res?.data ?? null;
  };

  return {
    endpoints: proxy,
    getCmsPages,
    getCmsPagesByType,
    getCmsPageBySlug,
    getCmsHeaderData,
  };
}

export async function getCmsPagesSSR(config = {}) {
  void config;
  const proxy = WebCmsPagesEndpoints;
  const res = await proxy.list();
  return res?.data ?? [];
}

export async function getCmsPagesByTypeSSR(pageType, config = {}) {
  void config;
  const proxy = WebCmsPagesEndpoints;
  const res = await proxy.listByType(pageType);
  return res?.data ?? [];
}

export async function getCmsPageBySlugSSR(slug, options = {}) {
  const proxy = WebCmsPagesEndpoints;
  const res = await proxy.bySlug(slug, options);
  return res?.data ?? null;
}
