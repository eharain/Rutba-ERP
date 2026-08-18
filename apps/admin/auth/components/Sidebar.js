import SharedSidebar from "@rutba/shared/components/Sidebar";

// apps/admin/auth is the pure SSO portal — user administration moved to apps/admin/console
// (APP_URLS.admin), which appears as a normal launcher card on the home page.
export default function Sidebar() {
    return <SharedSidebar sections={[]} storageKey="apps/admin/auth-sidebar-pinned" />;
}
