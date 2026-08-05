import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { NotificationsEndpoints } from "@rutba/api-provider/endpoints";

const POLL_MS = 60000;

function timeAgo(iso) {
    if (!iso) return "";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/**
 * NotificationBell — in-app notification center. Polls the caller's own
 * notifications (api::notification.notification via /notifications/me) and
 * shows an unread-count badge + dropdown list. Renders nothing when logged
 * out. Drop into Topbar so every app gets it for free.
 */
export default function NotificationBell() {
    const { user, jwt } = useAuth();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!jwt) return undefined;
        let alive = true;
        async function load() {
            setLoading(true);
            try {
                const res = await NotificationsEndpoints.listMine({ limit: 20 });
                if (alive) setItems(res?.data || []);
            } catch (err) {
                console.error("Failed to load notifications", err);
            } finally {
                if (alive) setLoading(false);
            }
        }
        load();
        const interval = setInterval(load, POLL_MS);
        return () => { alive = false; clearInterval(interval); };
    }, [jwt]);

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onClickOutside);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    if (!user) return null;

    const unreadCount = items.filter((n) => !n.is_read).length;

    async function markRead(n) {
        if (n.is_read) return;
        setItems((prev) => prev.map((x) => (x.documentId === n.documentId ? { ...x, is_read: true } : x)));
        try {
            await NotificationsEndpoints.markAsRead(n.documentId);
        } catch (err) {
            console.error("Failed to mark notification read", err);
        }
    }

    return (
        <div className="nav-item dropdown notification-bell" ref={wrapRef}>
            <button
                type="button"
                className={`nav-link dropdown-toggle d-inline-flex align-items-center position-relative${open ? ' show' : ''}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                title="Notifications"
            >
                <i className="fa-solid fa-bell"></i>
                {unreadCount > 0 && (
                    <span className="badge rounded-pill bg-danger position-absolute" style={{ top: 0, right: 0, fontSize: "0.6rem" }}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>
            <div
                className={`dropdown-menu dropdown-menu-end notification-bell-menu${open ? ' show' : ''}`}
                style={{ minWidth: 340, maxHeight: 420, overflowY: "auto" }}
            >
                <div className="dropdown-header d-flex align-items-center justify-content-between">
                    <span className="text-uppercase small fw-semibold">Notifications</span>
                    {unreadCount > 0 && <span className="badge bg-danger">{unreadCount} new</span>}
                </div>
                <hr className="dropdown-divider" />
                {loading && items.length === 0 && <div className="px-3 py-2 small text-muted">Loading…</div>}
                {!loading && items.length === 0 && <div className="px-3 py-2 small text-muted">No notifications yet.</div>}
                {items.map((n) => (
                    <button
                        key={n.id}
                        type="button"
                        className={`dropdown-item py-2 ${n.is_read ? "" : "fw-semibold"}`}
                        onClick={() => markRead(n)}
                    >
                        <div className="d-flex justify-content-between gap-2">
                            <span className="text-truncate">{n.title}</span>
                            {!n.is_read && <span className="badge bg-primary align-self-start" style={{ fontSize: "0.55rem" }}>new</span>}
                        </div>
                        <div className="small text-muted text-truncate">{n.message}</div>
                        <div className="small text-muted">{timeAgo(n.createdAt)}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}
