import { useEffect, useRef } from "react";

// The app's global key handling — one document listener, one guard.
//
// The guard is the whole point: a shortcut must never fire while the user is
// typing. That means inputs, textareas, selects, and the contentEditable body
// of the composer. RecipientInput already does this locally for its own
// dropdown keys; this is the same discipline lifted to the page.
//
// Modifier chords are deliberately NOT routed here. Ctrl/Cmd+Enter (send) and
// Escape (close) belong to the composer, which owns them on its own form so
// they keep working while the user is typing — exactly where these don't.

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTyping(target) {
    if (!target || typeof target !== "object") return false;
    if (TYPING_TAGS.has(target.tagName)) return true;
    return Boolean(target.isContentEditable);
}

/**
 * @param {Record<string, (e: KeyboardEvent) => void>} handlers keyed by KeyboardEvent.key
 * @param {{enabled?: boolean}} [options]
 */
export function useShortcuts(handlers, { enabled = true } = {}) {
    // Handlers close over state and are rebuilt every render; holding them in
    // a ref keeps the listener attached once instead of re-binding constantly.
    const latest = useRef(handlers);
    latest.current = handlers;

    useEffect(() => {
        if (!enabled) return undefined;
        const onKeyDown = (e) => {
            if (e.defaultPrevented || isTyping(e.target)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const fn = latest.current?.[e.key];
            if (typeof fn !== "function") return;
            e.preventDefault();
            fn(e);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [enabled]);
}

const KEYS = [
    ["j / k", "Move down / up the list"],
    ["Enter", "Open the selected message"],
    ["u", "Back to the list (close the reading pane)"],
    ["r", "Reply"],
    ["a", "Reply all"],
    ["f", "Forward"],
    ["e", "Archive"],
    ["s", "Toggle flag"],
    ["#", "Delete"],
    ["m", "Toggle read / unread"],
    ["c", "Compose"],
    ["/", "Search this folder"],
    ["Ctrl / ⌘ + Enter", "Send (in the composer)"],
    ["Esc", "Close the composer"],
    ["?", "This list"],
];

/** The `?` overlay — shortcuts nobody can use are shortcuts nobody knows. */
export function ShortcutHelp({ onClose }) {
    return (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
            style={{ background: "rgba(0,0,0,.45)", zIndex: 1080 }} role="dialog" onClick={onClose}>
            <div className="card shadow-lg" style={{ width: "min(28rem, 92vw)" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <strong><i className="fa-solid fa-keyboard me-2"></i>Keyboard shortcuts</strong>
                    <button type="button" className="btn-close" onClick={onClose}></button>
                </div>
                <div className="card-body py-2">
                    <table className="table table-sm mb-0">
                        <tbody>
                            {KEYS.map(([key, what]) => (
                                <tr key={key}>
                                    <td className="text-nowrap" style={{ width: "9rem" }}><kbd>{key}</kbd></td>
                                    <td className="small">{what}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
