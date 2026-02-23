import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useEffect, useState } from "react";
import AppSwitcher from "./AppSwitcher";

function FooterInfo({ currentApp }) {
    const [location, setLocation] = useState("");
    const { locationString, branch, desk } = useUtil();
    useEffect(() => {
        setLocation(locationString())

    }, [branch, desk]);


    return (
        <footer className="bg-dark text-white py-2 px-3 d-flex align-items-center justify-content-between">
            <span className="small text-muted">
                {location || (
                    <span>
                        Select location in <a href='/settings' className="text-warning">Settings</a>
                    </span>
                )}
            </span>
            <AppSwitcher currentApp={currentApp} />
        </footer>
    );
}

// Disable server-side rendering for FooterInfo
export default dynamic(() => Promise.resolve(FooterInfo), { ssr: false });