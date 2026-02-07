import { useAuth } from "../context/AuthContext";
import dynamic from 'next/dynamic';

export function PermissionCheck({ required, has, children }) {

    const { permissions } = useAuth();
    function findMissing(requiredString) {
        if (!requiredString) return [];
        const userPerms = permissions || []; 
        
        const requiredArray = requiredString.split(',').map(s => s.trim());
        const missing = requiredArray.filter(p => !userPerms.includes(p));
        return missing;
    }
    if (required) {
        const miss = findMissing(required);
        if (miss.length > 0) {
            console.log("permission check miss ",miss);
            return <p style={{ color: "crimson", fontWeight: 600 }}>
                Access Denied — missing permission: {miss.length} Required {required}
                {miss.map((perm, i) => {
                    return <span key={i} className="badge bg-danger ms-1">{perm}</span>;
                })}
                <button style={{ marginLeft: 10 }} onClick={() => {
                    window.history.back();
                }}>Back</button>
            </p>

        }
    } else if (has) {
        const miss = findMissing(has);
        if (miss.length > 0) {
            return '';
        }
    } else {
        return <p style={{ color: "crimson", fontWeight: 600 }}>Access Denied —PermissionChek has no required or requested has permission </p>;
    }
    return children;
}


export default dynamic(() => Promise.resolve(PermissionCheck), { ssr: false });