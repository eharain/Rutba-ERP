import { WebCmsMenusEndpoints } from '@rutba/api-provider/endpoints/web/cms-menus.js';
import { MenuInterface } from '@/types/api/menu';

export function createWebMenusService(config: { baseURL?: string } = {}) {
  void config;
  const proxy = WebCmsMenusEndpoints;

  // One call returns every enabled menu (all positions), resolved server-side.
  const getMenus = async (): Promise<MenuInterface[]> => {
    const res = await proxy.list();
    return (res?.data ?? []) as MenuInterface[];
  };

  return {
    endpoints: proxy,
    getMenus,
  };
}
