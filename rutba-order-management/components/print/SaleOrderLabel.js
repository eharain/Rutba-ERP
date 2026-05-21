import { QRCodeSVG } from "qrcode.react";

// Two provider templates, both 4×6" thermal layout, both rendered client-side
// and printed via window.print(). Per feedback_labels_print_client_side_html
// — same approach as SaleInvoicePrint / BulkBarcodePrint elsewhere in the
// ERP. Carrier-supplied labels (EasyPost) don't render here; the print page
// short-circuits to window.open()ing the carrier's hosted URL.
//
// own_rider:  in-house rider takes this with them; includes COD badge,
//             customer name + address + phone, item count, QR for scanning
//             the order back into the rider app.
// custom:     courier-agnostic pick slip; warehouse affixes it next to the
//             third-party AWB the courier sticks on the parcel.
// return-mode (both): swaps ship-to with the warehouse return address and
//             prefixes the header with the return_ref.

const FALLBACK_BRAND = "RUTBA";

function deliveryFromOrder(order) {
    const snap   = order?.delivery_snapshot || {};
    const person = order?.customer_person   || {};
    const addr   = order?.delivery_address  || {};
    return {
        name:    snap.name    || person.name    || "—",
        phone:   snap.phone   || person.phone   || "",
        line1:   snap.line1   || addr.line1     || "",
        line2:   snap.line2   || addr.line2     || "",
        city:    snap.city    || addr.city      || "",
        state:   snap.state   || addr.state     || "",
        zip:     snap.zip_code|| addr.zip_code  || "",
        country: snap.country || addr.country   || "",
    };
}

// Warehouse return-to is set per deployment via NEXT_PUBLIC_RETURN_TO_*
// envs. Falls back to a single line of "Rutba Warehouse" so the label still
// makes sense in dev without env wiring.
function returnToAddress() {
    return {
        name:    process.env.NEXT_PUBLIC_RETURN_TO_NAME    || "Rutba Warehouse",
        line1:   process.env.NEXT_PUBLIC_RETURN_TO_ADDRESS || "",
        city:    process.env.NEXT_PUBLIC_RETURN_TO_CITY    || "",
        state:   process.env.NEXT_PUBLIC_RETURN_TO_STATE   || "",
        zip:     process.env.NEXT_PUBLIC_RETURN_TO_ZIP     || "",
        country: process.env.NEXT_PUBLIC_RETURN_TO_COUNTRY || "",
        phone:   process.env.NEXT_PUBLIC_RETURN_TO_PHONE   || "",
    };
}

function AddressBlock({ label, addr }) {
    return (
        <div className="addr-block">
            <div className="addr-label">{label}</div>
            <div className="addr-name">{addr.name}</div>
            <div className="addr-lines">
                {addr.line1 && <div>{addr.line1}</div>}
                {addr.line2 && <div>{addr.line2}</div>}
                {(addr.city || addr.state) && (
                    <div>{[addr.city, addr.state].filter(Boolean).join(", ")}</div>
                )}
                {(addr.zip || addr.country) && (
                    <div>{[addr.zip, addr.country].filter(Boolean).join(" ")}</div>
                )}
            </div>
            {addr.phone && <div className="addr-phone">Phone: {addr.phone}</div>}
        </div>
    );
}

function CodBadge({ amount, currency }) {
    return (
        <div className="cod-badge">
            <div className="cod-label">COD</div>
            <div className="cod-amount">{currency}{Number(amount || 0).toFixed(2)}</div>
        </div>
    );
}

function Footer({ orderId, itemCount, total, currency, rider, paymentMethod }) {
    return (
        <div className="footer">
            <div className="footer-grid">
                <div><span className="k">Items:</span> <strong>{itemCount}</strong></div>
                <div><span className="k">Total:</span> <strong>{currency}{Number(total || 0).toFixed(2)}</strong></div>
                <div><span className="k">Pay:</span> <strong>{(paymentMethod || "—").toUpperCase()}</strong></div>
                {rider && <div><span className="k">Rider:</span> <strong>{rider}</strong></div>}
            </div>
            <div className="qr-wrap">
                <QRCodeSVG value={String(orderId || "")} size={60} level="M" />
            </div>
            <div className="barcode-text">*{orderId}*</div>
        </div>
    );
}

