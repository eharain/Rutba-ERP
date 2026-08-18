import { useEffect } from "react";
import Topbar from "@rutba/shared/components/Topbar";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { getBranch } from "@rutba/shared/lib/utils";

const SECONDARY = [
    { href: "/new/product-edit", label: "Product",  icon: "fa-tag",            variant: "primary" },
    { href: "/new/purchase",     label: "Purchase", icon: "fa-cart-shopping",  variant: "info" },
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
            currentApp="stock"
            appName="Rutba Stock"
            secondaryLabel="Create"
            secondary={SECONDARY}
            brand={<i className="fa-solid fa-warehouse text-warning"></i>}
        />
    );
}
