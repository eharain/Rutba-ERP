import _ from 'lodash';
import { WebProductsEndpoints } from '../../api/web/products.js';
import { WebCollectionsEndpoints } from '../../api/web/collections.js';
import { createWebClientProxy } from './createWebClientProxy.js';

export function createWebProductsService(config = {}) {
  const productsProxy = createWebClientProxy(WebProductsEndpoints, config);
  const collectionsProxy = createWebClientProxy(WebCollectionsEndpoints, config);

  const getFeaturedSneakers = async () => {
    const res = await productsProxy.featured();
    return res?.data?.[0]?.products ?? [];
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

  const getProductDetail = async (slug) => {
    const res = await productsProxy.detail(slug);
    return res?.data;
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
    return res?.data?.[0] ?? null;
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