function LabelStyles() {
    // Inline @page so the 4×6 thermal layout doesn't fight other prints
    // (sale invoice on 80mm receipt, barcode sheet on A4). The whole label
    // is wrapped in `.print-label-root` so the @media print rules can hide
    // everything else on the page.
    return (
        <style jsx global>{`
            @page { size: 4in 6in; margin: 0; }
            @media print {
                html, body { width: 4in; height: 6in; background: #fff; }
                .d-print-none { display: none !important; }
                .print-label-root { box-shadow: none !important; border: none !important; }
            }
            .print-label-root {
                width: 4in;
                min-height: 6in;
                padding: 14px 16px;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
                color: #111;
                background: #fff;
                margin: 16px auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .print-label-root .header-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 8px;
            }
            .print-label-root .brand {
                font-weight: 700;
                font-size: 12px;
                letter-spacing: 1px;
            }
            .print-label-root .ribbon {
                font-size: 9px;
                color: #555;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .print-label-root .order-id {
                font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
                font-size: 14px;
                font-weight: 700;
                text-align: right;
            }
            .print-label-root .tracking {
                font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
                font-size: 9px;
                text-align: right;
                color: #555;
            }
            .print-label-root .divider {
                border-top: 1px dashed #999;
                margin: 8px 0;
            }
            .print-label-root .slip-banner {
                font-size: 9px;
                color: #6b7280;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            .print-label-root .cod-badge {
                display: inline-block;
                padding: 4px 10px;
                border: 2px solid #b91c1c;
                color: #b91c1c;
                font-weight: 700;
                border-radius: 4px;
                margin: 4px 0 6px;
            }
            .print-label-root .cod-badge .cod-label {
                font-size: 9px;
                line-height: 1;
                letter-spacing: 1px;
            }
            .print-label-root .cod-badge .cod-amount {
                font-size: 14px;
                line-height: 1.1;
            }
            .print-label-root .addr-block { margin-bottom: 6px; }
            .print-label-root .addr-label {
                font-size: 9px;
                color: #555;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .print-label-root .addr-name {
                font-size: 17px;
                font-weight: 700;
                margin-top: 2px;
            }
            .print-label-root .addr-lines {
                font-size: 12px;
                margin-top: 4px;
                line-height: 1.35;
            }
            .print-label-root .addr-phone {
                font-size: 10px;
                color: #555;
                margin-top: 4px;
            }
            .print-label-root .contents-block { margin-top: 6px; }
            .print-label-root .contents-label {
                font-size: 9px;
                color: #555;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .print-label-root .contents-lines {
                font-size: 10px;
                margin-top: 3px;
                line-height: 1.3;
            }
            .print-label-root .footer {
                position: relative;
                margin-top: 12px;
                padding-top: 10px;
                border-top: 1px solid #ccc;
            }
            .print-label-root .footer .footer-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 3px 12px;
                font-size: 10px;
                padding-right: 70px;
            }
            .print-label-root .footer .footer-grid .k {
                color: #666;
            }
            .print-label-root .footer .qr-wrap {
                position: absolute;
                top: 10px;
                right: 0;
            }
            .print-label-root .footer .barcode-text {
                font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
                font-size: 10px;
                letter-spacing: 2px;
                text-align: center;
                padding-top: 8px;
                margin-top: 8px;
                border-top: 1px solid #eee;
            }
        `}</style>
    );
}

function HeaderRow({ brand, orderId, tracking, returnRef }) {
    return (
        <div className="header-row">
            <div>
                <div className="brand">{brand}</div>
                <div className="ribbon">
                    {returnRef ? `RETURN · ${returnRef}` : "SHIPMENT"}
                </div>
            </div>
            <div>
                <div className="ribbon">Order</div>
                <div className="order-id">{orderId}</div>
                {tracking && <div className="tracking">{tracking}</div>}
            </div>
        </div>
    );
}

