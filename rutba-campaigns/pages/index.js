import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

// Landing dashboard for Rutba Campaigns.
//
// Phase 0 is the foundation: content types, api-pro descriptors, the Rutba-MTA
// client and the sending-identity lifecycle. Sending itself is Rutba-MTA's job
// (suppression, per-domain reputation pacing, bounce capture, unsubscribe) —
// this app is the tenant UI and the template / audience / campaign store over
// it. Cards say plainly what is live and what is not.
const FEATURES = [
    {
        icon: "fa-gear", border: "border-secondary", color: "text-secondary",
        title: "Settings & Sending Identity",
        desc: "Register a sender with Rutba-MTA, check the connection, rotate its trust token.",
        href: "/settings", state: "live",
    },
    {
        icon: "fa-file-lines", border: "border-info", color: "text-info",
        title: "Template Studio",
        desc: "Drag-drop email authoring with merge fields and inlined CSS. Phase 1.",
        state: "next",
    },
    {
        icon: "fa-users-rectangle", border: "border-success", color: "text-success",
        title: "Audiences",
        desc: "CSV lists and saved filters over CRM contacts and customers, with merge-field mapping. Phase 2.",
        state: "next",
    },
    {
        icon: "fa-paper-plane", border: "border-warning", color: "text-warning",
        title: "Campaign Composer",
        desc: "Template + audience + schedule, with a test send before it goes out. Phase 2.",
        state: "next",
    },
    {
        icon: "fa-chart-line", border: "border-danger", color: "text-danger",
        title: "Delivery Reporting",
        desc: "Per-run counters and per-recipient drill-down, fed by MTA delivery webhooks. Phase 3.",
        state: "next",
    },
    {
        icon: "fa-eye", border: "border-primary", color: "text-primary",
        title: "Open & Click Tracking",
        desc: "Not built anywhere yet — Rutba-MTA puts tracking beyond action tokens out of scope. Phase 4 decision.",
        state: "later",
    },
];

const BADGE = {
    live: { cls: "bg-success", label: "Live" },
    next: { cls: "bg-light text-muted border", label: "Coming soon" },
    later: { cls: "bg-light text-muted border", label: "Not scheduled" },
};

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Campaigns ✉️</h2>
                <p className="text-muted mb-4">
                    Email marketing over Rutba-MTA — templates, audiences, campaigns and
                    delivery reporting. The MTA owns sending, suppression and reputation;
                    this app owns everything it deliberately doesn&apos;t.
                </p>

                <div className="row g-3">
                    {FEATURES.map((f) => (
                        <div className="col-md-4" key={f.title}>
                            <div className={`card ${f.border} h-100`}>
                                <div className="card-body">
                                    <h5 className="card-title">
                                        <i className={`fas ${f.icon} me-2 ${f.color}`}></i>{f.title}
                                    </h5>
                                    <p className="card-text text-muted">{f.desc}</p>
                                    {f.href ? (
                                        <Link className="btn btn-outline-primary btn-sm" href={f.href}>Open</Link>
                                    ) : (
                                        <span className={`badge ${BADGE[f.state].cls}`}>{BADGE[f.state].label}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
