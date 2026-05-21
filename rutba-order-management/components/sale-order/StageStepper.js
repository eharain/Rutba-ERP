import { STAGE_ORDER } from "./hooks/useSaleOrder";

// Visual progress through the happy path. Detour states (FAILED_DELIVERY,
// CANCELLED, REFUND_INITIATED, REFUNDED) are rendered as a single trailing
// pill rather than inline steps — they're exits, not stages.
const LABELS = {
  PENDING_PAYMENT:   "Awaiting Payment",
  PAYMENT_CONFIRMED: "Verifying",
  PREPARING:         "Preparing",
  AWAITING_PICKUP:   "Awaiting Pickup",
  OUT_FOR_DELIVERY:  "Out for Delivery",
  DELIVERED:         "Delivered",
};

const DETOUR_LABELS = {
  FAILED_DELIVERY:   { label: "Failed Delivery",  color: "bg-warning text-dark" },
  CANCELLED:         { label: "Cancelled",        color: "bg-danger" },
  RETURN_REQUESTED:  { label: "Return Requested", color: "bg-info text-dark" },
  RETURN_IN_TRANSIT: { label: "Return In Transit", color: "bg-info text-dark" },
  RETURNED:          { label: "Returned",          color: "bg-info text-dark" },
  REFUND_INITIATED:  { label: "Refund Pending",   color: "bg-warning text-dark" },
  REFUNDED:          { label: "Refunded",         color: "bg-secondary" },
};

export default function StageStepper({ status }) {
  const detour = DETOUR_LABELS[status];

  const activeIndex = detour
    ? -1
    : STAGE_ORDER.indexOf(status);

  return (
    <div className="d-flex flex-wrap align-items-center gap-1 mb-3">
      {STAGE_ORDER.map((s, i) => {
        const done = !detour && i < activeIndex;
        const active = !detour && i === activeIndex;
        return (
          <span
            key={s}
            className={
              "badge rounded-pill px-3 py-2 " +
              (active ? "bg-primary"
                : done ? "bg-success"
                : "bg-light text-muted border")
            }
            title={s}
          >
            <span className="me-1 small">{i + 1}</span>
            {LABELS[s]}
            {i < STAGE_ORDER.length - 1 && (
              <i className="fas fa-chevron-right ms-2 small opacity-50" />
            )}
          </span>
        );
      })}
      {detour && (
        <span className={`badge rounded-pill px-3 py-2 ms-2 ${detour.color}`}>
          <i className="fas fa-circle-exclamation me-1" />
          {detour.label}
        </span>
      )}
    </div>
  );
}
