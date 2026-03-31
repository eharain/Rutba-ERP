import { useState, useEffect, useRef } from "react";

export default function SearchBar({ value, onChange, delay = 500 }) {
    const [internalValue, setInternalValue] = useState(value);
    const onChangeRef = useRef(onChange);
    const lastReportedValue = useRef(value);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (internalValue === lastReportedValue.current) return;
        const handler = setTimeout(() => {
            lastReportedValue.current = internalValue;
            onChangeRef.current(internalValue);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [internalValue, delay]);

    return (
        <input
            type="text"
            placeholder="Search or scan barcode..."
            value={internalValue}
            onChange={(e) => setInternalValue(e.target.value)}
            style={{
                padding: "8px 10px",
                width: "100%",
                marginBottom: 12,
                borderRadius: 6,
                border: "1px solid #ccc",
            }}
        />
    );
}
