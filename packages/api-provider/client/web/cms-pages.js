import { WebCmsPagesEndpoints } from '@/api/web/cms-pages.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebCmsPagesService(config = {}) {
  const proxy = createWebClientProxy(WebCmsPagesEndpoints, config);

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
  const proxy = createWebClientProxy(WebCmsPagesEndpoints, config);
  const res = await proxy.list();
  return res?.data ?? [];
}

export async function getCmsPagesByTypeSSR(pageType, config = {}) {
  const proxy = createWebClientProxy(WebCmsPagesEndpoints, config);
  const res = await proxy.listByType(pageType);
  return res?.data ?? [];
}

export async function getCmsPageBySlugSSR(slug, config = {}) {
  const proxy = createWebClientProxy(WebCmsPagesEndpoints, config);
  const res = await proxy.bySlug(slug);
  const pages = res?.data ?? [];
  return pages.length > 0 ? pages[0] : null;
}
