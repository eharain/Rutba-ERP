/**
 * Status and priority chips.
 *
 * Spec 38.4 fixes the colour tokens. Spec 38.5 fixes the rule that matters
 * more: colour is never the sole carrier of meaning, so every chip renders an
 * icon and a word as well. Around 8% of men cannot separate the red and green
 * ends of this scale, and a queue that encodes "resolved" and "breached" in
 * colour alone is unreadable to them.
 *
 * The maps below carry ONLY colour and icon — labels are derived from the
 * token itself. A status this file has never heard of therefore still renders
 * (neutral colour, humanised label) instead of vanishing, and nothing here
 * decides which statuses exist or which a user may choose: that comes from the
 * ticket data and from /enums (see TicketFilters).
 */

const STATUS_TOKENS = {
    open:        { className: "bg-warning text-dark",       icon: "fa-circle-dot" },
    in_progress: { className: "bg-primary",                 icon: "fa-person-digging" },
    waiting:     { className: "bg-secondary",               icon: "fa-hourglass-half" },
    resolved:    { className: "bg-success",                 icon: "fa-circle-check" },
    closed:      { className: "bg-dark",                    icon: "fa-lock" },
    cancelled:   { className: "bg-light text-dark border",  icon: "fa-ban" },
    // Bootstrap ships no purple background utility; spec 38.4 calls merged
    // purple explicitly, so it is the one token that needs an inline colour.
    merged:      { className: "text-white", icon: "fa-code-merge", style: { backgroundColor: "#6f42c1" } },
};

const PRIORITY_TOKENS = {
    low:    { className: "bg-secondary",        icon: "fa-angle-down" },
    normal: { className: "bg-primary",          icon: "fa-equals" },
    high:   { className: "bg-warning text-dark", icon: "fa-angle-up" },
    urgent: { className: "bg-danger",           icon: "fa-angles-up" },
};

const UNKNOWN = { className: "bg-light text-dark border", icon: "fa-circle-question" };

export function humanizeToken(value) {
    if (value === null || value === undefined || value === "") return "";
    return String(value)
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Chip({ token, label, title, className }) {
    return (
        <span
            className={`badge ${token.className} d-inline-flex align-items-center gap-1 fw-normal ${className || ""}`}
            style={token.style}
            title={title || label}
        >
            <i className={`fa-solid ${token.icon}`} aria-hidden="true"></i>
            <span>{label}</span>
        </span>
    );
}

export default function StatusBadge({ status, className }) {
    if (!status) return <span className="text-muted">—</span>;
    return (
        <Chip
            token={STATUS_TOKENS[status] || UNKNOWN}
            label={humanizeToken(status)}
            className={className}
        />
    );
}

export function PriorityBadge({ priority, className }) {
    if (!priority) return <span className="text-muted">—</span>;
    return (
        <Chip
            token={PRIORITY_TOKENS[priority] || UNKNOWN}
            label={humanizeToken(priority)}
            title={`Priority: ${humanizeToken(priority)}`}
            className={className}
        />
    );
}
