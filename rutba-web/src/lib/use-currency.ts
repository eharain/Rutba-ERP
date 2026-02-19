export const currencyFormat = (value: number) => {
  const currencyFormat = new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
  });

  return currencyFormat.format(value);
};
