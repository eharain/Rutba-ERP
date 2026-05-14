import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import CartItem from "./cart-item";
import Link from "next/link";

import { useStoreCart } from "@/store/store-cart";
import { useEffect, useState } from "react";
import { currencyFormat } from "@/lib/use-currency";
import { useQuery } from "@tanstack/react-query";
import { useCartService } from "@/services/cart";
import { ArrowRight, ShoppingBasket } from "lucide-react";

export interface propsInterface {
  trigger: React.JSX.Element;
}

export default function Cart(props: propsInterface) {
  const { getCart } = useCartService();
  const { setCartItem, isCartOpen, setIsCartOpen, cartItem } = useStoreCart();

  // Why we need to mapping this cartItem?
  // The reason is because we only want it fetching the product
  // data when there are new variant and product in the cart
  // We exclude the quantity, because when we are change the quantity in cart
  // It will refetch the api which is useless
  const { data: cart } = useQuery({
    queryKey: [
      "cart-item",
      cartItem.map((item) => {
        return {
          variant: item.variantId,
          productId: item.productId,
          selectedImage: item.selectedImage,
        };
      }),
    ],
    queryFn: async () => {
      return await getCart();
    },
  });

  const [isMounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem("cart")) {
      const cartData = JSON.parse(localStorage.getItem("cart") as string);
      setCartItem(cartData);
    }
  }, []);

  // To get the quantity of the product use this.
  const getQuantity = (
    productId?: number,
    variantId?: number | null,
    selectedImage?: string | null
  ) => {
    const data = cartItem.find(
      (item) =>
        item.productId === productId &&
        (item.variantId ?? null) === (variantId ?? null) &&
        (item.selectedImage ?? null) === (selectedImage ?? null)
    );
    return data?.qty ?? 0;
  };

  // To get the quantity of the product use this.
  const countSubTotal = () => {
    return cart?.reduce((total, item) => {
      const unitPrice =
        item?.offerPrice && item.offerPrice > 0
          ? item.offerPrice
          : item?.price ?? 0;
      return (
        total +
        unitPrice *
          getQuantity(item.id, item.variant_id, item.selectedImage)
      );
    }, 0);
  };

  const countOriginalTotal = () => {
    return cart?.reduce(
      (total, item) =>
        total +
        (item?.price ?? 0) *
          getQuantity(item.id, item.variant_id, item.selectedImage),
      0
    );
  };

  const savings = (countOriginalTotal() ?? 0) - (countSubTotal() ?? 0);
  const itemCount = cart?.length ?? 0;
  const isEmpty = !cart || cart.length === 0;

  if (!isMounted) {
    return null;
  }

  return (
    <Sheet open={isCartOpen} onOpenChange={(value) => setIsCartOpen(value)}>
      <SheetTrigger asChild>{props.trigger}</SheetTrigger>

      <SheetContent className="flex h-full flex-col p-0 sm:max-w-md w-full bg-background">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Your bag</p>
            {itemCount > 0 && (
              <span className="text-xs font-semibold text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          <SheetTitle className="font-display text-2xl tracking-tight">
            {isEmpty ? "Your cart is empty" : "Cart"}
          </SheetTitle>
        </SheetHeader>

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <ShoppingBasket className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Add a few favourites to get started. Saved offers and recently
              viewed products are still waiting for you.
            </p>
            <SheetClose asChild>
              <Button asChild size="lg" className="rounded-full px-6 group">
                <Link href="/product">
                  Browse products
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </SheetClose>
          </div>
        ) : (
          <>
            {/* Items list */}
            <ul
              role="list"
              className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-border"
            >
              {cart?.map((item) => (
                <li
                  className="py-5 first:pt-2 last:pb-2"
                  key={
                    "product-cart-" +
                    item.id +
                    "-" +
                    item.variant_id +
                    "-" +
                    (item.selectedImage ?? "default")
                  }
                >
                  <CartItem
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

            {/* Totals + CTA */}
            <div className="border-t border-border bg-secondary/30 px-6 py-5 space-y-3">
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
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-sm uppercase tracking-wide font-bold text-muted-foreground">
                  Subtotal
                </span>
                <span className="font-display text-2xl font-bold">
                  {currencyFormat(countSubTotal() ?? (0 as number))}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Shipping &amp; taxes calculated at checkout.
              </p>

              <Button
                size="lg"
                asChild
                className="w-full h-12 rounded-full text-base font-bold tracking-wide group mt-1"
              >
                <Link href="/checkout">
                  Checkout
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>

              <div className="flex justify-center pt-1">
                <SheetClose asChild>
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    or continue shopping →
                  </button>
                </SheetClose>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
