export function MultiSelect({ entity, label, name, collection, fomatDisplay = function (item) { return item.name }, onSupplierChange = function () { } }) {

    const handleSelectionChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => collection.find(s => s.documentId == option.value));

        console.log('Selected options:', selectedOptions);
        console.log('Selected entity[name]:', entity[name]);
        console.log("e", e)

        const clist = entity[name];
        if (Array.isArray(clist)) {
            clist.forEach(n => { n.disconnect = true })
            selectedOptions.forEach(n => { n.disconnect = false })
            const attachs = selectedOptions.filter(n => clist.findIndex(a => a.id == n.id) < 0)
            clist.push(...attachs);

        } else {
            selectedOptions.forEach(n => { n.disconnect = false })
            entity[name] = selectedOptions;
        }
    };

    return (
        <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>
                {label}
            </label>
            <select
                multiple
                name={name}
                value={entity[name].filter(f => !f.disconnect).map(s => s.documentId)}
                onChange={handleSelectionChange}
                style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    height: '100px'
                }}
            >
                {collection.filter(f => !f.disconnect).map(supplier => (
                    <option key={supplier.documentId} value={supplier.documentId}>
                        {fomatDisplay(supplier)}
                    </option>
                ))}
            </select>
            <small style={{ color: 'black' }}>Hold Ctrl/Cmd to select multiple {label}</small>
        </div>
    )
}

export default MultiSelect;