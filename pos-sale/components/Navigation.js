import { useEffect } from "react";
import Topbar from "@rutba/pos-shared/components/Topbar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getBranch } from "@rutba/pos-shared/lib/utils";

const SECONDARY = [
    { href: "/new/sale",        label: "Sale",     icon: "fa-plus",          variant: "success" },
    { href: "/new/sale-return", label: "Return",   icon: "fa-rotate-left",   variant: "warning" },
    { href: "/new/sale",        label: "Exchange", icon: "fa-right-left",    variant: "info" },
];

export default function Navigation() {
    const { setCompanyName } = useAuth();
    useEffect(() => {
        try {
            setCompanyName(getBranch()?.companyName);
        } catch (e) { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Topbar
            currentApp="sale"
            secondaryLabel="Create"
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-cash-register text-warning"></i>
                <span>Rutba POS</span>
            </>}
        />
    );
}
