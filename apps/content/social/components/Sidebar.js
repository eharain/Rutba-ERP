import SharedSidebar from "@rutba/shared/components/Sidebar";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/shared/lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";

// Accounts and Relays hold platform/aggregator API keys — admin-only pages
// (PermissionCheck adminOnly inside), so non-admins don't get dead links.
const SECTIONS = [
    { href: "/posts",    label: "Posts",    icon: "fa-pen-to-square" },
    { href: "/posts/video-studio", label: "Video Studio", icon: "fa-film" },
    { href: "/videos",   label: "Videos",   icon: "fa-clapperboard" },
    { href: "/audio",    label: "Audio",    icon: "fa-music" },
    { href: "/products", label: "Products", icon: "fa-box" },
    { href: "/replies",  label: "Replies",  icon: "fa-reply" },
    // Read-only here — connecting and editing moved to the Rutba Admin console.
    // Relay providers moved there outright; this app only reads them (posts/index).
    { href: "/accounts", label: "Accounts", icon: "fa-share-nodes", adminOnly: true },
    { href: "/media",    label: "Media",    icon: "fa-photo-film" },
];

export default function Sidebar() {
    const { adminAppAccess, activeRoleKey } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, getAppName());
    const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
    return <SharedSidebar sections={sections} storageKey="apps/content/social-sidebar-pinned" />;
}
