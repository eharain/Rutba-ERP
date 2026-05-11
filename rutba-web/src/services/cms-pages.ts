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

  const getCmsPageBySlug = async (slug) => {
    const res = await proxy.bySlug(slug);
    const pages = res?.data ?? [];
    return pages.length > 0 ? pages[0] : null;
  };

  const getCmsHeaderData = async () => {
    const res = await proxy.header();
    const pages = res?.data ?? [];
    return pages.length > 0 ? pages[0] : null;
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

export async function getCmsPageBySlugSSR(slug, config = {}) {
  void config;
  const proxy = WebCmsPagesEndpoints;
  const res = await proxy.bySlug(slug);
  const pages = res?.data ?? [];
  return pages.length > 0 ? pages[0] : null;
}

