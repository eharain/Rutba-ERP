import { useState } from "react";

// Advanced filters over the current folder. Every criterion is executed
// server-side as ONE IMAP SEARCH (gateway buildSearch) — this bar only
// assembles the filter object.

const EMPTY = { unread: false, flagged: false, tag: "", from: "", to: "", subject: "", since: "", before: "" };

export default function FilterBar({ filters, tags = [], onChange }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState({ ...EMPTY, ...filters });

    const active = filters && Object.entries(filters).some(([, v]) => v);
    const chip = (key) => onChange({ ...filters, [key]: !filters?.[key] });

    const applyAdvanced = (e) => {
        e.preventDefault();
        onChange({ ...filters, ...draft });
        setOpen(false);
    };
    const clearAll = () => {
        setDraft({ ...EMPTY });
        onChange(null);
        setOpen(false);
    };

    return (
        <div className="border-bottom px-2 py-1 position-relative">
            <div className="d-flex align-items-center gap-1 flex-wrap">
                <button type="button"
                    className={`btn btn-sm ${filters?.unread ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => chip("unread")}>Unread</button>
                <button type="button"
                    className={`btn btn-sm ${filters?.flagged ? "btn-warning" : "btn-outline-secondary"}`}
                    onClick={() => chip("flagged")}>Flagged</button>
                {tags.length > 0 && (
                    <select className="form-select form-select-sm" style={{ width: "8.5rem" }}
                        value={filters?.tag || ""}
                        onChange={(e) => onChange({ ...filters, tag: e.target.value })}>
                        <option value="">Any tag</option>
                        {tags.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                    </select>
                )}
                <button type="button" className={`btn btn-sm ${open ? "btn-secondary" : "btn-outline-secondary"}`}
                    onClick={() => { setDraft({ ...EMPTY, ...filters }); setOpen(!open); }}>
                    <i className="fa-solid fa-sliders me-1"></i>More
                </button>
                {active && (
                    <button type="button" className="btn btn-sm btn-link text-muted" onClick={clearAll}>
                        Clear filters
                    </button>
                )}
            </div>

            {open && (
                <form className="card shadow position-absolute mt-1 p-2" style={{ zIndex: 1030, width: "22rem", left: "0.5rem" }}
                    onSubmit={applyAdvanced}>
                    <div className="row g-2">
                        <div className="col-6">
                            <label className="form-label small mb-0">From contains</label>
                            <input className="form-control form-control-sm" value={draft.from}
                                onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                        </div>
                        <div className="col-6">
                            <label className="form-label small mb-0">To contains</label>
                            <input className="form-control form-control-sm" value={draft.to}
                                onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                        </div>
                        <div className="col-12">
                            <label className="form-label small mb-0">Subject contains</label>
                            <input className="form-control form-control-sm" value={draft.subject}
                                onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                        </div>
                        <div className="col-6">
                            <label className="form-label small mb-0">Since</label>
                            <input type="date" className="form-control form-control-sm" value={draft.since}
                                onChange={(e) => setDraft({ ...draft, since: e.target.value })} />
                        </div>
                        <div className="col-6">
                            <label className="form-label small mb-0">Before</label>
                            <input type="date" className="form-control form-control-sm" value={draft.before}
                                onChange={(e) => setDraft({ ...draft, before: e.target.value })} />
                        </div>
                    </div>
                    <div className="d-flex justify-content-end gap-2 mt-2">
                        <button type="button" className="btn btn-sm btn-link" onClick={() => setOpen(false)}>Cancel</button>
                        <button className="btn btn-sm btn-primary">Apply</button>
                    </div>
                </form>
            )}
        </div>
    );
}
