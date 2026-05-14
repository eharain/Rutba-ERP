import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/sale-orders", label: "My Orders",      variant: "primary" },
    { href: "/returns",     label: "Request Return", variant: "warning" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="web-user"
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-user text-warning"></i>
                <span>Rutba Web Orders</span>
            </>}
        />
    );
}
