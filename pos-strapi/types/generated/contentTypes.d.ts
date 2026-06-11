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
    adminPermissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::permission'
    >;
    adminUserOwner: Schema.Attribute.Relation<'manyToOne', 'admin::user'>;
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
    kind: Schema.Attribute.Enumeration<['content-api', 'admin']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'content-api'>;
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
    apiToken: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
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
    apiTokens: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
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

export interface ApiAccAccountMappingAccAccountMapping
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_account_mappings';
  info: {
    description: 'Maps operational events to ledger accounts';
    displayName: 'Account Mapping';
    pluralName: 'acc-account-mappings';
    singularName: 'acc-account-mapping';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-account-mapping.acc-account-mapping'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-account.acc-account'
    >;
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    description: Schema.Attribute.Text;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_system: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-account.acc-account'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    normal_balance: Schema.Attribute.Enumeration<['Debit', 'Credit']> &
      Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    publishedAt: Schema.Attribute.DateTime;
    sub_type: Schema.Attribute.Enumeration<
      [
        'Cash',
        'Bank',
        'Accounts Receivable',
        'Inventory',
        'Fixed Asset',
        'Other Current Asset',
        'Accounts Payable',
        'Tax Payable',
        'Other Current Liability',
        'Long Term Liability',
        'Owner Equity',
        'Retained Earnings',
        'Sales Revenue',
        'Sales Returns',
        'Other Revenue',
        'Cost of Goods Sold',
        'Operating Expense',
        'Payroll Expense',
        'Tax Expense',
        'Other Expense',
      ]
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccBankAccountAccBankAccount
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_bank_accounts';
  info: {
    description: 'Bank and cash accounts linked to ledger accounts';
    displayName: 'Acc Bank Account';
    pluralName: 'acc-bank-accounts';
    singularName: 'acc-bank-account';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account_number: Schema.Attribute.String;
    account_type: Schema.Attribute.Enumeration<
      ['Cash', 'Checking', 'Savings', 'Credit Card', 'Mobile Wallet']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Checking'>;
    bank_name: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    current_balance: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    ledger_account: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-account.acc-account'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-bank-account.acc-bank-account'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccBillAccBill extends Struct.CollectionTypeSchema {
  collectionName: 'acc_bills';
  info: {
    description: 'Supplier bills for accounts payable';
    displayName: 'Acc Bill';
    pluralName: 'acc-bills';
    singularName: 'acc-bill';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount_paid: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    balance_due: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    bill_number: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    due_date: Schema.Attribute.Date & Schema.Attribute.Required;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-bill.acc-bill'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    purchase: Schema.Attribute.Relation<'oneToOne', 'api::purchase.purchase'>;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Received', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Draft'>;
    subtotal: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<0>;
    supplier: Schema.Attribute.Relation<'manyToOne', 'api::supplier.supplier'>;
    supplier_ref: Schema.Attribute.String;
    tax_amount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    total: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<0>;
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
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    category: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
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
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Approved', 'Posted', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccFiscalPeriodAccFiscalPeriod
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_fiscal_periods';
  info: {
    description: 'Fiscal year periods that control journal posting';
    displayName: 'Fiscal Period';
    pluralName: 'acc-fiscal-periods';
    singularName: 'acc-fiscal-period';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    end_date: Schema.Attribute.Date & Schema.Attribute.Required;
    fiscal_year: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-fiscal-period.acc-fiscal-period'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    start_date: Schema.Attribute.Date & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<['Open', 'Closed', 'Locked']> &
      Schema.Attribute.DefaultTo<'Open'>;
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
    amount_paid: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    balance_due: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    customer: Schema.Attribute.Relation<'manyToOne', 'api::customer.customer'>;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    due_date: Schema.Attribute.Date;
    invoice_number: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-invoice.acc-invoice'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    order: Schema.Attribute.Relation<'oneToOne', 'api::sale-order.sale-order'>;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    sale: Schema.Attribute.Relation<'oneToOne', 'api::sale.sale'>;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    subtotal: Schema.Attribute.Decimal & Schema.Attribute.Required;
    tax_amount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    total: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccJournalEntryAccJournalEntry
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_journal_entries';
  info: {
    description: 'Header for a balanced set of journal lines';
    displayName: 'Journal Entry';
    pluralName: 'acc-journal-entries';
    singularName: 'acc-journal-entry';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    entry_number: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    exchange_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    fiscal_period: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-fiscal-period.acc-fiscal-period'
    >;
    lines: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-journal-line.acc-journal-line'
    >;
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
    posted_at: Schema.Attribute.DateTime;
    posted_by: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String;
    reversal_of: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    source_id: Schema.Attribute.Integer;
    source_ref: Schema.Attribute.String;
    source_type: Schema.Attribute.Enumeration<
      [
        'POS Sale',
        'Sale Return',
        'Purchase Order',
        'Purchase Receipt',
        'Purchase Return',
        'Web Order',
        'Cash Register Open',
        'Cash Register Close',
        'Cash Register Transaction',
        'Inventory Adjustment',
        'Expense',
        'Invoice Payment',
        'Bill Payment',
        'Manual',
      ]
    >;
    status: Schema.Attribute.Enumeration<['Draft', 'Posted', 'Reversed']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    total_credit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    total_debit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccJournalLineAccJournalLine
  extends Struct.CollectionTypeSchema {
  collectionName: 'acc_journal_lines';
  info: {
    description: 'Individual debit or credit line within a journal entry';
    displayName: 'Journal Line';
    pluralName: 'acc-journal-lines';
    singularName: 'acc-journal-line';
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
    credit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    debit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    description: Schema.Attribute.String;
    journal_entry: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-journal-line.acc-journal-line'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    tax_amount: Schema.Attribute.Decimal;
    tax_rate: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAccTaxRateAccTaxRate extends Struct.CollectionTypeSchema {
  collectionName: 'acc_tax_rates';
  info: {
    description: 'Configurable tax rates for sales and purchases';
    displayName: 'Acc Tax Rate';
    pluralName: 'acc-tax-rates';
    singularName: 'acc-tax-rate';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::acc-tax-rate.acc-tax-rate'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    purchase_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    rate: Schema.Attribute.Decimal & Schema.Attribute.Required;
    sales_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    scope: Schema.Attribute.Enumeration<['Sales', 'Purchases', 'Both']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Both'>;
    type: Schema.Attribute.Enumeration<['Inclusive', 'Exclusive']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Exclusive'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAddressAddress extends Struct.CollectionTypeSchema {
  collectionName: 'addresses';
  info: {
    description: 'Shipping / billing address tied to a person. Multi-row per person with one default. Optional recipient overrides for gift orders.';
    displayName: 'Address';
    pluralName: 'addresses';
    singularName: 'address';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    archived_at: Schema.Attribute.DateTime;
    city: Schema.Attribute.String;
    country: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    label: Schema.Attribute.String;
    line1: Schema.Attribute.String;
    line2: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::address.address'
    > &
      Schema.Attribute.Private;
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    publishedAt: Schema.Attribute.DateTime;
    recipient_name: Schema.Attribute.String;
    recipient_phone: Schema.Attribute.String;
    state: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    zip_code: Schema.Attribute.String;
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
    instagram: Schema.Attribute.String;
    invoiceTerms: Schema.Attribute.RichText;
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
    printSettings: Schema.Attribute.JSON;
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
    tiktok: Schema.Attribute.String;
    town: Schema.Attribute.String;
    twitter: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    watsapp: Schema.Attribute.String;
    web: Schema.Attribute.String;
    youtube: Schema.Attribute.String;
  };
}

export interface ApiBrandGroupBrandGroup extends Struct.CollectionTypeSchema {
  collectionName: 'brand_groups';
  info: {
    description: 'Groups of brands for display on CMS pages';
    displayName: 'Brand Group';
    pluralName: 'brand-groups';
    singularName: 'brand-group';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    brands: Schema.Attribute.Relation<'manyToMany', 'api::brand.brand'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.RichText;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::brand-group.brand-group'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    sort_order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    summary: Schema.Attribute.RichText;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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
    description: Schema.Attribute.RichText;
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
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    summary: Schema.Attribute.RichText;
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
      ['CashDrop', 'CashTopUp', 'Expense', 'Adjustment', 'Refund']
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
    carry_over_expected: Schema.Attribute.Decimal;
    cash_drawn: Schema.Attribute.Decimal;
    cash_left: Schema.Attribute.Decimal;
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
    opening_note: Schema.Attribute.Text;
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

export interface ApiCategoryGroupCategoryGroup
  extends Struct.CollectionTypeSchema {
  collectionName: 'category_groups';
  info: {
    description: 'Groups of categories for display on CMS pages';
    displayName: 'Category Group';
    pluralName: 'category-groups';
    singularName: 'category-group';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    categories: Schema.Attribute.Relation<
      'manyToMany',
      'api::category.category'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.RichText;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::category-group.category-group'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    sort_order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    summary: Schema.Attribute.RichText;
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
    delivery_methods: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-method.delivery-method'
    >;
    description: Schema.Attribute.RichText;
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
    offers: Schema.Attribute.Relation<
      'manyToMany',
      'api::sale-offer.sale-offer'
    >;
    parent: Schema.Attribute.Relation<'manyToOne', 'api::category.category'>;
    publishedAt: Schema.Attribute.DateTime;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    summary: Schema.Attribute.RichText;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmsFooterCmsFooter extends Struct.CollectionTypeSchema {
  collectionName: 'cms_footers';
  info: {
    description: 'Footer configuration with contact info, hours, social links and pinned pages';
    displayName: 'CMS Footer';
    pluralName: 'cms-footers';
    singularName: 'cms-footer';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    address: Schema.Attribute.Text;
    cms_pages: Schema.Attribute.Relation<'oneToMany', 'api::cms-page.cms-page'>;
    copyright_text: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    custom_body_end_html: Schema.Attribute.Text;
    custom_head_html: Schema.Attribute.Text;
    email: Schema.Attribute.String;
    ga_measurement_id: Schema.Attribute.String;
    gtm_container_id: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-footer.cms-footer'
    > &
      Schema.Attribute.Private;
    meta_pixel_id: Schema.Attribute.String;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    opening_hours: Schema.Attribute.JSON;
    phone: Schema.Attribute.String;
    pinned_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    social_links: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmsMenuItemCmsMenuItem extends Struct.CollectionTypeSchema {
  collectionName: 'cms_menu_items';
  info: {
    description: 'A single navigation entry belonging to a CMS Menu; may link to an entity or URL and nest one level of children';
    displayName: 'CMS Menu Item';
    pluralName: 'cms-menu-items';
    singularName: 'cms-menu-item';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-menu-item.cms-menu-item'
    >;
    cms_page: Schema.Attribute.Relation<'manyToOne', 'api::cms-page.cms-page'>;
    collection_slug: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    icon_image: Schema.Attribute.Media<'images'>;
    label: Schema.Attribute.String;
    link_kind: Schema.Attribute.Enumeration<
      ['cms_page', 'page_group', 'product_group', 'collection', 'url', 'mega']
    > &
      Schema.Attribute.DefaultTo<'url'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-menu-item.cms-menu-item'
    > &
      Schema.Attribute.Private;
    mega_brand_group: Schema.Attribute.Relation<
      'manyToOne',
      'api::brand-group.brand-group'
    >;
    mega_category_group: Schema.Attribute.Relation<
      'manyToOne',
      'api::category-group.category-group'
    >;
    menu: Schema.Attribute.Relation<'manyToOne', 'api::cms-menu.cms-menu'>;
    open_in_new: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    page_group: Schema.Attribute.Relation<
      'manyToOne',
      'api::cms-page-group.cms-page-group'
    >;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::cms-menu-item.cms-menu-item'
    >;
    product_group: Schema.Attribute.Relation<
      'manyToOne',
      'api::product-group.product-group'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String;
  };
}

export interface ApiCmsMenuCmsMenu extends Struct.CollectionTypeSchema {
  collectionName: 'cms_menus';
  info: {
    description: 'CMS-driven navigation menus (top / side / footer) for the storefront';
    displayName: 'CMS Menu';
    pluralName: 'cms-menus';
    singularName: 'cms-menu';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-menu-item.cms-menu-item'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-menu.cms-menu'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    pages: Schema.Attribute.Relation<'manyToMany', 'api::cms-page.cms-page'>;
    position: Schema.Attribute.Enumeration<['top', 'side', 'footer']> &
      Schema.Attribute.DefaultTo<'top'>;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmsPageGroupCmsPageGroup
  extends Struct.CollectionTypeSchema {
  collectionName: 'cms_page_groups';
  info: {
    description: 'Curated groups of CMS pages rendered as flip cards on the storefront';
    displayName: 'CMS Page Group';
    pluralName: 'cms-page-groups';
    singularName: 'cms-page-group';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    columns: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<3>;
    cover_image: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    displayed_on_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    excerpt: Schema.Attribute.RichText;
    layout: Schema.Attribute.Enumeration<['flip-grid', 'grid', 'carousel']> &
      Schema.Attribute.DefaultTo<'flip-grid'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-page-group.cms-page-group'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    pages: Schema.Attribute.Relation<'manyToMany', 'api::cms-page.cms-page'>;
    publishedAt: Schema.Attribute.DateTime;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    sort_order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmsPageCmsPage extends Struct.CollectionTypeSchema {
  collectionName: 'cms_pages';
  info: {
    description: 'Static pages and blog posts for the public website';
    displayName: 'CMS Page';
    pluralName: 'cms-pages';
    singularName: 'cms-page';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    background_image: Schema.Attribute.Media<'images'>;
    brand_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::brand-group.brand-group'
    >;
    category_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::category-group.category-group'
    >;
    content: Schema.Attribute.RichText;
    content_priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<20>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_methods: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-method.delivery-method'
    >;
    enable_contact_form: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    excerpt: Schema.Attribute.RichText;
    excerpt_priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<10>;
    featured_image: Schema.Attribute.Media<'images'>;
    featured_image_priority: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    featured_image_show_overlay: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    footer: Schema.Attribute.Relation<
      'manyToOne',
      'api::cms-footer.cms-footer'
    >;
    gallery: Schema.Attribute.Media<'images' | 'videos', true>;
    gallery_priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<40>;
    hero_product_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::product-group.product-group'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cms-page.cms-page'
    > &
      Schema.Attribute.Private;
    member_page_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page-group.cms-page-group'
    >;
    menus: Schema.Attribute.Relation<'manyToMany', 'api::cms-menu.cms-menu'>;
    offers: Schema.Attribute.Relation<
      'manyToMany',
      'api::sale-offer.sale-offer'
    >;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    page_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page-group.cms-page-group'
    >;
    page_groups_priority: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<45>;
    page_type: Schema.Attribute.Enumeration<
      ['shop', 'blog', 'news', 'info', 'page']
    > &
      Schema.Attribute.DefaultTo<'shop'>;
    product_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::product-group.product-group'
    >;
    product_groups_priority: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<30>;
    publishedAt: Schema.Attribute.DateTime;
    related_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    related_pages_priority: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<50>;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    slug: Schema.Attribute.UID<'title'> & Schema.Attribute.Required;
    sort_order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiContactTicketContactTicket
  extends Struct.CollectionTypeSchema {
  collectionName: 'contact_tickets';
  info: {
    displayName: 'Contact Ticket';
    pluralName: 'contact-tickets';
    singularName: 'contact-ticket';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    assigned_to: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    last_reply_at: Schema.Attribute.DateTime;
    last_reply_by: Schema.Attribute.Enumeration<['user', 'agent']>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::contact-ticket.contact-ticket'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    metadata: Schema.Attribute.JSON;
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    publishedAt: Schema.Attribute.DateTime;
    resolved_at: Schema.Attribute.DateTime;
    sla_due_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['open', 'in_progress', 'waiting', 'resolved']
    > &
      Schema.Attribute.DefaultTo<'open'>;
    subject: Schema.Attribute.String & Schema.Attribute.Required;
    ticket_no: Schema.Attribute.UID<'subject'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
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
    assigned_to: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    company: Schema.Attribute.String;
    contact: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-contact.crm-contact'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer: Schema.Attribute.Relation<'manyToOne', 'api::customer.customer'>;
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

export interface ApiDeliveryMethodDeliveryMethod
  extends Struct.CollectionTypeSchema {
  collectionName: 'delivery_methods';
  info: {
    displayName: 'Delivery Method';
    pluralName: 'delivery-methods';
    singularName: 'delivery-method';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    base_cost: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    categories: Schema.Attribute.Relation<
      'manyToMany',
      'api::category.category'
    >;
    cms_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_zones: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-zone.delivery-zone'
    >;
    description: Schema.Attribute.Text;
    estimated_days_max: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<3>;
    estimated_days_min: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<1>;
    free_shipping_threshold: Schema.Attribute.Decimal;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::delivery-method.delivery-method'
    > &
      Schema.Attribute.Private;
    max_riders_to_offer: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<10>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    offer_timeout_minutes: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<5>;
    per_kg_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    product_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::product-group.product-group'
    >;
    publishedAt: Schema.Attribute.DateTime;
    service_provider: Schema.Attribute.Enumeration<
      ['own_rider', 'easypost', 'custom']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'own_rider'>;
    supports_cod: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiDeliveryOfferDeliveryOffer
  extends Struct.CollectionTypeSchema {
  collectionName: 'delivery_offers';
  info: {
    description: 'Rider assignment offer for delivering customer orders';
    displayName: 'Delivery Offer';
    pluralName: 'delivery-offers';
    singularName: 'delivery-offer';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_fee: Schema.Attribute.Decimal;
    estimated_distance_km: Schema.Attribute.Decimal;
    expires_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::delivery-offer.delivery-offer'
    > &
      Schema.Attribute.Private;
    offered_at: Schema.Attribute.DateTime;
    order: Schema.Attribute.Relation<'manyToOne', 'api::sale-order.sale-order'>;
    publishedAt: Schema.Attribute.DateTime;
    responded_at: Schema.Attribute.DateTime;
    rider: Schema.Attribute.Relation<'manyToOne', 'api::rider.rider'>;
    status: Schema.Attribute.Enumeration<
      ['pending', 'accepted', 'rejected', 'expired']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiDeliveryZoneDeliveryZone
  extends Struct.CollectionTypeSchema {
  collectionName: 'delivery_zones';
  info: {
    displayName: 'Delivery Zone';
    pluralName: 'delivery-zones';
    singularName: 'delivery-zone';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    cities: Schema.Attribute.JSON;
    countries: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_methods: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-method.delivery-method'
    >;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::delivery-zone.delivery-zone'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    postal_code_patterns: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    riders: Schema.Attribute.Relation<'manyToMany', 'api::rider.rider'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    zone_type: Schema.Attribute.Enumeration<
      ['domestic_own_rider', 'domestic_courier', 'international']
    > &
      Schema.Attribute.Required;
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
    teams: Schema.Attribute.Relation<'oneToMany', 'api::hr-team.hr-team'>;
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
    managed_teams: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-team.hr-team'
    >;
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
    teams: Schema.Attribute.Relation<'manyToMany', 'api::hr-team.hr-team'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
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

export interface ApiHrTeamHrTeam extends Struct.CollectionTypeSchema {
  collectionName: 'hr_teams';
  info: {
    description: 'Management teams with hierarchy, manager and members';
    displayName: 'HR Team';
    pluralName: 'hr-teams';
    singularName: 'hr-team';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    app_roles: Schema.Attribute.JSON;
    child_teams: Schema.Attribute.Relation<'oneToMany', 'api::hr-team.hr-team'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-team.hr-team'
    > &
      Schema.Attribute.Private;
    members: Schema.Attribute.Relation<
      'manyToMany',
      'api::hr-employee.hr-employee'
    >;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent_team: Schema.Attribute.Relation<'manyToOne', 'api::hr-team.hr-team'>;
    publishedAt: Schema.Attribute.DateTime;
    seeded_from_app_access: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    team_manager: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    team_slug: Schema.Attribute.UID<'name'> &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMfgBomMfgBom extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_boms';
  info: {
    description: 'Versioned bill of materials + routing for a finished product';
    displayName: 'Mfg BOM';
    pluralName: 'mfg-boms';
    singularName: 'mfg-bom';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    local_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-bom.mfg-bom'
    > &
      Schema.Attribute.Private;
    material_lines: Schema.Attribute.Component<'mfg.bom-line', true>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    output_quantity: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    routing_steps: Schema.Attribute.Component<'mfg.routing-step', true>;
    status: Schema.Attribute.Enumeration<['Draft', 'Active', 'Archived']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    version: Schema.Attribute.String & Schema.Attribute.DefaultTo<'1'>;
    work_orders: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiMfgBundleMfgBundle extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_bundles';
  info: {
    description: 'WIP traceability unit: a tied bundle of cut pieces moving through operations';
    displayName: 'Mfg Bundle';
    pluralName: 'mfg-bundles';
    singularName: 'mfg-bundle';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    bundle_code: Schema.Attribute.String & Schema.Attribute.Unique;
    color: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    current_operation: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-operation.mfg-operation'
    >;
    current_operation_seq: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-bundle.mfg-bundle'
    > &
      Schema.Attribute.Private;
    material_issues: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-issue.mfg-material-issue'
    >;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    qc_inspections: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-qc-inspection.mfg-qc-inspection'
    >;
    quantity: Schema.Attribute.Integer & Schema.Attribute.Required;
    quantity_completed: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    quantity_rejected: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    size: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      [
        'Created',
        'Issued',
        'InProgress',
        'QCHold',
        'Completed',
        'Rejected',
        'Scrapped',
      ]
    > &
      Schema.Attribute.DefaultTo<'Created'>;
    tasks: Schema.Attribute.Relation<'oneToMany', 'api::mfg-task.mfg-task'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiMfgDefectTypeMfgDefectType
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_defect_types';
  info: {
    description: 'QC defect catalogue';
    displayName: 'Mfg Defect Type';
    pluralName: 'mfg-defect-types';
    singularName: 'mfg-defect-type';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attributable_to_worker: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    code: Schema.Attribute.UID<'name'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_reworkable: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    local_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-defect-type.mfg-defect-type'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    operations: Schema.Attribute.Relation<
      'manyToMany',
      'api::mfg-operation.mfg-operation'
    >;
    publishedAt: Schema.Attribute.DateTime;
    severity: Schema.Attribute.Enumeration<['minor', 'major', 'critical']> &
      Schema.Attribute.DefaultTo<'minor'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMfgMaterialIssueMfgMaterialIssue
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_material_issues';
  info: {
    description: 'Immutable issue/return/wastage ledger row against a material lot and work order';
    displayName: 'Mfg Material Issue';
    pluralName: 'mfg-material-issues';
    singularName: 'mfg-material-issue';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    bundle: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-bundle.mfg-bundle'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    issue_type: Schema.Attribute.Enumeration<
      ['Issue', 'Return', 'Wastage', 'Adjustment']
    > &
      Schema.Attribute.DefaultTo<'Issue'>;
    issued_at: Schema.Attribute.DateTime;
    issued_by: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-issue.mfg-material-issue'
    > &
      Schema.Attribute.Private;
    material_lot: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-material-lot.mfg-material-lot'
    >;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    quantity: Schema.Attribute.Decimal & Schema.Attribute.Required;
    total_cost: Schema.Attribute.Decimal;
    unit_cost: Schema.Attribute.Decimal;
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
      Schema.Attribute.DefaultTo<'meter'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiMfgMaterialLotMfgMaterialLot
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_material_lots';
  info: {
    description: 'Quantity-based ledger for bulk raw materials (fabric rolls, thread, trims)';
    displayName: 'Mfg Material Lot';
    pluralName: 'mfg-material-lots';
    singularName: 'mfg-material-lot';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    color: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dye_lot: Schema.Attribute.String;
    expiry: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-lot.mfg-material-lot'
    > &
      Schema.Attribute.Private;
    lot_code: Schema.Attribute.String & Schema.Attribute.Unique;
    material_issues: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-issue.mfg-material-issue'
    >;
    name: Schema.Attribute.String;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    purchase_item: Schema.Attribute.Relation<
      'manyToOne',
      'api::purchase-item.purchase-item'
    >;
    quantity_received: Schema.Attribute.Decimal & Schema.Attribute.Required;
    quantity_remaining: Schema.Attribute.Decimal & Schema.Attribute.Required;
    quantity_reserved: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    received_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'Available',
        'Reserved',
        'PartiallyConsumed',
        'Consumed',
        'Returned',
        'Scrapped',
        'Quarantined',
      ]
    > &
      Schema.Attribute.DefaultTo<'Available'>;
    supplier: Schema.Attribute.Relation<'manyToOne', 'api::supplier.supplier'>;
    total_cost: Schema.Attribute.Decimal;
    unit_cost: Schema.Attribute.Decimal;
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
      Schema.Attribute.DefaultTo<'meter'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    width: Schema.Attribute.String;
  };
}

export interface ApiMfgOperationMfgOperation
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_operations';
  info: {
    description: 'Catalogue of production operations (cutting, stitching, finishing, QC, packing...)';
    displayName: 'Mfg Operation';
    pluralName: 'mfg-operations';
    singularName: 'mfg-operation';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      ['cutting', 'sewing', 'finishing', 'qc', 'packing', 'other']
    > &
      Schema.Attribute.DefaultTo<'sewing'>;
    code: Schema.Attribute.UID<'name'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    default_uom: Schema.Attribute.Enumeration<
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
    defect_types: Schema.Attribute.Relation<
      'manyToMany',
      'api::mfg-defect-type.mfg-defect-type'
    >;
    description: Schema.Attribute.Text;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    local_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-operation.mfg-operation'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    piece_rates: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-piece-rate.mfg-piece-rate'
    >;
    publishedAt: Schema.Attribute.DateTime;
    sequence_hint: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMfgPieceRateMfgPieceRate
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_piece_rates';
  info: {
    description: 'Tiered, effective-dated piece-rate card (operation x product x skill grade x qty band)';
    displayName: 'Mfg Piece Rate';
    pluralName: 'mfg-piece-rates';
    singularName: 'mfg-piece-rate';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    effective_from: Schema.Attribute.Date;
    effective_to: Schema.Attribute.Date;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-piece-rate.mfg-piece-rate'
    > &
      Schema.Attribute.Private;
    max_qty: Schema.Attribute.Integer;
    min_qty: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    operation: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-operation.mfg-operation'
    >;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    rate: Schema.Attribute.Decimal & Schema.Attribute.Required;
    skill_grade: Schema.Attribute.Enumeration<
      ['A', 'B', 'C', 'trainee', 'any']
    > &
      Schema.Attribute.DefaultTo<'any'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMfgProductionLineMfgProductionLine
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_production_lines';
  info: {
    description: 'Production line / floor / section (lightweight tree)';
    displayName: 'Mfg Production Line';
    pluralName: 'mfg-production-lines';
    singularName: 'mfg-production-line';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-production-line.mfg-production-line'
    >;
    code: Schema.Attribute.UID<'name'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    local_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-production-line.mfg-production-line'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    supervisor: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_orders: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-work-order.mfg-work-order'
    >;
    workers: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-worker-profile.mfg-worker-profile'
    >;
  };
}

export interface ApiMfgQcInspectionMfgQcInspection
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_qc_inspections';
  info: {
    description: 'A quality-control inspection event with defect lines and worker accountability';
    displayName: 'Mfg QC Inspection';
    pluralName: 'mfg-qc-inspections';
    singularName: 'mfg-qc-inspection';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    bundle: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-bundle.mfg-bundle'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    defect_lines: Schema.Attribute.Component<'mfg.qc-defect-line', true>;
    inspected_at: Schema.Attribute.DateTime;
    inspector: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-qc-inspection.mfg-qc-inspection'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    operation: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-operation.mfg-operation'
    >;
    publishedAt: Schema.Attribute.DateTime;
    quantity_failed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    quantity_inspected: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    quantity_passed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    quantity_rework: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    result: Schema.Attribute.Enumeration<
      ['Pass', 'Fail', 'PartialPass', 'Rework']
    > &
      Schema.Attribute.DefaultTo<'Pass'>;
    stage: Schema.Attribute.Enumeration<['InProcess', 'Final']> &
      Schema.Attribute.DefaultTo<'Final'>;
    task: Schema.Attribute.Relation<'manyToOne', 'api::mfg-task.mfg-task'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiMfgTaskMfgTask extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_tasks';
  info: {
    description: 'A worker doing one operation on a work order / bundle. Drives worker KPIs and piece-rate payroll.';
    displayName: 'Mfg Task';
    pluralName: 'mfg-tasks';
    singularName: 'mfg-task';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    approved_at: Schema.Attribute.DateTime;
    bundle: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-bundle.mfg-bundle'
    >;
    completed_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    is_rework: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-task.mfg-task'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    operation: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-operation.mfg-operation'
    >;
    payroll_locked: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    payslip: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payslip.pay-payslip'
    >;
    piece_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    piece_rate_card: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-piece-rate.mfg-piece-rate'
    >;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    qc_inspections: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-qc-inspection.mfg-qc-inspection'
    >;
    quantity_assigned: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    quantity_completed: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    quantity_rejected: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    quantity_reworked: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    skill_grade: Schema.Attribute.Enumeration<['A', 'B', 'C', 'trainee']>;
    started_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'Assigned',
        'InProgress',
        'Completed',
        'Approved',
        'Rejected',
        'Reworked',
        'Cancelled',
      ]
    > &
      Schema.Attribute.DefaultTo<'Assigned'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
    worker: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-worker-profile.mfg-worker-profile'
    >;
  };
}

export interface ApiMfgWorkOrderMfgWorkOrder
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_work_orders';
  info: {
    description: 'Production job card: a quantity of a finished product to manufacture';
    displayName: 'Mfg Work Order';
    pluralName: 'mfg-work-orders';
    singularName: 'mfg-work-order';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    bom: Schema.Attribute.Relation<'manyToOne', 'api::mfg-bom.mfg-bom'>;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    bundles: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-bundle.mfg-bundle'
    >;
    completed_at: Schema.Attribute.DateTime;
    cost_per_unit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    due_date: Schema.Attribute.Date;
    finished_stock_items: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-item.stock-item'
    >;
    labor_cost: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-work-order.mfg-work-order'
    > &
      Schema.Attribute.Private;
    material_cost: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    material_issues: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-issue.mfg-material-issue'
    >;
    name: Schema.Attribute.String;
    notes: Schema.Attribute.Text;
    overhead_cost: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    overhead_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    priority: Schema.Attribute.Enumeration<
      ['Low', 'Normal', 'High', 'Urgent']
    > &
      Schema.Attribute.DefaultTo<'Normal'>;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    qc_inspections: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-qc-inspection.mfg-qc-inspection'
    >;
    quantity_completed: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    quantity_ordered: Schema.Attribute.Integer & Schema.Attribute.Required;
    quantity_rejected: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    sale_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-order.sale-order'
    >;
    size_breakup: Schema.Attribute.Component<'mfg.size-breakup', true>;
    stage_key: Schema.Attribute.String;
    started_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Released', 'InProgress', 'OnHold', 'Completed', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    supervisor: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    tasks: Schema.Attribute.Relation<'oneToMany', 'api::mfg-task.mfg-task'>;
    total_cost: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    wo_number: Schema.Attribute.String & Schema.Attribute.Unique;
  };
}

export interface ApiMfgWorkerProfileMfgWorkerProfile
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_worker_profiles';
  info: {
    description: 'Manufacturing facet of a worker (1:1 with hr-employee)';
    displayName: 'Mfg Worker Profile';
    pluralName: 'mfg-worker-profiles';
    singularName: 'mfg-worker-profile';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    default_skill_grade: Schema.Attribute.Enumeration<
      ['A', 'B', 'C', 'trainee']
    > &
      Schema.Attribute.DefaultTo<'C'>;
    employee: Schema.Attribute.Relation<
      'oneToOne',
      'api::hr-employee.hr-employee'
    >;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-worker-profile.mfg-worker-profile'
    > &
      Schema.Attribute.Private;
    production_line: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-production-line.mfg-production-line'
    >;
    publishedAt: Schema.Attribute.DateTime;
    skill_grades: Schema.Attribute.Component<'mfg.skill-grade', true>;
    tasks: Schema.Attribute.Relation<'oneToMany', 'api::mfg-task.mfg-task'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    worker_type: Schema.Attribute.Enumeration<
      ['piece_rate', 'fixed', 'hybrid', 'contractor']
    > &
      Schema.Attribute.DefaultTo<'piece_rate'>;
  };
}

export interface ApiNotificationEventNotificationEvent
  extends Struct.CollectionTypeSchema {
  collectionName: 'notification_events';
  info: {
    displayName: 'Notification Event';
    pluralName: 'notification-events';
    singularName: 'notification-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entity_id: Schema.Attribute.String;
    entity_type: Schema.Attribute.String;
    error_message: Schema.Attribute.Text;
    event_name: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification-event.notification-event'
    > &
      Schema.Attribute.Private;
    notifications: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification.notification'
    >;
    payload: Schema.Attribute.JSON;
    processed_at: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['pending', 'processed', 'failed', 'deduplicated']
    > &
      Schema.Attribute.DefaultTo<'pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiNotificationLogNotificationLog
  extends Struct.CollectionTypeSchema {
  collectionName: 'notification_logs';
  info: {
    displayName: 'Notification Log';
    pluralName: 'notification-logs';
    singularName: 'notification-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      [
        'orders_payments',
        'account_security',
        'cart_activity',
        'wishlist_interest',
        'promotions_offers',
        'customer_support',
        'stock_management',
      ]
    >;
    channel: Schema.Attribute.Enumeration<['in_app', 'email']>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dedup_key: Schema.Attribute.String;
    error_message: Schema.Attribute.Text;
    event_name: Schema.Attribute.String;
    is_duplicate: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification-log.notification-log'
    > &
      Schema.Attribute.Private;
    metadata: Schema.Attribute.JSON;
    notification: Schema.Attribute.Relation<
      'manyToOne',
      'api::notification.notification'
    >;
    order: Schema.Attribute.Relation<'manyToOne', 'api::sale-order.sale-order'>;
    priority: Schema.Attribute.Enumeration<['critical', 'high', 'medium']>;
    publishedAt: Schema.Attribute.DateTime;
    recipient_email: Schema.Attribute.String;
    recipient_role_type: Schema.Attribute.String;
    recipient_user_id: Schema.Attribute.Integer;
    rendered_body: Schema.Attribute.Text;
    rendered_subject: Schema.Attribute.String;
    sent_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['sent', 'failed', 'pending']> &
      Schema.Attribute.DefaultTo<'pending'>;
    template: Schema.Attribute.Relation<
      'manyToOne',
      'api::notification-template.notification-template'
    >;
    trigger_event: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiNotificationPreferenceNotificationPreference
  extends Struct.CollectionTypeSchema {
  collectionName: 'notification_preferences';
  info: {
    displayName: 'Notification Preference';
    pluralName: 'notification-preferences';
    singularName: 'notification-preference';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      [
        'orders_payments',
        'account_security',
        'cart_activity',
        'wishlist_interest',
        'promotions_offers',
        'customer_support',
        'stock_management',
      ]
    > &
      Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email_enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    in_app_enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification-preference.notification-preference'
    > &
      Schema.Attribute.Private;
    minimum_priority: Schema.Attribute.Enumeration<
      ['critical', 'high', 'medium']
    > &
      Schema.Attribute.DefaultTo<'medium'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    > &
      Schema.Attribute.Required;
  };
}

export interface ApiNotificationTemplateNotificationTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'notification_templates';
  info: {
    displayName: 'Notification Template';
    pluralName: 'notification-templates';
    singularName: 'notification-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    audience: Schema.Attribute.Enumeration<
      ['user', 'admin', 'both', 'opposite_party']
    > &
      Schema.Attribute.DefaultTo<'user'>;
    available_variables: Schema.Attribute.JSON;
    body_template: Schema.Attribute.Text;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    category: Schema.Attribute.Enumeration<
      [
        'orders_payments',
        'account_security',
        'cart_activity',
        'wishlist_interest',
        'promotions_offers',
        'customer_support',
        'stock_management',
      ]
    > &
      Schema.Attribute.DefaultTo<'orders_payments'>;
    channel: Schema.Attribute.Enumeration<['email', 'sms', 'both']> &
      Schema.Attribute.DefaultTo<'email'>;
    channels: Schema.Attribute.JSON;
    conditions: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dedup_window_minutes: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<60>;
    delay_minutes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    event_name: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_critical: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    is_enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification-template.notification-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    priority: Schema.Attribute.Enumeration<['critical', 'high', 'medium']> &
      Schema.Attribute.DefaultTo<'medium'>;
    publishedAt: Schema.Attribute.DateTime;
    scope: Schema.Attribute.Enumeration<['global', 'per_branch']> &
      Schema.Attribute.DefaultTo<'global'>;
    send_email: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    send_to: Schema.Attribute.Enumeration<
      ['customer', 'rider', 'staff', 'admin']
    > &
      Schema.Attribute.DefaultTo<'customer'>;
    subject: Schema.Attribute.String;
    trigger_event: Schema.Attribute.Enumeration<
      [
        'order_placed',
        'payment_confirmed',
        'offer_accepted',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'refund_initiated',
        'return_requested',
        'return_approved',
        'return_rejected',
        'return_received',
        'return_completed',
        'cost_change_approval',
      ]
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiNotificationNotification
  extends Struct.CollectionTypeSchema {
  collectionName: 'notifications';
  info: {
    displayName: 'Notification';
    pluralName: 'notifications';
    singularName: 'notification';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    audience: Schema.Attribute.Enumeration<
      ['user', 'admin', 'both', 'opposite_party']
    > &
      Schema.Attribute.DefaultTo<'user'>;
    category: Schema.Attribute.Enumeration<
      [
        'orders_payments',
        'account_security',
        'cart_activity',
        'wishlist_interest',
        'promotions_offers',
        'customer_support',
        'stock_management',
      ]
    > &
      Schema.Attribute.Required;
    channels: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<['in_app']>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dedup_key: Schema.Attribute.String;
    event_name: Schema.Attribute.String & Schema.Attribute.Required;
    is_email_sent: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    is_read: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification.notification'
    > &
      Schema.Attribute.Private;
    logs: Schema.Attribute.Relation<
      'oneToMany',
      'api::notification-log.notification-log'
    >;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    payload: Schema.Attribute.JSON;
    priority: Schema.Attribute.Enumeration<['critical', 'high', 'medium']> &
      Schema.Attribute.DefaultTo<'medium'>;
    publishedAt: Schema.Attribute.DateTime;
    read_at: Schema.Attribute.DateTime;
    recipient_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    reference_id: Schema.Attribute.String;
    reference_type: Schema.Attribute.String;
    template: Schema.Attribute.Relation<
      'manyToOne',
      'api::notification-template.notification-template'
    >;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiOrderMessageOrderMessage
  extends Struct.CollectionTypeSchema {
  collectionName: 'order_messages';
  info: {
    displayName: 'Order Message';
    pluralName: 'order-messages';
    singularName: 'order-message';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_read: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::order-message.order-message'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    order: Schema.Attribute.Relation<'manyToOne', 'api::sale-order.sale-order'>;
    publishedAt: Schema.Attribute.DateTime;
    sender_id: Schema.Attribute.String;
    sender_type: Schema.Attribute.Enumeration<['rider', 'customer', 'staff']> &
      Schema.Attribute.Required;
    sent_at: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayAdjustmentPayAdjustment
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_adjustments';
  info: {
    description: 'Advances, loans, penalties, bonuses and other one-off payroll adjustments';
    displayName: 'Payroll Adjustment';
    pluralName: 'pay-adjustments';
    singularName: 'pay-adjustment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    balance: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    effective_date: Schema.Attribute.Date;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-adjustment.pay-adjustment'
    > &
      Schema.Attribute.Private;
    payroll_run: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payroll-run.pay-payroll-run'
    >;
    payslip: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payslip.pay-payslip'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Text;
    recovery_per_period: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      ['Pending', 'PartiallyApplied', 'Applied', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Pending'>;
    type: Schema.Attribute.Enumeration<
      ['advance', 'loan', 'penalty', 'bonus', 'incentive', 'deduction']
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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
    tasks: Schema.Attribute.Relation<'oneToMany', 'api::mfg-task.mfg-task'>;
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
    sale_return: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-return.sale-return'
    >;
    transaction_no: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPersonDedupAuditPersonDedupAudit
  extends Struct.CollectionTypeSchema {
  collectionName: 'person_dedup_audits';
  info: {
    description: "Audit pile for ambiguous person-match cases the contact-unification backfill and dedup tooling won't auto-resolve.";
    displayName: 'Person Dedup Audit';
    pluralName: 'person-dedup-audits';
    singularName: 'person-dedup-audit';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    candidate_person_ids: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::person-dedup-audit.person-dedup-audit'
    > &
      Schema.Attribute.Private;
    match_kind: Schema.Attribute.Enumeration<
      ['multi_match', 'user_collision', 'name_only', 'manual_hold']
    > &
      Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    proposed_action: Schema.Attribute.Enumeration<
      ['link', 'create_new', 'skip']
    >;
    publishedAt: Schema.Attribute.DateTime;
    resolution: Schema.Attribute.Enumeration<
      ['linked', 'new', 'merged', 'dismissed']
    >;
    resolved_at: Schema.Attribute.DateTime;
    source_document_id: Schema.Attribute.String & Schema.Attribute.Required;
    source_uid: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPersonPerson extends Struct.CollectionTypeSchema {
  collectionName: 'persons';
  info: {
    description: 'Canonical contact identity. One row per real human. Role profiles (customer, crm-contact, hr-employee, rider) attach to this via FK.';
    displayName: 'Person';
    pluralName: 'persons';
    singularName: 'person';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    addresses: Schema.Attribute.Relation<'oneToMany', 'api::address.address'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::person.person'
    > &
      Schema.Attribute.Private;
    merged_into: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    phone: Schema.Attribute.String;
    picture: Schema.Attribute.Media<'images'>;
    provisional_at: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
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
    cms_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    content: Schema.Attribute.RichText;
    cover_image: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    default_sort: Schema.Attribute.Enumeration<
      ['default', 'newest', 'price_asc', 'price_desc']
    > &
      Schema.Attribute.DefaultTo<'default'>;
    delivery_methods: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-method.delivery-method'
    >;
    enable_sort_dropdown: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    enable_view_toggle: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    excerpt: Schema.Attribute.RichText;
    gallery: Schema.Attribute.Media<'images'>;
    layout: Schema.Attribute.Enumeration<
      ['hero-slider', 'grid-4', 'grid-6', 'carousel', 'banner-single', 'list']
    > &
      Schema.Attribute.DefaultTo<'grid-4'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::product-group.product-group'
    > &
      Schema.Attribute.Private;
    max_inline_products: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<12>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    offers: Schema.Attribute.Relation<
      'manyToMany',
      'api::sale-offer.sale-offer'
    >;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    products: Schema.Attribute.Relation<'manyToMany', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    show_brand: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    show_category: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    slug: Schema.Attribute.UID<'name'> & Schema.Attribute.Required;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiProductProduct extends Struct.CollectionTypeSchema {
  collectionName: 'products';
  info: {
    description: 'Items sold in the POS and online is a product and product variants';
    displayName: 'Product';
    pluralName: 'products';
    singularName: 'product';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    barcode: Schema.Attribute.String;
    boms: Schema.Attribute.Relation<'oneToMany', 'api::mfg-bom.mfg-bom'>;
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    brands: Schema.Attribute.Relation<'manyToMany', 'api::brand.brand'>;
    bulk_quantity_on_hand: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
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
    kind: Schema.Attribute.Enumeration<
      [
        'raw_material',
        'consumable',
        'semi_finished',
        'finished_good',
        'service',
      ]
    > &
      Schema.Attribute.DefaultTo<'finished_good'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::product.product'
    > &
      Schema.Attribute.Private;
    logo: Schema.Attribute.Media<'images'>;
    material_lots: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-material-lot.mfg-material-lot'
    >;
    name: Schema.Attribute.String;
    non_returnable: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
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
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    sku: Schema.Attribute.String;
    slug: Schema.Attribute.UID<'name'>;
    stock_quantity: Schema.Attribute.Integer;
    summary: Schema.Attribute.RichText;
    supplierCode: Schema.Attribute.String;
    suppliers: Schema.Attribute.Relation<
      'manyToMany',
      'api::supplier.supplier'
    >;
    tax_rate: Schema.Attribute.Decimal;
    terms: Schema.Attribute.Relation<'manyToMany', 'api::term.term'>;
    track_mode: Schema.Attribute.Enumeration<['serialized', 'bulk']> &
      Schema.Attribute.DefaultTo<'serialized'>;
    unit_of_measure: Schema.Attribute.Enumeration<
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

export interface ApiReturnMethodReturnMethod
  extends Struct.CollectionTypeSchema {
  collectionName: 'return_methods';
  info: {
    description: 'How a customer can return a delivered order. Drives the return-label provider in the same way delivery-method drives the forward-label provider.';
    displayName: 'Return Method';
    pluralName: 'return-methods';
    singularName: 'return-method';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    instructions: Schema.Attribute.Text;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::return-method.return-method'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    pickup_type: Schema.Attribute.Enumeration<
      ['own_rider_pickup', 'courier_dropoff', 'walk_in']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'own_rider_pickup'>;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    return_requests: Schema.Attribute.Relation<
      'oneToMany',
      'api::return-request.return-request'
    >;
    service_provider: Schema.Attribute.Enumeration<
      ['own_rider', 'easypost', 'custom']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'own_rider'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiReturnPolicyReturnPolicy extends Struct.SingleTypeSchema {
  collectionName: 'return_policies';
  info: {
    description: 'Global return-window configuration. MVP scope: one global policy + per-product non_returnable opt-out (on product schema). Future: per-category / per-channel scope rows.';
    displayName: 'Return Policy';
    pluralName: 'return-policies';
    singularName: 'return-policy';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    auto_approve_under_paisa: Schema.Attribute.BigInteger;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    exchange_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::return-policy.return-policy'
    > &
      Schema.Attribute.Private;
    policy_text: Schema.Attribute.RichText;
    publishedAt: Schema.Attribute.DateTime;
    restocking_fee_percent: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    return_shipping_borne_by: Schema.Attribute.Enumeration<
      ['merchant', 'customer']
    > &
      Schema.Attribute.DefaultTo<'merchant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    window_days: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<7>;
  };
}

export interface ApiReturnRequestReturnRequest
  extends Struct.CollectionTypeSchema {
  collectionName: 'return_requests';
  info: {
    description: 'Customer-initiated return of a sale-order; carries the workflow state, line-level restock decisions, and refund record.';
    displayName: 'Return Request';
    pluralName: 'return-requests';
    singularName: 'return-request';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    approved_at: Schema.Attribute.DateTime;
    approved_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    branches: Schema.Attribute.Relation<'manyToMany', 'api::branch.branch'>;
    cancelled_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer_evidence: Schema.Attribute.Media<'images', true>;
    items: Schema.Attribute.Component<'order.return-line', true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::return-request.return-request'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    pickup_carrier_ref: Schema.Attribute.String;
    pickup_method: Schema.Attribute.Enumeration<
      ['customer_ship', 'courier_pickup', 'store_dropoff']
    > &
      Schema.Attribute.DefaultTo<'customer_ship'>;
    pickup_scheduled_at: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
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
      Schema.Attribute.Required;
    reason_notes: Schema.Attribute.Text;
    received_at: Schema.Attribute.DateTime;
    received_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    refund_amount_paisa: Schema.Attribute.BigInteger;
    refund_method: Schema.Attribute.Enumeration<
      ['original_method', 'bank_transfer', 'manual_cash', 'store_credit']
    > &
      Schema.Attribute.DefaultTo<'manual_cash'>;
    refund_notes: Schema.Attribute.Text;
    refund_status: Schema.Attribute.Enumeration<
      ['pending_manual', 'completed']
    > &
      Schema.Attribute.DefaultTo<'pending_manual'>;
    rejection_reason: Schema.Attribute.Text;
    resolution: Schema.Attribute.Enumeration<['refund', 'store_credit']> &
      Schema.Attribute.DefaultTo<'refund'>;
    return_label_generated_at: Schema.Attribute.DateTime;
    return_label_url: Schema.Attribute.Text;
    return_method: Schema.Attribute.Relation<
      'manyToOne',
      'api::return-method.return-method'
    >;
    return_ref: Schema.Attribute.UID & Schema.Attribute.Required;
    sale_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::sale-order.sale-order'
    >;
    stage_key: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      [
        'REQUESTED',
        'APPROVED',
        'REJECTED',
        'AWAITING_PICKUP',
        'RECEIVED',
        'COMPLETED',
        'CANCELLED',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'REQUESTED'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiRiderRider extends Struct.CollectionTypeSchema {
  collectionName: 'riders';
  info: {
    displayName: 'Rider';
    pluralName: 'riders';
    singularName: 'rider';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    assigned_zones: Schema.Attribute.Relation<
      'manyToMany',
      'api::delivery-zone.delivery-zone'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_offers: Schema.Attribute.Relation<
      'oneToMany',
      'api::delivery-offer.delivery-offer'
    >;
    full_name: Schema.Attribute.String & Schema.Attribute.Required;
    license_number: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::rider.rider'> &
      Schema.Attribute.Private;
    max_concurrent_deliveries: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<2>;
    phone: Schema.Attribute.String;
    profile_picture: Schema.Attribute.Media<'images'>;
    publishedAt: Schema.Attribute.DateTime;
    rating: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      ['available', 'on_delivery', 'off_duty', 'suspended']
    > &
      Schema.Attribute.DefaultTo<'off_duty'>;
    total_deliveries_completed: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    vehicle_type: Schema.Attribute.Enumeration<['bike', 'car', 'van']>;
  };
}

export interface ApiSaleAuditLogSaleAuditLog
  extends Struct.CollectionTypeSchema {
  collectionName: 'sale_audit_logs';
  info: {
    description: 'Append-only trail of teller actions on a sale: add/remove/edit items, save, print, checkout, customer changes, notes, payments. Read-only after creation.';
    displayName: 'Sale Audit Log';
    pluralName: 'sale-audit-logs';
    singularName: 'sale-audit-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action: Schema.Attribute.Enumeration<
      [
        'Created',
        'Viewed',
        'ItemAdded',
        'ItemUpdated',
        'ItemRemoved',
        'CustomerSet',
        'CustomerCleared',
        'NoteSaved',
        'Saved',
        'ReceiptPrintedDraft',
        'ReceiptPrintedPaid',
        'CheckedOut',
        'PaymentRecorded',
        'ExchangeReturnLinked',
        'ExchangeReturnRemoved',
        'Cancelled',
      ]
    > &
      Schema.Attribute.Required;
    app_name: Schema.Attribute.String;
    branch_id: Schema.Attribute.Integer;
    branch_name: Schema.Attribute.String;
    cash_register: Schema.Attribute.Relation<
      'manyToOne',
      'api::cash-register.cash-register'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    desk_id: Schema.Attribute.Integer;
    desk_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-audit-log.sale-audit-log'
    > &
      Schema.Attribute.Private;
    performed_at: Schema.Attribute.DateTime & Schema.Attribute.Required;
    performed_by: Schema.Attribute.String;
    performed_by_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    role_key: Schema.Attribute.String;
    sale: Schema.Attribute.Relation<'manyToOne', 'api::sale.sale'>;
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
    items: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
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

export interface ApiSaleOfferSaleOffer extends Struct.CollectionTypeSchema {
  collectionName: 'offers';
  info: {
    description: 'Sales promotion entity for CMS, linked to product groups, CMS pages, and categories';
    displayName: 'Sales Offer';
    pluralName: 'sale-offers';
    singularName: 'sale-offer';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    banner_image: Schema.Attribute.Media<'images'>;
    categories: Schema.Attribute.Relation<
      'manyToMany',
      'api::category.category'
    >;
    cms_pages: Schema.Attribute.Relation<
      'manyToMany',
      'api::cms-page.cms-page'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.RichText;
    discount_mode: Schema.Attribute.Enumeration<
      ['none', 'percent_off', 'fixed_off', 'use_product_offer_price']
    > &
      Schema.Attribute.DefaultTo<'use_product_offer_price'>;
    discount_value: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    end_date: Schema.Attribute.DateTime;
    free_shipping: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-offer.sale-offer'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    product_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::product-group.product-group'
    >;
    publishedAt: Schema.Attribute.DateTime;
    start_date: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSaleOrderSaleOrder extends Struct.CollectionTypeSchema {
  collectionName: 'orders';
  info: {
    description: 'Customer sale order for checkout, fulfillment, and delivery workflows';
    displayName: 'Sale Order';
    pluralName: 'sale-orders';
    singularName: 'sale-order';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    actual_delivery_time: Schema.Attribute.DateTime;
    assigned_rider: Schema.Attribute.Relation<'manyToOne', 'api::rider.rider'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customer_confirmation_notes: Schema.Attribute.Text;
    customer_confirmed_at: Schema.Attribute.DateTime;
    customer_confirmed_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    customer_confirmed_via: Schema.Attribute.Enumeration<
      ['email', 'phone', 'whatsapp', 'in_person']
    >;
    customer_person: Schema.Attribute.Relation<
      'manyToOne',
      'api::person.person'
    >;
    delivery_address: Schema.Attribute.Relation<
      'manyToOne',
      'api::address.address'
    >;
    delivery_cost: Schema.Attribute.Decimal;
    delivery_cost_breakdown: Schema.Attribute.JSON;
    delivery_method: Schema.Attribute.Relation<
      'manyToOne',
      'api::delivery-method.delivery-method'
    >;
    delivery_offers: Schema.Attribute.Relation<
      'oneToMany',
      'api::delivery-offer.delivery-offer'
    >;
    delivery_snapshot: Schema.Attribute.JSON;
    delivery_zone: Schema.Attribute.Relation<
      'manyToOne',
      'api::delivery-zone.delivery-zone'
    >;
    estimated_delivery_time: Schema.Attribute.DateTime;
    label_generated_at: Schema.Attribute.DateTime;
    label_image: Schema.Attribute.Text;
    label_url: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-order.sale-order'
    > &
      Schema.Attribute.Private;
    order_id: Schema.Attribute.UID & Schema.Attribute.Required;
    order_messages: Schema.Attribute.Relation<
      'oneToMany',
      'api::order-message.order-message'
    >;
    order_secret: Schema.Attribute.String;
    order_status: Schema.Attribute.Enumeration<
      [
        'PENDING_PAYMENT',
        'PAYMENT_CONFIRMED',
        'PREPARING',
        'AWAITING_PICKUP',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'FAILED_DELIVERY',
        'RETURN_REQUESTED',
        'RETURN_IN_TRANSIT',
        'RETURNED',
        'REFUND_INITIATED',
        'REFUNDED',
      ]
    > &
      Schema.Attribute.DefaultTo<'PENDING_PAYMENT'>;
    original_subtotal: Schema.Attribute.Decimal;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    paid_amount: Schema.Attribute.Decimal;
    payment_collected_at: Schema.Attribute.DateTime;
    payment_collected_by_note: Schema.Attribute.String;
    payment_collected_by_rider: Schema.Attribute.Relation<
      'manyToOne',
      'api::rider.rider'
    >;
    payment_method: Schema.Attribute.Enumeration<
      ['cod', 'card', 'bank_transfer', 'mobile_wallet', 'online_gateway']
    > &
      Schema.Attribute.DefaultTo<'cod'>;
    payment_status: Schema.Attribute.String & Schema.Attribute.Required;
    payment_verification_notes: Schema.Attribute.Text;
    payment_verification_status: Schema.Attribute.Enumeration<
      ['unverified', 'verified', 'disputed']
    > &
      Schema.Attribute.DefaultTo<'unverified'>;
    payment_verified_at: Schema.Attribute.DateTime;
    payment_verified_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    pending_cost_change: Schema.Attribute.JSON;
    products: Schema.Attribute.Component<'order.order-products', false>;
    publishedAt: Schema.Attribute.DateTime;
    rate_id: Schema.Attribute.String;
    return_label_generated_at: Schema.Attribute.DateTime;
    return_label_url: Schema.Attribute.Text;
    return_method: Schema.Attribute.Relation<
      'manyToOne',
      'api::return-method.return-method'
    >;
    rider_notes: Schema.Attribute.Text;
    savings: Schema.Attribute.Decimal;
    shipping_id: Schema.Attribute.String;
    shipping_label: Schema.Attribute.JSON;
    shipping_name: Schema.Attribute.String;
    shipping_price: Schema.Attribute.Decimal;
    stage_key: Schema.Attribute.String;
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
    items: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
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
    cash_register: Schema.Attribute.Relation<
      'manyToOne',
      'api::cash-register.cash-register'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    desk_id: Schema.Attribute.Integer;
    desk_name: Schema.Attribute.String;
    exchange_sale: Schema.Attribute.Relation<'manyToOne', 'api::sale.sale'>;
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
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    payments: Schema.Attribute.Relation<'oneToMany', 'api::payment.payment'>;
    publishedAt: Schema.Attribute.DateTime;
    refund_method: Schema.Attribute.Enumeration<
      [
        'Cash',
        'Card',
        'Bank',
        'Mobile Wallet',
        'Exchange Return',
        'Store Credit',
      ]
    > &
      Schema.Attribute.DefaultTo<'Cash'>;
    refund_status: Schema.Attribute.Enumeration<
      ['Pending', 'Refunded', 'Credited']
    > &
      Schema.Attribute.DefaultTo<'Pending'>;
    return_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    return_no: Schema.Attribute.String & Schema.Attribute.Required;
    returned_by: Schema.Attribute.String;
    returned_by_user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
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
    canceled_at: Schema.Attribute.DateTime;
    canceled_by: Schema.Attribute.String;
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
    exchange_returns: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-return.sale-return'
    >;
    invoice_no: Schema.Attribute.String & Schema.Attribute.Required;
    items: Schema.Attribute.Relation<'oneToMany', 'api::sale-item.sale-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::sale.sale'> &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
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
    status: Schema.Attribute.Enumeration<['Draft', 'Completed', 'Cancelled']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    subtotal: Schema.Attribute.Decimal;
    tax: Schema.Attribute.Decimal;
    total: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSeoMetaSeoMeta extends Struct.CollectionTypeSchema {
  collectionName: 'seo_metas';
  info: {
    description: 'SEO and social-share metadata attached to a CMS entity.';
    displayName: 'SEO Meta';
    pluralName: 'seo-metas';
    singularName: 'seo-meta';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'oneToOne', 'api::brand.brand'>;
    brand_group: Schema.Attribute.Relation<
      'oneToOne',
      'api::brand-group.brand-group'
    >;
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    category_group: Schema.Attribute.Relation<
      'oneToOne',
      'api::category-group.category-group'
    >;
    cms_page: Schema.Attribute.Relation<'oneToOne', 'api::cms-page.cms-page'>;
    cms_page_group: Schema.Attribute.Relation<
      'oneToOne',
      'api::cms-page-group.cms-page-group'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entity_title: Schema.Attribute.String;
    entity_type: Schema.Attribute.Enumeration<
      [
        'cms-page',
        'product',
        'category',
        'brand',
        'product-group',
        'brand-group',
        'category-group',
        'cms-page-group',
      ]
    > &
      Schema.Attribute.DefaultTo<'cms-page'>;
    keywords: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::seo-meta.seo-meta'
    > &
      Schema.Attribute.Private;
    meta_description: Schema.Attribute.Text;
    meta_title: Schema.Attribute.String;
    noindex: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    og_image: Schema.Attribute.Media<'images'>;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    product_group: Schema.Attribute.Relation<
      'oneToOne',
      'api::product-group.product-group'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSiteSettingSiteSetting extends Struct.SingleTypeSchema {
  collectionName: 'site_settings';
  info: {
    description: 'Global site configuration: branding, SEO defaults, promo banner, navigation labels';
    displayName: 'Site Settings';
    pluralName: 'site-settings';
    singularName: 'site-setting';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    default_footer: Schema.Attribute.Relation<
      'oneToOne',
      'api::cms-footer.cms-footer'
    >;
    default_meta_description: Schema.Attribute.Text;
    default_meta_keywords: Schema.Attribute.String;
    default_meta_title: Schema.Attribute.String;
    default_og_image: Schema.Attribute.Media<'images'>;
    favicon: Schema.Attribute.Media<'images'>;
    header_promo_cta_text: Schema.Attribute.String;
    header_promo_cta_url: Schema.Attribute.String;
    header_promo_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    header_promo_text: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::site-setting.site-setting'
    > &
      Schema.Attribute.Private;
    nav_explore_brands_label: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Explore Brands'>;
    nav_explore_products_label: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Explore Products'>;
    nav_login_label: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Login or Register'>;
    nav_search_placeholder: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Search Products'>;
    publishedAt: Schema.Attribute.DateTime;
    site_description: Schema.Attribute.Text &
      Schema.Attribute.DefaultTo<'Your ultimate destination for premium products at exceptional prices'>;
    site_logo: Schema.Attribute.Media<'images'>;
    site_name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Rutba.pk'>;
    site_tagline: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Premium Products at Exceptional Prices'>;
    site_url: Schema.Attribute.String;
    twitter_handle: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSocialAccountSocialAccount
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_accounts';
  info: {
    description: 'API credentials for connected social media platforms';
    displayName: 'Social Account';
    pluralName: 'social-accounts';
    singularName: 'social-account';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    access_token: Schema.Attribute.Text & Schema.Attribute.Private;
    account_name: Schema.Attribute.String & Schema.Attribute.Required;
    api_key: Schema.Attribute.Text & Schema.Attribute.Private;
    api_secret: Schema.Attribute.Text & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    extra_config: Schema.Attribute.JSON;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-account.social-account'
    > &
      Schema.Attribute.Private;
    page_id: Schema.Attribute.String;
    platform: Schema.Attribute.Enumeration<
      ['instagram', 'facebook', 'x', 'tiktok', 'youtube']
    > &
      Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    refresh_token: Schema.Attribute.Text & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSocialPostSocialPost extends Struct.CollectionTypeSchema {
  collectionName: 'social_posts';
  info: {
    description: 'Social media posts with multi-platform publishing';
    displayName: 'Social Post';
    pluralName: 'social-posts';
    singularName: 'social-post';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    body: Schema.Attribute.Text & Schema.Attribute.Required;
    cover: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-post.social-post'
    > &
      Schema.Attribute.Private;
    platform_results: Schema.Attribute.JSON;
    platforms: Schema.Attribute.JSON & Schema.Attribute.Required;
    post_status: Schema.Attribute.Enumeration<
      [
        'draft',
        'scheduled',
        'publishing',
        'published',
        'partially_published',
        'failed',
      ]
    > &
      Schema.Attribute.DefaultTo<'draft'>;
    products: Schema.Attribute.Relation<'manyToMany', 'api::product.product'>;
    published_at_social: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    scheduled_at: Schema.Attribute.DateTime;
    social_accounts: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-account.social-account'
    >;
    social_replies: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-reply.social-reply'
    >;
    tags: Schema.Attribute.JSON;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    video: Schema.Attribute.Media<'videos', true>;
  };
}

export interface ApiSocialReplySocialReply extends Struct.CollectionTypeSchema {
  collectionName: 'social_replies';
  info: {
    description: 'Replies and comments on social media posts';
    displayName: 'Social Reply';
    pluralName: 'social-replies';
    singularName: 'social-reply';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    author_avatar_url: Schema.Attribute.String;
    author_handle: Schema.Attribute.String;
    author_name: Schema.Attribute.String;
    body: Schema.Attribute.Text & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_outbound: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-reply.social-reply'
    > &
      Schema.Attribute.Private;
    parent_reply: Schema.Attribute.Relation<
      'manyToOne',
      'api::social-reply.social-reply'
    >;
    platform: Schema.Attribute.Enumeration<
      ['instagram', 'facebook', 'x', 'tiktok', 'youtube']
    > &
      Schema.Attribute.Required;
    platform_comment_id: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    replied_at: Schema.Attribute.DateTime;
    social_post: Schema.Attribute.Relation<
      'manyToOne',
      'api::social-post.social-post'
    >;
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
    archived: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    archived_at: Schema.Attribute.DateTime;
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
    sale_items: Schema.Attribute.Relation<
      'manyToMany',
      'api::sale-item.sale-item'
    >;
    sale_return_items: Schema.Attribute.Relation<
      'manyToMany',
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
        'Reduced',
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
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
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

export interface ApiWorkflowWorkflow extends Struct.CollectionTypeSchema {
  collectionName: 'workflows';
  info: {
    description: "Definable stage workflow for an entity (work orders, sale orders); validated and executed by that entity's state machine";
    displayName: 'Workflow';
    pluralName: 'workflows';
    singularName: 'workflow';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    entity_uid: Schema.Attribute.String & Schema.Attribute.Required;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::workflow.workflow'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    stages: Schema.Attribute.Component<'workflow.stage', true>;
    transitions: Schema.Attribute.Component<'workflow.transition', true>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProApiInterface extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_interfaces';
  info: {
    displayName: 'API Interface';
    pluralName: 'api-interfaces';
    singularName: 'api-interface';
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
    filePath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.api-interface'
    > &
      Schema.Attribute.Private;
    methods: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.api-interface-method'
    >;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['generated', 'modified', 'manual']> &
      Schema.Attribute.DefaultTo<'generated'>;
    uid: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProApiInterfaceMethod
  extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_interface_methods';
  info: {
    displayName: 'API Interface Method';
    pluralName: 'api-interface-methods';
    singularName: 'api-interface-method';
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
    action: Schema.Attribute.String;
    apiInterface: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::api-pro.api-interface'
    >;
    appRoles: Schema.Attribute.JSON;
    apps: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    inputSignature: Schema.Attribute.JSON;
    key: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.api-interface-method'
    > &
      Schema.Attribute.Private;
    method: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    path: Schema.Attribute.String & Schema.Attribute.Required;
    policies: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.api-method-policy'
    >;
    publishedAt: Schema.Attribute.DateTime;
    routeTokens: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProApiMethodPolicy
  extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_method_policies';
  info: {
    displayName: 'API Method Policy';
    pluralName: 'api-method-policies';
    singularName: 'api-method-policy';
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
    bodyTemplate: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    filtersTemplate: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    interfaceMethod: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::api-pro.api-interface-method'
    >;
    key: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.api-method-policy'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    populateTemplate: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    publishedAt: Schema.Attribute.DateTime;
    queryTemplate: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    resolverMode: Schema.Attribute.Enumeration<['strict', 'lenient']> &
      Schema.Attribute.DefaultTo<'strict'>;
    roleKey: Schema.Attribute.String & Schema.Attribute.Required;
    templateVersion: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProAppDomain extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_app_domains';
  info: {
    description: 'Shallow app domain grouping';
    displayName: 'App Domain';
    pluralName: 'app-domains';
    singularName: 'app-domain';
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
    appRoles: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::api-pro.app-role'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    isActive: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.app-domain'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProAppRole extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_app_roles';
  info: {
    description: 'Role mapped to Strapi admin role for app context validation';
    displayName: 'App Role';
    pluralName: 'app-roles';
    singularName: 'app-role';
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
    adminRoleCode: Schema.Attribute.String & Schema.Attribute.Required;
    appDomains: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::api-pro.app-domain'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    isActive: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.app-role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
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

export interface PluginApiProAppRoleTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_app_role_templates';
  info: {
    description: 'Reusable named set of app roles for quickly assigning permissions to users';
    displayName: 'App Role Template';
    pluralName: 'app-role-templates';
    singularName: 'app-role-template';
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
    appRoles: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::api-pro.app-role'
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
      'plugin::api-pro.app-role-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginApiProRecordingEntry
  extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_recording_entries';
  info: {
    displayName: 'Recording Entry';
    pluralName: 'recording-entries';
    singularName: 'recording-entry';
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
    body: Schema.Attribute.JSON;
    claimedContext: Schema.Attribute.JSON;
    count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    headers: Schema.Attribute.JSON;
    lastSeenAt: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.recording-entry'
    > &
      Schema.Attribute.Private;
    method: Schema.Attribute.String & Schema.Attribute.Required;
    path: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    query: Schema.Attribute.JSON;
    recordKey: Schema.Attribute.String & Schema.Attribute.Required;
    routeTemplate: Schema.Attribute.String;
    session: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::api-pro.recording-session'
    >;
    statusCode: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    urlParts: Schema.Attribute.JSON;
  };
}

export interface PluginApiProRecordingSession
  extends Struct.CollectionTypeSchema {
  collectionName: 'api_pro_recording_sessions';
  info: {
    displayName: 'Recording Session';
    pluralName: 'recording-sessions';
    singularName: 'recording-session';
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
    entries: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.recording-entry'
    >;
    filters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    key: Schema.Attribute.UID<'name'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::api-pro.recording-session'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    resolvedAppName: Schema.Attribute.String;
    resolvedRoleKey: Schema.Attribute.String;
    startedAt: Schema.Attribute.DateTime;
    startedByUserId: Schema.Attribute.Integer;
    status: Schema.Attribute.Enumeration<['idle', 'recording', 'stopped']> &
      Schema.Attribute.DefaultTo<'idle'>;
    stoppedAt: Schema.Attribute.DateTime;
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

export interface PluginStrapiContentSyncProSyncLog
  extends Struct.CollectionTypeSchema {
  collectionName: 'sync_logs';
  info: {
    displayName: 'Sync Log';
    pluralName: 'sync-logs';
    singularName: 'sync-log';
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
    action: Schema.Attribute.String;
    contentType: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    details: Schema.Attribute.JSON;
    direction: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::strapi-content-sync-pro.sync-log'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    recordId: Schema.Attribute.String;
    status: Schema.Attribute.String;
    syncId: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginStrapiContentSyncProSyncRunReport
  extends Struct.CollectionTypeSchema {
  collectionName: 'sync_run_reports';
  info: {
    displayName: 'Sync Run Report';
    pluralName: 'sync-run-reports';
    singularName: 'sync-run-report';
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
    afterStats: Schema.Attribute.JSON;
    beforeStats: Schema.Attribute.JSON;
    completedAt: Schema.Attribute.DateTime;
    contentTypes: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    error: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::strapi-content-sync-pro.sync-run-report'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    runType: Schema.Attribute.String;
    startedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.String;
    summary: Schema.Attribute.JSON;
    trigger: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginStrapiContentSyncProWorkflowNotification
  extends Struct.CollectionTypeSchema {
  collectionName: 'workflow_notifications';
  info: {
    displayName: 'Workflow Notification';
    pluralName: 'workflow-notifications';
    singularName: 'workflow-notification';
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
    event: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::strapi-content-sync-pro.workflow-notification'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    metadata: Schema.Attribute.JSON;
    orderId: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    purchaseId: Schema.Attribute.String;
    recipient: Schema.Attribute.String;
    sourceApp: Schema.Attribute.Enumeration<['web', 'web-user-app']>;
    status: Schema.Attribute.Enumeration<['pending', 'sent', 'failed']> &
      Schema.Attribute.DefaultTo<'pending'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    workflow: Schema.Attribute.Enumeration<['order', 'purchase']>;
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
    hr_employee: Schema.Attribute.Relation<
      'oneToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.me'
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
    app_roles: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::api-pro.app-role'
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
    hr_employee: Schema.Attribute.Relation<
      'oneToOne',
      'api::hr-employee.hr-employee'
    >;
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
      'api::acc-account-mapping.acc-account-mapping': ApiAccAccountMappingAccAccountMapping;
      'api::acc-account.acc-account': ApiAccAccountAccAccount;
      'api::acc-bank-account.acc-bank-account': ApiAccBankAccountAccBankAccount;
      'api::acc-bill.acc-bill': ApiAccBillAccBill;
      'api::acc-expense.acc-expense': ApiAccExpenseAccExpense;
      'api::acc-fiscal-period.acc-fiscal-period': ApiAccFiscalPeriodAccFiscalPeriod;
      'api::acc-invoice.acc-invoice': ApiAccInvoiceAccInvoice;
      'api::acc-journal-entry.acc-journal-entry': ApiAccJournalEntryAccJournalEntry;
      'api::acc-journal-line.acc-journal-line': ApiAccJournalLineAccJournalLine;
      'api::acc-tax-rate.acc-tax-rate': ApiAccTaxRateAccTaxRate;
      'api::address.address': ApiAddressAddress;
      'api::branch.branch': ApiBranchBranch;
      'api::brand-group.brand-group': ApiBrandGroupBrandGroup;
      'api::brand.brand': ApiBrandBrand;
      'api::cash-register-transaction.cash-register-transaction': ApiCashRegisterTransactionCashRegisterTransaction;
      'api::cash-register.cash-register': ApiCashRegisterCashRegister;
      'api::category-group.category-group': ApiCategoryGroupCategoryGroup;
      'api::category.category': ApiCategoryCategory;
      'api::cms-footer.cms-footer': ApiCmsFooterCmsFooter;
      'api::cms-menu-item.cms-menu-item': ApiCmsMenuItemCmsMenuItem;
      'api::cms-menu.cms-menu': ApiCmsMenuCmsMenu;
      'api::cms-page-group.cms-page-group': ApiCmsPageGroupCmsPageGroup;
      'api::cms-page.cms-page': ApiCmsPageCmsPage;
      'api::contact-ticket.contact-ticket': ApiContactTicketContactTicket;
      'api::crm-activity.crm-activity': ApiCrmActivityCrmActivity;
      'api::crm-contact.crm-contact': ApiCrmContactCrmContact;
      'api::crm-lead.crm-lead': ApiCrmLeadCrmLead;
      'api::currency.currency': ApiCurrencyCurrency;
      'api::customer.customer': ApiCustomerCustomer;
      'api::delivery-method.delivery-method': ApiDeliveryMethodDeliveryMethod;
      'api::delivery-offer.delivery-offer': ApiDeliveryOfferDeliveryOffer;
      'api::delivery-zone.delivery-zone': ApiDeliveryZoneDeliveryZone;
      'api::employee.employee': ApiEmployeeEmployee;
      'api::hr-attendance.hr-attendance': ApiHrAttendanceHrAttendance;
      'api::hr-department.hr-department': ApiHrDepartmentHrDepartment;
      'api::hr-employee.hr-employee': ApiHrEmployeeHrEmployee;
      'api::hr-leave-request.hr-leave-request': ApiHrLeaveRequestHrLeaveRequest;
      'api::hr-team.hr-team': ApiHrTeamHrTeam;
      'api::mfg-bom.mfg-bom': ApiMfgBomMfgBom;
      'api::mfg-bundle.mfg-bundle': ApiMfgBundleMfgBundle;
      'api::mfg-defect-type.mfg-defect-type': ApiMfgDefectTypeMfgDefectType;
      'api::mfg-material-issue.mfg-material-issue': ApiMfgMaterialIssueMfgMaterialIssue;
      'api::mfg-material-lot.mfg-material-lot': ApiMfgMaterialLotMfgMaterialLot;
      'api::mfg-operation.mfg-operation': ApiMfgOperationMfgOperation;
      'api::mfg-piece-rate.mfg-piece-rate': ApiMfgPieceRateMfgPieceRate;
      'api::mfg-production-line.mfg-production-line': ApiMfgProductionLineMfgProductionLine;
      'api::mfg-qc-inspection.mfg-qc-inspection': ApiMfgQcInspectionMfgQcInspection;
      'api::mfg-task.mfg-task': ApiMfgTaskMfgTask;
      'api::mfg-work-order.mfg-work-order': ApiMfgWorkOrderMfgWorkOrder;
      'api::mfg-worker-profile.mfg-worker-profile': ApiMfgWorkerProfileMfgWorkerProfile;
      'api::notification-event.notification-event': ApiNotificationEventNotificationEvent;
      'api::notification-log.notification-log': ApiNotificationLogNotificationLog;
      'api::notification-preference.notification-preference': ApiNotificationPreferenceNotificationPreference;
      'api::notification-template.notification-template': ApiNotificationTemplateNotificationTemplate;
      'api::notification.notification': ApiNotificationNotification;
      'api::order-message.order-message': ApiOrderMessageOrderMessage;
      'api::pay-adjustment.pay-adjustment': ApiPayAdjustmentPayAdjustment;
      'api::pay-payroll-run.pay-payroll-run': ApiPayPayrollRunPayPayrollRun;
      'api::pay-payslip.pay-payslip': ApiPayPayslipPayPayslip;
      'api::pay-salary-structure.pay-salary-structure': ApiPaySalaryStructurePaySalaryStructure;
      'api::payment.payment': ApiPaymentPayment;
      'api::person-dedup-audit.person-dedup-audit': ApiPersonDedupAuditPersonDedupAudit;
      'api::person.person': ApiPersonPerson;
      'api::product-group.product-group': ApiProductGroupProductGroup;
      'api::product.product': ApiProductProduct;
      'api::purchase-item.purchase-item': ApiPurchaseItemPurchaseItem;
      'api::purchase-return-item.purchase-return-item': ApiPurchaseReturnItemPurchaseReturnItem;
      'api::purchase-return.purchase-return': ApiPurchaseReturnPurchaseReturn;
      'api::purchase.purchase': ApiPurchasePurchase;
      'api::return-method.return-method': ApiReturnMethodReturnMethod;
      'api::return-policy.return-policy': ApiReturnPolicyReturnPolicy;
      'api::return-request.return-request': ApiReturnRequestReturnRequest;
      'api::rider.rider': ApiRiderRider;
      'api::sale-audit-log.sale-audit-log': ApiSaleAuditLogSaleAuditLog;
      'api::sale-item.sale-item': ApiSaleItemSaleItem;
      'api::sale-offer.sale-offer': ApiSaleOfferSaleOffer;
      'api::sale-order.sale-order': ApiSaleOrderSaleOrder;
      'api::sale-return-item.sale-return-item': ApiSaleReturnItemSaleReturnItem;
      'api::sale-return.sale-return': ApiSaleReturnSaleReturn;
      'api::sale.sale': ApiSaleSale;
      'api::seo-meta.seo-meta': ApiSeoMetaSeoMeta;
      'api::site-setting.site-setting': ApiSiteSettingSiteSetting;
      'api::social-account.social-account': ApiSocialAccountSocialAccount;
      'api::social-post.social-post': ApiSocialPostSocialPost;
      'api::social-reply.social-reply': ApiSocialReplySocialReply;
      'api::stock-input.stock-input': ApiStockInputStockInput;
      'api::stock-item.stock-item': ApiStockItemStockItem;
      'api::supplier.supplier': ApiSupplierSupplier;
      'api::term-type.term-type': ApiTermTypeTermType;
      'api::term.term': ApiTermTerm;
      'api::workflow.workflow': ApiWorkflowWorkflow;
      'plugin::api-pro.api-interface': PluginApiProApiInterface;
      'plugin::api-pro.api-interface-method': PluginApiProApiInterfaceMethod;
      'plugin::api-pro.api-method-policy': PluginApiProApiMethodPolicy;
      'plugin::api-pro.app-domain': PluginApiProAppDomain;
      'plugin::api-pro.app-role': PluginApiProAppRole;
      'plugin::api-pro.app-role-template': PluginApiProAppRoleTemplate;
      'plugin::api-pro.recording-entry': PluginApiProRecordingEntry;
      'plugin::api-pro.recording-session': PluginApiProRecordingSession;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::review-workflows.workflow': PluginReviewWorkflowsWorkflow;
      'plugin::review-workflows.workflow-stage': PluginReviewWorkflowsWorkflowStage;
      'plugin::strapi-content-sync-pro.sync-log': PluginStrapiContentSyncProSyncLog;
      'plugin::strapi-content-sync-pro.sync-run-report': PluginStrapiContentSyncProSyncRunReport;
      'plugin::strapi-content-sync-pro.workflow-notification': PluginStrapiContentSyncProWorkflowNotification;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.me': PluginUsersPermissionsMe;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
