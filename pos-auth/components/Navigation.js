import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="auth"
            loginHref="/login"
            brand={<>
                <i className="fa-solid fa-shield-halved text-warning"></i>
                <span>Rutba Auth</span>
            </>}
        />
    );
}
