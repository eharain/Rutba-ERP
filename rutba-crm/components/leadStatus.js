export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];

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
