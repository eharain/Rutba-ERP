export const TAX_RATE = 0.10;

/**
 * Calculate discount percentage from selling → offer price
 */
export function discountRateFromPrice(actual, discounted) {
    //let xsell = selling
    //selling = Math.max(selling, offer);
    //offer = Math.min(offer, xsell);
    /**
    const dicounted = actual- actual * (discount / 100);
    discount=    (actual-dicounted/actual)*100 ;

    
    */
    //if (!actual || dicounted >= actual) return 0;

    discounted = ValidNumberOrDefault(discounted, ValidNumberOrDefault(actual, 0));
    actual = ValidNumberOrDefault(actual, ValidNumberOrDefault(discounted, 0));

    if (!actual || actual==0 || + actual == 0) {
        return 0;
    }
    return ((actual - discounted) / actual) * 100;
}

export function ValidNumberOrDefault(value, defaultValue = 0) {
    const num = parseFloat(value);
    if (Number.isFinite(num)) {
        return num;
    }
    return defaultValue;
    
}
/**
 * Apply discount safely (never below cost)
 */
export function applyDiscount(
    sellingPrice,
    costPrice,
    discountPercent
) {
    const discountAmount = sellingPrice * (discountPercent / 100);
    const discounted = sellingPrice - discountAmount;
    return Math.max(discounted, costPrice);
}

export function calculateTax(amount) {
    return amount * TAX_RATE;
}
