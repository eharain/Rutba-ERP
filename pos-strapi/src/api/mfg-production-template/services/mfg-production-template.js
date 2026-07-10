'use strict';

const { factories } = require('@strapi/strapi');

const TEMPLATE_UID = 'api::mfg-production-template.mfg-production-template';
const BOM_UID = 'api::mfg-bom.mfg-bom';

module.exports = factories.createCoreService(TEMPLATE_UID, ({ strapi }) => ({
  /**
   * Instantiate a concrete, versioned mfg-bom from a template by resolving its
   * type-level input/output slots to real products.
   *
   * @param {string} templateDocumentId
   * @param {object} opts
   *   @param {string}  opts.outputProduct   documentId of the PRIMARY output product (required)
   *   @param {object}  opts.inputMap        { slot: productDocumentId } — slot = input_line.role_label || `input_<i>` (or "<i>")
   *   @param {object}  opts.outputMap       { slot: productDocumentId } — non-primary output slots
   *   @param {string} [opts.name]           BOM name (defaults to the template name)
   *   @param {string} [opts.version]        BOM version (default "1")
   *   @param {string} [opts.production_line] documentId
   *   @param {boolean}[opts.activate]       create Active (hard typing check) instead of Draft
   * @returns the created mfg-bom document
   */
  async instantiateBom(templateDocumentId, opts = {}, actor = null) {
    const tpl = await strapi.documents(TEMPLATE_UID).findOne({
      documentId: templateDocumentId,
      populate: {
        input_lines: true,
        output_lines: true,
        routing_steps: { populate: { operation: { fields: ['id', 'documentId'] } } },
      },
    });
    if (!tpl) {
      const e = new Error(`Production template ${templateDocumentId} not found`);
      e.status = 404;
      throw e;
    }

    const inputMap = opts.inputMap || {};
    const outputMap = opts.outputMap || {};
    const missing = [];

    const inputLines = Array.isArray(tpl.input_lines) ? tpl.input_lines : [];
    const outputLines = Array.isArray(tpl.output_lines) ? tpl.output_lines : [];

    // ── material_lines from input slots ───────────────────────────────────
    const material_lines = inputLines.map((line, i) => {
      const slot = line.role_label || `input_${i}`;
      const product = inputMap[slot] || inputMap[String(i)];
      if (!product) { missing.push(`input slot "${slot}"`); return null; }
      return {
        material_product: product,
        quantity: line.quantity ?? 0,
        wastage_pct: line.wastage_pct ?? 0,
        uom: line.uom || 'piece',
      };
    }).filter(Boolean);

    // ── outputs from output slots (primary → opts.outputProduct) ──────────
    let primaryYield = 1;
    const outputs = [];
    outputLines.forEach((line, i) => {
      let product;
      if (line.output_type === 'primary') {
        product = opts.outputProduct;
        primaryYield = line.relative_yield ?? 1;
        if (!product) { missing.push('outputProduct (primary)'); return; }
      } else {
        const slot = line.role_label || `output_${i}`;
        product = outputMap[slot] || outputMap[String(i)];
        if (!product) { missing.push(`output slot "${slot}"`); return; }
      }
      outputs.push({
        product,
        output_quantity: line.relative_yield ?? 1,
        output_type: line.output_type || 'co_product',
        cost_share_pct: line.cost_share_pct ?? 0,
      });
    });

    // No primary output_line declared → synthesise one from outputProduct that
    // absorbs the remaining cost share (so the primary isn't left at zero cost).
    if (!outputLines.some((l) => l.output_type === 'primary')) {
      if (!opts.outputProduct) {
        missing.push('outputProduct (primary)');
      } else {
        const sumOthers = outputs.reduce((s, o) => s + (Number(o.cost_share_pct) || 0), 0);
        outputs.unshift({
          product: opts.outputProduct,
          output_quantity: primaryYield,
          output_type: 'primary',
          cost_share_pct: Math.max(0, 100 - sumOthers),
        });
      }
    }

    if (missing.length) {
      const e = new Error(`Cannot instantiate: unmapped ${missing.join(', ')}`);
      e.status = 400;
      throw e;
    }

    // ── routing_steps: copy template routing (drop component ids, keep refs) ──
    const routing_steps = (Array.isArray(tpl.routing_steps) ? tpl.routing_steps : []).map((s) => ({
      ...(s.operation?.documentId ? { operation: s.operation.documentId } : {}),
      sequence: s.sequence,
      expected_minutes: s.expected_minutes,
      expected_pieces_per_hour: s.expected_pieces_per_hour,
      default_skill_grade: s.default_skill_grade,
      is_optional: s.is_optional,
      depends_on_sequence: s.depends_on_sequence,
      can_run_parallel: s.can_run_parallel,
      outsource_allowed: s.outsource_allowed,
      notes: s.notes,
    }));

    const data = {
      name: opts.name || tpl.name,
      version: opts.version || '1',
      status: opts.activate ? 'Active' : 'Draft',
      is_default: false,
      output_quantity: primaryYield,
      product: opts.outputProduct,
      material_lines,
      outputs,
      routing_steps,
      notes: `Instantiated from production template "${tpl.name}"${tpl.code ? ` (${tpl.code})` : ''}`,
      ...(opts.production_line ? { production_line: opts.production_line } : {}),
    };

    // documents().create runs the kind-typing middleware — a mistyped mapping on
    // an Active instantiation is correctly rejected there.
    const bom = await strapi.documents(BOM_UID).create({ data });
    strapi.log.info(`[mfg-production-template] instantiated BOM ${bom.documentId} from template ${tpl.documentId} (${material_lines.length} input(s), ${outputs.length} output(s), status=${data.status})`);
    return bom;
  },
}));
