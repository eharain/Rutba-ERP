const PLATFORMS = {
    instagram: { label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#E1306C' },
    facebook:  { label: 'Facebook',  icon: 'fa-brands fa-facebook',  color: '#1877F2' },
    x:         { label: 'X',         icon: 'fa-brands fa-x-twitter', color: '#000000' },
    tiktok:    { label: 'TikTok',    icon: 'fa-brands fa-tiktok',    color: '#010101' },
    youtube:   { label: 'YouTube',   icon: 'fa-brands fa-youtube',   color: '#FF0000' },
};

export default PLATFORMS;

export function PlatformBadge({ platform }) {
    const p = PLATFORMS[platform];
    if (!p) return <span className="badge bg-secondary">{platform}</span>;
    return (
        <span className="badge me-1" style={{ backgroundColor: p.color, color: '#fff' }}>
            <i className={`${p.icon} me-1`}></i>{p.label}
        </span>
    );
}

export function PlatformIcon({ platform, size = 16 }) {
    const p = PLATFORMS[platform];
    if (!p) return null;
    return <i className={p.icon} style={{ color: p.color, fontSize: size }} title={p.label}></i>;
}
