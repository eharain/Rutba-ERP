import axios from "axios";
import { BASE_URL } from "@/static/const";
import { OrderInterface } from "@/types/api/order";
import { useSession } from "next-auth/react";
import { MetaInterface } from "@/types/api/meta";
import { WebOrdersEndpoints } from "@/endpoints";

export default function useTransactionService() {
  const session = useSession();

  /**
   * Retrieves a transaction order using a secret code.
   *
   * @param {Object} data - An object containing the code and secret.
   * @param {string} data.code - The code of the transaction order.
   * @param {string} data.secret - The secret key for authentication.
   * @return {Promise<OrderInterface>} The transaction order data.
   */
  const getTransactionWithSecret = async (data: {
    code: string;
    secret: string;
  }) => {
    const ep = WebOrdersEndpoints.tracking(data.code, data.secret);
    const req = await axios.get(BASE_URL + ep.path, { params: ep.params });
    return req.data as OrderInterface;
  };

  const getMyTransaction = async () => {
    const ep = WebOrdersEndpoints.myOrders(session?.data?.user?.email ?? '');
    const req = await axios.get(BASE_URL + ep.path, {
      params: ep.params,
      headers: {
        Authorization: session?.data?.jwt
          ? "Bearer " + session?.data?.jwt
          : undefined,
      },
    });
    return {
      data: req.data?.data as OrderInterface[],
      pagination: req.data?.meta?.pagination as MetaInterface,
    };
  };

  const getMyTransactionById = async (id?: string) => {
    const ep = WebOrdersEndpoints.byId(id ?? '');
    const req = await axios.get(BASE_URL + ep.path, {
      params: ep.params,
      headers: {
        Authorization: session?.data?.jwt
          ? "Bearer " + session?.data?.jwt
          : undefined,
      },
    });
    return req.data as OrderInterface;
  };

  return {
    getTransactionWithSecret,
    getMyTransaction,
    getMyTransactionById,
  };
}
