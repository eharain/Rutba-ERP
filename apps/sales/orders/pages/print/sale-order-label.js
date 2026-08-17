import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SaleOrdersEndpoints, ReturnRequestsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import SaleOrderLabel from "../../components/print/SaleOrderLabel";

// Print page for shipping / return labels. Same shape as
// pos-sale/pages/print-invoice.js — fetch data, render the React label,
// auto-trigger window.print() once the page settles. Pop-up blockers
// behave because this is a same-origin navigation initiated by a click in
// the parent app, not a programmatic window.open of a foreign URL.
//
// Query shape:
//   ?orderId=<documentId>                  → forward shipping label
//   ?orderId=<documentId>&return=1         → return label (looks up the
//                                            order's most-recent active
//                                            return-request server-side)
//   ?returnId=<documentId>                 → return label scoped to a
//                                            specific return-request
//   &reprint=1                             → restamp label_generated_at
//
// EasyPost: descriptor.kind === 'url' triggers window.location.replace to
// the carrier's hosted PDF, then closes this tab.

export default function SaleOrderLabelPrintPage() {
    const router = useRouter();
    const { jwt } = useAuth();

    const [order, setOrder] = useState(null);
    const [descriptor, setDescriptor] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!router.isReady || !jwt) return;
        const { orderId, returnId, return: returnFlag, reprint } = router.query;
        const reprintFlag = String(reprint || "") === "1";
        const wantReturn = returnFlag === "1" || !!returnId;
        let cancelled = false;

        (async () => {
            try {
                // Resolve which endpoint to hit + which order documentId we
                // actually need to load for the render. When the caller
                // passed a returnId, we go through the return-scoped label
                // endpoint, then read sale_order off the response to pull
                // the populated order.
                let descriptorRes;
                let orderDocumentId = orderId;

                if (returnId) {
                    descriptorRes = await ReturnRequestsEndpoints.getReturnLabel(returnId, { reprint: reprintFlag });
                    // Pull the parent order from the return-request record —
                    // we need it for the render in HTML mode.
                    const retRes = await ReturnRequestsEndpoints.byId(returnId, {
                        populate: ["sale_order"],
                    });
                    orderDocumentId = (retRes?.data || retRes)?.sale_order?.documentId;
                } else if (orderId) {
                    descriptorRes = wantReturn
                        ? await SaleOrdersEndpoints.getReturnLabel(orderId, { reprint: reprintFlag })
                        : await SaleOrdersEndpoints.getLabel(orderId, { reprint: reprintFlag });
                } else {
                    throw new Error("orderId or returnId query param is required");
                }

                const desc = descriptorRes?.data || descriptorRes;
                if (cancelled) return;

                if (desc?.kind === "url" && desc.url) {
                    // Carrier-hosted label — hand off to the browser. Using
                    // location.replace avoids leaving an empty print page in
                    // the back-history.
                    window.location.replace(desc.url);
                    return;
                }

                // HTML provider: pull the order so we have populated
                // customer / address / products / rider for the render.
                if (!orderDocumentId) {
                    throw new Error("Could not resolve order documentId for label render");
                }
                const orderRes = await SaleOrdersEndpoints.byId(orderDocumentId, {
                    populate: {
                        customer_person: true,
                        delivery_address: true,
                        assigned_rider: true,
                        delivery_method: true,
                        products: {
                            populate: { items: { populate: { product: { fields: ["documentId", "name"] } } } },
                        },
                    },
                });
                if (cancelled) return;

                setOrder(orderRes?.data || orderRes);
                setDescriptor(desc);
            } catch (err) {
                console.error("Failed to prepare label", err);
                if (!cancelled) {
                    setError(err?.response?.data?.error?.message || err.message || "Failed to load label");
                }
            }
        })();

        return () => { cancelled = true; };
    }, [router.isReady, router.query, jwt]);

    // Auto-print once the label is on screen. The 500ms delay matches the
    // SaleInvoicePrint pattern — gives the browser time to lay the page out
    // (especially fonts) before the print dialog grabs a snapshot.
    useEffect(() => {
        if (!order || !descriptor || descriptor.kind === "url") return;
        const t = setTimeout(() => window.print(), 500);
        return () => clearTimeout(t);
    }, [order, descriptor]);

    if (error) {
        return (
            <div className="d-print-none p-4">
                <div className="alert alert-danger">
                    <strong>Could not generate label:</strong> {error}
                </div>
                <button className="btn btn-outline-secondary" onClick={() => window.close()}>Close</button>
            </div>
        );
    }

    if (!order || !descriptor) {
        return <div className="d-print-none p-4 text-muted">Preparing label…</div>;
    }

    return (
        <>
            <div className="d-print-none position-fixed" style={{ top: 20, right: 20, zIndex: 1100, display: "flex", gap: 8 }}>
                <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => window.print()}
                    title="Print"
                >
                    <i className="fas fa-print me-1" /> Print
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => window.close()}
                    title="Close"
                >
                    Close
                </button>
            </div>
            <SaleOrderLabel order={order} descriptor={descriptor} />
        </>
    );
}
