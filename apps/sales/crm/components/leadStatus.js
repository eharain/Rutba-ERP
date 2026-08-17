import { useEnumValues } from "@rutba/pos-shared/lib/use-enum-values";

/**
 * Lead statuses come from the schema via /enums/crm-lead/status — there is
 * deliberately no exported constant list here. A local copy drifts silently
 * the moment someone adds a status to the content-type, and the CRM segment
 * builder already reads the same route for its enum-typed filters.
 *
 * Returns `{ statuses, loading }`. `statuses` is `[]` until the fetch lands,
 * so callers that render one column per status simply render none for a beat.
 */
export function useLeadStatuses() {
    const { values, loading } = useEnumValues("crm-lead", "status");
    return { statuses: values || [], loading };
}

/**
 * Statuses that still count as an open pipeline. Derived from the live enum
 * by exclusion so a newly added status is treated as open by default — the
 * safe direction, since a new stage is far more likely to be a mid-pipeline
 * step than a terminal one.
 */
const CLOSED = new Set(["Won", "Lost"]);

export function isOpenStatus(status) {
    return !CLOSED.has(status || "New");
}

// Colour is presentation, not data — an unknown status just falls through to
// the neutral default rather than breaking the page.
export function leadStatusColor(status) {
    switch (status) {
        case "Qualified": return "success";
        case "Contacted": return "info";
        case "Lost": return "danger";
        case "Negotiation": return "warning";
        case "Won": return "success";
        case "New": return "primary";
        default: return "secondary";
    }
}
