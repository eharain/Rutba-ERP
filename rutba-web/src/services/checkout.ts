import axios from "axios";
import { BASE_URL } from "@/static/const";
import { ValidationShippingInformationSchema } from "@/validations/shipping-information-validation";
import {
  RatesInterface,
  // RequestCheckoutInterface,
  RequestShippingRateInterface,
  ValidateAddressInterface,
} from "@/types/api/checkout";
import { CheckoutPayload, OrderInterface } from "@/types/api/order";
import { WebCheckoutEndpoints, WebOrdersEndpoints } from "@/endpoints";

export default function useCheckoutService() {

  /**
   * Validates the given shipping information address.
   *
   * @param {ValidationShippingInformationSchema} data - The shipping information to be validated.
   * @return {Promise<ValidateAddressInterface>} The validated address.
   */
  const validateAddress = async (data: ValidationShippingInformationSchema) => {
    const ep = WebCheckoutEndpoints.validateAddress();
    const req = await axios.post(BASE_URL + ep.path, {
      data,
    });

    return req.data as ValidateAddressInterface;
  };

  /**
   * Retrieves the shipping rate for an order checkout.
   *
   * @param {RequestShippingRateInterface} data - The data containing the address and parcel information.
   * @return {Promise<RatesInterface>} The shipping rate for the order checkout.
   */
  const getShippingRate = async (data: RequestShippingRateInterface) => {
    const ep = WebCheckoutEndpoints.shippingRate();
    const req = await axios.post(BASE_URL + ep.path, {
      address: {
        ...data.address,
      },
      parcel: data.parcel,
    });

    return req.data as RatesInterface;
  };

  /**
   * Sends a POST request to the server to create an order with the provided checkout data.
   *
   * @param {CheckoutPayload} data - The data needed for the checkout process, including items, shipping, and customer details.
   * @return {Promise<OrderInterface>} A promise that resolves to the response data from the server.
   */
  const checkoutItem = async (data: CheckoutPayload) => {
    const ep = WebOrdersEndpoints.create();
    const req = await axios.post(BASE_URL + ep.path, {
      data,
    });

    return req.data.data as OrderInterface;
  };

  return {
    validateAddress,
    getShippingRate,
    checkoutItem,
  };
}
