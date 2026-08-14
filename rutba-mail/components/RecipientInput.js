import { useEffect, useRef, useState } from "react";
import {
    MailContactsEndpoints,
    PersonsEndpoints,
    CrmContactsEndpoints,
} from "@rutba/api-provider/endpoints";

// Recipient field with autocomplete over everything the ERP knows about
// people: the mail address book (personal + global), the person spine, and
// CRM contacts — deduped by address. This is the advantage Gmail can't
// match: it suggests your CUSTOMERS. Value stays a plain comma-separated
// string, so the send path is unchanged.

async function suggest(q) {
    const term = q.trim();
    if (term.length < 2) return [];
    const [book, persons, crm] = await Promise.all([
        MailContactsEndpoints.list({ q: term, pageSize: 6 }).catch(() => null),
        PersonsEndpoints.list({
            pageSize: 6,
            filters: { $or: [{ name: { $containsi: term } }, { email: { $containsi: term } }] },
        }).catch(() => null),
        CrmContactsEndpoints.list({
            pageSize: 6,
            filters: { $or: [{ name: { $containsi: term } }, { email: { $containsi: term } }] },
        }).catch(() => null),
    ]);
    const out = [];
    const seen = new Set();
    const push = (name, email, source) => {
        const key = String(email || "").toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({ name: name || email, email, source });
    };
    for (const c of book?.data || []) push(c.name, c.email, c.scope === "global" ? "directory" : "contacts");
    for (const p of persons?.data || []) push(p.name, p.email, "person");
    for (const c of crm?.data || []) push(c.name, c.email, "crm");
    return out.slice(0, 8);
}

export default function RecipientInput({ value, onChange, placeholder, autoFocus }) {
    const [options, setOptions] = useState([]);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const timer = useRef(null);
    const boxRef = useRef(null);

    // The fragment being typed = text after the last comma.
    const parts = String(value || "").split(",");
    const fragment = parts[parts.length - 1].trim();

    useEffect(() => {
        clearTimeout(timer.current);
        if (!fragment || fragment.length < 2 || fragment.includes("@") && fragment.includes(".") && fragment.length > 30) {
            setOptions([]);
            return undefined;
        }
        timer.current = setTimeout(() => {
            suggest(fragment).then((opts) => { setOptions(opts); setOpen(opts.length > 0); setHi(0); });
        }, 250);
        return () => clearTimeout(timer.current);
    }, [fragment]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const pick = (opt) => {
        const kept = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
        onChange([...kept, opt.email].join(", "));
        setOpen(false);
    };

    const onKeyDown = (e) => {
        if (!open || !options.length) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % options.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + options.length) % options.length); }
        else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[hi]); }
        else if (e.key === "Escape") {
            // Escape dismisses the suggestions ONLY. Without this the event
            // reaches the composer's handler and closes the whole dialog.
            e.stopPropagation();
            setOpen(false);
        }
    };

    return (
        <div className="position-relative" ref={boxRef}>
            <input className="form-control form-control-sm" value={value} placeholder={placeholder}
                autoFocus={autoFocus} autoComplete="off"
                onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
                onFocus={() => options.length && setOpen(true)} />
            {open && (
                <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 1050, maxHeight: "14rem", overflowY: "auto" }}>
                    {options.map((o, i) => (
                        <button key={o.email} type="button"
                            className={`list-group-item list-group-item-action py-1 ${i === hi ? "active" : ""}`}
                            onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
                            <span className="fw-semibold small">{o.name}</span>{" "}
                            <span className="small">{o.email}</span>
                            <span className={`badge float-end ${i === hi ? "bg-light text-dark" : "bg-secondary"}`}>{o.source}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
