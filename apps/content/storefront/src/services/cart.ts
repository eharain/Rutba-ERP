import useErrorHandler from "@/hooks/useErrorHandler";
import { useStoreCart } from "@/store/store-cart";
import { CartInterface, CartTermInfo } from "@/types/api/cart";
import { createWebProductsService } from "@/services/";
import { BASE_URL } from "@/static/const";

export interface cartLocalStorage {
  productId: number | null;
  variantId: number | null;
  qty: number | null;
  variantTerms?: CartTermInfo[];
  selectedImage?: string | null;
  offerPrice?: number;
  offerId?: string;
  sourceGroupId?: string;
  offerFreeShipping?: boolean;
}

export const useCartService = () => {
  const { showError } = useErrorHandler();
  const { setCartItem } = useStoreCart();
  const productsService = createWebProductsService({ baseURL: BASE_URL });

  /**
   * Adds a product to the cart.
   *
   * @param {number | null} productId - The ID of the product to add.
   * @param {number | null} variantId - The ID of the variant of the product to add.
   * @param {number} qty - The quantity of the product to add.
   */
  const addToCart = (
    productId: number | null,
    variantId: number | null,
    qty: number,
    variantTerms?: CartTermInfo[],
    selectedImage?: string | null,
    offerPrice?: number,
    offerId?: string,
    sourceGroupId?: string,
    offerFreeShipping?: boolean
  ) => {
    const cart = localStorage.getItem("cart");

    if (!productId && !variantId) {
      showError("Pick the options first — colour, size, the lot — then we'll pop it in your bag.");
      return;
    }

    if (cart) {
      const cartData = JSON.parse(cart);
      const index = cartData.findIndex(
        (item: cartLocalStorage) =>
          item.productId === productId &&
          item.variantId === variantId &&
          (item.selectedImage ?? null) === (selectedImage ?? null)
      );
      if (index > -1) {
        cartData[index].qty += qty;
      } else {
        cartData.push({
          productId: productId,
          variantId: variantId,
          qty: qty,
          variantTerms: variantTerms,
          selectedImage: selectedImage,
          offerPrice: offerPrice,
          offerId: offerId,
          sourceGroupId: sourceGroupId,
          offerFreeShipping: offerFreeShipping,
        });
      }

      localStorage.setItem("cart", JSON.stringify(cartData));
      setCartItem(cartData);
    } else {
      const data = [
        {
          productId: productId,
          variantId: variantId,
          qty: qty,
          variantTerms: variantTerms,
          selectedImage: selectedImage,
          offerPrice: offerPrice,
          offerId: offerId,
          sourceGroupId: sourceGroupId,
          offerFreeShipping: offerFreeShipping,
        },
      ];

      localStorage.setItem("cart", JSON.stringify(data));

      setCartItem(data);
    }
  };

  const updateQuantity = (
    productId?: number | null,
    variantId?: number | null,
    qty?: number,
    selectedImage?: string | null
  ) => {
    const cart = localStorage.getItem("cart");

    if (!qty) return;
    if (!cart) return;
    if (qty < 1) return;

    const cartData = JSON.parse(cart);
    const index = cartData.findIndex(
      (item: cartLocalStorage) =>
        item.productId === productId &&
        (item.variantId ?? null) === (variantId ?? null) &&
        (item.selectedImage ?? null) === (selectedImage ?? null)
    );

    if (index > -1) {
      cartData[index].qty = qty;

      localStorage.setItem("cart", JSON.stringify(cartData));
      setCartItem(cartData);
    }
  };

  /**
   * Retrieves the cart data from local storage.
   *
   * @return {cartLocalStorage[]} The cart data retrieved from local storage, or an empty array if no data is found.
   */
  const getCartFromLocalStorage = () => {
    const cart = localStorage.getItem("cart");
    const cartData: cartLocalStorage[] = JSON.parse(cart as string);

    return cartData ?? [];
  };

  /**
   * Retrieves the cart data from local storage and fetches the corresponding product data from the API.
   * Filters the cart data based on the availability of product variants in the API.
   * Updates the cart in local storage and sets the filtered cart data in the component state.
   * Returns an array of cart items with the required product and variant information.
   *
   * @return {CartInterface[]} An array of cart items with the required product and variant information.
   */
  const getCart = async () => {
    const cartData = getCartFromLocalStorage();
    
    if (cartData.length > 0) {
      const ids = cartData.map((item) => item.productId) as number[];
      const data = await productsService.productInArrayId(ids);
      // Filter data, if the item in cart and the variant not available on the api.
      const filteredCartData = cartData.filter((item) => {
        const product = data.find((product) => item.productId === product.id);
        return (
          product
        );
      });

      // Set new cart value with the valid data from api
      localStorage.setItem("cart", JSON.stringify(filteredCartData));
      setCartItem(filteredCartData);

      return filteredCartData.map((item) => {
        const productData = data.find(
          (product) => item.productId === product.id
        );
        const productVariant = productData?.variants.find(
          (variant) => variant.id === item.variantId
        );

        const variantImage =
          productVariant?.logo?.url ??
          productVariant?.gallery?.[0]?.url;
        const parentImage =
          productData?.logo?.url ??
          productData?.gallery?.[0]?.url;

        // Prefer the image the user explicitly selected in the gallery
        const displayImage = item.selectedImage ?? variantImage ?? parentImage;

        // Resolve the media id for the displayed image
        const allImages = [
          productVariant?.logo,
          ...(productVariant?.gallery ?? []),
          productData?.logo,
          ...(productData?.gallery ?? []),
        ].filter(Boolean);
        const matchedImage = allImages.find((img) => img?.url === displayImage);
        const imageId = matchedImage?.id ?? null;

        // Extract variant terms from populated data
        const apiTerms: CartTermInfo[] = (productVariant?.terms || [])
          .flatMap((t) =>
            (t.term_types || [])
              .filter((tt) => tt.is_variant || tt.is_public)
              .map((tt) => ({ typeName: tt.name, termName: t.name }))
          );

        // Resolve the unit price with a real "positive-or-fall-back" rule
        // instead of nullish coalescing. Three reasons:
        //   1. Variants commonly inherit pricing from the parent and are
        //      stored with selling_price = 0 — `0 ?? parent` evaluates to 0
        //      and would silently zero out the cart total.
        //   2. Strapi/MySQL returns `decimal` columns as strings, so the raw
        //      values are "1000.00" not 1000 — Number() normalizes both.
        //   3. NaN guard for the rare case both sides are non-numeric.
        const variantPrice = Number(productVariant?.selling_price) || 0;
        const productPrice = Number(productData?.selling_price) || 0;
        const unitPrice = variantPrice > 0 ? variantPrice : productPrice;

        return {
          id: productData?.id,
          image: displayImage,
          imageId,
          name: productData?.name,
          // Normalize to `null` (not undefined) so the checkout's strict-equality
          // lookup in getQuantity matches the cart store record, which is set
          // to `null` when the product has no variant. `null === undefined` is
          // false — leaving this as undefined silently zeros the line qty.
          variant_id: productVariant?.id ?? null,
          variant_name: productVariant?.name,
          price: unitPrice,
          offerPrice: item.offerPrice,
          offerId: item.offerId,
          sourceGroupId: item.sourceGroupId,
          offerFreeShipping: item.offerFreeShipping,
          documentId: productData?.documentId,
          qty: item.qty,
          variant_terms: apiTerms.length > 0 ? apiTerms : (item.variantTerms || []),
          selectedImage: item.selectedImage ?? null,
        };
      }) as CartInterface[];
    }

    return [] as CartInterface[];
  };

  /**
   * Removes an item from the cart based on the provided productId and variantId.
   *
   * @param {number | null} productId - The ID of the product to be removed from the cart.
   * @param {number | null} variantId - The ID of the variant of the product to be removed from the cart.
   */
  const removeItemFromCart = (
    productId?: number | null,
    variantId?: number | null,
    selectedImage?: string | null
  ) => {
    const cart = localStorage.getItem("cart");

    if (!cart) return;

    const cartData = JSON.parse(cart);

    const updatedCart = cartData.filter((item: cartLocalStorage) => {
      return !(
        item.productId === productId &&
        (item.variantId ?? null) === (variantId ?? null) &&
        (item.selectedImage ?? null) === (selectedImage ?? null)
      );
    });

    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItem(updatedCart);
  };

  /**
   * Clears the cart by removing the "cart" key from localStorage and setting the cart items to an empty array.
   *
   * @param {none}
   * @return {void}
   */
  const clearCart = () => {
    localStorage.removeItem("cart");
    setCartItem([]);
  };

  return {
    addToCart,
    getCartFromLocalStorage,
    getCart,
    updateQuantity,
    removeItemFromCart,
    clearCart,
  };
};
