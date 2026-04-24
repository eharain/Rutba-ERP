import LayoutMain from "@/components/layouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/ui/spinner";
import useDeliveryService from "@/services/delivery";
import { OrderMessage } from "@/types/api/delivery";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

const STATUS_ORDER = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PREPARING",
  "AWAITING_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PREPARING: "Preparing",
  AWAITING_PICKUP: "Awaiting Pickup",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  FAILED_DELIVERY: "Failed Delivery",
  CANCELLED: "Cancelled",
  REFUND_INITIATED: "Refund Initiated",
  REFUNDED: "Refunded",
};

export default function OrderTrackingPage() {
  const router = useRouter();
  const session = useSession();
  const { getOrderTracking, getOrderMessages, sendOrderMessage } = useDeliveryService();

  const orderId = router.query.orderId as string | undefined;
  const secretFromQuery = router.query.secret as string | undefined;
  const [secretInput, setSecretInput] = useState(secretFromQuery || "");
  const [messageInput, setMessageInput] = useState("");

  const canTrack = Boolean(orderId && secretFromQuery);

  const {
    data: tracking,
    isLoading: isTrackingLoading,
    error: trackingError,
    refetch: refetchTracking,
  } = useQuery({
    queryKey: ["order-tracking", orderId, secretFromQuery],
    queryFn: () => getOrderTracking(orderId as string, secretFromQuery as string),
    enabled: canTrack,
    refetchInterval: 15000,
  });

  const {
    data: messages,
    isLoading: isMessagesLoading,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["order-messages", orderId],
    queryFn: () => getOrderMessages(orderId as string, session.data?.jwt),
    enabled: Boolean(orderId),
    refetchInterval: 10000,
  });

  const { mutate: mutateSendMessage, isPending: isSendingMessage } = useMutation({
    mutationFn: () => sendOrderMessage(orderId as string, messageInput.trim(), session.data?.jwt as string),
    onSuccess: () => {
      setMessageInput("");
      refetchMessages();
    },
  });

  const currentStatusIndex = useMemo(() => {
    if (!tracking?.order_status) return -1;
    return STATUS_ORDER.indexOf(tracking.order_status);
  }, [tracking?.order_status]);

  const submitSecret = () => {
    if (!orderId || !secretInput.trim()) return;
    router.push(`/order-tracking/${orderId}?secret=${encodeURIComponent(secretInput.trim())}`);
  };

  const submitMessage = () => {
    if (!messageInput.trim() || !session.data?.jwt || !orderId) return;
    mutateSendMessage();
  };

  return (
    <LayoutMain>
      <div className="container-fluid my-16">
        <div className="grid grid-cols-12 gap-[15px] lg:gap-[30px]">
          <div className="col-span-12 lg:col-span-8 lg:col-start-3 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Track Your Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canTrack && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Enter your order secret to view live delivery updates.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        placeholder="Enter order secret"
                      />
                      <Button onClick={submitSecret}>Track</Button>
                    </div>
                  </div>
                )}

                {isTrackingLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Spinner />
                    Loading order tracking...
                  </div>
                )}

                {trackingError && (
                  <p className="text-sm text-red-600">
                    Failed to load tracking details. Please verify order secret.
                  </p>
                )}

                {tracking && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Order #{tracking.order_id}</p>
                        <p className="text-sm text-slate-500">
                          Status: {STATUS_LABELS[tracking.order_status] || tracking.order_status}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => refetchTracking()}>
                        Refresh
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <p>Subtotal: Rs. {Number(tracking.subtotal || 0).toFixed(0)}</p>
                      <p>Delivery: Rs. {Number(tracking.delivery_cost || 0).toFixed(0)}</p>
                      <p className="font-semibold col-span-2">Total: Rs. {Number(tracking.total || 0).toFixed(0)}</p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2">Delivery Progress</p>
                      <div className="space-y-2">
                        {STATUS_ORDER.map((status, idx) => {
                          const done = currentStatusIndex >= idx;
                          return (
                            <div key={status} className="flex items-center gap-2 text-sm">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${done ? "bg-green-600" : "bg-slate-300"}`}
                              />
                              <span className={done ? "text-black" : "text-slate-400"}>
                                {STATUS_LABELS[status] || status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {tracking.assigned_rider && (
                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-semibold mb-1">Assigned Rider</p>
                        <p>{tracking.assigned_rider.full_name}</p>
                        <p>{tracking.assigned_rider.phone}</p>
                        <p className="text-slate-500">{tracking.assigned_rider.vehicle_type}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Messages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isMessagesLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Spinner />
                    Loading messages...
                  </div>
                )}

                <div className="max-h-[280px] overflow-y-auto space-y-2">
                  {(messages || []).map((msg: OrderMessage) => (
                    <div key={msg.documentId} className="rounded-md border p-2 text-sm">
                      <p className="font-medium capitalize">{msg.sender_type}</p>
                      <p>{msg.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(msg.sent_at).toLocaleString()}
                      </p>
                    </div>
                  ))}

                  {messages?.length === 0 && (
                    <p className="text-sm text-slate-500">No messages yet.</p>
                  )}
                </div>

                {session.data?.jwt ? (
                  <div className="flex gap-2">
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Write a message to rider/support"
                    />
                    <Button disabled={isSendingMessage || !messageInput.trim()} onClick={submitMessage}>
                      {isSendingMessage ? <Spinner /> : "Send"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Log in to send a message.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LayoutMain>
  );
}
