import Link from "next/link";

export default function DeliveryOfferCard({ offer }) {
  const order = offer?.order || {};
  const customer = order?.customer_contact || {};

  return (
    <div className="card mb-2">
      <div className="card-body d-flex justify-content-between align-items-start gap-3">
        <div>
          <p className="mb-1 fw-bold">Order #{order.order_id || order.documentId || order.id}</p>
          <p className="mb-1 small text-muted">Customer: {customer.name || "—"}</p>
          <p className="mb-1 small text-muted">City: {customer.city || "—"}</p>
          <p className="mb-0 small">Fee: Rs. {Number(offer?.delivery_fee || 0).toFixed(0)}</p>
        </div>
        <div className="d-flex gap-2">
          <Link href={`/delivery-offers/${offer.documentId}`} className="btn btn-sm btn-primary">View Delivery Offer</Link>
        </div>
      </div>
    </div>
  );
}
