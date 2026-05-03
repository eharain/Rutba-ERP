import axios from "axios";
import { BASE_URL } from "@/static/const";
import { BannerInterface } from "@/types/api/banner";
import { WebBannersEndpoints } from "@/endpoints";

export default function useBannersService() {
  const getBanners = async () => {
    const ep = WebBannersEndpoints.homeBanner();
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data.data[0] as BannerInterface;
  };

  return { getBanners };
}
