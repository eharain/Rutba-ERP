// Pinning min/max fraction digits is load-bearing for SSR hydration: Node's
// bundled ICU often strips trailing zeros for PKR (rendering "Rs 0") while
// browsers keep them ("Rs 0.00"), causing a React hydration mismatch on every
// price render. Explicit digit counts force both runtimes to produce the same
// string. Don't remove without checking SSR output against the browser.
const formatter = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const currencyFormat = (value: number) => formatter.format(value);
