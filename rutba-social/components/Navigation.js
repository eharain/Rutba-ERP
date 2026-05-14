import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="social"
            brand={<>
                <i className="fa-solid fa-hashtag text-warning"></i>
                <span>Rutba Social</span>
            </>}
        />
    );
}
