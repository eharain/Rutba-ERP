import { useEffect, useState } from "react";
import Topbar from "@rutba/pos-shared/components/Topbar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SiteSettingEndpoints } from "@rutba/api-provider/endpoints";

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
            alt="Rutba CMS"
            style={{ height: 28, objectFit: "contain" }}
        />
    ) : (
        <>
            <i className="fa-solid fa-feather-pointed text-warning"></i>
            <span>Rutba CMS</span>
        </>
    );

    return <Topbar currentApp="cms" brand={brand} />;
}
