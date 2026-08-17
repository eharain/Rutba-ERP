import { useState, useEffect } from "react";
import {
    MailAccountsEndpoints,
    CrmContactsEndpoints,
    CustomersEndpoints,
    PersonsEndpoints,
    SaleOrdersEndpoints,
} from "@rutba/api-provider/endpoints";

// Attach a live message to an ERP record — THE import-on-demand action
// (docs/todo/email-program/04). Importing is idempotent: linking twice, or
// linking after a triage import, just merges.

const TYPES = [
    { key: "person", uid: "api::person.person", label: "Person" },
    { key: "crm-contact", uid: "api::crm-contact.crm-contact", label: "CRM contact" },
    { key: "customer", uid: "api::customer.customer", label: "Customer" },
    { key: "sale-order", uid: "api::sale-order.sale-order", label: "Sale order" },
];

export default function LinkPicker({ account, folder, uid, fromEmail, onLinked, onClose }) {
    const [type, setType] = useState(TYPES[0]);
    const [term, setTerm] = useState(fromEmail || "");
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const t = setTimeout(async () => {
            const q = term.trim();
            if (!q) { setResults([]); return; }
            try {
                setError(null);
                if (type.key === "person") {
                    const res = await PersonsEndpoints.list({
                        pageSize: 10,
                        filters: { $or: [{ name: { $containsi: q } }, { email: { $containsi: q } }, { phone: { $containsi: q } }] },
                    });
                    setResults((res?.data || []).map((r) => ({ documentId: r.documentId, title: r.name, sub: r.email || r.phone })));
                } else if (type.key === "crm-contact") {
                    const res = await CrmContactsEndpoints.list({
                        pageSize: 10,
                        filters: { $or: [{ name: { $containsi: q } }, { email: { $containsi: q } }, { phone: { $containsi: q } }] },
                    });
                    setResults((res?.data || []).map((r) => ({ documentId: r.documentId, title: r.name, sub: r.email || r.phone })));
                } else if (type.key === "customer") {
                    const res = await CustomersEndpoints.list({
                        pageSize: 10,
                        filters: { $or: [{ name: { $containsi: q } }, { email: { $containsi: q } }, { phone: { $containsi: q } }] },
                    });
                    setResults((res?.data || []).map((r) => ({ documentId: r.documentId, title: r.name, sub: r.email || r.phone })));
                } else {
                    const res = await SaleOrdersEndpoints.list({
                        pageSize: 10,
                        filters: {
                            $or: [
                                { documentId: { $containsi: q } },
                                { tracking_code: { $containsi: q } },
                                { external_order_number: { $containsi: q } },
                                { customer_person: { $or: [{ name: { $containsi: q } }, { email: { $containsi: q } }] } },
                            ],
                        },
                        populate: { customer_person: { fields: ["name", "email"] } },
                    });
                    setResults((res?.data || []).map((r) => ({
                        documentId: r.documentId,
                        title: `Order ${r.tracking_code || r.external_order_number || r.documentId.slice(0, 8)}`,
                        sub: r.customer_person?.name || r.order_status || "",
                    })));
                }
            } catch (err) {
                setResults([]);
                setError(err.message);
            }
        }, 350);
        return () => clearTimeout(t);
    }, [term, type]);

    const link = async (target) => {
        setBusy(true);
        setError(null);
        try {
            const res = await MailAccountsEndpoints.createImport(account.documentId, uid, {
                folder,
                links: [{ entityUid: type.uid, targetDocumentId: target.documentId, kind: "manual" }],
            });
            onLinked?.(res);
        } catch (err) {
            setError(`Link failed: ${err.message}`);
            setBusy(false);
        }
    };

    return (
        <div className="card border-primary position-absolute shadow" style={{ zIndex: 1040, width: "24rem", right: "1rem", top: "3rem" }}>
            <div className="card-header d-flex justify-content-between align-items-center py-2">
                <strong><i className="fa-solid fa-link me-2"></i>Link to record</strong>
                <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="card-body py-2">
                <div className="input-group input-group-sm mb-2">
                    <select className="form-select" style={{ maxWidth: "9.5rem" }} value={type.key}
                        onChange={(e) => setType(TYPES.find((t) => t.key === e.target.value) || TYPES[0])}>
                        {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <input className="form-control" autoFocus placeholder="Search…"
                        value={term} onChange={(e) => setTerm(e.target.value)} />
                </div>
                {error && <div className="alert alert-warning py-1 px-2 small">{error}</div>}
                <div style={{ maxHeight: "16rem", overflowY: "auto" }}>
                    {results.map((r) => (
                        <button key={r.documentId} type="button" disabled={busy}
                            className="list-group-item list-group-item-action w-100 text-start py-1"
                            onClick={() => link(r)}>
                            <div className="fw-semibold small">{r.title}</div>
                            {r.sub && <div className="text-muted small">{r.sub}</div>}
                        </button>
                    ))}
                    {!results.length && term.trim() && !error && (
                        <div className="text-muted small p-2">No matches.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
