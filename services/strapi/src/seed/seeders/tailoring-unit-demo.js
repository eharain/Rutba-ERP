'use strict';

/**
 * Demo dataset for a tailoring & stitching unit — registry seeder.
 *
 * Creates a coherent manufacturing dataset through the documents API so
 * components, relations and lifecycles (stock recompute) all fire:
 *
 *   suppliers → products (raw + finished) → employees → production lines →
 *   worker profiles → operations → defect types → piece rates → BOMs →
 *   material lots → work orders → bundles → material issues → tasks →
 *   QC inspections → finished stock-items (for the completed WO).
 *
 * The numbers are hand-balanced to mirror what the state machines compute:
 * lot remaining = received - issues, WO labor = approved task amounts,
 * material = issue ledger, overhead = 10%, cost/unit = total / completed.
 *
 * Category 'demo', not essential — run it explicitly:
 *   node scripts/seed.js --only=tailoring-unit
 * Idempotent guard: aborts (returns skipped) if mfg-operations already has rows.
 *
 * @param {import('@strapi/strapi').Core.Strapi} strapi
 * @returns {Promise<{created:number, updated:number, skipped:number}>}
 */

const D = (s) => s; // date 'YYYY-MM-DD'
const T = (s) => new Date(s).toISOString(); // datetime

