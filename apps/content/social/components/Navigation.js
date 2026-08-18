import Topbar from "@rutba/shared/components/Topbar";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { isAppAdmin, isActiveAdminRole } from "@rutba/shared/lib/roles";
import { getAppName } from "@rutba/api-provider/lib/api";

// Accounts and Relays hold platform/aggregator API keys — admin-only pages
// (PermissionCheck adminOnly inside), so non-admins don't get dead links.
const SECONDARY = [
    { href: "/posts",    label: "Posts",    variant: "primary" },
    { href: "/posts/video-studio", label: "Video Studio", variant: "warning" },
    { href: "/videos",   label: "Videos",   variant: "danger" },
    { href: "/audio",    label: "Audio",    variant: "info" },
    { href: "/products", label: "Products", variant: "success" },
    { href: "/replies",  label: "Replies",  variant: "info" },
    { href: "/accounts", label: "Accounts", variant: "secondary", adminOnly: true },
    { href: "/media",    label: "Media",    variant: "dark" },
];

export default function Navigation() {
    const { adminAppAccess, activeRoleKey } = useAuth();
    const isAdmin = activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, getAppName());
    const secondary = SECONDARY.filter((s) => !s.adminOnly || isAdmin);
    return (
        <Topbar
            currentApp="social"
            appName="Rutba Social"
            secondary={secondary}
            brand={<i className="fa-solid fa-hashtag text-warning"></i>}
        />
    );
}
