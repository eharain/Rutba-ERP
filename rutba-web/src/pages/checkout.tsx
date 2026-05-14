import CartItem from "@/components/cart/cart-item";
import FormQuickOrder from "@/components/form/checkout/form-quick-order";
import FormCheckoutShippingInformation from "@/components/form/checkout/form-checkout-shipping-information";
import FormCheckoutDeliveryMethod from "@/components/form/checkout/form-checkout-delivery-method";
import { useCartService } from "@/services/cart";
import { currencyFormat } from "@/lib/use-currency";
import { useStoreCart } from "@/store/store-cart";
import { useStoreCheckout } from "@/store/store-checkout";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Truck, MessageCircle, ChevronDown } from "lucide-react";
import useErrorHandler from "@/hooks/useErrorHandler";
import { createWebCheckoutService } from "@/services/";
import { BASE_URL } from "@/static/const";
import Link from "next/link";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";
import Seo from "@/components/seo/seo";
import { ValidationQuickOrderSchema } from "@/validations/shipping-information-validation";
import { cn } from "@/lib/utils";
import {
  useSavedCustomer,
  hasShippingAddress,
  formatAddressLine,
} from "@/store/store-customer";
import { MapPin, Pencil } from "lucide-react";

const FALLBACK_WHATSAPP = "+923245303530";

