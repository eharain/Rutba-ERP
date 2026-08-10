import { useState, useEffect } from "react";
import { MailLinksEndpoints } from "@rutba/api-provider/endpoints";

// "Mail" panel for a CRM record — every email linked to it via rutba-mail's
// import-on-link flow (docs/todo/email-program/04). Read-only here: linking
// happens in the mail client. Callers without a mail app-role get a 403 from
// the links route; the panel then renders nothing rather than an error.

export default function MailTimeline({ entityUid, targetDocumentId }) {
    const [links, setLinks] = useState(null);
    const [open, setOpen] = useState(null);

    useEffect(() => {
        if (!targetDocumentId) return;
        MailLinksEndpoints.list({ entityUid, targetDocumentId, pageSize: 25 })
            .then((res) => setLinks(res?.data || []))
            .catch(() => setLinks(null)); // no mail role → hide the panel
    }, [entityUid, targetDocumentId]);

    if (!links || links.length === 0) return null;

    return (
        <div className="card mt-3">
            <div className="card-header py-2">
                <strong><i className="fa-solid fa-envelope me-2 text-info"></i>Mail</strong>
                <span className="text-muted small ms-2">{links.length} linked message{links.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="list-group list-group-flush">
                {links.map((l) => {
                    const m = l.mail_message;
                    if (!m) return null;
                    return (
                        <li key={l.documentId} className="list-group-item py-2">
                            <div className="d-flex justify-content-between gap-2">
                                <button className="btn btn-link btn-sm p-0 text-start text-truncate"
                                    onClick={() => setOpen(m)}>
                                    <i className={`fa-solid ${m.direction === "outbound" ? "fa-arrow-up text-success" : "fa-arrow-down text-primary"} me-1`}></i>
                                    {m.subject || "(no subject)"}
                                </button>
                                <span className="text-muted small text-nowrap">
                                    {m.date ? new Date(m.date).toLocaleDateString() : ""}
                                </span>
                            </div>
                            <div className="text-muted small text-truncate">{m.snippet}</div>
                        </li>
                    );
                })}
            </ul>

            {open && (
                <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                    style={{ background: "rgba(0,0,0,.4)", zIndex: 1050 }} onClick={() => setOpen(null)}>
                    <div className="card shadow-lg" style={{ width: "min(720px, 95vw)", maxHeight: "85vh" }}
                        onClick={(e) => e.stopPropagation()}>
                        <div className="card-header d-flex justify-content-between align-items-center py-2">
                            <strong className="text-truncate">{open.subject || "(no subject)"}</strong>
                            <button type="button" className="btn-close" onClick={() => setOpen(null)}></button>
                        </div>
                        <div className="small text-muted px-3 pt-2">
                            {open.from_name || open.from_email} — {open.date ? new Date(open.date).toLocaleString() : ""}
                        </div>
                        <iframe sandbox="" title="Message" style={{ width: "100%", height: "55vh", border: 0 }}
                            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial;font-size:14px;margin:12px;}</style></head><body>${open.body_html || ""}</body></html>`} />
                    </div>
                </div>
            )}
        </div>
    );
}
