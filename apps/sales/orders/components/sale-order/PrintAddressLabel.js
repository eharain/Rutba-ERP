// Provider-aware shipping label print buttons. Labels render client-side
// via React + window.print() per feedback_labels_print_client_side_html —
// same pattern as SaleInvoicePrint / BulkBarcodePrint. We open the
// /print/sale-order-label page in a new tab; that page fetches the
// provider descriptor from the server, redirects to a carrier-hosted URL
// when applicable (EasyPost), or renders the in-house template + auto-prints.

function openPrintTab(qs) {
    if (typeof window === "undefined") return;
    const url = `/print/sale-order-label?${qs}`;
    const w = window.open(url, "_blank", "width=480,height=720");
    if (!w) {
        alert("Pop-up blocked — allow pop-ups for this site to print labels.");
    }
}

function readyToPrint(order) {
    const snap = order?.delivery_snapshot || {};
    const addr = order?.delivery_address || {};
    const name = snap.name || order?.customer_person?.name;
    const line1 = snap.line1 || addr.line1;
    const city  = snap.city  || addr.city;
    return Boolean(name && line1 && city);
}

// Forward-shipping label. Used by PickupStage / DeliveryStage.
export default function PrintLabelButton({
    order,
    className = "btn btn-outline-secondary",
    children,
    reprint = false,
}) {
    const ready = readyToPrint(order);
    return (
        <button
            type="button"
            className={className}
            onClick={() => {
                if (!order?.documentId) return;
                const params = new URLSearchParams({ orderId: order.documentId });
                if (reprint) params.set("reprint", "1");
                openPrintTab(params.toString());
            }}
            disabled={!ready}
            title={ready ? "Print the provider-specific shipping label" : "Order is missing a delivery address"}
        >
            <i className="fas fa-print me-1" />
            {children ?? "Print Label"}
        </button>
    );
}

// Return-mode label. Used by ReturnStage. Pass either `returnRequest` (uses
// the return-scoped endpoint — preferred when the UI is already on one
// specific return) or `order` (uses the order-scoped endpoint, which looks
// up the active return-request server-side).
export function PrintReturnLabelButton({
    order,
    returnRequest,
    className = "btn btn-outline-secondary",
    children,
    reprint = false,
}) {
    const subject = returnRequest || order;
    const ready = Boolean(subject?.documentId);

    return (
        <button
            type="button"
            className={className}
            onClick={() => {
                if (!ready) return;
                const params = new URLSearchParams();
                if (returnRequest) {
                    params.set("returnId", returnRequest.documentId);
                } else {
                    params.set("orderId", order.documentId);
                    params.set("return", "1");
                }
                if (reprint) params.set("reprint", "1");
                openPrintTab(params.toString());
            }}
            disabled={!ready}
            title="Print the return pickup / pick slip"
        >
            <i className="fas fa-arrow-rotate-left me-1" />
            {children ?? "Print Return Label"}
        </button>
    );
}
