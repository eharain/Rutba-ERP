import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/posts",    label: "Posts",    variant: "primary" },
    { href: "/replies",  label: "Replies",  variant: "info" },
    { href: "/accounts", label: "Accounts", variant: "secondary" },
    { href: "/media",    label: "Media",    variant: "dark" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="social"
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-hashtag text-warning"></i>
                <span>Rutba Social</span>
            </>}
        />
    );
}
