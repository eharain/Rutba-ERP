import axios from "axios";
import { BASE_URL } from "@/static/const";
import { FilterProductInterface, ProductInterface } from "@/types/api/product";
import { CollectionInterface } from "@/types/api/collection";
import { WebProductsEndpoints, WebCollectionsEndpoints } from "@/endpoints";

import _ from "lodash";
import { MetaInterface } from "@/types/api/meta";

export default function useProductsService() {
  /**
   * Retrieves the featured sneakers from the API.
   *
   * @return {ProductInterface} The featured sneakers.
   */
  const getFeaturedSneakers = async () => {
    const ep = WebProductsEndpoints.featured();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data[0].products as ProductInterface[];
  };

  /**
   * Retrieves collections from the server.
   *
   * @return {Promise<CollectionInterface[]>} An array of collections.
   */
  const getCollections = async () => {
    const ep = WebCollectionsEndpoints.list();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as CollectionInterface[];
  };

  /**
   * Retrieves the products from the API.
   *
   * @return {ProductInterface} The featured sneakers.
   */
  const getProducts = async (
    filter?: FilterProductInterface,
    page: string = "1"
  ) => {
    const ep = WebProductsEndpoints.list(filter, page);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });

    const data = req.data.data;

    // NOTE: Currently strapi facing problem when product deep sorting
    // for example product_variant.variant_price:DESC. It will duplicate
    // the some products. That why we need to remove duplicate products
    // within this function
    const uniqueIds = _.uniqBy<ProductInterface>(data, "id");

    // return data with unique id
    return {
      data: uniqueIds,
      pagination: req.data?.meta?.pagination as MetaInterface,
    };
  };

  /**
   * Retrieves the details of a product by its slug.
   *
   * @param {string} slug - The slug of the product.
   * @return {ProductInterface} The product details.
   */
  const getProductDetail = async (slug: string) => {
    const ep = WebProductsEndpoints.detail(slug);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as ProductInterface;
  };

  /**
   * Retrieves products from the API based on the given array of product IDs.
   *
   * @param {number[]} idProducts - An array of product IDs.
   * @return {ProductInterface[]} - An array of product data.
   */
  const productInArrayId = async (idProducts: number[]) => {
    const ep = WebProductsEndpoints.byIds(idProducts);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as ProductInterface[];
  };

  /**
   * Searches for products based on the given search string.
   *
   * @param {string} search - The search string to filter products by name.
   * @return {ProductInterface[]} - An array of products that match the search query.
   */
  const searchProduct = async (search: string) => {
    if (search.length <= 0) {
      return [] as ProductInterface[];
    }
    const ep = WebProductsEndpoints.search(search);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data as ProductInterface[];
  };

  return {
    getFeaturedSneakers,
    getCollections,
    getProducts,
    getProductDetail,
    productInArrayId,
    searchProduct,
  };
}

/**
 * Retrieves the highest priced product from the API.
 *
 * @return {ProductInterface} The highest priced product.
 */
export const getHighestProductPrice = async () => {
  const ep = WebProductsEndpoints.highestPrice();
  const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
  return req.data.data[0] as ProductInterface;
};
