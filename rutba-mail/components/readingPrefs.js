import { useCallback, useEffect, useState } from "react";

// Per-person reading preferences. These are device preferences, not mailbox
// facts, so they live in localStorage rather than on the mail-account row —
// nothing here is worth a round trip or a schema column.

const MARK_READ_KEY = "rutba-mail.markReadOnOpen";

/**
 * Whether opening a message marks it read.
 *
 * The gateway PEEKs the body and sets \Seen only when asked, so this is a real
 * choice rather than a label on something that happens regardless. Default is
 * on — that is what every mail client does and what people expect; turning it
 * off gives you preview-without-marking-read.
 */
export function useMarkReadOnOpen() {
    // Starts at the default so server and first client render agree; the
    // stored value is applied after mount.
    const [markRead, setMarkRead] = useState(true);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(MARK_READ_KEY);
            if (stored !== null) setMarkRead(stored !== "false");
        } catch {
            // Private mode / blocked storage — the default stands.
        }
    }, []);

    const set = useCallback((value) => {
        setMarkRead(value);
        try {
            window.localStorage.setItem(MARK_READ_KEY, value ? "true" : "false");
        } catch {
            // Not persisting is survivable; not applying it would not be.
        }
    }, []);

    return [markRead, set];
}
