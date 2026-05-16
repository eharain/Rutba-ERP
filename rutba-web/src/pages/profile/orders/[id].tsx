import DetailTransactionCard from "@/components/transaction/detail-transaction-card";
import ProfileLayout from "@/components/layouts/profile-layout";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { createWebOrdersService } from "@/services";
import { useQuery } from "@tanstack/react-query";
import { ErrorCard } from "@/components/errors/error-card";
import { BASE_URL } from "@/static/const";
export default function Transaction() {
  const ordersService = createWebOrdersService({ baseURL: BASE_URL });
  const router = useRouter();
  const session = useSession();

  const {
    data: dataTransaction,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-transaction", router.query.id],
    queryFn: async () => {
      return await ordersService.getMyTransactionById(router.query.id as string, session.data?.jwt);
    },
    enabled: !!session.data && !!router.query.id,
  });

  if (isLoading || !dataTransaction)
    return (
      <ProfileLayout>
        <></>
        <p>Loading...</p>
      </ProfileLayout>
    );
  if (isError)
    return <ErrorCard message={(error as Error).message}></ErrorCard>;

  return (
    <ProfileLayout>
      <></>
      <DetailTransactionCard
        refreshGetDataTransaction={() => refetch()}
        dataTransaction={{
          order_id: dataTransaction?.order_id ?? "",
          date: dataTransaction?.createdAt ?? "",
          items: dataTransaction?.products.items.map((item) => {
            return {
              name: item.product_name ?? "",
              qty: item.quantity ?? 0,
              image: item.image?.url ?? undefined,
              variant_name: item.variant_name ?? item.variant ?? "",
              variant_terms: item.variant_terms,
              price: item.price ?? 0,
            };
          }) as [],
          customer: (() => {
            const snap = dataTransaction?.delivery_snapshot ?? {};
            const person = dataTransaction?.customer_person ?? {};
            return {
              name: snap.name ?? person.name ?? "",
              phone_number: snap.phone ?? person.phone ?? "",
              email: snap.email ?? person.email ?? "",
              address: [snap.line1, snap.line2].filter(Boolean).join(", ") || "",
              state: snap.state ?? "",
              city: snap.city ?? "",
              country: snap.country ?? "",
              zip_code: snap.zip_code ?? "",
            };
          })(),
          shipping: {
            url: dataTransaction?.tracking_url ?? null,
            name: dataTransaction?.shipping_name ?? "",
            code: dataTransaction?.tracking_code ?? null,
          },
          payment: {
            subtotal: dataTransaction?.subtotal ?? "0",
            shipping_price: dataTransaction?.shipping_price ?? "0",
            total: dataTransaction?.total ?? "0",
            payment_status: dataTransaction?.payment_status ?? "0",
            url: dataTransaction?.stripe_url,
          },
        }}
      ></DetailTransactionCard>
    </ProfileLayout>
  );
}

