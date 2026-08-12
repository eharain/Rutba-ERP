import SharedSidebar from "@rutba/pos-shared/components/Sidebar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/pos-shared/lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";

// Accounts and Relays hold platform/aggregator API keys — admin-only pages
// (PermissionCheck adminOnly inside), so non-admins don't get dead links.
const SECTIONS = [
    { href: "/posts",    label: "Posts",    icon: "fa-pen-to-square" },
    { href: "/posts/video-studio", label: "Video Studio", icon: "fa-film" },
    { href: "/audio",    label: "Audio",    icon: "fa-music" },
    { href: "/products", label: "Products", icon: "fa-box" },
    { href: "/replies",  label: "Replies",  icon: "fa-reply" },
    { href: "/accounts", label: "Accounts", icon: "fa-share-nodes", adminOnly: true },
    { href: "/relays",   label: "Relays",   icon: "fa-tower-broadcast", adminOnly: true },
    { href: "/media",    label: "Media",    icon: "fa-photo-film" },
];

export default function Sidebar() {
    const { adminAppAccess, activeRoleKey } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, getAppName());
    const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
    return <SharedSidebar sections={sections} storageKey="rutba-social-sidebar-pinned" />;
}
