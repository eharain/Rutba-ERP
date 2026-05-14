import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { getCrossAppLinks } from "../lib/roles";

function FooterInfo({ currentApp }) {
    const [location, setLocation] = useState("");
    const { locationString, branch, desk } = useUtil();
    const { appAccess, adminAppAccess } = useAuth();

    useEffect(() => {
        setLocation(locationString());
    }, [branch, desk]);

    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];
    const apps = getCrossAppLinks(effectiveAccess, currentApp)
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));

    return (
        <footer className="footer-info">
            <span className="footer-info-location">
                {location || (
                    <span>
                        <i className="fa-solid fa-location-dot me-1"></i>
                        No branch/desk selected — set in <a href='/settings' className="text-warning">Settings</a>
                    </span>
                )}
            </span>

            {apps.length > 0 && (
                <ul className="footer-info-apps">
                    {apps.map((app) => (
                        <li key={app.key}>
                            <a
                                href={app.href}
                                className={`footer-info-app ${app.color || ''}`}
                                title={app.label}
                            >
                                <i className={app.icon}></i>
                                <span>{app.label}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </footer>
    );
}

export default dynamic(() => Promise.resolve(FooterInfo), { ssr: false });
