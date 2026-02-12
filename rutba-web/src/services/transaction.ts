import axios from "axios";
import { BASE_URL } from "@/static/const";
import { OrderInterface } from "@/types/api/order";
import { useSession } from "next-auth/react";
import { MetaInterface } from "@/types/api/meta";

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
    const req = await axios.get(
      `${BASE_URL}orders/transaction/${data.code}?secret=${data.secret}`
    );
    return req.data as OrderInterface;
  };

  const getMyTransaction = async () => {
    const req = await axios.get(`${BASE_URL}orders`, {
      params: {
        filters: {
          user_id: {$eq: session?.data?.user?.email},
        },
        populate: {
          customer_contact: true,
          products: {
            populate: {
              items: {
                fields: ['quantity', 'product_name'] 
              }
            }
          }
        },
      },
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
    const req = await axios.get(`${BASE_URL}orders/me/transaction/${id}`, {
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
