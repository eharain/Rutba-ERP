import ProfileLayout from "@/components/layouts/profile-layout";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createWebOrdersService, createWebReturnsService } from "@/services";
import type { CreateReturnInput, ReturnLineInput } from "@/services";
import { BASE_URL } from "@/static/const";

// Hard-coded reason set mirrors the Strapi enum on return-request.reason.
// Keep in sync with pos-strapi/src/api/return-request/content-types/return-request/schema.json.
const RETURN_REASONS = [
  { value: "defective",          label: "Item is defective" },
  { value: "damaged_in_transit", label: "Damaged in transit" },
  { value: "wrong_item",         label: "Received the wrong item" },
  { value: "wrong_size",         label: "Wrong size / fit" },
  { value: "changed_mind",       label: "Changed my mind" },
  { value: "late_delivery",      label: "Arrived too late" },
  { value: "other",              label: "Other (please describe)" },
] as const;

type OrderLine = {
  product_name?: string;
  variant_name?: string;
  variant?: string;
  quantity?: number;
  price?: number;
  image?: { url?: string };
};

export default function RequestReturnPage() {
  const router = useRouter();
  const session = useSession();
  const id = router.query.id as string | undefined;

  const ordersService = useMemo(() => createWebOrdersService({ baseURL: BASE_URL }), []);
  const returnsService = useMemo(() => createWebReturnsService(), []);

  // Pull the order to render line picker; also pull the policy so we can
  // show the deadline + block submission past the window.
  const orderQuery = useQuery({
    queryKey: ["my-transaction", id],
    queryFn:  () => ordersService.getMyTransactionById(id as string, session.data?.jwt),
    enabled:  !!session.data?.jwt && !!id,
  });
  const policyQuery = useQuery({
    queryKey: ["return-policy"],
    queryFn:  () => returnsService.getPolicy(),
  });

  // Per-line selection state: { [order_line_index]: { selected, quantity } }
  const [picks, setPicks] = useState<Record<number, { selected: boolean; quantity: number }>>({});
  const [reason, setReason] = useState<string>("changed_mind");
  const [reasonNotes, setReasonNotes] = useState<string>("");
  const [submitted, setSubmitted] = useState<boolean>(false);

  const order = orderQuery.data;
  const lines: OrderLine[] = order?.products?.items ?? [];

  // Seed quantity inputs to the max on each line once the order arrives.
  useEffect(() => {
    if (!lines.length) return;
    setPicks((prev) => {
      const next = { ...prev };
      lines.forEach((line, idx) => {
        if (!next[idx]) next[idx] = { selected: false, quantity: line.quantity ?? 1 };
      });
      return next;
    });
  }, [lines.length]);

  // Window eligibility — DELIVERED + within policy window. Storefront also
  // shows the deadline so buyers know how long they have.
  const windowInfo = useMemo(() => {
    const days = Number(policyQuery.data?.window_days ?? 7);
    if (!order) return { eligible: false, days, reason: "loading" };
    if (order.order_status !== "DELIVERED") {
      return { eligible: false, days, reason: "Order has not been delivered yet." };
    }
    const delivered = order.actual_delivery_time
      ? new Date(order.actual_delivery_time)
      : new Date(order.createdAt);
    const deadline = new Date(delivered.getTime() + days * 86400 * 1000);
    const eligible = Date.now() <= deadline.getTime();
    return {
      eligible,
      days,
      deadline,
      reason: eligible ? null : `The return window closed on ${deadline.toLocaleDateString()}.`,
    };
  }, [order, policyQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing order id");
      const items: ReturnLineInput[] = Object.entries(picks)
        .filter(([, v]) => v.selected && v.quantity > 0)
        .map(([idx, v]) => ({
          order_line_index: Number(idx),
          quantity:         v.quantity,
          reason,
        }));
      if (items.length === 0) throw new Error("Select at least one item to return.");
      const input: CreateReturnInput = {
        sale_order_document_id: id,
        reason,
        reason_notes:           reasonNotes,
        resolution:             "refund",
        items,
      };
      return returnsService.create(input, session.data?.jwt as string);
    },
    onSuccess: () => setSubmitted(true),
  });

  if (orderQuery.isLoading || !order) {
    return (
      <ProfileLayout>
        <></>
        <p>Loading order…</p>
      </ProfileLayout>
    );
  }

  if (submitted) {
    return (
      <ProfileLayout>
        <></>
        <div className="rounded border bg-green-50 p-6">
          <h2 className="text-lg font-semibold mb-2">Return requested</h2>
          <p className="text-sm text-gray-700">
            We&apos;ve received your request. Our team will review it and reach
            out within 1-2 business days about next steps (pickup or drop-off).
          </p>
          <div className="mt-4">
            <Link href={`/profile/orders/${id}`} className="text-blue-600 underline">
              Back to order
            </Link>
          </div>
        </div>
      </ProfileLayout>
    );
  }

  return (
    <ProfileLayout>
      <></>
      <div className="space-y-4">
        <div>
          <Link href={`/profile/orders/${id}`} className="text-sm text-gray-500 hover:underline">
            ← Back to order
          </Link>
          <h1 className="text-xl font-semibold mt-1">Request a return</h1>
          <div className="text-sm text-gray-600">
            Order <code>{order.order_id}</code>
          </div>
        </div>

        {/* Policy + window banner */}
        {!windowInfo.eligible ? (
          <div className="rounded border bg-red-50 p-4 text-sm text-red-700">
            {windowInfo.reason || "This order isn't eligible for return."}
          </div>
        ) : (
          <div className="rounded border bg-blue-50 p-4 text-sm text-blue-800">
            Return window: {windowInfo.days} days from delivery.
            {windowInfo.deadline && (
              <> Last day to request a return: <strong>{windowInfo.deadline.toLocaleDateString()}</strong>.</>
            )}
          </div>
        )}
        {policyQuery.data?.policy_text && (
          <details className="rounded border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Return policy</summary>
            <div className="mt-2 text-gray-700 whitespace-pre-wrap">{policyQuery.data.policy_text}</div>
          </details>
        )}

        {/* Line picker */}
        <div className="rounded border">
          <div className="px-4 py-2 border-b font-medium">Pick items to return</div>
          <ul>
            {lines.map((line, idx) => {
              const pick = picks[idx] || { selected: false, quantity: line.quantity ?? 1 };
              const max  = line.quantity ?? 1;
              return (
                <li key={idx} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                  <input
                    type="checkbox"
                    checked={pick.selected}
                    onChange={(e) => setPicks((p) => ({ ...p, [idx]: { ...pick, selected: e.target.checked } }))}
                    disabled={!windowInfo.eligible}
                  />
                  {line.image?.url && (
                    <img src={line.image.url} alt={line.product_name} className="h-14 w-14 rounded object-cover" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{line.product_name || "Item"}</div>
                    {(line.variant_name || line.variant) && (
                      <div className="text-xs text-gray-500">{line.variant_name || line.variant}</div>
                    )}
                    <div className="text-xs text-gray-500">Purchased {max} × {Number(line.price || 0).toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Qty</label>
                    <input
                      type="number"
                      min={1}
                      max={max}
                      value={pick.quantity}
                      onChange={(e) => setPicks((p) => ({
                        ...p, [idx]: { ...pick, quantity: Math.max(1, Math.min(max, Number(e.target.value) || 1)) },
                      }))}
                      disabled={!pick.selected || !windowInfo.eligible}
                      className="w-16 rounded border px-2 py-1 text-sm disabled:bg-gray-100"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Reason + notes */}
        <div className="rounded border p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <select
              className="w-full rounded border px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!windowInfo.eligible}
            >
              {RETURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Add a note (optional)</label>
            <textarea
              rows={3}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Anything our team should know"
              value={reasonNotes}
              onChange={(e) => setReasonNotes(e.target.value)}
              disabled={!windowInfo.eligible}
            />
          </div>
        </div>

        {submitMutation.isError && (
          <div className="rounded border bg-red-50 p-3 text-sm text-red-700">
            {(submitMutation.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href={`/profile/orders/${id}`} className="rounded border px-4 py-2 text-sm">
            Cancel
          </Link>
          <button
            type="button"
            disabled={!windowInfo.eligible || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {submitMutation.isPending ? "Submitting…" : "Submit return request"}
          </button>
        </div>
      </div>
    </ProfileLayout>
  );
}
