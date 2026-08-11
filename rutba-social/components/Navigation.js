import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/posts",    label: "Posts",    variant: "primary" },
    { href: "/posts/video-studio", label: "Video Studio", variant: "warning" },
    { href: "/videos",   label: "Videos",   variant: "danger" },
    { href: "/audio",    label: "Audio",    variant: "info" },
    { href: "/products", label: "Products", variant: "success" },
    { href: "/replies",  label: "Replies",  variant: "info" },
    { href: "/accounts", label: "Accounts", variant: "secondary" },
    { href: "/media",    label: "Media",    variant: "dark" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="social"
            appName="Rutba Social"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-hashtag text-warning"></i>}
        />
    );
}
