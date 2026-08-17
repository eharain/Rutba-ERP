import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="auth"
            appName="Rutba Auth"
            loginHref="/login"
            brand={<i className="fa-solid fa-shield-halved text-warning"></i>}
        />
    );
}
