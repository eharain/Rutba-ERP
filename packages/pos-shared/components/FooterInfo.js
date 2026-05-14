import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { getCrossAppLinks, APP_URLS } from "../lib/roles";

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

    // Public storefront — not gated by appAccess, always shown
    const webHref = APP_URLS.web;
    const showWeb = Boolean(webHref) && currentApp !== 'web';

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

            {(apps.length > 0 || showWeb) && (
                <ul className="footer-info-apps">
                    {showWeb && (
                        <li>
                            <a
                                href={webHref}
                                className="footer-info-app text-info"
                                title="Storefront"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <i className="fa-solid fa-globe"></i>
                                <span>Storefront</span>
                            </a>
                        </li>
                    )}
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
