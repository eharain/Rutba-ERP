import _ from 'lodash';
import { WebProductsEndpoints, WebCollectionsEndpoints} from './endpoints';

// SSR helpers — callable directly from getServerSideProps. They share the
// underlying generated proxy so request shaping (X-Rutba-App header, base URL)
// stays identical between server and client. The component re-runs the query
// on hydration but useQuery({ initialData }) makes that first run a cache hit.
//
// Returns the full envelope ({ data, meta }) so callers can read both the
// product and the resolved offerContext (when a groupId was supplied).
export async function getProductDetailSSR(slug: string, groupId?: string) {
  const res = await WebProductsEndpoints.detail(slug, groupId);
  return res ?? null;
}

export function createWebProductsService(config = {}) {
  void config;
  const productsProxy = WebProductsEndpoints;
  const collectionsProxy = WebCollectionsEndpoints;

  const getFeaturedSneakers = async () => {
    // Returns the group itself so callers can attribute clicks to it via
    // `sourceGroupId` — the detail page needs that to resolve group offers.
    const res = await productsProxy.featured();
    const group = res?.data?.[0];
    return {
      group: group ?? null,
      products: group?.products ?? [],
    };
  };

  const getCollections = async () => {
    const res = await collectionsProxy.list();
    return res?.data ?? [];
  };

  const getProducts = async (filter, page = '1') => {
    const res = await productsProxy.list(filter, page);
    const data = res?.data ?? [];
    const uniqueIds = _.uniqBy(data, 'id');
    return {
      data: uniqueIds,
      pagination: res?.meta?.pagination,
    };
  };

  const getProductDetail = async (slug, groupId) => {
    const res = await productsProxy.detail(slug, groupId);
    return { data: res?.data, offerContext: res?.meta?.offerContext ?? null };
  };

  const productInArrayId = async (idProducts) => {
    const res = await productsProxy.byIds(idProducts);
    return res?.data ?? [];
  };

  const searchProduct = async (search) => {
    if ((search ?? '').length <= 0) return [];
    const res = await productsProxy.search(search);
    return res?.data ?? [];
  };

  const getHighestProductPrice = async () => {
    const res = await productsProxy.highestPrice();
    return res?.data ?? null;
  };

  return {
    productsEndpoints: productsProxy,
    collectionsEndpoints: collectionsProxy,
    getFeaturedSneakers,
    getCollections,
    getProducts,
    getProductDetail,
    productInArrayId,
    searchProduct,
    getHighestProductPrice,
  };
}

