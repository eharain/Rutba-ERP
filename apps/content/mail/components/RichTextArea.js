import { useEffect, useRef } from "react";

// Dependency-free rich-text editor for compose: contentEditable + a small
// toolbar. Deliberately NOT a full editor framework — bold/italic/lists/
// links cover the one-to-one mail register, and the produced HTML goes
// through the server-side sanitizer on send anyway. Uncontrolled by design:
// the DOM owns the text; `value` is only applied when it CHANGES from
// outside (snippet insert, reply prefill), so typing never fights React.

const BTNS = [
    ["bold", "fa-bold", "Bold"],
    ["italic", "fa-italic", "Italic"],
    ["underline", "fa-underline", "Underline"],
    ["insertUnorderedList", "fa-list-ul", "Bullet list"],
    ["insertOrderedList", "fa-list-ol", "Numbered list"],
];

export default function RichTextArea({ value, onChange, minHeight = "10rem" }) {
    const ref = useRef(null);
    const lastEmitted = useRef(null);

    useEffect(() => {
        if (!ref.current) return;
        if (value !== lastEmitted.current && value !== ref.current.innerHTML) {
            ref.current.innerHTML = value || "";
        }
    }, [value]);

    const emit = () => {
        const html = ref.current?.innerHTML || "";
        lastEmitted.current = html;
        onChange(html);
    };

    const exec = (command) => {
        ref.current?.focus();
        document.execCommand(command);
        emit();
    };

    const addLink = () => {
        const url = window.prompt("Link URL (https://…)");
        if (!url) return;
        ref.current?.focus();
        document.execCommand("createLink", false, url);
        emit();
    };

    return (
        <div className="border rounded">
            <div className="d-flex gap-1 border-bottom px-1 py-1 bg-light rounded-top">
                {BTNS.map(([cmd, icon, title]) => (
                    <button key={cmd} type="button" className="btn btn-sm btn-outline-secondary border-0"
                        title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => exec(cmd)}>
                        <i className={`fa-solid ${icon}`}></i>
                    </button>
                ))}
                <button type="button" className="btn btn-sm btn-outline-secondary border-0" title="Insert link"
                    onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
                    <i className="fa-solid fa-link"></i>
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary border-0" title="Clear formatting"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => exec("removeFormat")}>
                    <i className="fa-solid fa-text-slash"></i>
                </button>
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                className="px-2 py-2"
                style={{ minHeight, outline: "none", overflowY: "auto", maxHeight: "24rem" }}
                onInput={emit}
                onBlur={emit}
            />
        </div>
    );
}
