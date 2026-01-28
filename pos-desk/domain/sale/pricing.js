export const TAX_RATE = 0.10;

/**
 * Calculate discount percentage from selling → offer price
 */
export function discountFromOffer(selling, offer) {
    if (!selling || offer >= selling) return 0;
    return ((selling - offer) / selling) * 100;
}

/**
 * Apply discount safely (never below cost)
 */
export function applyDiscount({
    sellingPrice,
    costPrice,
    discountPercent
}) {
    const discountAmount = sellingPrice * (discountPercent / 100);
    const discounted = sellingPrice - discountAmount;
    return Math.max(discounted, costPrice);
}

export function calculateTax(amount) {
    return amount * TAX_RATE;
}
