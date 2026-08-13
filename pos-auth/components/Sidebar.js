import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

// pos-auth is the pure SSO portal — user administration moved to rutba-admin
// (APP_URLS.admin), which appears as a normal launcher card on the home page.
export default function Sidebar() {
    return <SharedSidebar sections={[]} storageKey="pos-auth-sidebar-pinned" />;
}
