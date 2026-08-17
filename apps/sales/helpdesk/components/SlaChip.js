import { humanizeToken } from "./StatusBadge";

/**
 * The SLA chip — the most consequential signal on the queue, so it is the one
 * component that is not allowed to lean on colour (spec 38.4). Every state
 * renders a colour, an icon AND a word, plus a countdown when the ticket has a
 * real deadline.
 *
 * `state` is the materialised `sla_state` column, which the SLA sweep keeps
 * current; the countdown is computed from `dueAt` here rather than trusted from
 * the server, so a chip never claims "2h left" on a page that has been open for
 * three hours. Pass `now` from a single shared timer in the parent — one
 * interval for a 25-row page instead of 25 of them.
 */

const SLA_TOKENS = {
    ok:            { className: "bg-success",                icon: "fa-circle-check",        label: "On track" },
    at_risk:       { className: "bg-warning text-dark",      icon: "fa-triangle-exclamation", label: "At risk" },
    breached:      { className: "bg-danger",                 icon: "fa-circle-exclamation",  label: "Breached" },
    paused:        { className: "bg-secondary",              icon: "fa-circle-pause",        label: "Paused" },
    indeterminate: { className: "bg-white text-muted border", icon: "fa-circle-question",    label: "No SLA" },
};

const UNKNOWN = { className: "bg-white text-muted border", icon: "fa-circle-question" };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse, two-unit duration: "3d 4h", "5h 12m", "40m", "<1m". */
export function formatDuration(ms) {
    const abs = Math.abs(ms);
    if (abs < MINUTE) return "<1m";
    if (abs < HOUR) return `${Math.floor(abs / MINUTE)}m`;
    if (abs < DAY) {
        const h = Math.floor(abs / HOUR);
        const m = Math.floor((abs % HOUR) / MINUTE);
        return m ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(abs / DAY);
    const h = Math.floor((abs % DAY) / HOUR);
    return h ? `${d}d ${h}h` : `${d}d`;
}

/**
 * "12m ago" / "3d ago", falling back to a date past a week — a queue column
 * reading "63d ago" tells an agent less than "9 Jun". Lives here because this
 * is the module's time-formatting file; the queue and dashboard both use it.
 */
export function formatRelativeTime(value, now) {
    if (!value) return "—";
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return "—";
    const delta = (now ?? Date.now()) - then;
    if (delta < 0) return `in ${formatDuration(delta)}`;
    if (delta < 7 * DAY) return `${formatDuration(delta)} ago`;
    return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SlaChip({ state, dueAt, now, className }) {
    const token = SLA_TOKENS[state] || { ...UNKNOWN, label: humanizeToken(state) || "Unknown" };
    const at = dueAt ? new Date(dueAt).getTime() : null;
    const hasClock = Number.isFinite(at) && state !== "indeterminate";
    const remaining = hasClock ? at - (now ?? Date.now()) : null;

    // The clock is suppressed while paused: a paused SLA's due date drifts
    // forward when it resumes, so counting down against it would be a lie.
    const showClock = hasClock && state !== "paused";
    const clock = showClock
        ? (remaining >= 0 ? `${formatDuration(remaining)} left` : `${formatDuration(remaining)} over`)
        : null;

    return (
        <span
            className={`badge ${token.className} d-inline-flex align-items-center gap-1 fw-normal ${className || ""}`}
            title={at ? `${token.label} · due ${new Date(at).toLocaleString()}` : token.label}
        >
            <i className={`fa-solid ${token.icon}`} aria-hidden="true"></i>
            <span>{token.label}</span>
            {clock && <span className="opacity-75">· {clock}</span>}
        </span>
    );
}
