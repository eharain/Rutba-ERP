import SharedSidebar from "@rutba/pos-shared/components/Sidebar";

const SECTIONS = [
    { href: "/posts",    label: "Posts",    icon: "fa-pen-to-square" },
    { href: "/replies",  label: "Replies",  icon: "fa-reply" },
    { href: "/accounts", label: "Accounts", icon: "fa-share-nodes" },
    { href: "/media",    label: "Media",    icon: "fa-photo-film" },
];

export default function Sidebar() {
    return <SharedSidebar sections={SECTIONS} storageKey="rutba-social-sidebar-pinned" />;
}
