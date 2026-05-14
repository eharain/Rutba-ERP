import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="hr"
            brand={<>
                <i className="fa-solid fa-users text-warning"></i>
                <span>Rutba HR</span>
            </>}
        />
    );
}
