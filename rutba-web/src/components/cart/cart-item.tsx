import { useCartService } from "@/services/cart";
import NextImage from "../next-image";
import { IMAGE_URL } from "@/static/const";
import { currencyFormat } from "@/lib/use-currency";
import { CartTermInfo } from "@/types/api/cart";

interface CartItem {
  id?: number;
  name?: string;
  image?: string;
  variant_id?: number;
  variant_name?: string;
  price?: number;
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

  return (
    <div className="flex">
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
        <NextImage
          src={IMAGE_URL + cartItem.image}
          alt="product"
          width={200}
          height={200}
          className="h-full w-full object-cover object-center"
        ></NextImage>
      </div>

      <div className="ml-4 flex flex-1 flex-col">
        <div>
          <div className="flex justify-between text-base font-medium text-gray-900">
            <h3>
              <a href="#">{cartItem.name}</a>
            </h3>
            <p className="ml-4 text-sm">
              {currencyFormat(cartItem.price ?? 0)}
            </p>
          </div>
          {cartItem.variant_terms && cartItem.variant_terms.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {cartItem.variant_terms.map((t, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                  {t.typeName}: {t.termName}
                </span>
              ))}
            </div>
          ) : cartItem.variant_name ? (
            <p className="mt-1 text-sm text-gray-500">{cartItem.variant_name}</p>
          ) : null}
        </div>
        <div className="flex flex-1 items-end justify-between text-sm">
          {showAction && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  updateQuantity(
                    cartItem?.id,
                    cartItem?.variant_id,
                    (cartItem?.qty ?? 1) - 1,
                    cartItem?.selectedImage
                  )
                }
                className="border hover:bg-black hover:text-white h-6 w-6 flex items-center justify-center rounded-sm"
              >
                -
              </button>
              <p className="text-gray-500">{cartItem.qty}</p>
              <button
                onClick={() =>
                  updateQuantity(
                    cartItem?.id,
                    cartItem?.variant_id,
                    (cartItem?.qty ?? 1) + 1,
                    cartItem?.selectedImage
                  )
                }
                className="border hover:bg-black hover:text-white h-6 w-6 flex items-center justify-center rounded-sm"
              >
                +
              </button>
            </div>
          )}

          {!showAction && (
            <div className="flex items-center gap-2">Qty: {cartItem.qty}</div>
          )}

          {showAction && (
            <div className="flex">
              <button
                type="button"
                className="font-medium text-slate-500"
                onClick={() =>
                  removeItemFromCart(cartItem?.id, cartItem?.variant_id, cartItem?.selectedImage)
                }
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
