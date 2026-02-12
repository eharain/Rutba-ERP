import { useState, useEffect } from "react";

export default function SearchBar({ value, onChange, delay = 500 }) {
    const [internalValue, setInternalValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            onChange(internalValue);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [internalValue, delay, onChange]);

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
