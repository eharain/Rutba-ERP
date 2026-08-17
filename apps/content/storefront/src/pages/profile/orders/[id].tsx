import DetailTransactionCard from "@/components/transaction/detail-transaction-card";
import ProfileLayout from "@/components/layouts/profile-layout";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { createWebOrdersService } from "@/services";
import { useQuery } from "@tanstack/react-query";
import { ErrorCard } from "@/components/errors/error-card";
import { BASE_URL } from "@/static/const";
import Link from "next/link";
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

  // Error check first — the loading gate below also catches `!dataTransaction`,
  // which would otherwise show an endless "Loading..." on a failed fetch.
  if (isError && !dataTransaction)
    return <ErrorCard message={(error as Error).message}></ErrorCard>;
  if (isLoading || !dataTransaction)
    return (
      <ProfileLayout>
        <></>
        <p>Loading...</p>
      </ProfileLayout>
    );

  // Show the Request-return CTA once the order is delivered. We don't
  // re-check the policy window here — the request-return page does that
  // and renders a clear message if the window has expired. Keeping this
  // gate to a single field (order_status) means a stale browser tab
  // doesn't silently hide the entry point if delivery just landed.
  const canRequestReturn = dataTransaction?.order_status === "DELIVERED";

  return (
    <ProfileLayout>
      <></>
      {canRequestReturn && (
        <div className="mb-3 flex items-center justify-between rounded border bg-gray-50 p-3 text-sm">
          <span>Something wrong with this order?</span>
          <Link
            href={`/profile/orders/${router.query.id}/request-return`}
            className="rounded border px-3 py-1.5 text-sm hover:bg-white"
          >
            Request a return
          </Link>
        </div>
      )}
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

