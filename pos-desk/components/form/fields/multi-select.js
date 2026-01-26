export default function MultiSelect({ entity, label, name, collection = [], formatDisplay = function (item) { return item.name ?? '' }, onSupplierChange = function () { } }) {

    const handleSelectionChange = (e) => {
        // Ensure entity[name] exists and is an array
        if (!Array.isArray(entity[name])) {
            entity[name] = [];
        }

        const selectedOptions = Array.from(e.target.selectedOptions, option => {
            // Find by documentId or fallback to id; compare as strings
            return collection.find(s => String(s.documentId ?? s.id) === String(option.value));
        }).filter(Boolean);

        // mark all existing as disconnected by default
        const clist = entity[name];
        if (Array.isArray(clist)) {
            clist.forEach(n => { n.disconnect = true; });

            // mark selected options as connected (disconnect = false)
            selectedOptions.forEach(n => { n.disconnect = false; });

            // find attachments that are selected but not currently present in clist
            const attachs = selectedOptions.filter(n =>
                clist.findIndex(a => String(a.documentId ?? a.id) === String(n.documentId ?? n.id)) < 0
            );

            if (attachs.length > 0) {
                clist.push(...attachs);
            }
        } else {
            // fallback: store selectedOptions array
            entity[name] = selectedOptions;
        }
    };

    const valueArray = (Array.isArray(entity[name]) ? entity[name] : [])
        .filter(f => !f.disconnect)
        .map(s => String(s.documentId ?? s.id));

    return (
        <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                {label}
            </label>
            <select
                multiple
                name={name}
                value={valueArray}
                onChange={handleSelectionChange}
                style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    height: '100px'
                }}
            >
                {collection.map(item => (
                    <option key={String(item.documentId ?? item.id)} value={String(item.documentId ?? item.id)}>
                        {formatDisplay(item)}
                    </option>
                ))}
            </select>
            <small style={{ color: 'black' }}>Hold Ctrl/Cmd to select multiple {label}</small>
        </div>
    )
}