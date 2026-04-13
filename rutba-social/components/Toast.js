import { useState, useCallback, useRef } from "react";

/**
 * useToast – lightweight inline toast for Social pages.
 *
 * Usage:
 *   const { toast, ToastContainer } = useToast();
 *   toast("Saved!", "success");   // or "danger", "warning", "info"
 *   // render <ToastContainer /> once in your JSX
 */
export function useToast() {
    const [messages, setMessages] = useState([]);
    const idRef = useRef(0);

    const toast = useCallback((text, variant = "success", duration = 3000) => {
        const id = ++idRef.current;
        setMessages((prev) => [...prev, { id, text, variant }]);
        setTimeout(() => {
            setMessages((prev) => prev.filter((m) => m.id !== id));
        }, duration);
    }, []);

    const ToastContainer = useCallback(
        () => (
            <div
                style={{
                    position: "fixed",
                    top: 16,
                    right: 16,
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxWidth: 360,
                }}
            >
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`alert alert-${m.variant} alert-dismissible fade show mb-0 py-2 px-3 shadow-sm`}
                        role="alert"
                    >
                        {m.text}
                        <button
                            type="button"
                            className="btn-close btn-close-sm"
                            onClick={() => setMessages((prev) => prev.filter((x) => x.id !== m.id))}
                        />
                    </div>
                ))}
            </div>
        ),
        [messages]
    );

    return { toast, ToastContainer };
}
