import { useEffect } from "react";
import Topbar from "@rutba/pos-shared/components/Topbar";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getBranch } from "@rutba/pos-shared/lib/utils";

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
            brand={<>
                <i className="fa-solid fa-cash-register text-warning"></i>
                <span>Rutba POS</span>
            </>}
        />
    );
}
