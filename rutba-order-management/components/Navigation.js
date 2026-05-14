import { useEffect, useState } from "react";
import Topbar from "@rutba/pos-shared/components/Topbar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SiteSettingEndpoints } from "@rutba/api-provider/endpoints/index.js";

export default function Navigation() {
    const { jwt } = useAuth();
    const [siteLogo, setSiteLogo] = useState(null);

    useEffect(() => {
        if (!jwt) return;
        SiteSettingEndpoints.fetchDraft({ populate: ["site_logo"] })
            .then(res => {
                const logo = (res.data || res)?.site_logo;
                if (logo?.url) setSiteLogo(logo);
            })
            .catch(() => {});
    }, [jwt]);

    const brand = siteLogo?.url ? (
        <img
            src={MediaUtilsEndpoints.imageBaseUrl() + siteLogo.url}
            alt="Order Management"
            style={{ height: 28, objectFit: "contain" }}
        />
    ) : (
        <>
            <i className="fa-solid fa-shopping-bag text-warning"></i>
            <span>Order Management</span>
        </>
    );

    return <Topbar currentApp="order-management" brand={brand} />;
}
