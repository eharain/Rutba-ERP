import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { MailContactsEndpoints } from "@rutba/api-provider/endpoints";

// Address book — the Outlook personal-contacts + GAL split. "My contacts"
// are private to the signed-in user; "Company directory" is the shared
// global book (mail admin/manager write). Both feed compose autocomplete,
// alongside the person spine and CRM contacts which are managed in their
// own apps.

const EMPTY = { name: "", email: "", phone: "", organization: "", notes: "", scope: "personal" };

export default function ContactsPage() {
    const { jwt } = useAuth();
    const [scope, setScope] = useState("personal");
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [q, setQ] = useState("");
    const [qDraft, setQDraft] = useState("");
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(undefined); // undefined closed; null new; row edit
    const [notice, setNotice] = useState(null);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        MailContactsEndpoints.list({ scope, q: q || undefined, page, pageSize: 25 })
            .then((res) => { setRows(res?.data || []); setTotal(res?.meta?.pagination?.total || 0); })
            .catch((err) => setNotice({ type: "danger", text: err.message }))
            .finally(() => setLoading(false));
    }, [jwt, scope, q, page]);

    useEffect(() => { load(); }, [load]);

    const remove = async (row) => {
        if (!window.confirm(`Delete "${row.name}" from the address book?`)) return;
        try {
            await MailContactsEndpoints.del(row.documentId);
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Delete failed: ${err.message}` });
        }
    };

    const pages = Math.max(1, Math.ceil(total / 25));

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h2 className="mb-0"><i className="fa-solid fa-address-book text-success me-2"></i>Contacts</h2>
                    <div className="d-flex gap-2">
                        <form className="input-group input-group-sm" style={{ width: "16rem" }}
                            onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qDraft.trim()); }}>
                            <input className="form-control" placeholder="Search name, email, company…"
                                value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
                            <button className="btn btn-outline-secondary"><i className="fa-solid fa-magnifying-glass"></i></button>
                        </form>
                        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>
                            <i className="fa-solid fa-plus me-1"></i>New contact
                        </button>
                    </div>
                </div>

                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button className={`nav-link ${scope === "personal" ? "active" : ""}`}
                            onClick={() => { setScope("personal"); setPage(1); }}>
                            <i className="fa-solid fa-user me-1"></i>My contacts
                        </button>
                    </li>
                    <li className="nav-item">
                        <button className={`nav-link ${scope === "global" ? "active" : ""}`}
                            onClick={() => { setScope("global"); setPage(1); }}>
                            <i className="fa-solid fa-building me-1"></i>Company directory
                        </button>
                    </li>
                </ul>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible py-2`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                {editing !== undefined && (
                    <ContactForm contact={editing} defaultScope={scope}
                        onClose={() => setEditing(undefined)}
                        onSaved={() => { setEditing(undefined); setNotice({ type: "success", text: "Contact saved." }); load(); }} />
                )}

                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : rows.length === 0 ? (
                    <div className="alert alert-light border">
                        {q ? "No matches." : scope === "personal"
                            ? "Your personal address book is empty — save senders from the reading pane, or add contacts here."
                            : "The company directory is empty. Admins and managers can add shared contacts."}
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle table-hover">
                            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Organization</th><th></th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.documentId}>
                                        <td>{r.name}</td>
                                        <td className="text-muted">{r.email}</td>
                                        <td className="text-muted">{r.phone}</td>
                                        <td className="text-muted">{r.organization}</td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-primary me-2" onClick={() => setEditing(r)}>Edit</button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {pages > 1 && (
                            <div className="btn-group btn-group-sm">
                                <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
                                <button className="btn btn-outline-secondary" disabled>{page}/{pages}</button>
                                <button className="btn btn-outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
                            </div>
                        )}
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function ContactForm({ contact, defaultScope, onSaved, onClose }) {
    const editing = Boolean(contact?.documentId);
    const [draft, setDraft] = useState({ ...EMPTY, scope: defaultScope, ...(contact || {}) });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const data = {
                name: draft.name, email: draft.email, phone: draft.phone,
                organization: draft.organization, notes: draft.notes, scope: draft.scope,
            };
            if (editing) await MailContactsEndpoints.update(contact.documentId, data);
            else await MailContactsEndpoints.create(data);
            onSaved?.();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <form className="card border-primary mb-3" onSubmit={save}>
            <div className="card-body py-2">
                <div className="d-flex justify-content-between align-items-start">
                    <h6 className="card-title">{editing ? `Edit ${contact.name}` : "New contact"}</h6>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <div className="row g-2">
                    <div className="col-md-3">
                        <label className="form-label small mb-0">Name</label>
                        <input className="form-control form-control-sm" required value={draft.name} onChange={set("name")} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label small mb-0">Email</label>
                        <input className="form-control form-control-sm" type="email" required value={draft.email} onChange={set("email")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label small mb-0">Phone</label>
                        <input className="form-control form-control-sm" value={draft.phone || ""} onChange={set("phone")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label small mb-0">Organization</label>
                        <input className="form-control form-control-sm" value={draft.organization || ""} onChange={set("organization")} />
                    </div>
                    <div className="col-md-2">
                        <label className="form-label small mb-0">Book</label>
                        <select className="form-select form-select-sm" value={draft.scope} onChange={set("scope")}>
                            <option value="personal">My contacts</option>
                            <option value="global">Company directory</option>
                        </select>
                    </div>
                    <div className="col-12">
                        <label className="form-label small mb-0">Notes</label>
                        <input className="form-control form-control-sm" value={draft.notes || ""} onChange={set("notes")} />
                    </div>
                </div>
                {error && <div className="alert alert-danger py-1 px-2 small mt-2 mb-0">{error}</div>}
                <div className="mt-2">
                    <button className="btn btn-sm btn-primary me-2" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                    <button type="button" className="btn btn-sm btn-link" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </form>
    );
}
