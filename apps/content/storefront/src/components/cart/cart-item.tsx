import { useCartService } from "@/services/cart";
import NextImage from "../next-image";
import { IMAGE_URL } from "@/static/const";
import { currencyFormat } from "@/lib/use-currency";
import { CartTermInfo } from "@/types/api/cart";
import { Minus, Plus, Trash2 } from "lucide-react";

interface CartItem {
  id?: number;
  name?: string;
  image?: string;
  variant_id?: number;
  variant_name?: string;
  price?: number;
  offerPrice?: number;
  qty?: number | null;
  variant_terms?: CartTermInfo[];
  selectedImage?: string | null;
}

export default function CartItem({
  showAction = true,
  cartItem,
}: {
  showAction?: boolean;
  cartItem: CartItem;
}) {
  const { updateQuantity, removeItemFromCart } = useCartService();

  const hasOffer = cartItem.offerPrice && cartItem.offerPrice > 0;
  const qty = cartItem.qty ?? 0;

  return (
    <div className="flex gap-4">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary">
        <NextImage
          src={IMAGE_URL + cartItem.image}
          alt={cartItem.name || "product"}
          width={200}
          height={200}
          className="h-full w-full object-cover object-center"
        />
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2">
            {cartItem.name}
          </h3>
          <div className="text-right shrink-0">
            {hasOffer ? (
              <>
                <p className="text-sm font-bold text-brand">
                  {currencyFormat(cartItem.offerPrice!)}
                </p>
                <p className="text-[11px] text-muted-foreground line-through">
                  {currencyFormat(cartItem.price ?? 0)}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold">
                {currencyFormat(cartItem.price ?? 0)}
              </p>
            )}
          </div>
        </div>

        {/* Variant info */}
        {cartItem.variant_terms && cartItem.variant_terms.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cartItem.variant_terms.map((t, i) => (
              <span
                key={i}
                className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5"
              >
                {t.typeName}: {t.termName}
              </span>
            ))}
          </div>
        ) : cartItem.variant_name ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {cartItem.variant_name}
          </p>
        ) : null}

        <div className="mt-auto pt-3 flex items-center justify-between">
          {showAction ? (
            <>
              {/* Quantity stepper */}
              <div className="inline-flex items-center rounded-full border border-border bg-background">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() =>
                    updateQuantity(
                      cartItem?.id,
                      cartItem?.variant_id,
                      qty - 1,
                      cartItem?.selectedImage
                    )
                  }
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-bold min-w-[1.5rem] text-center select-none">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() =>
                    updateQuantity(
                      cartItem?.id,
                      cartItem?.variant_id,
                      qty + 1,
                      cartItem?.selectedImage
                    )
                  }
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                aria-label="Remove item"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand transition-colors"
                onClick={() =>
                  removeItemFromCart(
                    cartItem?.id,
                    cartItem?.variant_id,
                    cartItem?.selectedImage
                  )
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Qty: {qty}</span>
          )}
        </div>
      </div>
    </div>
  );
}
