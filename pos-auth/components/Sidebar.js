import SharedSidebar from "@rutba/pos-shared/components/Sidebar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { canAccessApp } from "@rutba/pos-shared/lib/roles";

export default function Sidebar() {
    const { appAccess } = useAuth();
    const hasAuthAccess = canAccessApp(appAccess, 'auth');

    const sections = hasAuthAccess
        ? [
            { href: "/users",                   label: "Users",             icon: "fa-users" },
            { href: "/users/access-assignment", label: "Access Assignment", icon: "fa-key" },
        ]
        : [];

    return <SharedSidebar sections={sections} storageKey="pos-auth-sidebar-pinned" />;
}
