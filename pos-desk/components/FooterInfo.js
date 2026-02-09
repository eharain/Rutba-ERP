import dynamic from "next/dynamic";
import { useUtil } from "../context/UtilContext";
import { useEffect, useState } from "react";
function FooterInfo() {
    const [location, setLocation] = useState("");
    const { locationString, branch, desk } = useUtil();
    useEffect(() => {
        setLocation(locationString())
      
    }, [branch, desk]);


    return (
        <footer className="bg-dark text-white text-center py-3">
            {location ?? (
                <p>
                    System will not work unless The Store Location and Desk are selected in <a href='/settings/>'>Settings</a>.
                </p>
            )}
        </footer>
    );
}

// Disable server-side rendering for FooterInfo
export default dynamic(() => Promise.resolve(FooterInfo), { ssr: false });