import axios from "axios";
import { BASE_URL } from "@/static/const";
import { CmsPageInterface, CmsPageDetailInterface } from "@/types/api/cms-page";
import { WebCmsPagesEndpoints } from "@/endpoints";

export default function useCmsPagesService() {
  const getCmsPages = async () => {
    const ep = WebCmsPagesEndpoints.list();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as CmsPageInterface[];
  };

  const getCmsPageBySlug = async (slug: string) => {
    const ep = WebCmsPagesEndpoints.bySlug(slug);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    const pages = req.data.data as CmsPageDetailInterface[];
    return pages.length > 0 ? pages[0] : null;
  };

  const getCmsHeaderData = async () => {
    const ep = WebCmsPagesEndpoints.header();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    const pages = req.data.data as CmsPageDetailInterface[];
    return pages.length > 0 ? pages[0] : null;
  };

  const getCmsPagesByType = async (pageType: string) => {
    const ep = WebCmsPagesEndpoints.listByType(pageType);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as CmsPageInterface[];
  };

  return {
    getCmsPages,
    getCmsPagesByType,
    getCmsPageBySlug,
    getCmsHeaderData,
  };
}

export const getCmsPagesSSR = async () => {
  const ep = WebCmsPagesEndpoints.list();
  const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
  return req.data.data as CmsPageInterface[];
};

export const getCmsPagesByTypeSSR = async (pageType: string) => {
  const ep = WebCmsPagesEndpoints.listByType(pageType);
  const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
  return req.data.data as CmsPageInterface[];
};

export const getCmsPageBySlugSSR = async (slug: string) => {
  const ep = WebCmsPagesEndpoints.bySlug(slug);
  const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
  const pages = req.data.data as CmsPageDetailInterface[];
  return pages.length > 0 ? pages[0] : null;
};
