import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomePill, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

// Landing page for Rutba Campaigns.
//
// Phase 0 is the foundation: content types, api-pro descriptors, the MTA
// client and the sending-identity lifecycle. Sending itself is MTA's job
// (suppression, per-domain reputation pacing, bounce capture, unsubscribe) —
// this app is the tenant UI and the template / audience / campaign store over
// it. Tiles say plainly what is live and what is not.
const SECTIONS = [
    {
        icon: "fa-gear", tone: "secondary",
        title: "Settings & Sending Identity",
        text: "Register a sender with MTA, check the connection, rotate its trust token.",
        href: "/settings", state: "live",
    },
    {
        icon: "fa-file-lines", tone: "info",
        title: "Template Studio",
        text: "Drag-drop email authoring with merge fields and inlined CSS. Phase 1.",
        state: "next",
    },
    {
        icon: "fa-users-rectangle", tone: "success",
        title: "Audiences",
        text: "CSV lists and saved filters over CRM contacts and customers, with merge-field mapping. Phase 2.",
        state: "next",
    },
    {
        icon: "fa-paper-plane", tone: "warning",
        title: "Campaign Composer",
        text: "Template + audience + schedule, with a test send before it goes out. Phase 2.",
        state: "next",
    },
    {
        icon: "fa-chart-line", tone: "danger",
        title: "Delivery Reporting",
        text: "Per-run counters and per-recipient drill-down, fed by MTA delivery webhooks. Phase 3.",
        state: "next",
    },
    {
        icon: "fa-eye", tone: "primary",
        title: "Open & Click Tracking",
        text: "Not built anywhere yet — MTA puts tracking beyond action tokens out of scope. Phase 4 decision.",
        state: "later",
    },
];

const PILL = {
    live:  { kind: "live", icon: "fa-circle-check", label: "Live" },
    next:  { kind: "soon", icon: "fa-clock",        label: "Coming soon" },
    later: { kind: "soon", icon: "fa-pause",        label: "Not scheduled" },
};

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="campaigns"
                    eyebrow="Channels"
                    title="Campaigns"
                    subtitle="Email marketing over MTA — templates, audiences, campaigns and delivery reporting. The MTA owns sending, suppression and reputation; this app owns everything it deliberately doesn't."
                    actions={
                        <Link href="/settings" className="btn btn-accent">
                            <i className="fa-solid fa-gear me-2"></i>Settings
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Campaigns" />
                    <AppHomeGrid>
                        {SECTIONS.map((s) => {
                            const pill = PILL[s.state];
                            return (
                                <AppHomeTile
                                    key={s.title}
                                    href={s.href}
                                    icon={s.icon}
                                    tone={s.tone}
                                    title={s.title}
                                    text={s.text}
                                    disabled={!s.href}
                                    badge={
                                        <AppHomePill kind={pill.kind} icon={pill.icon}>
                                            {pill.label}
                                        </AppHomePill>
                                    }
                                />
                            );
                        })}
                    </AppHomeGrid>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
