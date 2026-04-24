import CartItem from "@/components/cart/cart-item";
import FormCheckoutShippingInformation from "@/components/form/checkout/form-checkout-shipping-information";
import FormCheckoutDeliveryMethod from "@/components/form/checkout/form-checkout-delivery-method";
import { Card, CardContent } from "@/components/ui/card";
import { useCartService } from "@/services/cart";
import { currencyFormat } from "@/lib/use-currency";
import { useStoreCart } from "@/store/store-cart";
import { useStoreCheckout } from "@/store/store-checkout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, CheckCircleIcon } from "lucide-react";
import useErrorHandler from "@/hooks/useErrorHandler";
import useCheckoutService from "@/services/checkout";

type CheckoutStep = "SHIPPING_INFORMATION" | "DELIVERY_METHOD";

export default function CheckoutPage() {
  const [step, setStep] = useState<CheckoutStep>("SHIPPING_INFORMATION");
  const { selectedDeliveryMethod, formShippingInformation } = useStoreCheckout();
  const router = useRouter();
  const session = useSession();
  const { showError } = useErrorHandler();
  const { checkoutItem } = useCheckoutService();
  const { getCart, clearCart } = useCartService();
  const { cartItem } = useStoreCart();

  useEffect(() => {
    if (!session.data?.jwt) {
      router.push("/login?redirect=/checkout");
    }
    if (cartItem.length === 0) {
      showError("No items in cart");
      router.push("/");
    }
  }, [session.data?.jwt, router]);

  const { data: cart } = useQuery({
    queryKey: [
      "cart-item",
      cartItem.map((item) => ({
        variant: item.variantId,
        productId: item.productId,
        selectedImage: item.selectedImage,
      })),
    ],
    queryFn: () => getCart(),
  });

  const getQuantity = (productId?: number, variantId?: number, selectedImage?: string | null) => {
    const data = cartItem.find(
      (item) =>
        item.productId === productId &&
        item.variantId === variantId &&
        (item.selectedImage ?? null) === (selectedImage ?? null)
    );
    return data?.qty ?? 0;
  };

  const countSubTotal = () =>
    cart?.reduce((total, item) => {
      const unitPrice = item?.offerPrice && item.offerPrice > 0 ? item.offerPrice : (item?.price ?? 0);
      return total + unitPrice * getQuantity(item.id, item.variant_id, item.selectedImage);
    }, 0);

  const countOriginalTotal = () =>
    cart?.reduce(
      (total, item) =>
        total + (item?.price ?? 0) * getQuantity(item.id, item.variant_id, item.selectedImage),
      0
    );

  const savings = (countOriginalTotal() ?? 0) - (countSubTotal() ?? 0);

  const deliveryCost = selectedDeliveryMethod?.cost ?? 0;

  const countTotal = () => (countSubTotal() ?? 0) + deliveryCost;

  // ── Place order mutation ─────────────────────────────────────────────────
  const { mutate: placeOrder, isPending: isPlacingOrder } = useMutation({
    mutationFn: checkoutItem,
    onSuccess: (response) => {
      const phoneNumber = "+923245303530";
      const orderId = response?.order_id || "N/A";
      const customerName = response?.customer_contact?.name || "";
      const total = response?.total || response?.subtotal || 0;

      const items = response?.products?.items ?? [];
      const itemLines = items.map(
        (item, i) =>
          `${i + 1}. ${item.product_name || "Item"}` +
          (item.variant_name ? ` (${item.variant_name})` : "") +
          ` × ${item.quantity}` +
          (item.offer_price
            ? ` = Rs. ${item.total} (was Rs. ${(item.original_price || item.price) * item.quantity})`
            : ` = Rs. ${item.total}`)
      );

      const orderSavings = (response as any)?.savings || 0;

      const message =
        `Asalam u Alikum! 🛒\n\n` +
        `*Order ID:* ${orderId}\n` +
        (customerName ? `*Name:* ${customerName}\n` : "") +
        `\n*Items:*\n${itemLines.join("\n")}\n` +
        (orderSavings > 0 ? `\n*Savings: Rs. ${orderSavings}* 🎉\n` : "") +
        `\n*Total: Rs. ${total}*\n\n` +
        `Please confirm my order. JazakAllah!`;

      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      clearCart();
      window.open(whatsappUrl, "_blank");
      router.push("/");
    },
    onError: (err) => {
      showError("Error Placing Order: " + (err as Error).message);
    },
  });

  const handlePlaceOrder = async () => {
    const userEmail = session?.data?.user?.email;
    if (!userEmail) {
      showError("You must be logged in to place an order.");
      return;
    }
    if (!selectedDeliveryMethod) {
      showError("Please select a delivery method.");
      return;
    }

    const cartItems = await getCart();

    const calculatedSubtotal = cartItems.reduce((acc, item) => {
      const unitPrice = item.offerPrice && item.offerPrice > 0 ? item.offerPrice : Number(item.price);
      return acc + unitPrice * Number(item.qty || 1);
    }, 0);

    const originalSubtotal = cartItems.reduce(
      (acc, item) => acc + Number(item.price) * Number(item.qty || 1),
      0
    );
    const totalSavings = originalSubtotal - calculatedSubtotal;
    const totalWithDelivery = calculatedSubtotal + selectedDeliveryMethod.cost;

    const formattedItems = cartItems.map((item) => {
      const itemQty = Number(item.qty || 1);
      const unitPrice = item.offerPrice && item.offerPrice > 0 ? item.offerPrice : Number(item.price || 0);
      const originalPrice = Number(item.price || 0);
      return {
        quantity: itemQty,
        price: unitPrice,
        original_price: originalPrice,
        offer_price: item.offerPrice && item.offerPrice > 0 ? item.offerPrice : undefined,
        total: unitPrice * itemQty,
        product_name: item.name,
        product: item.documentId,
        variant: item.variant_id ? String(item.variant_id) : undefined,
        variant_name: item.variant_name,
        variant_terms: item.variant_terms,
        image: item.imageId ?? undefined,
        offer_id: item.offerId,
        source_group_id: item.sourceGroupId,
      };
    });

    placeOrder({
      products: { items: formattedItems },
      customer_contact: { ...formShippingInformation },
      payment_status: "Ordered",
      user_id: userEmail,
      order_id: `ORD-${Date.now()}`,
      subtotal: calculatedSubtotal,
      total: totalWithDelivery,
      original_subtotal: totalSavings > 0 ? originalSubtotal : undefined,
      savings: totalSavings > 0 ? totalSavings : undefined,
      delivery_method_id: selectedDeliveryMethod.methodDocumentId,
      delivery_zone_id: selectedDeliveryMethod.zoneDocumentId,
      delivery_cost: selectedDeliveryMethod.cost,
      delivery_cost_breakdown: {
        base_cost: selectedDeliveryMethod.cost,
        is_free_shipping: selectedDeliveryMethod.isFreeShipping,
        service_provider: selectedDeliveryMethod.serviceProvider,
      },
    });
  };

  const stepLabel: Record<CheckoutStep, string> = {
    SHIPPING_INFORMATION: "01. Shipping Information",
    DELIVERY_METHOD: "02. Delivery Method",
  };

  return (
    <>
      <div className="grid min-h-[100vh] grid-cols-12 gap-[15px] lg:gap-[60px]">
        {/* ── Left panel: cart summary ──────────────────────────────── */}
        <div className="col-span-12 md:col-span-6 lg:col-span-6 md:bg-slate-50 border-l">
          <div className="mx-[15px] xl:ml-[15vw]">
            <div className="pt-24 md:mx-[15px] lg:mx-[60px] h-full flex flex-col gap-5">
              <Button onClick={() => router.push("/")} variant="outline" className="w-full">
                <ArrowLeftIcon />
                Back
              </Button>

              {cart?.map((item) => (
                <div
                  key={
                    "product-cart-" + item.id + "-" + item.variant_id + "-" + (item.selectedImage ?? "default")
                  }
                >
                  <CartItem
                    showAction={false}
                    cartItem={{
                      id: item.id,
                      name: item.name,
                      image: item.image ?? "/images/fallback-image.png",
                      variant_id: item.variant_id,
                      variant_name: item.variant_name,
                      price: item.price,
                      offerPrice: item.offerPrice,
                      qty: getQuantity(item?.id, item?.variant_id, item?.selectedImage),
                      variant_terms: item.variant_terms,
                      selectedImage: item.selectedImage,
                    }}
                  />
                </div>
              ))}
            </div>

            <Card className="md:mx-[15px] lg:mx-[60px] mt-5">
              <CardContent className="my-6 pb-0">
                <div className="flex flex-col gap-2">
                  {savings > 0 && (
                    <>
                      <div className="flex justify-between">
                        <p className="text-sm text-slate-500">Original Total</p>
                        <p className="text-sm text-slate-500 line-through">
                          {currencyFormat(countOriginalTotal() ?? 0)}
                        </p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-sm text-green-600 font-medium">You Save</p>
                        <p className="text-sm text-green-600 font-medium">-{currencyFormat(savings)}</p>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <p className="text-sm">Subtotal</p>
                    <p className="font-bold text-sm">{currencyFormat(countSubTotal() ?? 0)}</p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-sm">Shipping</p>
                    <p className="font-bold text-sm">
                      {selectedDeliveryMethod
                        ? selectedDeliveryMethod.isFreeShipping
                          ? "FREE"
                          : currencyFormat(selectedDeliveryMethod.cost)
                        : step === "DELIVERY_METHOD"
                        ? "Select a method below"
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <hr className="my-2" />
                  </div>
                  <div className="flex justify-between">
                    <p className="font-bold">Total</p>
                    <p className="font-bold">{currencyFormat(countTotal() ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Right panel: step forms ───────────────────────────────── */}
        <div className="col-span-12 md:col-span-6 lg:col-span-6">
          <div className="mx-[15px] mb-20 md:mb-0 md:mr-[15px] lg:mr-[60px] xl:mr-[15vw] pb-10">
            <div className="pt-24 h-full">
              {/* Step breadcrumbs */}
              <div className="flex items-center gap-3 mb-2">
                {(["SHIPPING_INFORMATION", "DELIVERY_METHOD"] as CheckoutStep[]).map((s, idx) => (
                  <span
                    key={s}
                    className={`text-sm flex items-center gap-1 ${
                      step === s ? "font-semibold text-black" : "text-slate-400"
                    }`}
                  >
                    {step !== s && idx < (["SHIPPING_INFORMATION", "DELIVERY_METHOD"] as CheckoutStep[]).indexOf(step) ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : null}
                    {stepLabel[s]}
                    {idx < 1 && <span className="ml-3 text-slate-300">/</span>}
                  </span>
                ))}
              </div>

              <h2 className="text-xl font-bold mb-6">
                {step === "SHIPPING_INFORMATION" ? "Shipping Information" : "Choose Delivery Method"}
              </h2>

              {step === "SHIPPING_INFORMATION" && (
                <FormCheckoutShippingInformation
                  onDeliveryMethodsReady={() => setStep("DELIVERY_METHOD")}
                />
              )}

              {step === "DELIVERY_METHOD" && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("SHIPPING_INFORMATION")}
                    className="text-sm text-slate-500 underline mb-4 inline-flex items-center gap-1"
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    Edit shipping address
                  </button>
                  <FormCheckoutDeliveryMethod onConfirm={handlePlaceOrder} isPlacingOrder={isPlacingOrder} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