async function seedTailoringUnit(strapi) {
    const app = strapi;
    let created = 0;

    const doc = (uid) => app.documents(uid);
    const create = async (uid, data) => {
        try {
            const r = await doc(uid).create({ data });
            created += 1;
            return r;
        } catch (err) {
            app.log.error(`[seed:tailoring] CREATE FAILED ${uid}: ${err.message}`);
            app.log.error(JSON.stringify(data).slice(0, 400));
            throw err;
        }
    };

    // ---- guard -------------------------------------------------------------
    const existingOps = await app.db.query('api::mfg-operation.mfg-operation').count();
    if (existingOps > 0) {
        app.log.info(`[seed:tailoring] mfg_operations already has ${existingOps} rows — skipping.`);
        return { created: 0, updated: 0, skipped: 1 };
    }

    // ---- branch ------------------------------------------------------------
    const branches = await doc('api::branch.branch').findMany({ limit: 10 });
    const branch = branches.find((b) => /lehtrar/i.test(b.name || '')) || branches[0];
    if (!branch) throw new Error('No branch found — seed branches first.');

    // ---- suppliers -----------------------------------------------------------
    const supplierNames = [
        { name: 'Khan Cloth House', contact_person: 'Haji Karim Khan', phone: '0300-5551234', address: 'Moti Bazar, Rawalpindi' },
        { name: 'Madina Accessories', contact_person: 'Rana Shakeel', phone: '0321-5559876', address: 'Urdu Bazar, Rawalpindi' },
    ];
    const suppliers = {};
    for (const s of supplierNames) {
        const found = await doc('api::supplier.supplier').findMany({ filters: { name: s.name }, limit: 1 });
        suppliers[s.name] = found[0] || (await create('api::supplier.supplier', s));
    }

    // ---- products ------------------------------------------------------------
    // raw materials (bulk)
    const rawDefs = [
        { key: 'latha', name: 'Latha Fabric — Premium White', sku: 'RM-LATHA-WHT', uom: 'meter', cost: 350, supplier: 'Khan Cloth House' },
        { key: 'washwear', name: 'Wash & Wear Fabric — Sky Blue', sku: 'RM-WW-SKY', uom: 'meter', cost: 420, supplier: 'Khan Cloth House' },
        { key: 'cambric', name: 'Cotton Cambric — Black', sku: 'RM-CC-BLK', uom: 'meter', cost: 380, supplier: 'Khan Cloth House' },
        { key: 'lawn', name: 'Lawn Print — Floral', sku: 'RM-LAWN-FLR', uom: 'meter', cost: 450, supplier: 'Khan Cloth House' },
        { key: 'threadW', name: 'Sewing Thread Cone — White', sku: 'RM-THR-WHT', uom: 'cone', cost: 180, supplier: 'Madina Accessories' },
        { key: 'threadB', name: 'Sewing Thread Cone — Black', sku: 'RM-THR-BLK', uom: 'cone', cost: 180, supplier: 'Madina Accessories' },
        { key: 'buttons', name: 'Shirt Buttons 4-hole (dozen)', sku: 'RM-BTN-4H', uom: 'dozen', cost: 60, supplier: 'Madina Accessories' },
        { key: 'bukram', name: 'Bukram Interlining', sku: 'RM-BKR-01', uom: 'meter', cost: 90, supplier: 'Madina Accessories' },
        { key: 'bag', name: 'Suit Packing Bag', sku: 'RM-BAG-01', uom: 'piece', cost: 12, supplier: 'Madina Accessories' },
    ];
    const raw = {};
    for (const r of rawDefs) {
        raw[r.key] = await create('api::product.product', {
            name: r.name, sku: r.sku, kind: 'raw_material', track_mode: 'bulk',
            unit_of_measure: r.uom, cost_price: r.cost, is_active: true,
            suppliers: [suppliers[r.supplier].documentId],
            branches: [branch.documentId],
        });
    }

    // finished goods (serialized)
    const fgDefs = [
        { key: 'gskWhite', name: 'Gents Shalwar Kameez — Latha White (Stitched)', sku: 'FG-GSK-WHT', sell: 4500 },
        { key: 'gskBlue', name: 'Gents Shalwar Kameez — Wash & Wear Sky Blue (Stitched)', sku: 'FG-GSK-SKY', sell: 5200 },
        { key: 'kurta', name: 'Gents Kurta — Cotton Black (Stitched)', sku: 'FG-KURTA-BLK', sell: 3800 },
        { key: 'ladies2pc', name: 'Ladies 2-pc Lawn Suit (Stitched)', sku: 'FG-L2PC-LAWN', sell: 4200 },
        { key: 'kurti', name: 'Ladies Kurti — Lawn (Stitched)', sku: 'FG-KURTI-LAWN', sell: 2800 },
    ];
    const fg = {};
    for (const f of fgDefs) {
        fg[f.key] = await create('api::product.product', {
            name: f.name, sku: f.sku, kind: 'finished_good', track_mode: 'serialized',
            unit_of_measure: 'piece', selling_price: f.sell, is_active: true,
            branches: [branch.documentId],
        });
    }

    // ---- employees -----------------------------------------------------------
    const empDefs = [
        { key: 'saleem', name: 'Muhammad Saleem', designation: 'Production Supervisor (Master)', phone: '0301-7001001', doj: '2024-02-01' },
        { key: 'rauf', name: 'Abdul Rauf', designation: 'Cutting Master', phone: '0301-7001002', doj: '2024-03-15' },
        { key: 'imran', name: 'Imran Khalid', designation: 'Cutter', phone: '0301-7001003', doj: '2025-01-10' },
        { key: 'shahid', name: 'Shahid Mehmood', designation: 'Tailor (Gents)', phone: '0301-7001004', doj: '2024-04-01' },
        { key: 'naveed', name: 'Naveed Anjum', designation: 'Stitcher', phone: '0301-7001005', doj: '2024-09-20' },
        { key: 'rashid', name: 'Rashid Ali', designation: 'Stitcher', phone: '0301-7001006', doj: '2025-02-01' },
        { key: 'zubair', name: 'Zubair Ahmed', designation: 'Stitcher', phone: '0301-7001007', doj: '2025-06-15' },
        { key: 'bilal', name: 'Bilal Hussain', designation: 'Trainee Stitcher', phone: '0301-7001008', doj: '2026-03-01' },
        { key: 'samina', name: 'Samina Bibi', designation: 'Tailor (Ladies)', phone: '0301-7001009', doj: '2024-05-05' },
        { key: 'farzana', name: 'Farzana Kausar', designation: 'Stitcher (Ladies)', phone: '0301-7001010', doj: '2025-04-12' },
        { key: 'tariq', name: 'Tariq Javed', designation: 'Overlock / Finishing', phone: '0301-7001011', doj: '2024-06-01' },
        { key: 'asif', name: 'Muhammad Asif', designation: 'Presser (Istri)', phone: '0301-7001012', doj: '2024-08-01' },
        { key: 'nasreen', name: 'Nasreen Akhtar', designation: 'QC Inspector', phone: '0301-7001013', doj: '2024-07-01' },
        { key: 'yasir', name: 'Yasir Iqbal', designation: 'Packer', phone: '0301-7001014', doj: '2025-08-01' },
    ];
    const emp = {};
    for (const e of empDefs) {
        emp[e.key] = await create('api::hr-employee.hr-employee', {
            name: e.name, designation: e.designation, phone: e.phone,
            date_of_joining: D(e.doj), status: 'Active',
        });
    }

    // ---- production lines ------------------------------------------------------
    const unitRoot = await create('api::mfg-production-line.mfg-production-line', {
        name: 'Stitching Unit — Lehtrar Road', local_name: 'سلائی یونٹ', code: 'stitching-unit-lehtrar',
        is_active: true, branch: branch.documentId, supervisor: emp.saleem.documentId,
    });
    const lineCutting = await create('api::mfg-production-line.mfg-production-line', {
        name: 'Cutting Section', local_name: 'کٹنگ سیکشن', code: 'cutting-section',
        is_active: true, parent: unitRoot.documentId, branch: branch.documentId, supervisor: emp.rauf.documentId,
    });
    const lineGents = await create('api::mfg-production-line.mfg-production-line', {
        name: 'Line 1 — Gents', local_name: 'جینٹس لائن', code: 'line-1-gents',
        is_active: true, parent: unitRoot.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
    });
    const lineLadies = await create('api::mfg-production-line.mfg-production-line', {
        name: 'Line 2 — Ladies', local_name: 'لیڈیز لائن', code: 'line-2-ladies',
        is_active: true, parent: unitRoot.documentId, branch: branch.documentId, supervisor: emp.samina.documentId,
    });
    const lineFinish = await create('api::mfg-production-line.mfg-production-line', {
        name: 'Finishing & Packing', local_name: 'فنشنگ و پیکنگ', code: 'finishing-packing',
        is_active: true, parent: unitRoot.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
    });

    // ---- operations ------------------------------------------------------------
    const opDefs = [
        { key: 'cutting', name: 'Cutting', local: 'کٹائی', cat: 'cutting', uom: 'piece', seq: 10 },
        { key: 'overlock', name: 'Overlock', local: 'اوورلاک', cat: 'sewing', uom: 'piece', seq: 20 },
        { key: 'stitching', name: 'Stitching', local: 'سلائی', cat: 'sewing', uom: 'piece', seq: 30 },
        { key: 'buttonhole', name: 'Buttonhole & Buttons', local: 'کاج و بٹن', cat: 'finishing', uom: 'piece', seq: 40 },
        { key: 'pico', name: 'Pico / Hemming', local: 'پیکو', cat: 'finishing', uom: 'piece', seq: 50 },
        { key: 'pressing', name: 'Pressing', local: 'استری', cat: 'finishing', uom: 'piece', seq: 60 },
        { key: 'qc', name: 'Final QC', local: 'حتمی معائنہ', cat: 'qc', uom: 'piece', seq: 70 },
        { key: 'packing', name: 'Packing', local: 'پیکنگ', cat: 'packing', uom: 'piece', seq: 80 },
    ];
    const op = {};
    for (const o of opDefs) {
        op[o.key] = await create('api::mfg-operation.mfg-operation', {
            name: o.name, local_name: o.local, code: o.key, category: o.cat,
            default_uom: o.uom, sequence_hint: o.seq, is_active: true,
        });
    }

    // ---- defect types ------------------------------------------------------------
    const defectDefs = [
        { key: 'skipped', name: 'Skipped Stitch', local: 'چھوٹا ہوا ٹانکا', sev: 'major', rework: true, attr: true, ops: ['stitching', 'overlock'] },
        { key: 'broken', name: 'Broken Stitch', local: 'ٹوٹا ہوا ٹانکا', sev: 'major', rework: true, attr: true, ops: ['stitching', 'overlock'] },
        { key: 'openSeam', name: 'Open Seam', local: 'کھلی سلائی', sev: 'major', rework: true, attr: true, ops: ['stitching'] },
        { key: 'unevenHem', name: 'Uneven Hem', local: 'ناہموار پلی', sev: 'minor', rework: true, attr: true, ops: ['pico', 'stitching'] },
        { key: 'oilStain', name: 'Oil Stain', local: 'تیل کا داغ', sev: 'major', rework: true, attr: true, ops: ['stitching', 'overlock', 'pressing'] },
        { key: 'fabricFlaw', name: 'Fabric Flaw', local: 'کپڑے کا نقص', sev: 'major', rework: false, attr: false, ops: ['cutting'] },
        { key: 'wrongMeasure', name: 'Wrong Measurement', local: 'غلط ناپ', sev: 'critical', rework: false, attr: true, ops: ['cutting', 'stitching'] },
        { key: 'looseThread', name: 'Loose Threads', local: 'ڈھیلے دھاگے', sev: 'minor', rework: true, attr: true, ops: ['stitching', 'buttonhole'] },
        { key: 'btnMisaligned', name: 'Button Misaligned', local: 'ٹیڑھا بٹن', sev: 'minor', rework: true, attr: true, ops: ['buttonhole'] },
        { key: 'scorchMark', name: 'Scorch / Press Mark', local: 'استری کا نشان', sev: 'major', rework: false, attr: true, ops: ['pressing'] },
    ];
    const defect = {};
    for (const d of defectDefs) {
        defect[d.key] = await create('api::mfg-defect-type.mfg-defect-type', {
            name: d.name, local_name: d.local, code: d.key.toLowerCase(),
            severity: d.sev, is_reworkable: d.rework, attributable_to_worker: d.attr, is_active: true,
        });
    }
    // link defects from the owning side (operation.defect_types)
    const opDefects = {};
    for (const d of defectDefs) for (const o of d.ops) (opDefects[o] = opDefects[o] || []).push(defect[d.key].documentId);
    for (const [k, ids] of Object.entries(opDefects)) {
        await doc('api::mfg-operation.mfg-operation').update({ documentId: op[k].documentId, data: { defect_types: ids } });
    }

    // ---- worker profiles ------------------------------------------------------------
    const wpDefs = [
        { key: 'rauf', type: 'piece_rate', grade: 'A', code: 'W-01', line: lineCutting, skills: [{ op: 'cutting', grade: 'A' }] },
        { key: 'imran', type: 'piece_rate', grade: 'B', code: 'W-02', line: lineCutting, skills: [{ op: 'cutting', grade: 'B' }] },
        { key: 'shahid', type: 'piece_rate', grade: 'A', code: 'W-03', line: lineGents, skills: [{ op: 'stitching', grade: 'A' }] },
        { key: 'naveed', type: 'piece_rate', grade: 'B', code: 'W-04', line: lineGents, skills: [{ op: 'stitching', grade: 'B' }] },
        { key: 'rashid', type: 'piece_rate', grade: 'B', code: 'W-05', line: lineGents, skills: [{ op: 'stitching', grade: 'B' }, { op: 'buttonhole', grade: 'B' }] },
        { key: 'zubair', type: 'piece_rate', grade: 'C', code: 'W-06', line: lineGents, skills: [{ op: 'stitching', grade: 'C' }] },
        { key: 'bilal', type: 'piece_rate', grade: 'trainee', code: 'W-07', line: lineGents, skills: [{ op: 'stitching', grade: 'trainee' }] },
        { key: 'samina', type: 'piece_rate', grade: 'A', code: 'W-08', line: lineLadies, skills: [{ op: 'stitching', grade: 'A' }] },
        { key: 'farzana', type: 'piece_rate', grade: 'B', code: 'W-09', line: lineLadies, skills: [{ op: 'stitching', grade: 'B' }] },
        { key: 'tariq', type: 'piece_rate', grade: 'B', code: 'W-10', line: lineFinish, skills: [{ op: 'overlock', grade: 'B' }, { op: 'pico', grade: 'B' }] },
        { key: 'asif', type: 'piece_rate', grade: 'B', code: 'W-11', line: lineFinish, skills: [{ op: 'pressing', grade: 'B' }] },
        { key: 'nasreen', type: 'fixed', grade: 'A', code: 'W-12', line: lineFinish, skills: [{ op: 'qc', grade: 'A' }] },
        { key: 'yasir', type: 'piece_rate', grade: 'C', code: 'W-13', line: lineFinish, skills: [{ op: 'packing', grade: 'C' }] },
    ];
    const wp = {};
    for (const w of wpDefs) {
        wp[w.key] = await create('api::mfg-worker-profile.mfg-worker-profile', {
            worker_type: w.type, default_skill_grade: w.grade, code: w.code, is_active: true,
            employee: emp[w.key].documentId, production_line: w.line.documentId,
            skill_grades: w.skills.map((s) => ({ operation: op[s.op].documentId, grade: s.grade, certified_at: D('2026-05-01') })),
        });
    }

    // ---- piece rates ------------------------------------------------------------
    const EF = D('2026-05-01');
    const rateDefs = [
        // cutting — generic by grade
        { op: 'cutting', grade: 'A', rate: 60 }, { op: 'cutting', grade: 'B', rate: 50 }, { op: 'cutting', grade: 'C', rate: 40 },
        // cutting — product-specific
        { op: 'cutting', prod: 'ladies2pc', grade: 'A', rate: 55 },
        { op: 'cutting', prod: 'kurta', grade: 'any', rate: 40 },
        { op: 'cutting', prod: 'kurti', grade: 'any', rate: 35 },
        // stitching — per product per grade
        { op: 'stitching', prod: 'gskWhite', grade: 'A', rate: 450 }, { op: 'stitching', prod: 'gskWhite', grade: 'B', rate: 380 },
        { op: 'stitching', prod: 'gskWhite', grade: 'C', rate: 320 }, { op: 'stitching', prod: 'gskWhite', grade: 'trainee', rate: 250 },
        { op: 'stitching', prod: 'gskBlue', grade: 'A', rate: 470 }, { op: 'stitching', prod: 'gskBlue', grade: 'B', rate: 400 },
        { op: 'stitching', prod: 'gskBlue', grade: 'C', rate: 330 }, { op: 'stitching', prod: 'gskBlue', grade: 'trainee', rate: 260 },
        { op: 'stitching', prod: 'kurta', grade: 'A', rate: 300 }, { op: 'stitching', prod: 'kurta', grade: 'B', rate: 260 },
        { op: 'stitching', prod: 'ladies2pc', grade: 'A', rate: 400 }, { op: 'stitching', prod: 'ladies2pc', grade: 'B', rate: 340 },
        { op: 'stitching', prod: 'kurti', grade: 'A', rate: 250 }, { op: 'stitching', prod: 'kurti', grade: 'B', rate: 210 },
        { op: 'stitching', prod: 'kurti', grade: 'C', rate: 180 },
        // finishing — generic
        { op: 'overlock', grade: 'any', rate: 30 }, { op: 'overlock', prod: 'kurti', grade: 'any', rate: 20 },
        { op: 'buttonhole', grade: 'any', rate: 25 },
        { op: 'pico', grade: 'any', rate: 20 },
        { op: 'pressing', grade: 'any', rate: 25 },
        { op: 'packing', grade: 'any', rate: 10 },
    ];
    for (const r of rateDefs) {
        await create('api::mfg-piece-rate.mfg-piece-rate', {
            rate: r.rate, skill_grade: r.grade, min_qty: 0, effective_from: EF, is_active: true,
            operation: op[r.op].documentId, ...(r.prod ? { product: fg[r.prod].documentId } : {}),
        });
    }

    // ---- BOMs ------------------------------------------------------------
    const routing = (steps) => steps.map(([key, seq, mins, grade]) => ({
        operation: op[key].documentId, sequence: seq, expected_minutes: mins,
        ...(grade ? { default_skill_grade: grade } : {}),
    }));
    const gentsRouting = routing([
        ['cutting', 1, 15], ['overlock', 2, 10], ['stitching', 3, 120, 'B'], ['buttonhole', 4, 10],
        ['pico', 5, 8], ['pressing', 6, 10], ['qc', 7, 5], ['packing', 8, 3],
    ]);
    const ladiesRouting = routing([
        ['cutting', 1, 15], ['overlock', 2, 10], ['stitching', 3, 100, 'B'],
        ['pico', 4, 8], ['pressing', 5, 10], ['qc', 6, 5], ['packing', 7, 3],
    ]);
    const bomDefs = [
        {
            key: 'gskWhite', name: 'BOM — Gents Shalwar Kameez (Latha White)', steps: gentsRouting,
            lines: [
                { p: 'latha', q: 4.5, uom: 'meter', waste: 5 }, { p: 'threadW', q: 0.13, uom: 'cone' },
                { p: 'buttons', q: 0.75, uom: 'dozen' }, { p: 'bukram', q: 0.3, uom: 'meter' }, { p: 'bag', q: 1, uom: 'piece' },
            ],
        },
        {
            key: 'gskBlue', name: 'BOM — Gents Shalwar Kameez (Wash & Wear Sky Blue)', steps: gentsRouting,
            lines: [
                { p: 'washwear', q: 4.5, uom: 'meter', waste: 5 }, { p: 'threadW', q: 0.13, uom: 'cone' },
                { p: 'buttons', q: 0.75, uom: 'dozen' }, { p: 'bukram', q: 0.3, uom: 'meter' }, { p: 'bag', q: 1, uom: 'piece' },
            ],
        },
        {
            key: 'kurta', name: 'BOM — Gents Kurta (Cotton Black)', steps: gentsRouting,
            lines: [
                { p: 'cambric', q: 3.25, uom: 'meter', waste: 5 }, { p: 'threadB', q: 0.1, uom: 'cone' },
                { p: 'buttons', q: 0.5, uom: 'dozen' }, { p: 'bag', q: 1, uom: 'piece' },
            ],
        },
        {
            key: 'ladies2pc', name: 'BOM — Ladies 2-pc Lawn Suit', steps: ladiesRouting,
            lines: [
                { p: 'lawn', q: 5.5, uom: 'meter', waste: 4 }, { p: 'threadW', q: 0.12, uom: 'cone' }, { p: 'bag', q: 1, uom: 'piece' },
            ],
        },
        {
            key: 'kurti', name: 'BOM — Ladies Kurti (Lawn)', steps: ladiesRouting,
            lines: [
                { p: 'lawn', q: 2.5, uom: 'meter', waste: 4 }, { p: 'threadW', q: 0.08, uom: 'cone' }, { p: 'bag', q: 1, uom: 'piece' },
            ],
        },
    ];
    const bom = {};
    for (const b of bomDefs) {
        bom[b.key] = await create('api::mfg-bom.mfg-bom', {
            name: b.name, version: '1', status: 'Active', is_default: true, output_quantity: 1,
            product: fg[b.key].documentId,
            material_lines: b.lines.map((l) => ({
                material_product: raw[l.p].documentId, quantity: l.q, uom: l.uom, wastage_pct: l.waste || 0,
            })),
            routing_steps: b.steps,
        });
    }

    // ---- material lots ------------------------------------------------------------
    // remaining = received - sum of issues created below
    const lotDefs = [
        { key: 'latha1', code: 'LOT-LATHA-2605-W', p: 'latha', uom: 'meter', recv: 300, rem: 160, cost: 350, dye: 'DL-2605', color: 'White', width: '58 in', at: '2026-05-16', sup: 'Khan Cloth House', status: 'PartiallyConsumed' },
        { key: 'ww1', code: 'LOT-WW-2606-SB', p: 'washwear', uom: 'meter', recv: 350, rem: 350, cost: 420, dye: 'DL-2606', color: 'Sky Blue', width: '58 in', at: '2026-06-02', sup: 'Khan Cloth House', status: 'Available' },
        { key: 'cambric1', code: 'LOT-CC-2605-BLK', p: 'cambric', uom: 'meter', recv: 200, rem: 120, cost: 380, dye: 'DL-2599', color: 'Black', width: '56 in', at: '2026-05-25', sup: 'Khan Cloth House', status: 'PartiallyConsumed' },
        { key: 'lawn1', code: 'LOT-LAWN-2605-FL', p: 'lawn', uom: 'meter', recv: 400, rem: 80, cost: 450, dye: 'DL-2587', color: 'Floral Multi', width: '54 in', at: '2026-05-20', sup: 'Khan Cloth House', status: 'PartiallyConsumed' },
        { key: 'thrW1', code: 'LOT-THR-W-01', p: 'threadW', uom: 'cone', recv: 100, rem: 91, cost: 180, color: 'White', at: '2026-05-10', sup: 'Madina Accessories', status: 'PartiallyConsumed' },
        { key: 'thrB1', code: 'LOT-THR-B-01', p: 'threadB', uom: 'cone', recv: 50, rem: 50, cost: 180, color: 'Black', at: '2026-05-10', sup: 'Madina Accessories', status: 'Available' },
        { key: 'btn1', code: 'LOT-BTN-01', p: 'buttons', uom: 'dozen', recv: 40, rem: 37, cost: 60, at: '2026-05-10', sup: 'Madina Accessories', status: 'PartiallyConsumed' },
        { key: 'bkr1', code: 'LOT-BKR-01', p: 'bukram', uom: 'meter', recv: 100, rem: 90, cost: 90, at: '2026-05-10', sup: 'Madina Accessories', status: 'PartiallyConsumed' },
        { key: 'bag1', code: 'LOT-BAG-01', p: 'bag', uom: 'piece', recv: 500, rem: 472, cost: 12, at: '2026-05-10', sup: 'Madina Accessories', status: 'PartiallyConsumed' },
    ];
    const lot = {};
    for (const l of lotDefs) {
        lot[l.key] = await create('api::mfg-material-lot.mfg-material-lot', {
            lot_code: l.code, name: `${l.code} — ${raw[l.p].name}`, uom: l.uom,
            quantity_received: l.recv, quantity_remaining: l.rem, quantity_reserved: 0,
            unit_cost: l.cost, total_cost: l.recv * l.cost,
            dye_lot: l.dye, color: l.color, width: l.width, status: l.status,
            received_at: T(`${l.at}T10:00:00+05:00`),
            product: raw[l.p].documentId, supplier: suppliers[l.sup].documentId, branch: branch.documentId,
        });
    }

    // ---- work orders ------------------------------------------------------------
    // WO-1: Completed. labor 16240, material 51136, overhead 10% = 6737.60, total 74113.60, /28 = 2646.91
    const wo1 = await create('api::mfg-work-order.mfg-work-order', {
        wo_number: 'WO-2026-0001', name: 'Gents Shalwar Kameez — White (Eid stock)',
        status: 'Completed', priority: 'High',
        quantity_ordered: 30, quantity_completed: 28, quantity_rejected: 2,
        due_date: D('2026-06-01'), started_at: T('2026-05-18T09:00:00+05:00'), completed_at: T('2026-05-30T17:00:00+05:00'),
        overhead_rate: 0.10, material_cost: 51136, labor_cost: 16240, overhead_cost: 6737.6,
        total_cost: 74113.6, cost_per_unit: 2646.91,
        product: fg.gskWhite.documentId, bom: bom.gskWhite.documentId,
        production_line: lineGents.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
        size_breakup: [
            { size: 'S', quantity: 10, quantity_completed: 10 },
            { size: 'M', quantity: 10, quantity_completed: 10 },
            { size: 'L', quantity: 10, quantity_completed: 8 },
        ],
        notes: 'Eid restock for Lehtrar Road outlet. 2 pcs rejected at final QC.',
    });

    // WO-2: InProgress (ladies line)
    const wo2 = await create('api::mfg-work-order.mfg-work-order', {
        wo_number: 'WO-2026-0002', name: 'Ladies 2-pc Lawn Suits — Summer batch',
        status: 'InProgress', priority: 'Normal',
        quantity_ordered: 40, quantity_completed: 10, quantity_rejected: 0,
        due_date: D('2026-06-15'), started_at: T('2026-06-03T09:00:00+05:00'), overhead_rate: 0.10,
        product: fg.ladies2pc.documentId, bom: bom.ladies2pc.documentId,
        production_line: lineLadies.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
        size_breakup: [
            { size: 'S', quantity: 10, quantity_completed: 10 },
            { size: 'M', quantity: 20, quantity_completed: 0 },
            { size: 'L', quantity: 10, quantity_completed: 0 },
        ],
    });

    // WO-3: Released (kurtas), cutting starts tomorrow
    const wo3 = await create('api::mfg-work-order.mfg-work-order', {
        wo_number: 'WO-2026-0003', name: 'Gents Kurta — Black (retail order)',
        status: 'Released', priority: 'Normal',
        quantity_ordered: 25, quantity_completed: 0, quantity_rejected: 0,
        due_date: D('2026-06-18'), overhead_rate: 0.10,
        product: fg.kurta.documentId, bom: bom.kurta.documentId,
        production_line: lineGents.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
    });

    // WO-4: Draft
    await create('api::mfg-work-order.mfg-work-order', {
        wo_number: 'WO-2026-0004', name: 'Gents Shalwar Kameez — Sky Blue (July batch)',
        status: 'Draft', priority: 'Low',
        quantity_ordered: 50, quantity_completed: 0, quantity_rejected: 0,
        due_date: D('2026-07-01'), overhead_rate: 0.10,
        product: fg.gskBlue.documentId, bom: bom.gskBlue.documentId,
        production_line: lineGents.documentId, branch: branch.documentId,
    });

    // WO-5: OnHold (fabric shortage)
    const wo5 = await create('api::mfg-work-order.mfg-work-order', {
        wo_number: 'WO-2026-0005', name: 'Ladies Kurti — Lawn (boutique order)',
        status: 'OnHold', priority: 'Urgent',
        quantity_ordered: 60, quantity_completed: 0, quantity_rejected: 0,
        due_date: D('2026-06-20'), started_at: T('2026-06-01T09:00:00+05:00'), overhead_rate: 0.10,
        product: fg.kurti.documentId, bom: bom.kurti.documentId,
        production_line: lineLadies.documentId, branch: branch.documentId, supervisor: emp.saleem.documentId,
        notes: 'ON HOLD: lawn fabric short by ~70 m — awaiting next lot from Khan Cloth House.',
    });

    // ---- bundles ------------------------------------------------------------
    const mkBundle = (data) => create('api::mfg-bundle.mfg-bundle', data);
    await mkBundle({ bundle_code: 'B-0001-S', size: 'S', color: 'White', quantity: 10, quantity_completed: 10, status: 'Completed', current_operation_seq: 8, current_operation: op.packing.documentId, work_order: wo1.documentId, production_line: lineGents.documentId });
    await mkBundle({ bundle_code: 'B-0001-M', size: 'M', color: 'White', quantity: 10, quantity_completed: 10, status: 'Completed', current_operation_seq: 8, current_operation: op.packing.documentId, work_order: wo1.documentId, production_line: lineGents.documentId });
    await mkBundle({ bundle_code: 'B-0001-L', size: 'L', color: 'White', quantity: 10, quantity_completed: 8, quantity_rejected: 2, status: 'Completed', current_operation_seq: 8, current_operation: op.packing.documentId, work_order: wo1.documentId, production_line: lineGents.documentId });

    const b2a = await mkBundle({ bundle_code: 'LB-0002-1', size: 'S', color: 'Floral', quantity: 10, quantity_completed: 10, status: 'Completed', current_operation_seq: 7, current_operation: op.packing.documentId, work_order: wo2.documentId, production_line: lineLadies.documentId });
    const b2b = await mkBundle({ bundle_code: 'LB-0002-2', size: 'M', color: 'Floral', quantity: 10, status: 'InProgress', current_operation_seq: 3, current_operation: op.stitching.documentId, work_order: wo2.documentId, production_line: lineLadies.documentId });
    await mkBundle({ bundle_code: 'LB-0002-3', size: 'M', color: 'Floral', quantity: 10, status: 'Issued', current_operation_seq: 1, current_operation: op.cutting.documentId, work_order: wo2.documentId, production_line: lineLadies.documentId });
    const b2d = await mkBundle({ bundle_code: 'LB-0002-4', size: 'L', color: 'Floral', quantity: 10, status: 'QCHold', current_operation_seq: 6, current_operation: op.qc.documentId, work_order: wo2.documentId, production_line: lineLadies.documentId });

    await mkBundle({ bundle_code: 'KB-0003-1', size: 'M', color: 'Black', quantity: 13, status: 'Created', current_operation_seq: 0, work_order: wo3.documentId, production_line: lineGents.documentId });
    await mkBundle({ bundle_code: 'KB-0003-2', size: 'L', color: 'Black', quantity: 12, status: 'Created', current_operation_seq: 0, work_order: wo3.documentId, production_line: lineGents.documentId });

    const b5a = await mkBundle({ bundle_code: 'KT-0005-1', size: 'M', color: 'Floral', quantity: 15, status: 'InProgress', current_operation_seq: 3, current_operation: op.stitching.documentId, work_order: wo5.documentId, production_line: lineLadies.documentId });

    // ---- material issues ------------------------------------------------------------
    const mkIssue = (l, wo, qty, uom, at, notes, bundle) => create('api::mfg-material-issue.mfg-material-issue', {
        material_lot: lot[l].documentId, work_order: wo.documentId, quantity: qty, uom,
        issue_type: 'Issue', unit_cost: lotDefs.find((x) => x.key === l).cost,
        total_cost: qty * lotDefs.find((x) => x.key === l).cost,
        issued_at: T(at), issued_by: emp.saleem.documentId, branch: branch.documentId,
        ...(notes ? { notes } : {}), ...(bundle ? { bundle: bundle.documentId } : {}),
    });
    // WO1 — 51,136 total
    await mkIssue('latha1', wo1, 140, 'meter', '2026-05-18T09:30:00+05:00', 'Latha for 30 suits incl. cutting wastage');
    await mkIssue('thrW1', wo1, 4, 'cone', '2026-05-18T09:35:00+05:00');
    await mkIssue('btn1', wo1, 3, 'dozen', '2026-05-22T11:00:00+05:00');
    await mkIssue('bkr1', wo1, 10, 'meter', '2026-05-18T09:40:00+05:00');
    await mkIssue('bag1', wo1, 28, 'piece', '2026-05-30T15:00:00+05:00', 'Bags for packed pieces only');
    // WO2
    await mkIssue('lawn1', wo2, 230, 'meter', '2026-06-03T09:30:00+05:00', 'Lawn for 40 ladies suits incl. wastage');
    await mkIssue('thrW1', wo2, 5, 'cone', '2026-06-03T09:35:00+05:00');
    // WO3
    await mkIssue('cambric1', wo3, 80, 'meter', '2026-06-09T16:00:00+05:00', 'Cambric staged for kurta cutting');
    // WO5
    await mkIssue('lawn1', wo5, 90, 'meter', '2026-06-01T09:30:00+05:00', 'Partial issue — lot ran short, WO on hold');

    // ---- tasks ------------------------------------------------------------
    const mkTask = (data) => create('api::mfg-task.mfg-task', data);
    const approved = (worker, operation, wo, bundle, line, qa, qc_, rate, started, completed, opts = {}) => mkTask({
        status: 'Approved', quantity_assigned: qa, quantity_completed: qc_, quantity_rejected: opts.rejected || 0,
        skill_grade: opts.grade || wpDefs.find((w) => w.key === worker).grade,
        piece_rate: rate, amount: +(rate * qc_).toFixed(2), payroll_locked: false,
        started_at: T(started), completed_at: T(completed), approved_at: T(opts.approvedAt || completed),
        work_order: wo.documentId, ...(bundle ? { bundle: bundle.documentId } : {}),
        operation: op[operation].documentId, worker: wp[worker].documentId, employee: emp[worker].documentId,
        production_line: line.documentId, ...(opts.notes ? { notes: opts.notes } : {}),
    });

    // WO1 — all approved; labor total 16,240
    await approved('rauf', 'cutting', wo1, null, lineCutting, 30, 30, 60, '2026-05-18T10:00:00+05:00', '2026-05-19T13:00:00+05:00');
    await approved('shahid', 'stitching', wo1, null, lineGents, 12, 12, 450, '2026-05-20T09:00:00+05:00', '2026-05-24T17:00:00+05:00');
    await approved('naveed', 'stitching', wo1, null, lineGents, 10, 10, 380, '2026-05-20T09:00:00+05:00', '2026-05-25T17:00:00+05:00', { rejected: 1, notes: '1 pc failed final QC (oil stain)' });
    await approved('zubair', 'stitching', wo1, null, lineGents, 8, 8, 320, '2026-05-20T09:00:00+05:00', '2026-05-26T17:00:00+05:00', { rejected: 1, notes: '1 pc failed final QC (open seam)' });
    await approved('tariq', 'overlock', wo1, null, lineFinish, 30, 30, 30, '2026-05-19T14:00:00+05:00', '2026-05-20T17:00:00+05:00');
    await approved('rashid', 'buttonhole', wo1, null, lineFinish, 30, 30, 25, '2026-05-26T09:00:00+05:00', '2026-05-27T13:00:00+05:00');
    await approved('asif', 'pressing', wo1, null, lineFinish, 30, 30, 25, '2026-05-28T09:00:00+05:00', '2026-05-29T13:00:00+05:00');
    await approved('yasir', 'packing', wo1, null, lineFinish, 28, 28, 10, '2026-05-30T14:00:00+05:00', '2026-05-30T16:30:00+05:00');

    // WO2 — mixed states
    await approved('rauf', 'cutting', wo2, null, lineCutting, 40, 40, 55, '2026-06-03T10:00:00+05:00', '2026-06-04T13:00:00+05:00');
    await approved('samina', 'stitching', wo2, b2a, lineLadies, 10, 10, 400, '2026-06-04T14:00:00+05:00', '2026-06-06T17:00:00+05:00');
    await approved('tariq', 'overlock', wo2, b2a, lineLadies, 10, 10, 30, '2026-06-04T13:30:00+05:00', '2026-06-04T17:00:00+05:00');
    await approved('tariq', 'pico', wo2, b2a, lineLadies, 10, 10, 20, '2026-06-07T09:00:00+05:00', '2026-06-07T11:00:00+05:00');
    await approved('asif', 'pressing', wo2, b2a, lineLadies, 10, 10, 25, '2026-06-07T11:30:00+05:00', '2026-06-07T15:00:00+05:00');
    // completed, awaiting approval (QCHold bundle — rework decision pending)
    await mkTask({
        status: 'Completed', quantity_assigned: 10, quantity_completed: 10, skill_grade: 'A',
        piece_rate: 400, amount: 4000, payroll_locked: false,
        started_at: T('2026-06-05T09:00:00+05:00'), completed_at: T('2026-06-08T17:00:00+05:00'),
        work_order: wo2.documentId, bundle: b2d.documentId, operation: op.stitching.documentId,
        worker: wp.samina.documentId, employee: emp.samina.documentId, production_line: lineLadies.documentId,
        notes: 'Bundle held at QC — 3 pcs marked for rework.',
    });
    // in progress
    await mkTask({
        status: 'InProgress', quantity_assigned: 10, skill_grade: 'B', piece_rate: 0, amount: 0,
        started_at: T('2026-06-09T09:00:00+05:00'),
        work_order: wo2.documentId, bundle: b2b.documentId, operation: op.stitching.documentId,
        worker: wp.farzana.documentId, employee: emp.farzana.documentId, production_line: lineLadies.documentId,
    });
    // assigned, not started
    await mkTask({
        status: 'Assigned', quantity_assigned: 10,
        work_order: wo2.documentId, bundle: b2a.documentId, operation: op.packing.documentId,
        worker: wp.yasir.documentId, employee: emp.yasir.documentId, production_line: lineFinish.documentId,
    });

    // WO3 — cutting assigned
    await mkTask({
        status: 'Assigned', quantity_assigned: 25,
        work_order: wo3.documentId, operation: op.cutting.documentId,
        worker: wp.imran.documentId, employee: emp.imran.documentId, production_line: lineCutting.documentId,
    });

    // WO5 — partial cutting approved, stitching stalled
    await approved('imran', 'cutting', wo5, null, lineCutting, 60, 36, 35, '2026-06-01T10:00:00+05:00', '2026-06-02T17:00:00+05:00', { notes: 'Only 36 pcs cut — fabric short.' });
    await mkTask({
        status: 'InProgress', quantity_assigned: 15, skill_grade: 'C', piece_rate: 0, amount: 0,
        started_at: T('2026-06-02T09:00:00+05:00'),
        work_order: wo5.documentId, bundle: b5a.documentId, operation: op.stitching.documentId,
        worker: wp.zubair.documentId, employee: emp.zubair.documentId, production_line: lineLadies.documentId,
    });

    // ---- QC inspections ------------------------------------------------------------
    await create('api::mfg-qc-inspection.mfg-qc-inspection', {
        result: 'PartialPass', stage: 'Final', quantity_inspected: 30, quantity_passed: 28, quantity_failed: 2,
        inspected_at: T('2026-05-30T11:00:00+05:00'), inspector: emp.nasreen.documentId,
        work_order: wo1.documentId, operation: op.qc.documentId, branch: branch.documentId,
        notes: 'Final inspection of Eid batch: 2 rejects (1 open seam, 1 oil stain).',
        defect_lines: [
            { defect_type: defect.openSeam.documentId, quantity: 1, responsible_worker: wp.zubair.documentId, notes: 'Side seam open 2 in — size L' },
            { defect_type: defect.oilStain.documentId, quantity: 1, responsible_worker: wp.naveed.documentId, notes: 'Machine oil mark on kameez front' },
        ],
    });
    await create('api::mfg-qc-inspection.mfg-qc-inspection', {
        result: 'Pass', stage: 'InProcess', quantity_inspected: 10, quantity_passed: 10,
        inspected_at: T('2026-06-07T16:00:00+05:00'), inspector: emp.nasreen.documentId,
        work_order: wo2.documentId, bundle: b2a.documentId, operation: op.stitching.documentId, branch: branch.documentId,
    });
    await create('api::mfg-qc-inspection.mfg-qc-inspection', {
        result: 'Rework', stage: 'InProcess', quantity_inspected: 10, quantity_passed: 7, quantity_rework: 3,
        inspected_at: T('2026-06-09T10:00:00+05:00'), inspector: emp.nasreen.documentId,
        work_order: wo2.documentId, bundle: b2d.documentId, operation: op.stitching.documentId, branch: branch.documentId,
        notes: 'Bundle LB-0002-4 held: 3 pcs need restitching before final.',
        defect_lines: [
            { defect_type: defect.skipped.documentId, quantity: 2, responsible_worker: wp.samina.documentId },
            { defect_type: defect.unevenHem.documentId, quantity: 1, responsible_worker: wp.samina.documentId },
        ],
    });

    // ---- finished stock-items for the completed WO ---------------------------------
    for (let i = 0; i < 28; i++) {
        await create('api::stock-item.stock-item', {
            name: fg.gskWhite.name, sku: fg.gskWhite.sku, status: 'InStock', sellable_units: 1,
            cost_price: 2646.91, selling_price: 4500,
            product: fg.gskWhite.documentId, branch: branch.documentId, work_order: wo1.documentId,
        });
    }

    // make sure the product cache matches the invariant
    const inStock = await app.db.query('api::stock-item.stock-item').count({
        where: { product: fg.gskWhite.id, status: 'InStock' },
    });
    await doc('api::product.product').update({
        documentId: fg.gskWhite.documentId, data: { stock_quantity: inStock },
    });

    return { created, updated: 0, skipped: 0 };
}

module.exports = { seedTailoringUnit };
