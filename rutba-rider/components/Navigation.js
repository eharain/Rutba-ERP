import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="rider"
            showRoleSwitcher={false}
            brand={<>
                <i className="fa-solid fa-motorcycle text-warning"></i>
                <span>Rutba Rider</span>
            </>}
        />
    );
}
