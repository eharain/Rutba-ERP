import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import SelectSearch from "@/components/input-custom/select-search";
import { SubmitHandler, useForm } from "react-hook-form";
import {
  ValidationShippingInformation,
  ValidationShippingInformationSchema,
} from "@/validations/shipping-information-validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { countryList } from "@/static/country";
import { useStoreCheckout } from "@/store/store-checkout";
import useErrorHandler from "@/hooks/useErrorHandler";
import Spinner from "@/components/ui/spinner";
import useDeliveryService from "@/services/delivery";
import { useCartService } from "@/services/cart";

interface Props {
  onDeliveryMethodsReady: () => void;
}

export default function FormCheckoutShippingInformation({ onDeliveryMethodsReady }: Props) {
  const { showError } = useErrorHandler();
  const { getDeliveryMethods } = useDeliveryService();
  const { getCart } = useCartService();
  const {
    formShippingInformation,
    setFormShippingInformation,
    setAvailableDeliveryMethods,
    setIsLoadingDeliveryMethods,
    setSelectedDeliveryMethod,
  } = useStoreCheckout();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ValidationShippingInformationSchema>({
    resolver: zodResolver(ValidationShippingInformation),
    defaultValues: formShippingInformation,
  });

  const onSubmitShippingInformation: SubmitHandler<ValidationShippingInformationSchema> = async (data) => {
    setFormShippingInformation(data);
    setSelectedDeliveryMethod(null);

    setIsLoadingDeliveryMethods(true);
    try {
      const cartItems = await getCart();

      const cartTotal = cartItems.reduce((acc, item) => {
        const unitPrice = item.offerPrice && item.offerPrice > 0 ? item.offerPrice : Number(item.price);
        return acc + unitPrice * Number(item.qty || 1);
      }, 0);

      const productGroupDocumentIds = [
        ...new Set(cartItems.map((i) => i.sourceGroupId).filter(Boolean) as string[]),
      ];

      const options = await getDeliveryMethods({
        productGroupDocumentIds,
        destination: { city: data.city, country: data.country },
        cartTotal,
      });

      setAvailableDeliveryMethods(options);
      onDeliveryMethodsReady();
    } catch (err) {
      showError("Could not load delivery options. Please try again.");
    } finally {
      setIsLoadingDeliveryMethods(false);
    }
  };

  useEffect(() => {
    register("country");
  }, []);

  return (
    <form
      onSubmit={handleSubmit(onSubmitShippingInformation)}
      className="space-y-4"
    >
      <div className="grid grid-cols-12 gap-[15px] lg:gap[30px]">
        <div className="col-span-12 md:col-span-12 lg:col-span-12">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              {...register("name")}
              type="text"
              className="name"
              placeholder="eg. John Doe"
            ></Input>
            {errors.name && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.name?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">Email</Label>
            <Input
              {...register("email")}
              type="text"
              className="name"
              placeholder="eg. johndoe@example.com"
            ></Input>
            {errors.email && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.email?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">Phone Number</Label>
            <Input
              {...register("phone_number")}
              type="text"
              className="name"
              placeholder="eg. +12300000000"
            ></Input>
            {errors.phone_number && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.phone_number?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-12 lg:col-span-12">
          <hr className="mt-4 mb-3" />
        </div>
        <div className="col-span-12 md:col-span-12 lg:col-span-12">
          <div>
            <Label htmlFor="name">Address</Label>
            <Input
              {...register("address")}
              type="text"
              className="name"
              placeholder="eg. example street 111th"
            ></Input>
            {errors.address && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.address?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">Country</Label>
            <SelectSearch
              defaultValue={getValues("country")}
              onDataChange={(country) => setValue("country", country as string)}
              label="Country"
              items={countryList.map((item) => {
                return {
                  value: item.code,
                  name: item.name,
                };
              })}
            ></SelectSearch>
            {errors.country && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.country?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">State</Label>
            <Input
              {...register("state")}
              type="text"
              className="name"
              placeholder="eg. New York City"
            ></Input>
            {errors.state && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.state?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">City</Label>
            <Input
              {...register("city")}
              type="text"
              className="name"
              placeholder="eg. New York"
            ></Input>
            {errors.city && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.city?.message}
              </p>
            )}
          </div>
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div>
            <Label htmlFor="name">Zip Code</Label>
            <Input
              {...register("zip_code")}
              type="text"
              className="name"
              placeholder="eg. 000000"
            ></Input>
            {errors.zip_code && (
              <p className="text-xs italic text-red-500 mt-2">
                {errors.zip_code?.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between flex-wrap">
        <Button className="mt-4" type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <div className="mr-2">
              <Spinner></Spinner>
            </div>
          )}
          <span>Continue to Delivery</span>
        </Button>
      </div>
    </form>
  );
}
