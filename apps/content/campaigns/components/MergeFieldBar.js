import { useState } from "react";

// Merge fields available to a template.
//
// SUGGESTED is a starting set, not a contract — an audience declares its own
// mapping, and the composer validates the intersection at campaign time. Showing
// it here is what stops every author inventing their own key for "first name".
//
// `used` is parsed live from the body so the author sees drift immediately; the
// authoritative list is recomputed server-side on save (cmp-template lifecycles).
const SUGGESTED = [
    "first_name", "last_name", "full_name", "email",
    "company", "job_title", "city", "country",
];

export default function MergeFieldBar({ used = [] }) {
    const [copied, setCopied] = useState(null);

    const copy = async (key) => {
        const token = `{{${key}}}`;
        try {
            await navigator.clipboard.writeText(token);
            setCopied(key);
            setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
        } catch {
            // Clipboard is permission-gated and blocked outside secure contexts;
            // prompt() still lets the author copy by hand rather than dead-ending.
            window.prompt("Copy this merge field:", token);
        }
    };

    const unknown = used.filter((k) => !SUGGESTED.includes(k));

    return (
        <div className="border rounded p-2 mb-2 bg-light">
            <div className="d-flex flex-wrap align-items-center gap-1">
                <span className="small text-muted me-1">Merge fields — click to copy:</span>
                {SUGGESTED.map((k) => (
                    <button key={k} type="button"
                        className={`btn btn-sm py-0 px-2 ${used.includes(k) ? "btn-primary" : "btn-outline-secondary"}`}
                        title={used.includes(k) ? "Used in this template" : "Not used yet"}
                        onClick={() => copy(k)}>
                        {copied === k ? "copied" : `{{${k}}}`}
                    </button>
                ))}
            </div>

            {unknown.length > 0 && (
                <div className="small text-muted mt-2">
                    Also used, outside the suggested set:{" "}
                    {unknown.map((k) => <code key={k} className="me-2">{`{{${k}}}`}</code>)}
                    <span className="d-block mt-1">
                        The audience must supply these, or they render empty.
                    </span>
                </div>
            )}
        </div>
    );
}