export default function CheckoutPage() {
  const router = useRouter();
  const session = useSession();
  const { showError } = useErrorHandler();
  const checkoutService = createWebCheckoutService({ baseURL: BASE_URL });
  const { getCart, clearCart } = useCartService();
  const { cartItem } = useStoreCart();
  const { selectedDeliveryMethod } = useStoreCheckout();
  const settings = useSiteSettings();

  // Full-address path is opt-in; quick path is the default.
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [fullAddressStep, setFullAddressStep] = useState<
    "SHIPPING_INFORMATION" | "DELIVERY_METHOD"
  >("SHIPPING_INFORMATION");

  // Saved customer (localStorage). Pre-fills express form, surfaces a
  // "Shipping to: …" hint when an address from a previous order is on file,
  // and absorbs the contact info from logged-in NextAuth session as initial
  // values when nothing is saved yet.
  const savedCustomer = useSavedCustomer((s) => s.customer);
  const persistCustomer = useSavedCustomer((s) => s.save);
  const sessionUser = session.data?.user;
  const customerDefaults = {
    name: savedCustomer.name || sessionUser?.name || "",
    email: savedCustomer.email || sessionUser?.email || "",
    phone_number: savedCustomer.phone_number || "",
  };
  const knownAddressLine = hasShippingAddress(savedCustomer)
    ? formatAddressLine(savedCustomer)
    : "";

  // Bounce visitors with an empty cart — no point being here.
  useEffect(() => {
    if (cartItem.length === 0) {
      router.replace("/");
    }
  }, [cartItem.length, router]);

  // When the visitor opens the full-address path, seed the shipping store
  // with whatever we already know about them so the form isn't a blank
  // slate after they've been a customer before.
  const setFormShippingInformation = useStoreCheckout((s) => s.setFormShippingInformation);
  useEffect(() => {
    if (!showFullAddress) return;
    const cur = useStoreCheckout.getState().formShippingInformation;
    setFormShippingInformation({
      ...cur,
      name: savedCustomer.name || sessionUser?.name || cur.name,
      email: savedCustomer.email || sessionUser?.email || cur.email,
      phone_number: savedCustomer.phone_number || cur.phone_number,
      address: savedCustomer.address || cur.address,
      country: savedCustomer.country || cur.country,
      state: savedCustomer.state || cur.state,
      city: savedCustomer.city || cur.city,
      zip_code: savedCustomer.zip_code || cur.zip_code,
    });
    // Open this once per "expand" — don't fight the user typing fresh values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullAddress]);

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

  const getQuantity = (
    productId?: number,
    variantId?: number,
    selectedImage?: string | null
  ) => {
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
      const unitPrice =
        item?.offerPrice && item.offerPrice > 0
          ? item.offerPrice
          : item?.price ?? 0;
      return (
        total +
        unitPrice * getQuantity(item.id, item.variant_id, item.selectedImage)
      );
    }, 0);

  const countOriginalTotal = () =>
    cart?.reduce(
      (total, item) =>
        total +
        (item?.price ?? 0) *
          getQuantity(item.id, item.variant_id, item.selectedImage),
      0
    );

  const savings = (countOriginalTotal() ?? 0) - (countSubTotal() ?? 0);
  const deliveryCost = selectedDeliveryMethod?.cost ?? 0;
  const countTotal = () => (countSubTotal() ?? 0) + (showFullAddress ? deliveryCost : 0);

  // ── Place order mutation ─────────────────────────────────────────────────
  const { mutate: placeOrder, isPending: isPlacingOrder } = useMutation({
    mutationFn: checkoutService.checkoutItem,
    onSuccess: (response) => {
      const phoneNumber =
        settings.default_footer?.phone ||
        (settings as { whatsapp_number?: string }).whatsapp_number ||
        FALLBACK_WHATSAPP;
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
            ? ` = Rs. ${item.total} (was Rs. ${
                (item.original_price || item.price) * item.quantity
              })`
            : ` = Rs. ${item.total}`)
      );

      const orderSavings = (response as { savings?: number })?.savings || 0;

      const message =
        `Asalam u Alikum! 🛒\n\n` +
        `*Order ID:* ${orderId}\n` +
        (customerName ? `*Name:* ${customerName}\n` : "") +
        `\n*Items:*\n${itemLines.join("\n")}\n` +
        (orderSavings > 0 ? `\n*Savings: Rs. ${orderSavings}* 🎉\n` : "") +
        `\n*Total: Rs. ${total}*\n\n` +
        `Please confirm my order. JazakAllah!`;

      const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        message
      )}`;

      clearCart();
      // Land on the confirmation page; pop a WhatsApp tab from there so
      // popup blockers don't eat it.
      router.push({
        pathname: "/order/confirmation",
        query: {
          id: orderId,
          wa: encodeURIComponent(whatsappUrl),
        },
      });
    },
    onError: (err) => {
      showError(
        "Hmm, couldn't get that order through just yet — " +
          (err as Error).message +
          ". Tap the button again or message us on WhatsApp and we'll sort it."
      );
    },
  });

  // Build the order payload from cart + contact info, regardless of which
  // path (quick or full) the visitor used.
  const buildPayload = ({
    contact,
    note,
    includeDelivery,
  }: {
    contact: { name: string; email: string; phone_number: string };
    note?: string;
    includeDelivery: boolean;
  }) => {
    const safeCart = cart ?? [];
    const subtotal = safeCart.reduce((acc, item) => {
      const unit = item.offerPrice && item.offerPrice > 0 ? item.offerPrice : Number(item.price);
      return acc + unit * Number(item.qty || 1);
    }, 0);
    const originalSubtotal = safeCart.reduce(
      (acc, item) => acc + Number(item.price) * Number(item.qty || 1),
      0
    );
    const totalSavings = originalSubtotal - subtotal;
    const totalWithDelivery =
      subtotal + (includeDelivery ? selectedDeliveryMethod?.cost ?? 0 : 0);

    const formattedItems = safeCart.map((item) => {
      const itemQty = Number(item.qty || 1);
      const unitPrice =
        item.offerPrice && item.offerPrice > 0
          ? item.offerPrice
          : Number(item.price || 0);
      const originalPrice = Number(item.price || 0);
      return {
        quantity: itemQty,
        price: unitPrice,
        original_price: originalPrice,
        offer_price:
          item.offerPrice && item.offerPrice > 0 ? item.offerPrice : undefined,
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

    return {
      products: { items: formattedItems },
      customer_contact: { ...contact, note },
      payment_status: "Ordered",
      // Prefer the email from the form; fall back to logged-in user if any.
      user_id: contact.email || session?.data?.user?.email,
      order_id: `ORD-${Date.now()}`,
      subtotal,
      total: totalWithDelivery,
      original_subtotal: totalSavings > 0 ? originalSubtotal : undefined,
      savings: totalSavings > 0 ? totalSavings : undefined,
      ...(includeDelivery && selectedDeliveryMethod
        ? {
            delivery_method_id: selectedDeliveryMethod.methodDocumentId,
            delivery_zone_id: selectedDeliveryMethod.zoneDocumentId,
            delivery_cost: selectedDeliveryMethod.cost,
            delivery_cost_breakdown: {
              base_cost: selectedDeliveryMethod.cost,
              is_free_shipping: selectedDeliveryMethod.isFreeShipping,
              service_provider:
                selectedDeliveryMethod.serviceProvider ?? "manual_contact",
            },
          }
        : {}),
    };
  };

  const handleQuickOrder = (values: ValidationQuickOrderSchema) => {
    persistCustomer({
      name: values.name,
      email: values.email,
      phone_number: values.phone_number,
    });
    placeOrder(
      buildPayload({
        contact: {
          name: values.name,
          email: values.email,
          phone_number: values.phone_number,
        },
        note: values.note,
        includeDelivery: false,
      })
    );
  };

  const handleFullAddressOrder = async (opts?: { allowNoDelivery?: boolean }) => {
    const formShippingInformation = useStoreCheckout.getState().formShippingInformation;
    if (!selectedDeliveryMethod && !opts?.allowNoDelivery) {
      showError("Pick a delivery option above so we know how to get it to you.");
      return;
    }
    persistCustomer({
      name: formShippingInformation.name,
      email: formShippingInformation.email,
      phone_number: formShippingInformation.phone_number,
      address: formShippingInformation.address,
      country: formShippingInformation.country,
      state: formShippingInformation.state,
      city: formShippingInformation.city,
      zip_code: formShippingInformation.zip_code,
    });
    placeOrder(
      buildPayload({
        contact: {
          name: formShippingInformation.name,
          email: formShippingInformation.email,
          phone_number: formShippingInformation.phone_number,
        },
        includeDelivery: true,
      })
    );
  };

  return (
    <>
      <Seo title="Checkout" description="Place your order." noindex />

      {/* Slim brand bar */}
      <header className="border-b border-border bg-background">
        <div className="container-fluid flex items-center justify-between py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            {settings.site_logo?.url ? (
              <img
                src={resolveMediaUrl(settings.site_logo.url)}
                alt={settings.site_name}
                className="h-7 w-auto"
              />
            ) : (
              <span className="font-display text-lg font-bold tracking-tight">
                {settings.site_name}
              </span>
            )}
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure checkout
          </span>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-65px)] grid-cols-1 lg:grid-cols-12">
        {/* Form column (lower order on mobile) */}
        <div className="lg:col-span-7 lg:col-start-1 lg:row-start-1 order-2 lg:order-1">
          <div className="container-fluid max-w-2xl py-10 md:py-14">
            <Button
              onClick={() => router.push("/")}
              variant="ghost"
              size="sm"
              className="mb-6 -ml-3 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to shopping
            </Button>

            <p className="eyebrow mb-2">
              {savedCustomer.name ? "Welcome back" : "Express checkout"}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              {savedCustomer.name
                ? `Confirm and we'll ship it, ${savedCustomer.name.split(" ")[0]}`
                : "Just your name, phone & email"}
            </h1>
            <p className="mt-3 text-muted-foreground text-sm md:text-base max-w-md">
              We'll confirm your order on WhatsApp — share delivery details and
              payment when it suits you.
            </p>

            {/* Saved-shipping hint — shown when we already have an address
                from a previous order. Visitor can either keep it (default)
                or click "Change" to expand the full-address form prefilled
                with those values. */}
            {knownAddressLine && !showFullAddress && (
              <div className="mt-6 rounded-2xl border border-border bg-secondary/40 p-4 flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand shrink-0">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-0.5">
                    Shipping to
                  </p>
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {knownAddressLine}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullAddress(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-foreground transition-colors shrink-0"
                >
                  <Pencil className="h-3 w-3" />
                  Change
                </button>
              </div>
            )}

            <div className="mt-8">
              <FormQuickOrder
                defaultValues={customerDefaults}
                onSubmit={handleQuickOrder}
                isPlacingOrder={isPlacingOrder}
                totalLabel={currencyFormat(countSubTotal() ?? 0)}
              />
            </div>

            {/* Full-address opt-in */}
            <div className="mt-10 pt-8 border-t border-border">
              <button
                type="button"
                onClick={() => setShowFullAddress((v) => !v)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div>
                  <p className="font-semibold text-foreground group-hover:text-brand transition-colors">
                    Prefer to enter a full delivery address now?
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Optional — lets us calculate shipping upfront.
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform shrink-0 ml-3",
                    showFullAddress && "rotate-180"
                  )}
                />
              </button>

              {showFullAddress && (
                <div className="mt-6 space-y-6">
                  {fullAddressStep === "SHIPPING_INFORMATION" && (
                    <FormCheckoutShippingInformation
                      onDeliveryMethodsReady={() => setFullAddressStep("DELIVERY_METHOD")}
                    />
                  )}

                  {fullAddressStep === "DELIVERY_METHOD" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setFullAddressStep("SHIPPING_INFORMATION")}
                        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Edit shipping address
                      </button>
                      <FormCheckoutDeliveryMethod
                        onConfirm={() => handleFullAddressOrder()}
                        onNoDeliveryConfirm={() =>
                          handleFullAddressOrder({ allowNoDelivery: true })
                        }
                        isPlacingOrder={isPlacingOrder}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order summary */}
        <aside className="lg:col-span-5 lg:col-start-8 lg:row-start-1 order-1 lg:order-2 bg-secondary/40 lg:border-l border-border">
          <div className="container-fluid max-w-xl py-10 md:py-14 lg:sticky lg:top-0">
            <p className="eyebrow mb-2">Your order</p>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-6">
              Summary
            </h2>

            <ul className="divide-y divide-border bg-background rounded-2xl border border-border overflow-hidden">
              {cart?.map((item) => (
                <li
                  key={
                    "product-cart-" +
                    item.id +
                    "-" +
                    item.variant_id +
                    "-" +
                    (item.selectedImage ?? "default")
                  }
                  className="p-4"
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
                      qty: getQuantity(
                        item?.id,
                        item?.variant_id,
                        item?.selectedImage
                      ),
                      variant_terms: item.variant_terms,
                      selectedImage: item.selectedImage,
                    }}
                  />
                </li>
              ))}
            </ul>

            <div className="mt-5 space-y-2.5">
              {savings > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal before offers</span>
                    <span className="line-through">
                      {currencyFormat(countOriginalTotal() ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-brand">
                    <span>You save</span>
                    <span>− {currencyFormat(savings)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">
                  {currencyFormat(countSubTotal() ?? 0)}
                </span>
              </div>
              {showFullAddress && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    Shipping
                  </span>
                  <span className="font-semibold">
                    {selectedDeliveryMethod
                      ? selectedDeliveryMethod.isFreeShipping
                        ? <span className="text-brand">FREE</span>
                        : currencyFormat(selectedDeliveryMethod.cost)
                      : <span className="text-muted-foreground italic">Pick below</span>}
                  </span>
                </div>
              )}

              <div className="h-px bg-border my-3" />

              <div className="flex justify-between items-baseline">
                <span className="text-sm uppercase tracking-wide font-bold text-muted-foreground">
                  {showFullAddress ? "Total" : "Items total"}
                </span>
                <span className="font-display text-2xl font-bold">
                  {currencyFormat(countTotal() ?? 0)}
                </span>
              </div>
              {!showFullAddress && (
                <p className="text-[11px] text-muted-foreground">
                  Shipping calculated on WhatsApp based on your delivery location.
                </p>
              )}
            </div>

            <div className="mt-6 rounded-xl bg-background border border-border p-4 flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-foreground shrink-0">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div className="text-sm">
                <p className="font-semibold mb-0.5">How this works</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Submit your contact info — we'll open WhatsApp to confirm
                  your order, share delivery options, and arrange payment.
                  No account needed.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
