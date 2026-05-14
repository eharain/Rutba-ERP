import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/delivery-offers", label: "Open Offers",       variant: "primary" },
    { href: "/deliveries",      label: "Active Deliveries", variant: "success" },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="rider"
            showRoleSwitcher={false}
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-motorcycle text-warning"></i>
                <span>Rutba Rider</span>
            </>}
        />
    );
}
