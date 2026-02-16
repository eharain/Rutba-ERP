import type { Schema, Struct } from '@strapi/strapi';

export interface AdminApiToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_tokens';
  info: {
    description: '';
    displayName: 'Api Token';
    name: 'Api Token';
    pluralName: 'api-tokens';
    singularName: 'api-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    encryptedKey: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'read-only'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_token_permissions';
  info: {
    description: '';
    displayName: 'API Token Permission';
    name: 'API Token Permission';
    pluralName: 'api-token-permissions';
    singularName: 'api-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminPermission extends Struct.CollectionTypeSchema {
  collectionName: 'admin_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'Permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    conditions: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::permission'> &
      Schema.Attribute.Private;
    properties: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<'manyToOne', 'admin::role'>;
    subject: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminRole extends Struct.CollectionTypeSchema {
  collectionName: 'admin_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'Role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::role'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<'oneToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<'manyToMany', 'admin::user'>;
  };
}

export interface AdminSession extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_sessions';
  info: {
    description: 'Session Manager storage';
    displayName: 'Session';
    name: 'Session';
    pluralName: 'sessions';
    singularName: 'session';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
    i18n: {
      localized: false;
    };
  };
  attributes: {
    absoluteExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    childId: Schema.Attribute.String & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deviceId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    expiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::session'> &
      Schema.Attribute.Private;
    origin: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    sessionId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    status: Schema.Attribute.String & Schema.Attribute.Private;
    type: Schema.Attribute.String & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    userId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_tokens';
  info: {
    description: '';
    displayName: 'Transfer Token';
    name: 'Transfer Token';
    pluralName: 'transfer-tokens';
    singularName: 'transfer-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferTokenPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    description: '';
    displayName: 'Transfer Token Permission';
    name: 'Transfer Token Permission';
    pluralName: 'transfer-token-permissions';
    singularName: 'transfer-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::transfer-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminUser extends Struct.CollectionTypeSchema {
  collectionName: 'admin_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'User';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    blocked: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    lastname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::user'> &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    preferedLanguage: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    registrationToken: Schema.Attribute.String & Schema.Attribute.Private;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    roles: Schema.Attribute.Relation<'manyToMany', 'admin::role'> &
      Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String;
  };
}

export interface ApiAccAccountAccAccount extends Struct.CollectionTypeSchema {
  collectionName: 'acc_accounts';
  info: {
    description: 'Chart of accounts \u2014 ledger accounts';
    displayName: 'Account';
    pluralName: 'acc-accounts';
    singularName: 'acc-account';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account_type: Schema.Attribute.Enumeration<
      ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']
    > &
      Schema.Attribute.Required;
    balance: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-account.acc-account'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccExpenseAccExpense extends Struct.CollectionTypeSchema {
  collectionName: 'acc_expenses';
  info: {
    description: 'Business expense records';
    displayName: 'Expense';
    pluralName: 'acc-expenses';
    singularName: 'acc-expense';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    category: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-expense.acc-expense'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    payment_method: Schema.Attribute.Enumeration<
      ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet', 'Other']
    >;
    publishedAt: Schema.Attribute.DateTime;
    receipt: Schema.Attribute.Media<'images' | 'files'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccInvoiceAccInvoice extends Struct.CollectionTypeSchema {
  collectionName: 'acc_invoices';
  info: {
    description: 'Customer invoices for accounts receivable';
    displayName: 'Invoice';
    pluralName: 'acc-invoices';
    singularName: 'acc-invoice';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer_name: Schema.Attribute.String;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    due_date: Schema.Attribute.Date;
    invoice_number: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-invoice.acc-invoice'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    tax: Schema.Attribute.Decimal;
    total: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccJournalEntryAccJournalEntry
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_journal_entries';
  info: {
    description: 'Double-entry bookkeeping journal entries';
    displayName: 'Journal Entry';
    pluralName: 'acc-journal-entries';
    singularName: 'acc-journal-entry';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    credit: Schema.Attribute.Decimal & Schema.Attribute.Required;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    debit: Schema.Attribute.Decimal & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-journal-entry.acc-journal-entry'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAppAccessAppAccess extends Struct.CollectionTypeSchema {
  collectionName: 'app_accesses';
  info: {
    description: 'Defines which front-end applications exist. Assign to users to grant access.';
    displayName: 'App Access';
    pluralName: 'app-accesses';
    singularName: 'app-access';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    admin_users: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::app-access.app-access'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    permissions: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiBranchBranch extends Struct.CollectionTypeSchema {
  collectionName: 'branches';
  info: {
    displayName: 'Branch';
    pluralName: 'branches';
    singularName: 'branch';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    address: Schema.Attribute.String;
    city: Schema.Attribute.String;
    companyName: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'oneToOne', 'api::currency.currency'>;
    desks: Schema.Attribute.Component<'pos.sales-desks', true>;
    email: Schema.Attribute.String;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::branch.branch'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String;
    payments: Schema.Attribute.Relation<'manyToMany', 'api::payment.payment'>;
    phone: Schema.Attribute.String;
    po_prefix: Schema.Attribute.String;
    products: Schema.Attribute.Relation<'manyToMany', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase_returns: Schema.Attribute.Relation<
      'manyToMany',
      'api::purchase-return.purchase-return'
    >;
    sale_returns: Schema.Attribute.Relation<
      'manyToMany',
      'api::sale-return.sale-return'
    >;
    sales: Schema.Attribute.Relation<'manyToMany', 'api::sale.sale'>;
    tax_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    town: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    watsapp: Schema.Attribute.String;
    web: Schema.Attribute.String;
  };
}

export interface ApiBrandBrand extends Struct.CollectionTypeSchema {
  collectionName: 'brands';
  info: {
    displayName: 'Brand';
    pluralName: 'brands';
    singularName: 'brand';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    keywords: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::brand.brand'> &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCashRegisterTransactionCashRegisterTransaction
  extends Struct.CollectionTypeSchema {
  collectionName: 'cash_register_transactions';
  info: {
    description: 'Tracks cash drops, expenses, manual adjustments and other register events';
    displayName: 'Cash Register Transaction';
    pluralName: 'cash-register-transactions';
    singularName: 'cash-register-transaction';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    cash_register: Schema.Attribute.Relation<
      'manyToOne',
      'api::cash-register.cash-register'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cash-register-transaction.cash-register-transaction'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    performed_by: Schema.Attribute.String;
    performed_by_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    transaction_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      ['CashDrop', 'Expense', 'Adjustment', 'Refund']
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCashRegisterCashRegister
  extends Struct.CollectionTypeSchema {
  collectionName: 'cash_registers';
  info: {
    displayName: 'Cash Register';
    pluralName: 'cash-registers';
    singularName: 'cash-register';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    branch_id: Schema.Attribute.String;
    branch_name: Schema.Attribute.String;
    closed_at: Schema.Attribute.DateTime;
    closed_by: Schema.Attribute.String;
    closed_by_id: Schema.Attribute.Integer;
    closed_by_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    closing_cash: Schema.Attribute.Decimal;
    counted_cash: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    desk_id: Schema.Attribute.Integer;
    desk_name: Schema.Attribute.String;
    difference: Schema.Attribute.Decimal;
    expected_cash: Schema.Attribute.Decimal;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cash-register.cash-register'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    opened_at: Schema.Attribute.DateTime;
    opened_by: Schema.Attribute.String;
    opened_by_id: Schema.Attribute.Integer;
    opened_by_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    opening_cash: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    payments: Schema.Attribute.Relation<'oneToMany', 'api::payment.payment'>;
    publishedAt: Schema.Attribute.DateTime;
    sales: Schema.Attribute.Relation<'oneToMany', 'api::sale.sale'>;
    short_cash: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      ['Open', 'Active', 'Closed', 'Expired', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Active'>;
    transactions: Schema.Attribute.Relation<
      'oneToMany',
      'api::cash-register-transaction.cash-register-transaction'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCategoryCategory extends Struct.CollectionTypeSchema {
  collectionName: 'categories';
  info: {
    displayName: 'Category';
    pluralName: 'categories';
    singularName: 'category';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    childern: Schema.Attribute.Relation<'oneToMany', 'api::category.category'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    keywords: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::category.category'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<'manyToOne', 'api::category.category'>;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    summary: Schema.Attribute.Text;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCrmActivityCrmActivity extends Struct.CollectionTypeSchema {
  collectionName: 'crm_activities';
  info: {
    description: 'Interaction logs \u2014 calls, emails, meetings, notes';
    displayName: 'CRM Activity';
    pluralName: 'crm-activities';
    singularName: 'crm-activity';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    contact: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-contact.crm-contact'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-activity.crm-activity'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    subject: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      ['Call', 'Email', 'Meeting', 'Note', 'Follow-up']
    > &
      Schema.Attribute.DefaultTo<'Note'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCrmContactCrmContact extends Struct.CollectionTypeSchema {
  collectionName: 'crm_contacts';
  info: {
    description: 'Customer and business contacts for CRM';
    displayName: 'CRM Contact';
    pluralName: 'crm-contacts';
    singularName: 'crm-contact';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    activities: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-activity.crm-activity'
    >;
    address: Schema.Attribute.Text;
    company: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    leads: Schema.Attribute.Relation<'oneToMany', 'api::crm-lead.crm-lead'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-contact.crm-contact'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCrmLeadCrmLead extends Struct.CollectionTypeSchema {
  collectionName: 'crm_leads';
  info: {
    description: 'Sales leads and opportunities';
    displayName: 'CRM Lead';
    pluralName: 'crm-leads';
    singularName: 'crm-lead';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    assigned_to: Schema.Attribute.String;
    company: Schema.Attribute.String;
    contact: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-contact.crm-contact'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-lead.crm-lead'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    source: Schema.Attribute.Enumeration<
      [
        'Website',
        'Referral',
        'Social Media',
        'Cold Call',
        'Advertisement',
        'Other',
      ]
    >;
    status: Schema.Attribute.Enumeration<
      ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost']
    > &
      Schema.Attribute.DefaultTo<'New'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    value: Schema.Attribute.Decimal;
  };
}

export interface ApiCurrencyCurrency extends Struct.CollectionTypeSchema {
  collectionName: 'currencies';
  info: {
    description: 'List of global currencies with ISO code, symbol, and region';
    displayName: 'Currencies';
    pluralName: 'currencies';
    singularName: 'currency';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    country: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::currency.currency'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    region: Schema.Attribute.String & Schema.Attribute.Required;
    symbol: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCustomerCustomer extends Struct.CollectionTypeSchema {
  collectionName: 'customers';
  info: {
    displayName: 'Customer';
    pluralName: 'customers';
    singularName: 'customer';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    address: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::customer.customer'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    picture: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Schema.Attribute.DateTime;
    sales: Schema.Attribute.Relation<'oneToMany', 'api::sale.sale'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiEmployeeEmployee extends Struct.CollectionTypeSchema {
  collectionName: 'employees';
  info: {
    displayName: 'Employee';
    pluralName: 'employees';
    singularName: 'employee';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::employee.employee'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    picture: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrAttendanceHrAttendance
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_attendances';
  info: {
    description: 'Daily attendance records for employees';
    displayName: 'HR Attendance';
    pluralName: 'hr-attendances';
    singularName: 'hr-attendance';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    check_in: Schema.Attribute.Time;
    check_out: Schema.Attribute.Time;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-attendance.hr-attendance'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Present', 'Absent', 'Late', 'Leave']
    > &
      Schema.Attribute.DefaultTo<'Present'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrDepartmentHrDepartment
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_departments';
  info: {
    description: 'Company departments';
    displayName: 'HR Department';
    pluralName: 'hr-departments';
    singularName: 'hr-department';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    employees: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee.hr-employee'
    >;
    head: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-department.hr-department'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrEmployeeHrEmployee extends Struct.CollectionTypeSchema {
  collectionName: 'hr_employees';
  info: {
    description: 'Employee records for HR management';
    displayName: 'HR Employee';
    pluralName: 'hr-employees';
    singularName: 'hr-employee';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    address: Schema.Attribute.Text;
    attendances: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-attendance.hr-attendance'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date_of_joining: Schema.Attribute.Date;
    department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    designation: Schema.Attribute.String;
    email: Schema.Attribute.String;
    leave_requests: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-leave-request.hr-leave-request'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee.hr-employee'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    salary_structure: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-salary-structure.pay-salary-structure'
    >;
    status: Schema.Attribute.Enumeration<
      ['Active', 'Inactive', 'Terminated', 'On Leave']
    > &
      Schema.Attribute.DefaultTo<'Active'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrLeaveRequestHrLeaveRequest
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_leave_requests';
  info: {
    description: 'Employee leave and time-off requests';
    displayName: 'HR Leave Request';
    pluralName: 'hr-leave-requests';
    singularName: 'hr-leave-request';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    end_date: Schema.Attribute.Date & Schema.Attribute.Required;
    leave_type: Schema.Attribute.Enumeration<
      ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other']
    > &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-leave-request.hr-leave-request'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Text;
    start_date: Schema.Attribute.Date & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<['Pending', 'Approved', 'Rejected']> &
      Schema.Attribute.DefaultTo<'Pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiOrderOrder extends Struct.CollectionTypeSchema {
  collectionName: 'orders';
  info: {
    description: '';
    displayName: 'Order';
    pluralName: 'orders';
    singularName: 'order';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer_contact: Schema.Attribute.Component<'order.order-contact', false>;
    label_image: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::order.order'> &
      Schema.Attribute.Private;
    order_id: Schema.Attribute.UID & Schema.Attribute.Required;
    order_secret: Schema.Attribute.String;
    payment_status: Schema.Attribute.String & Schema.Attribute.Required;
    products: Schema.Attribute.Component<'order.order-products', false>;
    publishedAt: Schema.Attribute.DateTime;
    rate_id: Schema.Attribute.String;
    shipping_id: Schema.Attribute.String;
    shipping_label: Schema.Attribute.JSON;
    shipping_name: Schema.Attribute.String;
    shipping_price: Schema.Attribute.Decimal;
    stripe_id: Schema.Attribute.String;
    stripe_request: Schema.Attribute.JSON;
    stripe_response_webhook: Schema.Attribute.JSON;
    stripe_url: Schema.Attribute.Text;
    subtotal: Schema.Attribute.Decimal;
    total: Schema.Attribute.Decimal;
    tracking_code: Schema.Attribute.String;
    tracking_url: Schema.Attribute.Text;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user_id: Schema.Attribute.String;
  };
}

export interface ApiPayPayrollRunPayPayrollRun
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_payroll_runs';
  info: {
    description: 'Monthly or periodic payroll processing batches';
    displayName: 'Payroll Run';
    pluralName: 'pay-payroll-runs';
    singularName: 'pay-payroll-run';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payroll-run.pay-payroll-run'
    > &
      Schema.Attribute.Private;
    payslips: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payslip.pay-payslip'
    >;
    period_end: Schema.Attribute.Date & Schema.Attribute.Required;
    period_start: Schema.Attribute.Date & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['Draft', 'Processed', 'Cancelled']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    total_deductions: Schema.Attribute.Decimal;
    total_gross: Schema.Attribute.Decimal;
    total_net: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayPayslipPayPayslip extends Struct.CollectionTypeSchema {
  collectionName: 'pay_payslips';
  info: {
    description: 'Individual employee payslips per payroll run';
    displayName: 'Payslip';
    pluralName: 'pay-payslips';
    singularName: 'pay-payslip';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deductions: Schema.Attribute.Decimal;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    gross: Schema.Attribute.Decimal;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payslip.pay-payslip'
    > &
      Schema.Attribute.Private;
    net_pay: Schema.Attribute.Decimal;
    payroll_run: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payroll-run.pay-payroll-run'
    >;
    period: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['Pending', 'Paid']> &
      Schema.Attribute.DefaultTo<'Pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPaySalaryStructurePaySalaryStructure
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_salary_structures';
  info: {
    description: 'Defines salary grades and base compensation';
    displayName: 'Salary Structure';
    pluralName: 'pay-salary-structures';
    singularName: 'pay-salary-structure';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    base_salary: Schema.Attribute.Decimal & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-salary-structure.pay-salary-structure'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPaymentPayment extends Struct.CollectionTypeSchema {
  collectionName: 'payments';
  info: {
    displayName: 'Payment';
    pluralName: 'payments';
    singularName: 'payment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal;
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    cash_received: Schema.Attribute.Decimal;
    cash_register: Schema.Attribute.Relation<
      'manyToOne',
      'api::cash-register.cash-register'
    >;
    change: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    due: Schema.Attribute.Decimal;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::payment.payment'
    > &
      Schema.Attribute.Private;
    payment_date: Schema.Attribute.DateTime;
    payment_method: Schema.Attribute.Enumeration<
      ['Cash', 'Card', 'Bank', 'Mobile Wallet', 'Exchange Return']
    >;
    publishedAt: Schema.Attribute.DateTime;
    sale: Schema.Attribute.Relation<'manyToOne', 'api::sale.sale'>;
    transaction_no: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiProductGroupProductGroup
  extends Struct.CollectionTypeSchema {
  collectionName: 'product_groups';
  info: {
    description: '';
    displayName: 'Product Groups';
    pluralName: 'product-groups';
    singularName: 'product-group';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    cover_image: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gallery: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::product-group.product-group'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    products: Schema.Attribute.Relation<'manyToMany', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiProductProduct extends Struct.CollectionTypeSchema {
  collectionName: 'products';
  info: {
    description: 'Items sold in the POS';
    displayName: 'Product';
    pluralName: 'products';
    singularName: 'product';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    barcode: Schema.Attribute.String;
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    brands: Schema.Attribute.Relation<'manyToMany', 'api::brand.brand'>;
    bundle_units: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    categories: Schema.Attribute.Relation<
      'manyToMany',
      'api::category.category'
    >;
    cost_price: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.RichText;
    gallery: Schema.Attribute.Media<'images' | 'videos' | 'audios', true>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_exchangeable: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    is_returnable: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_variant: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    keywords: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::product.product'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images'>;
    name: Schema.Attribute.String;
    offer_price: Schema.Attribute.Decimal;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    parent: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase_items: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-item.purchase-item'
    >;
    reorder_level: Schema.Attribute.Integer;
    selling_price: Schema.Attribute.Decimal;
    sku: Schema.Attribute.String;
    stock_quantity: Schema.Attribute.Integer;
    summary: Schema.Attribute.RichText;
    supplierCode: Schema.Attribute.String;
    suppliers: Schema.Attribute.Relation<
      'manyToMany',
      'api::supplier.supplier'
    >;
    tax_rate: Schema.Attribute.Decimal;
    terms: Schema.Attribute.Relation<'manyToMany', 'api::term.term'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    variants: Schema.Attribute.Relation<'oneToMany', 'api::product.product'>;
  };
}

export interface ApiPurchaseItemPurchaseItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'purchase_items';
  info: {
    displayName: 'Purchase Item';
    pluralName: 'purchase-items';
    singularName: 'purchase-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    bundle_units: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-item.purchase-item'
    > &
      Schema.Attribute.Private;
    order_units: Schema.Attribute.Integer;
    price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase: Schema.Attribute.Relation<'manyToOne', 'api::purchase.purchase'>;
    quantity: Schema.Attribute.Integer;
    received_quantity: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    status: Schema.Attribute.Enumeration<
      [
        'Draft',
        'Pending',
        'Ordered',
        'Partially Received',
        'Received',
        'Cancelled',
        'Supplier Cancelled',
      ]
    > &
      Schema.Attribute.DefaultTo<'pending'>;
    total: Schema.Attribute.Decimal;
    unit_price: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPurchaseReturnItemPurchaseReturnItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'purchase_return_items';
  info: {
    displayName: 'Purchase Return Item';
    pluralName: 'purchase-return-items';
    singularName: 'purchase-return-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-return-item.purchase-return-item'
    > &
      Schema.Attribute.Private;
    price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase_return: Schema.Attribute.Relation<
      'manyToOne',
      'api::purchase-return.purchase-return'
    >;
    quantity: Schema.Attribute.Integer;
    total: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPurchaseReturnPurchaseReturn
  extends Struct.CollectionTypeSchema {
  collectionName: 'purchase_returns';
  info: {
    displayName: 'Purchase Return';
    pluralName: 'purchase-returns';
    singularName: 'purchase-return';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-return-item.purchase-return-item'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-return.purchase-return'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    purchase: Schema.Attribute.Relation<'manyToOne', 'api::purchase.purchase'>;
    return_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    return_no: Schema.Attribute.String & Schema.Attribute.Required;
    total_refund: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPurchasePurchase extends Struct.CollectionTypeSchema {
  collectionName: 'purchases';
  info: {
    displayName: 'Purchases';
    pluralName: 'purchases';
    singularName: 'purchase';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    approval_status: Schema.Attribute.Enumeration<
      [
        'Draft',
        'Pending Approval',
        'Not Required',
        'Approved',
        'Rejected',
        'Revised',
      ]
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gallery: Schema.Attribute.Media<'images', true>;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase-item.purchase-item'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::purchase.purchase'
    > &
      Schema.Attribute.Private;
    order_date: Schema.Attribute.DateTime;
    order_recieved_date: Schema.Attribute.DateTime;
    orderId: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    receipts: Schema.Attribute.Media<
      'files' | 'images' | 'videos' | 'audios',
      true
    >;
    status: Schema.Attribute.Enumeration<
      [
        'Draft',
        'Pending',
        'Submitted',
        'Partially Received',
        'Received',
        'Closed',
        'Cancelled',
      ]
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    suppliers: Schema.Attribute.Relation<
      'manyToMany',
      'api::supplier.supplier'
    >;
    total: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSaleItemSaleItem extends Struct.CollectionTypeSchema {
  collectionName: 'sale_items';
  info: {
    displayName: 'Sale Item';
    pluralName: 'sale-items';
    singularName: 'sale-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    discount: Schema.Attribute.Decimal;
    discount_percentage: Schema.Attribute.Decimal;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-item.sale-item'
    > &
      Schema.Attribute.Private;
    price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    quantity: Schema.Attribute.Integer;
    sale: Schema.Attribute.Relation<'manyToOne', 'api::sale.sale'>;
    subtotal: Schema.Attribute.Decimal;
    tax: Schema.Attribute.Decimal;
    total: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSaleReturnItemSaleReturnItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'sale_return_items';
  info: {
    displayName: 'Sale Return Item';
    pluralName: 'sale-return-items';
    singularName: 'sale-return-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-return-item.sale-return-item'
    > &
      Schema.Attribute.Private;
    price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    quantity: Schema.Attribute.Integer;
    sale_return: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-return.sale-return'
    >;
    total: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSaleReturnSaleReturn extends Struct.CollectionTypeSchema {
  collectionName: 'sale_returns';
  info: {
    displayName: 'Sale Return';
    pluralName: 'sale-returns';
    singularName: 'sale-return';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    exchange_sale: Schema.Attribute.Relation<'oneToOne', 'api::sale.sale'>;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-return-item.sale-return-item'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-return.sale-return'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    return_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    return_no: Schema.Attribute.String & Schema.Attribute.Required;
    sale: Schema.Attribute.Relation<'manyToOne', 'api::sale.sale'>;
    total_refund: Schema.Attribute.Decimal;
    type: Schema.Attribute.Enumeration<['Return', 'Exchange']> &
      Schema.Attribute.DefaultTo<'Return'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSaleSale extends Struct.CollectionTypeSchema {
  collectionName: 'sales';
  info: {
    displayName: 'Sale';
    pluralName: 'sales';
    singularName: 'sale';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    cash_register: Schema.Attribute.Relation<
      'manyToOne',
      'api::cash-register.cash-register'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer: Schema.Attribute.Relation<'manyToOne', 'api::customer.customer'>;
    discount: Schema.Attribute.Decimal;
    employee: Schema.Attribute.Relation<'manyToOne', 'api::employee.employee'>;
    invoice_no: Schema.Attribute.String & Schema.Attribute.Required;
    items: Schema.Attribute.Relation<'oneToMany', 'api::sale-item.sale-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::sale.sale'> &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    payment_status: Schema.Attribute.Enumeration<
      ['Paid', 'Partial', 'Unpaid']
    > &
      Schema.Attribute.DefaultTo<'Unpaid'>;
    payments: Schema.Attribute.Relation<'oneToMany', 'api::payment.payment'>;
    publishedAt: Schema.Attribute.DateTime;
    return_status: Schema.Attribute.Enumeration<
      ['None', 'Returned', 'PartiallyReturned']
    > &
      Schema.Attribute.DefaultTo<'None'>;
    sale_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    sale_returns: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-return.sale-return'
    >;
    subtotal: Schema.Attribute.Decimal;
    tax: Schema.Attribute.Decimal;
    total: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockInputStockInput extends Struct.CollectionTypeSchema {
  collectionName: 'stock_inputs';
  info: {
    description: 'Stock intake via barcode, OCR, or manual entry';
    displayName: 'Stock Inputs';
    pluralName: 'stock-inputs';
    singularName: 'stock-input';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    auto: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    barcode: Schema.Attribute.String;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    brandName: Schema.Attribute.String;
    category: Schema.Attribute.Relation<'manyToOne', 'api::category.category'>;
    categoryName: Schema.Attribute.String;
    costPrice: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    images: Schema.Attribute.Media<'images', true>;
    importName: Schema.Attribute.String;
    keywords: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>;
    lastError: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-input.stock-input'
    > &
      Schema.Attribute.Private;
    offerPrice: Schema.Attribute.Decimal;
    orderId: Schema.Attribute.String;
    process: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    processed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    processedAt: Schema.Attribute.DateTime;
    processedOk: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    productName: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    purchase: Schema.Attribute.Relation<'manyToOne', 'api::purchase.purchase'>;
    purchaseItem: Schema.Attribute.Relation<
      'manyToOne',
      'api::purchase-item.purchase-item'
    >;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    sellableUnits: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    sellingPrice: Schema.Attribute.Decimal;
    stockItems: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
    supplier: Schema.Attribute.Relation<'manyToOne', 'api::supplier.supplier'>;
    supplierCode: Schema.Attribute.String;
    supplierName: Schema.Attribute.String;
    terms: Schema.Attribute.Relation<'manyToMany', 'api::term.term'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockItemStockItem extends Struct.CollectionTypeSchema {
  collectionName: 'stock_items';
  info: {
    displayName: 'Stock Item';
    pluralName: 'stock-items';
    singularName: 'stock-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    barcode: Schema.Attribute.String & Schema.Attribute.Unique;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    cost_price: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    discount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-item.stock-item'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    offer_price: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase_item: Schema.Attribute.Relation<
      'manyToOne',
      'api::purchase-item.purchase-item'
    >;
    sale_item: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-item.sale-item'
    >;
    sale_return_item: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-return-item.sale-return-item'
    >;
    sellable_units: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    selling_price: Schema.Attribute.Decimal;
    sku: Schema.Attribute.String;
    sold_units: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
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
      ]
    > &
      Schema.Attribute.DefaultTo<'InStock'>;
    status_history: Schema.Attribute.Component<
      'pos.stock-status-history',
      true
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSupplierSupplier extends Struct.CollectionTypeSchema {
  collectionName: 'suppliers';
  info: {
    displayName: 'Supplier';
    pluralName: 'suppliers';
    singularName: 'supplier';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    address: Schema.Attribute.Text;
    contact_person: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    keywords: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::supplier.supplier'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    products: Schema.Attribute.Relation<'manyToMany', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchases: Schema.Attribute.Relation<
      'manyToMany',
      'api::purchase.purchase'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiTermTypeTermType extends Struct.CollectionTypeSchema {
  collectionName: 'term_types';
  info: {
    displayName: 'Term Type';
    pluralName: 'term-types';
    singularName: 'term-type';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    is_public: Schema.Attribute.Boolean;
    is_variant: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::term-type.term-type'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    terms: Schema.Attribute.Relation<'manyToMany', 'api::term.term'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiTermTerm extends Struct.CollectionTypeSchema {
  collectionName: 'terms';
  info: {
    displayName: 'Term';
    pluralName: 'terms';
    singularName: 'term';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gallery: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios',
      true
    >;
    keywords: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::term.term'> &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    term_types: Schema.Attribute.Relation<
      'manyToMany',
      'api::term-type.term-type'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginContentReleasesRelease
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_releases';
  info: {
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    actions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    releasedAt: Schema.Attribute.DateTime;
    scheduledAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Schema.Attribute.Required;
    timezone: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_release_actions';
  info: {
    displayName: 'Release Action';
    pluralName: 'release-actions';
    singularName: 'release-action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentType: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entryDocumentId: Schema.Attribute.String;
    isEntryValid: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    release: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::content-releases.release'
    >;
    type: Schema.Attribute.Enumeration<['publish', 'unpublish']> &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginI18NLocale extends Struct.CollectionTypeSchema {
  collectionName: 'i18n_locale';
  info: {
    collectionName: 'locales';
    description: '';
    displayName: 'Locale';
    pluralName: 'locales';
    singularName: 'locale';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String & Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::i18n.locale'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMax<
        {
          max: 50;
          min: 1;
        },
        number
      >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflow
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows';
  info: {
    description: '';
    displayName: 'Workflow';
    name: 'Workflow';
    pluralName: 'workflows';
    singularName: 'workflow';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentTypes: Schema.Attribute.JSON &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'[]'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    stageRequiredToPublish: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::review-workflows.workflow-stage'
    >;
    stages: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflowStage
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows_stages';
  info: {
    description: '';
    displayName: 'Stages';
    name: 'Workflow Stage';
    pluralName: 'workflow-stages';
    singularName: 'workflow-stage';
  };
  options: {
    draftAndPublish: false;
    version: '1.1.0';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    color: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#4945FF'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    permissions: Schema.Attribute.Relation<'manyToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    workflow: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::review-workflows.workflow'
    >;
  };
}

export interface PluginUploadFile extends Struct.CollectionTypeSchema {
  collectionName: 'files';
  info: {
    description: '';
    displayName: 'File';
    pluralName: 'files';
    singularName: 'file';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    alternativeText: Schema.Attribute.Text;
    caption: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    ext: Schema.Attribute.String;
    focalPoint: Schema.Attribute.JSON;
    folder: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'> &
      Schema.Attribute.Private;
    folderPath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    formats: Schema.Attribute.JSON;
    hash: Schema.Attribute.String & Schema.Attribute.Required;
    height: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.file'
    > &
      Schema.Attribute.Private;
    mime: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    previewUrl: Schema.Attribute.Text;
    provider: Schema.Attribute.String & Schema.Attribute.Required;
    provider_metadata: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    related: Schema.Attribute.Relation<'morphToMany'>;
    size: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.Text & Schema.Attribute.Required;
    width: Schema.Attribute.Integer;
  };
}

export interface PluginUploadFolder extends Struct.CollectionTypeSchema {
  collectionName: 'upload_folders';
  info: {
    displayName: 'Folder';
    pluralName: 'folders';
    singularName: 'folder';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    children: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.folder'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    files: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.file'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.folder'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    parent: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'>;
    path: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    pathId: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsMe extends Struct.CollectionTypeSchema {
  collectionName: 'up_me';
  info: {
    description: '';
    displayName: 'me';
    name: 'me';
    pluralName: 'mes';
    singularName: 'me';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.me'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

export interface PluginUsersPermissionsPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.String & Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface PluginUsersPermissionsUser
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'user';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    admin_app_accesses: Schema.Attribute.Relation<
      'manyToMany',
      'api::app-access.app-access'
    >;
    app_accesses: Schema.Attribute.Relation<
      'manyToMany',
      'api::app-access.app-access'
    >;
    blocked: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    confirmationToken: Schema.Attribute.String & Schema.Attribute.Private;
    confirmed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    displayName: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    isStaff: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    > &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    provider: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ContentTypeSchemas {
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::permission': AdminPermission;
      'admin::role': AdminRole;
      'admin::session': AdminSession;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'admin::user': AdminUser;
      'api::acc-account.acc-account': ApiAccAccountAccAccount;
      'api::acc-expense.acc-expense': ApiAccExpenseAccExpense;
      'api::acc-invoice.acc-invoice': ApiAccInvoiceAccInvoice;
      'api::acc-journal-entry.acc-journal-entry': ApiAccJournalEntryAccJournalEntry;
      'api::app-access.app-access': ApiAppAccessAppAccess;
      'api::branch.branch': ApiBranchBranch;
      'api::brand.brand': ApiBrandBrand;
      'api::cash-register-transaction.cash-register-transaction': ApiCashRegisterTransactionCashRegisterTransaction;
      'api::cash-register.cash-register': ApiCashRegisterCashRegister;
      'api::category.category': ApiCategoryCategory;
      'api::crm-activity.crm-activity': ApiCrmActivityCrmActivity;
      'api::crm-contact.crm-contact': ApiCrmContactCrmContact;
      'api::crm-lead.crm-lead': ApiCrmLeadCrmLead;
      'api::currency.currency': ApiCurrencyCurrency;
      'api::customer.customer': ApiCustomerCustomer;
      'api::employee.employee': ApiEmployeeEmployee;
      'api::hr-attendance.hr-attendance': ApiHrAttendanceHrAttendance;
      'api::hr-department.hr-department': ApiHrDepartmentHrDepartment;
      'api::hr-employee.hr-employee': ApiHrEmployeeHrEmployee;
      'api::hr-leave-request.hr-leave-request': ApiHrLeaveRequestHrLeaveRequest;
      'api::order.order': ApiOrderOrder;
      'api::pay-payroll-run.pay-payroll-run': ApiPayPayrollRunPayPayrollRun;
      'api::pay-payslip.pay-payslip': ApiPayPayslipPayPayslip;
      'api::pay-salary-structure.pay-salary-structure': ApiPaySalaryStructurePaySalaryStructure;
      'api::payment.payment': ApiPaymentPayment;
      'api::product-group.product-group': ApiProductGroupProductGroup;
      'api::product.product': ApiProductProduct;
      'api::purchase-item.purchase-item': ApiPurchaseItemPurchaseItem;
      'api::purchase-return-item.purchase-return-item': ApiPurchaseReturnItemPurchaseReturnItem;
      'api::purchase-return.purchase-return': ApiPurchaseReturnPurchaseReturn;
      'api::purchase.purchase': ApiPurchasePurchase;
      'api::sale-item.sale-item': ApiSaleItemSaleItem;
      'api::sale-return-item.sale-return-item': ApiSaleReturnItemSaleReturnItem;
      'api::sale-return.sale-return': ApiSaleReturnSaleReturn;
      'api::sale.sale': ApiSaleSale;
      'api::stock-input.stock-input': ApiStockInputStockInput;
      'api::stock-item.stock-item': ApiStockItemStockItem;
      'api::supplier.supplier': ApiSupplierSupplier;
      'api::term-type.term-type': ApiTermTypeTermType;
      'api::term.term': ApiTermTerm;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::review-workflows.workflow': PluginReviewWorkflowsWorkflow;
      'plugin::review-workflows.workflow-stage': PluginReviewWorkflowsWorkflowStage;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.me': PluginUsersPermissionsMe;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
