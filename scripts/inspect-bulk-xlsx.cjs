/* eslint-disable no-console */
// Quick inspector for the bulk-import xlsx files. Prints the _meta sheet's
// contentType, the data sheet's header row, and the first 2 rows in JSON.
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const dir = process.argv[2];
if (!dir) {
    console.error('usage: node inspect-bulk-xlsx.cjs <dir>');
    process.exit(1);
}
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx')).sort();
for (const file of files) {
    const full = path.join(dir, file);
    const wb = XLSX.readFile(full);
    const META = wb.Sheets['_meta'];
    let metaCt = '(no _meta sheet)';
    if (META) {
        const m = XLSX.utils.sheet_to_json(META, { header: 1, defval: '' });
        const r = m.find((row) => Array.isArray(row) && row[0] === 'contentType');
        if (r) metaCt = String(r[1]);
    }
    const dataSheetName = wb.SheetNames.find((n) => n !== '_meta') || wb.SheetNames[0];
    const ws = wb.Sheets[dataSheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    console.log('========================================');
    console.log('FILE :', file);
    console.log('SHEET:', dataSheetName, ' rows=', rows.length);
    console.log('META contentType:', metaCt);
    console.log('HEADERS:', headers.join(' | '));
    if (rows.length > 0) {
        const first = rows[0];
        const sample = {};
        for (const k of headers) {
            const v = first[k];
            sample[k] = typeof v === 'string' && v.length > 80 ? v.slice(0, 77) + '…' : v;
        }
        console.log('ROW 1 :', JSON.stringify(sample));
        const ctCellsDistinct = new Set();
        for (const r of rows) {
            const v = r.contentType;
            if (v !== undefined) ctCellsDistinct.add(String(v).trim());
        }
        console.log('contentType column distinct values:', [...ctCellsDistinct].join(' , ') || '(absent)');
        const publishCellsDistinct = new Set();
        for (const r of rows) {
            const v = r.publish;
            if (v !== undefined) publishCellsDistinct.add(String(v).trim());
        }
        console.log('publish column distinct values:', [...publishCellsDistinct].join(' , ') || '(absent)');
    }
}
