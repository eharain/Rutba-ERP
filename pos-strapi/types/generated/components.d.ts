import type { Schema, Struct } from '@strapi/strapi';

export interface OrderOrderContact extends Struct.ComponentSchema {
  collectionName: 'components_order_order_contacts';
  info: {
    description: '';
    displayName: 'Order Contact';
    icon: 'book';
  };
  attributes: {
    address: Schema.Attribute.String & Schema.Attribute.Required;
    city: Schema.Attribute.String & Schema.Attribute.Required;
    country: Schema.Attribute.String & Schema.Attribute.Required;
    email: Schema.Attribute.Email & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone_number: Schema.Attribute.String & Schema.Attribute.Required;
    state: Schema.Attribute.String & Schema.Attribute.Required;
    zip_code: Schema.Attribute.String & Schema.Attribute.Required;
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
    price: Schema.Attribute.Decimal & Schema.Attribute.Required;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    product_name: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    total: Schema.Attribute.Decimal & Schema.Attribute.Required;
    variant: Schema.Attribute.String;
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

export interface PosSalesDesks extends Struct.ComponentSchema {
  collectionName: 'components_pos_sales_desks';
  info: {
    displayName: 'sales desks';
    icon: 'paperPlane';
  };
  attributes: {
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
      'order.order-contact': OrderOrderContact;
      'order.order-product-item': OrderOrderProductItem;
      'order.order-products': OrderOrderProducts;
      'pos.sales-desks': PosSalesDesks;
      'pos.stock-status-history': PosStockStatusHistory;
      'product.variant-information': ProductVariantInformation;
    }
  }
}