// own_rider template — used for both forward shipment and return pickup.
function OwnRiderLabel({ order, currency, brand, returnMode, returnRef }) {
    const items = order?.products?.items || [];
    const itemCount = items.reduce((n, it) => n + Number(it.quantity || 0), 0);
    const orderId   = order?.order_id || order?.documentId || "—";
    const isCod     = !returnMode && String(order?.payment_method || "").toLowerCase() === "cod";
    const codAmount = Number(order?.total || 0);
    const rider     = order?.assigned_rider?.full_name || "";
    const tracking  = order?.tracking_code || "";

    const customer  = deliveryFromOrder(order);
    const warehouse = returnToAddress();

    return (
        <div className="print-label-root">
            <LabelStyles />
            <HeaderRow brand={brand} orderId={orderId} tracking={tracking} returnRef={returnMode ? returnRef : null} />
            <div className="divider" />
            {isCod && <CodBadge amount={codAmount} currency={currency} />}
            <AddressBlock label={returnMode ? "Pick up from" : "Ship to"} addr={customer} />
            {returnMode && (
                <>
                    <div className="divider" />
                    <AddressBlock label="Return to" addr={warehouse} />
                </>
            )}
            <Footer
                orderId={orderId}
                itemCount={itemCount}
                total={order?.total}
                currency={currency}
                rider={rider}
                paymentMethod={returnMode ? "RETURN" : order?.payment_method}
            />
        </div>
    );
}

// custom template — courier-agnostic internal pick slip.
function CustomPickSlip({ order, currency, brand, returnMode, returnRef }) {
    const items = order?.products?.items || [];
    const itemCount = items.reduce((n, it) => n + Number(it.quantity || 0), 0);
    const orderId   = order?.order_id || order?.documentId || "—";
    const isCod     = !returnMode && String(order?.payment_method || "").toLowerCase() === "cod";
    const codAmount = Number(order?.total || 0);

    const customer  = deliveryFromOrder(order);
    const warehouse = returnToAddress();

    const summary = items.slice(0, 4).map((it, idx) => (
        <div key={idx}>
            {Number(it.quantity || 0)} × {it.product_name || it.variant_name || "item"}
        </div>
    ));
    if (items.length > 4) summary.push(<div key="more">… +{items.length - 4} more</div>);

    return (
        <div className="print-label-root">
            <LabelStyles />
            <HeaderRow brand={brand} orderId={orderId} tracking="" returnRef={returnMode ? returnRef : null} />
            <div className="slip-banner">
                {returnMode
                    ? "Internal pick slip · affix next to carrier return waybill"
                    : "Internal pick slip · affix next to carrier waybill"}
            </div>
            <div className="divider" />
            {isCod && <CodBadge amount={codAmount} currency={currency} />}
            <AddressBlock label={returnMode ? "From customer" : "Ship to"} addr={customer} />
            <div className="divider" />
            <AddressBlock label={returnMode ? "Return to" : "From"} addr={returnMode ? warehouse : { ...warehouse, name: brand }} />
            <div className="contents-block">
                <div className="contents-label">Contents</div>
                <div className="contents-lines">{summary.length ? summary : "—"}</div>
            </div>
            <Footer
                orderId={orderId}
                itemCount={itemCount}
                total={order?.total}
                currency={currency}
                rider=""
                paymentMethod={returnMode ? "RETURN" : order?.payment_method}
            />
        </div>
    );
}

export default function SaleOrderLabel({ order, descriptor }) {
    const currency = process.env.NEXT_PUBLIC_LABEL_CURRENCY || "Rs.";
    const brand    = process.env.NEXT_PUBLIC_LABEL_BRAND    || FALLBACK_BRAND;
    const provider = descriptor?.provider || "custom";
    const returnMode = !!descriptor?.return_mode;
    const returnRef = descriptor?.return_ref || null;

    if (provider === "own_rider") {
        return <OwnRiderLabel order={order} currency={currency} brand={brand} returnMode={returnMode} returnRef={returnRef} />;
    }
    return <CustomPickSlip order={order} currency={currency} brand={brand} returnMode={returnMode} returnRef={returnRef} />;
}
