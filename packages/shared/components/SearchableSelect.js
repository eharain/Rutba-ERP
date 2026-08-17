import { Dropdown } from 'primereact/dropdown';

/**
 * A searchable select (combo-box) built on PrimeReact's Dropdown.
 *
 * Props:
 *  - value        current value (string)
 *  - onChange      called with the new value string
 *  - options       array of { value, label } objects
 *  - placeholder   placeholder when nothing is selected (default "Select…")
 *  - showClear     allow clearing the selection (default true)
 *  - className     optional extra CSS class
 *  - style         optional inline style
 *  - disabled      disable the dropdown
 */
export default function SearchableSelect({
    value,
    onChange,
    options = [],
    placeholder = 'Select…',
    showClear = true,
    className = '',
    style,
    disabled = false,
}) {
    return (
        <Dropdown
            value={value || null}
            options={options}
            optionLabel="label"
            optionValue="value"
            onChange={(e) => onChange(e.value ?? '')}
            placeholder={placeholder}
            filter
            showClear={showClear}
            className={className}
            style={{ width: '100%', ...style }}
            disabled={disabled}
        />
    );
}
