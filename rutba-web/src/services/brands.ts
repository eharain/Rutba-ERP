import axios from "axios";
import { BASE_URL } from "@/static/const";
import { BrandInterface } from "@/types/api/brand";
import { WebBrandsEndpoints } from "@/endpoints";

export default function useBrandsService() {
  /**
   * Retrieves a list of brands from the server.
   *
   * @return {BrandInterface[]} An array of brand objects.
   */
  const getBrands = async () => {
    const ep = WebBrandsEndpoints.list();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });

    return req.data.data as BrandInterface[];
  };

  return {
    getBrands,
  };
}
