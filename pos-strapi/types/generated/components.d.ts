import type { Schema, Struct } from '@strapi/strapi';

export interface InvCountLine extends Struct.ComponentSchema {
  collectionName: 'components_inv_count_lines';
  info: {
    description: 'One product line in a stock count: expected (system) vs physically counted quantity.';
    displayName: 'Count Line';
  };
  attributes: {
    counted_qty: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    product_doc_id: Schema.Attribute.String;
    product_name: Schema.Attribute.String;
    sku: Schema.Attribute.String;
    system_qty: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface MfgBomLine extends Struct.ComponentSchema {
  collectionName: 'components_mfg_bom_lines';
  info: {
    description: 'One material requirement on a bill of materials';
    displayName: 'BOM Line';
    icon: 'layer';
  };
  attributes: {
    material_product: Schema.Attribute.Relation<
      'oneToOne',
      'api::product.product'
    >;
    notes: Schema.Attribute.String;
    quantity: Schema.Attribute.Decimal;
    uom: Schema.Attribute.Enumeration<
      [
        'piece',
        'meter',
        'yard',
        'kg',
        'gram',
        'dozen',
        'set',
        'cone',
        'roll',
        'box',
      ]
    > &
      Schema.Attribute.DefaultTo<'piece'>;
    wastage_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
  };
}

export interface MfgBomOutput extends Struct.ComponentSchema {
  collectionName: 'components_mfg_bom_outputs';
  info: {
    description: 'One product a BOM produces (primary / co-product / by-product / scrap), with its yield and cost share.';
    displayName: 'BOM Output';
    icon: 'cube';
  };
  attributes: {
    cost_share_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    notes: Schema.Attribute.String;
    output_quantity: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    output_type: Schema.Attribute.Enumeration<
      ['primary', 'co_product', 'by_product', 'scrap']
    > &
      Schema.Attribute.DefaultTo<'primary'>;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
  };
}

export interface MfgQcDefectLine extends Struct.ComponentSchema {
  collectionName: 'components_mfg_qc_defect_lines';
  info: {
    description: 'One defect found in a QC inspection, with worker accountability';
    displayName: 'QC Defect Line';
    icon: 'crossCircle';
  };
  attributes: {
    defect_type: Schema.Attribute.Relation<
      'oneToOne',
      'api::mfg-defect-type.mfg-defect-type'
    >;
    notes: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer;
    responsible_task: Schema.Attribute.Relation<
      'oneToOne',
      'api::mfg-task.mfg-task'
    >;
    responsible_worker: Schema.Attribute.Relation<
      'oneToOne',
      'api::mfg-worker-profile.mfg-worker-profile'
    >;
  };
}

export interface MfgRoutingStep extends Struct.ComponentSchema {
  collectionName: 'components_mfg_routing_steps';
  info: {
    description: "One operation in a BOM's production routing";
    displayName: 'Routing Step';
    icon: 'bulletList';
  };
  attributes: {
    can_run_parallel: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    default_skill_grade: Schema.Attribute.Enumeration<
      ['A', 'B', 'C', 'trainee']
    >;
    depends_on_sequence: Schema.Attribute.Integer;
    expected_minutes: Schema.Attribute.Decimal;
    expected_pieces_per_hour: Schema.Attribute.Decimal;
    is_optional: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    notes: Schema.Attribute.String;
    operation: Schema.Attribute.Relation<
      'oneToOne',
      'api::mfg-operation.mfg-operation'
    >;
    outsource_allowed: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    sequence: Schema.Attribute.Integer;
  };
}

export interface MfgSizeBreakup extends Struct.ComponentSchema {
  collectionName: 'components_mfg_size_breakups';
  info: {
    description: 'Per-size / per-colour quantity split for a work order';
    displayName: 'Size Breakup';
    icon: 'grid';
  };
  attributes: {
    color: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer;
    quantity_completed: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    size: Schema.Attribute.String;
  };
}

export interface MfgSkillGrade extends Struct.ComponentSchema {
  collectionName: 'components_mfg_skill_grades';
  info: {
    description: "A worker's certified grade + optional rate override for one operation";
    displayName: 'Skill Grade';
    icon: 'medal';
  };
  attributes: {
    certified_at: Schema.Attribute.Date;
    grade: Schema.Attribute.Enumeration<['A', 'B', 'C', 'trainee']>;
    operation: Schema.Attribute.Relation<
      'oneToOne',
      'api::mfg-operation.mfg-operation'
    >;
    rate_override: Schema.Attribute.Decimal;
  };
}

export interface MfgTemplateInput extends Struct.ComponentSchema {
  collectionName: 'components_mfg_template_inputs';
  info: {
    description: 'A type-level input slot on a production template (an input kind/category + qty + wastage), resolved to a concrete product at instantiation.';
    displayName: 'Template Input';
    icon: 'layer';
  };
  attributes: {
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    kind: Schema.Attribute.Enumeration<
      ['raw_material', 'consumable', 'semi_finished']
    > &
      Schema.Attribute.DefaultTo<'raw_material'>;
    notes: Schema.Attribute.String;
    quantity: Schema.Attribute.Decimal;
    role_label: Schema.Attribute.String;
    uom: Schema.Attribute.Enumeration<
      [
        'piece',
        'meter',
        'yard',
        'kg',
        'gram',
        'dozen',
        'set',
        'cone',
        'roll',
        'box',
      ]
    > &
      Schema.Attribute.DefaultTo<'piece'>;
    wastage_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
  };
}

export interface MfgTemplateOutput extends Struct.ComponentSchema {
  collectionName: 'components_mfg_template_outputs';
  info: {
    description: 'A type-level output slot on a production template (output category + type + relative yield + cost share), resolved to a concrete product at instantiation.';
    displayName: 'Template Output';
    icon: 'cube';
  };
  attributes: {
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    cost_share_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    notes: Schema.Attribute.String;
    output_type: Schema.Attribute.Enumeration<
      ['primary', 'co_product', 'by_product', 'scrap']
    > &
      Schema.Attribute.DefaultTo<'primary'>;
    relative_yield: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    role_label: Schema.Attribute.String;
  };
}

export interface OrderOrderProductItem extends Struct.ComponentSchema {
  collectionName: 'components_order_order_product_items';
  info: {
    description: '';
    displayName: 'Order Product Item';
    icon: 'arrowRight';
  };
  attributes: {
    image: Schema.Attribute.Media<'images'>;
    price: Schema.Attribute.Decimal & Schema.Attribute.Required;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    product_name: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    stock_item: Schema.Attribute.Relation<
      'oneToOne',
      'api::stock-item.stock-item'
    >;
    total: Schema.Attribute.Decimal & Schema.Attribute.Required;
    variant: Schema.Attribute.String;
    variant_name: Schema.Attribute.String;
    variant_terms: Schema.Attribute.JSON;
  };
}

export interface OrderOrderProducts extends Struct.ComponentSchema {
  collectionName: 'components_order_order_products';
  info: {
    description: '';
    displayName: 'Order Products';
    icon: 'grid';
  };
  attributes: {
    items: Schema.Attribute.Component<'order.order-product-item', true>;
  };
}

export interface OrderReturnLine extends Struct.ComponentSchema {
  collectionName: 'components_order_return_lines';
  info: {
    description: 'One returned line of a sale-order, pinned to the original line by index. Carries the restock decision that drives the stock-item walk on RECEIVED.';
    displayName: 'Return Line';
    icon: 'arrowLeft';
  };
  attributes: {
    inspection_notes: Schema.Attribute.Text;
    order_line_index: Schema.Attribute.Integer & Schema.Attribute.Required;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    product_name: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    reason: Schema.Attribute.Enumeration<
      [
        'defective',
        'damaged_in_transit',
        'wrong_item',
        'wrong_size',
        'changed_mind',
        'late_delivery',
        'other',
      ]
    > &
      Schema.Attribute.DefaultTo<'other'>;
    reason_notes: Schema.Attribute.Text;
    restock_decision: Schema.Attribute.Enumeration<
      ['back_to_inventory', 'damaged_writeoff']
    > &
      Schema.Attribute.DefaultTo<'back_to_inventory'>;
    stock_item: Schema.Attribute.Relation<
      'oneToOne',
      'api::stock-item.stock-item'
    >;
    unit_refund_paisa: Schema.Attribute.BigInteger;
    variant_name: Schema.Attribute.String;
  };
}

export interface PayPayslipLine extends Struct.ComponentSchema {
  collectionName: 'components_pay_payslip_lines';
  info: {
    description: 'One earning, deduction, or employer-contribution line on a payslip';
    displayName: 'Payslip Line';
    icon: 'bulletList';
  };
  attributes: {
    amount: Schema.Attribute.Decimal;
    category: Schema.Attribute.Enumeration<
      [
        'salary',
        'allowance',
        'overtime',
        'piece_rate',
        'bonus',
        'incentive',
        'unpaid_leave',
        'tax',
        'eobi',
        'provident_fund',
        'advance_recovery',
        'penalty',
        'deduction',
        'other',
      ]
    >;
    gl_account_key: Schema.Attribute.String;
    kind: Schema.Attribute.Enumeration<
      ['earning', 'deduction', 'employer_contribution']
    >;
    label: Schema.Attribute.String;
    quantity: Schema.Attribute.Decimal;
    rate: Schema.Attribute.Decimal;
    source_ref: Schema.Attribute.String;
  };
}

export interface PaySalaryComponent extends Struct.ComponentSchema {
  collectionName: 'components_pay_salary_components';
  info: {
    description: 'A recurring earning or deduction within a salary structure';
    displayName: 'Salary Component';
    icon: 'calculator';
  };
  attributes: {
    calc: Schema.Attribute.Enumeration<['fixed', 'percent_of_base']> &
      Schema.Attribute.DefaultTo<'fixed'>;
    kind: Schema.Attribute.Enumeration<['earning', 'deduction']> &
      Schema.Attribute.DefaultTo<'earning'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    value: Schema.Attribute.Decimal & Schema.Attribute.Required;
  };
}

export interface PayTaxBracket extends Struct.ComponentSchema {
  collectionName: 'components_pay_tax_brackets';
  info: {
    description: 'One marginal slab: the portion of the base between the previous threshold and `up_to` is charged at `rate` %. Leave up_to empty (or 0) for the open-ended top bracket.';
    displayName: 'Tax Bracket';
    icon: 'chartBubble';
  };
  attributes: {
    rate: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<0>;
    up_to: Schema.Attribute.Decimal;
  };
}

export interface PosSalesDesks extends Struct.ComponentSchema {
  collectionName: 'components_pos_sales_desks';
  info: {
    displayName: 'sales desks';
    icon: 'paperPlane';
  };
  attributes: {
    has_cash_register: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    has_sale_returns: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    invoice_prefix: Schema.Attribute.String;
    name: Schema.Attribute.String;
    note: Schema.Attribute.String;
  };
}

export interface PosStockStatusHistory extends Struct.ComponentSchema {
  collectionName: 'components_pos_stock_status_history';
  info: {
    displayName: 'stock statis history';
    icon: 'history';
  };
  attributes: {
    cost_price: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.Date &
      Schema.Attribute.DefaultTo<{
        $now: true;
      }>;
    selling_price: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      [
        'Received',
        'InStock',
        'Reserved',
        'Sold',
        'Returned',
        'ReturnedDamaged',
        'ReturnedToSupplier',
        'Damaged',
        'Lost',
        'Expired',
        'Transferred',
        'Reduced',
      ]
    > &
      Schema.Attribute.DefaultTo<'InStock'>;
  };
}

export interface ProductVariantInformation extends Struct.ComponentSchema {
  collectionName: 'components_product_variant_informations';
  info: {
    description: '';
    displayName: 'Variant Information';
    icon: 'apps';
  };
  attributes: {
    height: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<1>;
    length: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<1>;
    variant_name: Schema.Attribute.String & Schema.Attribute.Required;
    variant_price: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    weight: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<1>;
    width: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<1>;
  };
}

export interface WorkflowStage extends Struct.ComponentSchema {
  collectionName: 'components_workflow_stages';
  info: {
    description: "One definable stage; maps_to_status ties it to the entity's canonical status enum so state-machine side effects keep firing";
    displayName: 'Workflow Stage';
    icon: 'stack';
  };
  attributes: {
    color: Schema.Attribute.String;
    is_initial: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    is_terminal: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    key: Schema.Attribute.String & Schema.Attribute.Required;
    local_name: Schema.Attribute.String;
    maps_to_status: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String;
    pos_x: Schema.Attribute.Float;
    pos_y: Schema.Attribute.Float;
    sequence: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface WorkflowTransition extends Struct.ComponentSchema {
  collectionName: 'components_workflow_transitions';
  info: {
    description: 'One allowed move between two stage keys';
    displayName: 'Workflow Transition';
    icon: 'arrowRight';
  };
  attributes: {
    approles: Schema.Attribute.String;
    from_key: Schema.Attribute.String & Schema.Attribute.Required;
    label: Schema.Attribute.String;
    to_key: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'inv.count-line': InvCountLine;
      'mfg.bom-line': MfgBomLine;
      'mfg.bom-output': MfgBomOutput;
      'mfg.qc-defect-line': MfgQcDefectLine;
      'mfg.routing-step': MfgRoutingStep;
      'mfg.size-breakup': MfgSizeBreakup;
      'mfg.skill-grade': MfgSkillGrade;
      'mfg.template-input': MfgTemplateInput;
      'mfg.template-output': MfgTemplateOutput;
      'order.order-product-item': OrderOrderProductItem;
      'order.order-products': OrderOrderProducts;
      'order.return-line': OrderReturnLine;
      'pay.payslip-line': PayPayslipLine;
      'pay.salary-component': PaySalaryComponent;
      'pay.tax-bracket': PayTaxBracket;
      'pos.sales-desks': PosSalesDesks;
      'pos.stock-status-history': PosStockStatusHistory;
      'product.variant-information': ProductVariantInformation;
      'workflow.stage': WorkflowStage;
      'workflow.transition': WorkflowTransition;
    }
  }
}
