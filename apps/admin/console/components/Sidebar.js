import SharedSidebar from "@rutba/shared/components/Sidebar";

// The tenant's admin console, grown out of the rutba-users carve-out. Sections
// land per the admin-console program (docs/todo/admin-console-program/): app
// catalogue, integrations and notifications join the four below.
const SECTIONS = [
    { href: "/users", label: "Users", icon: "fa-users" },
    { href: "/users/access-assignment", label: "Access Assignment", icon: "fa-user-shield" },
    { href: "/app-domains", label: "App Domains", icon: "fa-key" },
    // One row per app, resolved by app slug. The storefront's row is `web` —
    // that is where its GA / GTM / Pixel ids have to go to have any effect.
    { href: "/site-settings", label: "Site Settings", icon: "fa-sliders" },
    { href: "/mailboxes", label: "Mailboxes", icon: "fa-envelope" },
    { href: "/email-servers", label: "Email Servers", icon: "fa-server" },
    // Integrations. apps/content/social keeps read-only views of both; connecting,
    // editing and deleting live here — enforced by apps: ['admin'] on the
    // write methods of the social-accounts / social-relay-providers descriptors.
    { href: "/social-accounts", label: "Social Accounts", icon: "fa-share-nodes" },
    // "Social" is load-bearing in the label: relays come in three kinds and
    // only this one is a pluggable registry. Email relaying is Rutba-MTA, a
    // single instance pinned by MTA_BASE_URL (with per-sender identities in
    // Campaigns → Settings); SMS providers do not exist yet.
    { href: "/social-relays", label: "Social Relay Providers", icon: "fa-tower-broadcast" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="apps/admin/console-sidebar-pinned" />;
}
