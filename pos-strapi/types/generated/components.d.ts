import type { Schema, Struct } from '@strapi/strapi';

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

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'order.order-product-item': OrderOrderProductItem;
      'order.order-products': OrderOrderProducts;
      'order.return-line': OrderReturnLine;
      'pos.sales-desks': PosSalesDesks;
      'pos.stock-status-history': PosStockStatusHistory;
      'product.variant-information': ProductVariantInformation;
    }
  }
}
