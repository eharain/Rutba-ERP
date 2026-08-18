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
    metadata: Schema.Attribute.JSON & Schema.Attribute.Private;
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
    resetPasswordTokenExpiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Private;
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
    expense_key: Schema.Attribute.String;
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
        'Web Order Payment',
        'Payroll Run',
        'Payroll Payment',
        'Employee Advance',
        'Production Labor',
        'Statutory Remittance',
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
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
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
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_default_location: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    items: Schema.Attribute.Relation<'oneToMany', 'api::stock-item.stock-item'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::branch.branch'
    > &
      Schema.Attribute.Private;
    location_code: Schema.Attribute.String;
    location_type: Schema.Attribute.Enumeration<
      ['warehouse', 'store', 'transit', 'virtual', 'supplier', 'customer']
    > &
      Schema.Attribute.DefaultTo<'warehouse'>;
    locations: Schema.Attribute.Relation<
      'oneToMany',
      'api::storage-location.storage-location'
    >;
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
    force_close_reason: Schema.Attribute.Text;
    force_closed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
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

export interface ApiCmpAudienceCmpAudience extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_audiences';
  info: {
    description: "Who a campaign goes to. Resolved through a single service contract \u2014 resolve(audience) -> [{ email, mergeData }] \u2014 so the 'segment' source can later point at a real crm-segment engine (ROADMAP 0.6) without touching the campaign runner.";
    displayName: 'Campaign Audience';
    pluralName: 'cmp-audiences';
    singularName: 'cmp-audience';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    campaigns: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-campaign.cmp-campaign'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    entity: Schema.Attribute.Enumeration<
      ['crm-contact', 'customer', 'person']
    > &
      Schema.Attribute.DefaultTo<'crm-contact'>;
    filter_json: Schema.Attribute.JSON;
    last_resolved_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-audience.cmp-audience'
    > &
      Schema.Attribute.Private;
    member_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    merge_mapping: Schema.Attribute.JSON;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    segment: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-segment.crm-segment'
    >;
    source: Schema.Attribute.Enumeration<['static', 'filter', 'segment']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'filter'>;
    static_members: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmpCampaignCmpCampaign extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_campaigns';
  info: {
    description: "Template + audience + sending identity + schedule. Each execution produces a cmp-run; pacing, suppression and reputation are Rutba-MTA's job, not ours.";
    displayName: 'Campaign';
    pluralName: 'cmp-campaigns';
    singularName: 'cmp-campaign';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    audience: Schema.Attribute.Relation<
      'manyToOne',
      'api::cmp-audience.cmp-audience'
    >;
    channel: Schema.Attribute.Enumeration<['email', 'sms', 'whatsapp']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'email'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    failure_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    from_email: Schema.Attribute.String;
    from_name: Schema.Attribute.String;
    last_error: Schema.Attribute.Text;
    last_run_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-campaign.cmp-campaign'
    > &
      Schema.Attribute.Private;
    max_failures: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<3>;
    max_runs: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    next_run_at: Schema.Attribute.DateTime;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    run_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    runs: Schema.Attribute.Relation<'oneToMany', 'api::cmp-run.cmp-run'>;
    schedule_frequency: Schema.Attribute.Enumeration<
      ['once', 'hourly', 'daily', 'weekly', 'monthly']
    > &
      Schema.Attribute.DefaultTo<'once'>;
    schedule_interval: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    sending_identity: Schema.Attribute.Relation<
      'manyToOne',
      'api::cmp-sending-identity.cmp-sending-identity'
    >;
    start_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'Draft',
        'Scheduled',
        'Running',
        'Paused',
        'Completed',
        'Failed',
        'Cancelled',
      ]
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    subject_override: Schema.Attribute.String;
    template: Schema.Attribute.Relation<
      'manyToOne',
      'api::cmp-template.cmp-template'
    >;
    track_clicks: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    track_opens: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    utm_campaign: Schema.Attribute.String;
    utm_content: Schema.Attribute.String;
    utm_medium: Schema.Attribute.String;
    utm_source: Schema.Attribute.String;
  };
}

export interface ApiCmpEventCmpEvent extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_events';
  info: {
    description: 'Delivery events mirrored from Rutba-MTA webhooks. dedup_key is unique because the MTA retries a failed webhook six times \u2014 the receiver must be idempotent.';
    displayName: 'Campaign Event';
    pluralName: 'cmp-events';
    singularName: 'cmp-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action_key: Schema.Attribute.String;
    bounce_type: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dedup_key: Schema.Attribute.String & Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-event.cmp-event'
    > &
      Schema.Attribute.Private;
    occurred_at: Schema.Attribute.DateTime;
    payload: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    recipient: Schema.Attribute.Relation<
      'manyToOne',
      'api::cmp-recipient.cmp-recipient'
    >;
    type: Schema.Attribute.Enumeration<
      [
        'queued',
        'sent',
        'deferred',
        'bounced',
        'complained',
        'failed',
        'dropped',
        'action_clicked',
        'unsubscribed',
        'opened',
        'clicked',
      ]
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmpRecipientCmpRecipient
  extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_recipients';
  info: {
    description: 'One row per person per run \u2014 the attribution spine. Carries the merge data actually sent and the MTA message_uuid, which is what lets a delivery webhook find its way back to a contact. The volume table: plan retention before it grows.';
    displayName: 'Campaign Recipient';
    pluralName: 'cmp-recipients';
    singularName: 'cmp-recipient';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    clicked_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    crm_contact: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-contact.crm-contact'
    >;
    customer: Schema.Attribute.Relation<'manyToOne', 'api::customer.customer'>;
    email: Schema.Attribute.String & Schema.Attribute.Required;
    error: Schema.Attribute.Text;
    events: Schema.Attribute.Relation<'oneToMany', 'api::cmp-event.cmp-event'>;
    last_event_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-recipient.cmp-recipient'
    > &
      Schema.Attribute.Private;
    merge_data: Schema.Attribute.JSON;
    message_uuid: Schema.Attribute.String;
    opened_at: Schema.Attribute.DateTime;
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    publishedAt: Schema.Attribute.DateTime;
    run: Schema.Attribute.Relation<'manyToOne', 'api::cmp-run.cmp-run'>;
    sent_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'Pending',
        'Queued',
        'Sent',
        'Deferred',
        'Bounced',
        'Complained',
        'Failed',
        'Dropped',
        'Suppressed',
        'Unsubscribed',
      ]
    > &
      Schema.Attribute.DefaultTo<'Pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmpRunCmpRun extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_runs';
  info: {
    description: "One execution of a campaign. Holds the Rutba-MTA batch_uuid and mirrors that batch's counters, so a run stays readable even if the MTA is unreachable. Engine-written \u2014 no create/update descriptors.";
    displayName: 'Campaign Run';
    pluralName: 'cmp-runs';
    singularName: 'cmp-run';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    actions_clicked: Schema.Attribute.JSON;
    batch_uuid: Schema.Attribute.String;
    bounced_hard: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    bounced_soft: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    campaign: Schema.Attribute.Relation<
      'manyToOne',
      'api::cmp-campaign.cmp-campaign'
    >;
    clicked: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    error: Schema.Attribute.Text;
    failed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    finished_at: Schema.Attribute.DateTime;
    is_test: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-run.cmp-run'
    > &
      Schema.Attribute.Private;
    opened: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    pending_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    queued: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    recipients: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-recipient.cmp-recipient'
    >;
    sent: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    started_at: Schema.Attribute.DateTime;
    state: Schema.Attribute.Enumeration<
      ['Pending', 'Submitting', 'Sending', 'Completed', 'Failed', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Pending'>;
    suppressed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    total: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    tracked_links: Schema.Attribute.JSON;
    unsubscribed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCmpSendingIdentityCmpSendingIdentity
  extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_sending_identities';
  info: {
    description: "A registered Rutba-MTA sender: the from-address campaigns send as, plus the trust token and webhook secret the MTA issues once at registration. The RMAILX 'mail agent' equivalent.";
    displayName: 'Campaign Sending Identity';
    pluralName: 'cmp-sending-identities';
    singularName: 'cmp-sending-identity';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    from_email: Schema.Attribute.String & Schema.Attribute.Required;
    from_name: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    last_error: Schema.Attribute.Text;
    last_verified_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-sending-identity.cmp-sending-identity'
    > &
      Schema.Attribute.Private;
    mta_sender_id: Schema.Attribute.String;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reply_to: Schema.Attribute.String;
    smtp_host: Schema.Attribute.String;
    smtp_port: Schema.Attribute.Integer;
    smtp_secure: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    smtp_username: Schema.Attribute.String;
    trust_token: Schema.Attribute.Text & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    webhook_secret: Schema.Attribute.Text & Schema.Attribute.Private;
    webhook_url: Schema.Attribute.String;
  };
}

export interface ApiCmpTemplateCmpTemplate extends Struct.CollectionTypeSchema {
  collectionName: 'cmp_templates';
  info: {
    description: "Reusable campaign message template. Rutba-MTA does not keep a template library (FUNCTION.md: 'reusable saved template library -> caller app'), so this is the store; templates are rendered here and passed inline to /v1/send/batch.";
    displayName: 'Campaign Template';
    pluralName: 'cmp-templates';
    singularName: 'cmp-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    append_utm: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    body_html: Schema.Attribute.Text;
    body_text: Schema.Attribute.Text;
    campaigns: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-campaign.cmp-campaign'
    >;
    channel: Schema.Attribute.Enumeration<['email', 'sms', 'whatsapp']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'email'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    design_json: Schema.Attribute.JSON;
    folder: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::cmp-template.cmp-template'
    > &
      Schema.Attribute.Private;
    merge_keys: Schema.Attribute.JSON;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['Draft', 'Active', 'Archived']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    subject: Schema.Attribute.String;
    tracking_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
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
    archived_at: Schema.Attribute.DateTime;
    assigned_to: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    branch_id: Schema.Attribute.Integer;
    catalog_item_id: Schema.Attribute.Integer;
    category: Schema.Attribute.Enumeration<
      ['General', 'IT', 'HR', 'Facilities']
    > &
      Schema.Attribute.DefaultTo<'General'>;
    closed_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    custom_fields: Schema.Attribute.JSON;
    dedupe_key: Schema.Attribute.String;
    desk_id: Schema.Attribute.Integer;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    first_response_at: Schema.Attribute.DateTime;
    first_response_due_at: Schema.Attribute.DateTime;
    is_imported: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    last_reply_at: Schema.Attribute.DateTime;
    last_reply_by: Schema.Attribute.Enumeration<['user', 'agent']>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::contact-ticket.contact-ticket'
    > &
      Schema.Attribute.Private;
    merged_into_id: Schema.Attribute.Integer;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    metadata: Schema.Attribute.JSON;
    origin_event: Schema.Attribute.JSON;
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    priority: Schema.Attribute.Enumeration<
      ['low', 'normal', 'high', 'urgent']
    > &
      Schema.Attribute.DefaultTo<'normal'>;
    publishedAt: Schema.Attribute.DateTime;
    reopened_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    requester_kind: Schema.Attribute.Enumeration<
      ['customer', 'employee', 'supplier', 'system', 'anonymous']
    >;
    resolution: Schema.Attribute.Text;
    resolution_code_id: Schema.Attribute.Integer;
    resolution_due_at: Schema.Attribute.DateTime;
    resolved_at: Schema.Attribute.DateTime;
    sla_due_at: Schema.Attribute.DateTime;
    sla_paused_at: Schema.Attribute.DateTime;
    sla_paused_ms: Schema.Attribute.BigInteger;
    sla_policy_id: Schema.Attribute.Integer;
    sla_state: Schema.Attribute.Enumeration<
      ['ok', 'at_risk', 'breached', 'paused', 'indeterminate']
    > &
      Schema.Attribute.DefaultTo<'ok'>;
    source: Schema.Attribute.Enumeration<
      [
        'web',
        'portal',
        'email',
        'phone',
        'whatsapp',
        'walk_in',
        'internal',
        'api',
        'system',
        'marketplace',
      ]
    > &
      Schema.Attribute.DefaultTo<'api'>;
    split_from_id: Schema.Attribute.Integer;
    stage_key: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      [
        'open',
        'in_progress',
        'waiting',
        'resolved',
        'closed',
        'cancelled',
        'merged',
      ]
    > &
      Schema.Attribute.DefaultTo<'open'>;
    subject: Schema.Attribute.String & Schema.Attribute.Required;
    subject_document_id: Schema.Attribute.String;
    subject_entity_uid: Schema.Attribute.String;
    tags: Schema.Attribute.JSON;
    team_id: Schema.Attribute.Integer;
    ticket_no: Schema.Attribute.UID<'subject'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    workflow_id: Schema.Attribute.Integer;
  };
}

export interface ApiCrmActivityCrmActivity extends Struct.CollectionTypeSchema {
  collectionName: 'crm_activities';
  info: {
    description: 'Typed customer-touch timeline \u2014 calls, emails, meetings, notes, site visits. One row per touch, carrying direction, outcome, duration, follow-up reminder and attachments. Distinct from work-item-activity, which is the system-generated audit trail for workflow transitions.';
    displayName: 'CRM Activity';
    pluralName: 'crm-activities';
    singularName: 'crm-activity';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    actor: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    actor_label: Schema.Attribute.String;
    attachments: Schema.Attribute.Media<undefined, true>;
    contact: Schema.Attribute.Relation<
      'manyToOne',
      'api::crm-contact.crm-contact'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    direction: Schema.Attribute.Enumeration<
      ['Inbound', 'Outbound', 'Internal']
    > &
      Schema.Attribute.DefaultTo<'Internal'>;
    duration_minutes: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    followup_at: Schema.Attribute.DateTime;
    followup_done_at: Schema.Attribute.DateTime;
    followup_note: Schema.Attribute.String;
    lead: Schema.Attribute.Relation<'manyToOne', 'api::crm-lead.crm-lead'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-activity.crm-activity'
    > &
      Schema.Attribute.Private;
    outcome: Schema.Attribute.Enumeration<
      [
        'Connected',
        'No Answer',
        'Busy',
        'Voicemail',
        'Wrong Number',
        'Callback Requested',
        'Not Interested',
        'Completed',
        'Cancelled',
      ]
    >;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
    publishedAt: Schema.Attribute.DateTime;
    subject: Schema.Attribute.String & Schema.Attribute.Required;
    type: Schema.Attribute.Enumeration<
      ['Call', 'Email', 'Meeting', 'Note', 'Follow-up', 'WhatsApp', 'Site']
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
    person: Schema.Attribute.Relation<'manyToOne', 'api::person.person'>;
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
    activities: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-activity.crm-activity'
    >;
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

export interface ApiCrmSegmentCrmSegment extends Struct.CollectionTypeSchema {
  collectionName: 'crm_segments';
  info: {
    description: 'A saved, re-runnable audience definition over people / CRM contacts / leads. Filters compile through the whitelisted field catalog in src/utils/crm-segment-engine.js; results resolve to canonical person identity so a segment can drive a campaign audience. `owners` records the creator only \u2014 segments are deliberately team-visible and carry no owner scope; it is stamped server-side and never accepted from the client.';
    displayName: 'CRM Segment';
    pluralName: 'crm-segments';
    singularName: 'crm-segment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    columns: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    definition: Schema.Attribute.JSON;
    description: Schema.Attribute.Text;
    entity: Schema.Attribute.Enumeration<
      ['person', 'crm-contact', 'crm-lead']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'person'>;
    folder: Schema.Attribute.String;
    last_run_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-segment.crm-segment'
    > &
      Schema.Attribute.Private;
    member_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    sort: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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

export interface ApiHrAppraisalCycleHrAppraisalCycle
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_appraisal_cycles';
  info: {
    description: 'A named review period';
    displayName: 'HR Appraisal Cycle';
    pluralName: 'hr-appraisal-cycles';
    singularName: 'hr-appraisal-cycle';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    end_date: Schema.Attribute.Date & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-appraisal-cycle.hr-appraisal-cycle'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    start_date: Schema.Attribute.Date & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<['Draft', 'Active', 'Closed']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrAppraisalRatingHrAppraisalRating
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_appraisal_ratings';
  info: {
    description: 'One competency scored on one appraisal (self + manager)';
    displayName: 'HR Appraisal Rating';
    pluralName: 'hr-appraisal-ratings';
    singularName: 'hr-appraisal-rating';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    appraisal: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-appraisal.hr-appraisal'
    >;
    comments: Schema.Attribute.Text;
    competency: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-competency.hr-competency'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-appraisal-rating.hr-appraisal-rating'
    > &
      Schema.Attribute.Private;
    manager_rating: Schema.Attribute.Decimal;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    self_rating: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrAppraisalHrAppraisal extends Struct.CollectionTypeSchema {
  collectionName: 'hr_appraisals';
  info: {
    description: 'One employee review for one cycle';
    displayName: 'HR Appraisal';
    pluralName: 'hr-appraisals';
    singularName: 'hr-appraisal';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    completed_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    cycle: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-appraisal-cycle.hr-appraisal-cycle'
    >;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    final_rating: Schema.Attribute.Decimal;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-appraisal.hr-appraisal'
    > &
      Schema.Attribute.Private;
    manager_comments: Schema.Attribute.Text;
    manager_rating: Schema.Attribute.Decimal;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    ratings: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-appraisal-rating.hr-appraisal-rating'
    >;
    reviewer: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    self_comments: Schema.Attribute.Text;
    self_rating: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'SelfAssessment', 'ManagerReview', 'Completed']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    submitted_at: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrAssetAssignmentHrAssetAssignment
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_asset_assignments';
  info: {
    description: "One employee's assign/return history for an asset";
    displayName: 'HR Asset Assignment';
    pluralName: 'hr-asset-assignments';
    singularName: 'hr-asset-assignment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    asset: Schema.Attribute.Relation<'manyToOne', 'api::hr-asset.hr-asset'>;
    assigned_date: Schema.Attribute.Date & Schema.Attribute.Required;
    condition_on_assign: Schema.Attribute.String;
    condition_on_return: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-asset-assignment.hr-asset-assignment'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    return_date: Schema.Attribute.Date;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrAssetHrAsset extends Struct.CollectionTypeSchema {
  collectionName: 'hr_assets';
  info: {
    description: 'A company asset (laptop, phone, vehicle, etc.) that can be assigned to employees';
    displayName: 'HR Asset';
    pluralName: 'hr-assets';
    singularName: 'hr-asset';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account: Schema.Attribute.Relation<
      'manyToOne',
      'api::acc-account.acc-account'
    >;
    asset_tag: Schema.Attribute.String & Schema.Attribute.Unique;
    assignments: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-asset-assignment.hr-asset-assignment'
    >;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    category: Schema.Attribute.Enumeration<
      ['Laptop', 'Mobile', 'Vehicle', 'Furniture', 'Equipment', 'Other']
    > &
      Schema.Attribute.DefaultTo<'Other'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-asset.hr-asset'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    purchase_date: Schema.Attribute.Date;
    purchase_value: Schema.Attribute.Decimal;
    serial_number: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      ['Available', 'Assigned', 'UnderMaintenance', 'Retired']
    > &
      Schema.Attribute.DefaultTo<'Available'>;
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
    shift: Schema.Attribute.Relation<'manyToOne', 'api::hr-shift.hr-shift'>;
    status: Schema.Attribute.Enumeration<
      ['Present', 'Absent', 'Late', 'Leave']
    > &
      Schema.Attribute.DefaultTo<'Present'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    worked_hours: Schema.Attribute.Decimal;
  };
}

export interface ApiHrBankAccountHrBankAccount
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_bank_accounts';
  info: {
    description: 'Employee bank account for salary payout';
    displayName: 'HR Bank Account';
    pluralName: 'hr-bank-accounts';
    singularName: 'hr-bank-account';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account_number: Schema.Attribute.String;
    account_title: Schema.Attribute.String;
    bank_name: Schema.Attribute.String & Schema.Attribute.Required;
    branch_name: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    iban: Schema.Attribute.String;
    is_primary: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-bank-account.hr-bank-account'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrBenefitEnrollmentHrBenefitEnrollment
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_benefit_enrollments';
  info: {
    description: "An employee's enrollment in a benefit plan";
    displayName: 'HR Benefit Enrollment';
    pluralName: 'hr-benefit-enrollments';
    singularName: 'hr-benefit-enrollment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    benefit_plan: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-benefit-plan.hr-benefit-plan'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    enrollment_date: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-benefit-enrollment.hr-benefit-enrollment'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Active', 'Suspended', 'Terminated']
    > &
      Schema.Attribute.DefaultTo<'Active'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrBenefitPlanHrBenefitPlan
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_benefit_plans';
  info: {
    description: 'A benefit plan employees can be enrolled in';
    displayName: 'HR Benefit Plan';
    pluralName: 'hr-benefit-plans';
    singularName: 'hr-benefit-plan';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    employee_contribution_pct: Schema.Attribute.Decimal;
    employer_contribution_pct: Schema.Attribute.Decimal;
    enrollments: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-benefit-enrollment.hr-benefit-enrollment'
    >;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-benefit-plan.hr-benefit-plan'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<
      [
        'MedicalInsurance',
        'Retirement',
        'ProvidentFund',
        'Gratuity',
        'Wellness',
        'Other',
      ]
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrBusinessUnitHrBusinessUnit
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_business_units';
  info: {
    description: 'Organizational business unit';
    displayName: 'HR Business Unit';
    pluralName: 'hr-business-units';
    singularName: 'hr-business-unit';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-business-unit.hr-business-unit'
    >;
    code: Schema.Attribute.String;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    cost_centers: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-cost-center.hr-cost-center'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    division: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-division.hr-division'
    >;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-business-unit.hr-business-unit'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-business-unit.hr-business-unit'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrCandidateHrCandidate extends Struct.CollectionTypeSchema {
  collectionName: 'hr_candidates';
  info: {
    description: 'An applicant against a requisition';
    displayName: 'HR Candidate';
    pluralName: 'hr-candidates';
    singularName: 'hr-candidate';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-candidate.hr-candidate'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    requisition: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-job-requisition.hr-job-requisition'
    >;
    resume: Schema.Attribute.Media<'files'>;
    source: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected']
    > &
      Schema.Attribute.DefaultTo<'Applied'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrCertificationHrCertification
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_certifications';
  info: {
    description: 'Employee professional certification';
    displayName: 'HR Certification';
    pluralName: 'hr-certifications';
    singularName: 'hr-certification';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    credential_id: Schema.Attribute.String;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    expiry_date: Schema.Attribute.Date;
    issue_date: Schema.Attribute.Date;
    issuing_organization: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-certification.hr-certification'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrCompanyHrCompany extends Struct.CollectionTypeSchema {
  collectionName: 'hr_companies';
  info: {
    description: 'Lightweight org-structure company grouping (not tenant isolation)';
    displayName: 'HR Company';
    pluralName: 'hr-companies';
    singularName: 'hr-company';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    address: Schema.Attribute.Text;
    branches: Schema.Attribute.Relation<'oneToMany', 'api::branch.branch'>;
    business_units: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-business-unit.hr-business-unit'
    >;
    code: Schema.Attribute.String & Schema.Attribute.Unique;
    cost_centers: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-cost-center.hr-cost-center'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    divisions: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-division.hr-division'
    >;
    email: Schema.Attribute.String;
    employees: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee.hr-employee'
    >;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-company.hr-company'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    weekend_days: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[0]>;
  };
}

export interface ApiHrCompetencyHrCompetency
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_competencies';
  info: {
    description: 'A rated skill/behaviour used in appraisals';
    displayName: 'HR Competency';
    pluralName: 'hr-competencies';
    singularName: 'hr-competency';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      ['Technical', 'Behavioral', 'Leadership']
    > &
      Schema.Attribute.DefaultTo<'Technical'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-competency.hr-competency'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrComplianceItemHrComplianceItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_compliance_items';
  info: {
    description: 'A tracked expiring document or requirement';
    displayName: 'HR Compliance Item';
    pluralName: 'hr-compliance-items';
    singularName: 'hr-compliance-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    document: Schema.Attribute.Media<'images' | 'files'>;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    expiry_date: Schema.Attribute.Date;
    issue_date: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-compliance-item.hr-compliance-item'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      ['Valid', 'ExpiringSoon', 'Expired', 'Waived']
    > &
      Schema.Attribute.DefaultTo<'Valid'>;
    type: Schema.Attribute.Enumeration<
      [
        'Contract',
        'Visa',
        'WorkPermit',
        'License',
        'MandatoryTraining',
        'Medical',
        'Other',
      ]
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrCostCenterHrCostCenter
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_cost_centers';
  info: {
    description: 'Cost attribution center';
    displayName: 'HR Cost Center';
    pluralName: 'hr-cost-centers';
    singularName: 'hr-cost-center';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    business_unit: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-business-unit.hr-business-unit'
    >;
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-cost-center.hr-cost-center'
    >;
    code: Schema.Attribute.String;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-cost-center.hr-cost-center'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-cost-center.hr-cost-center'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrCourseHrCourse extends Struct.CollectionTypeSchema {
  collectionName: 'hr_courses';
  info: {
    description: 'A training course in the catalogue';
    displayName: 'HR Course';
    pluralName: 'hr-courses';
    singularName: 'hr-course';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.String;
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    delivery_mode: Schema.Attribute.Enumeration<
      ['Classroom', 'Online', 'OnTheJob']
    > &
      Schema.Attribute.DefaultTo<'Classroom'>;
    description: Schema.Attribute.Text;
    duration_hours: Schema.Attribute.Decimal;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-course.hr-course'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
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
    child_departments: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-department.hr-department'
    >;
    cost_center: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-cost-center.hr-cost-center'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    division: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-division.hr-division'
    >;
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
    parent_department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    publishedAt: Schema.Attribute.DateTime;
    teams: Schema.Attribute.Relation<'oneToMany', 'api::hr-team.hr-team'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrDesignationHrDesignation
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_designations';
  info: {
    description: 'Job title / designation';
    displayName: 'HR Designation';
    pluralName: 'hr-designations';
    singularName: 'hr-designation';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    job_grade: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-job-grade.hr-job-grade'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-designation.hr-designation'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    positions: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-position.hr-position'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrDisciplinaryActionHrDisciplinaryAction
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_disciplinary_actions';
  info: {
    description: 'A recorded disciplinary step';
    displayName: 'HR Disciplinary Action';
    pluralName: 'hr-disciplinary-actions';
    singularName: 'hr-disciplinary-action';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    acknowledged_at: Schema.Attribute.DateTime;
    action_date: Schema.Attribute.Date;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    issued_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-disciplinary-action.hr-disciplinary-action'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Text;
    type: Schema.Attribute.Enumeration<
      ['Verbal', 'Written', 'FinalWarning', 'Suspension', 'Termination']
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrDivisionHrDivision extends Struct.CollectionTypeSchema {
  collectionName: 'hr_divisions';
  info: {
    description: 'Organizational division';
    displayName: 'HR Division';
    pluralName: 'hr-divisions';
    singularName: 'hr-division';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    business_units: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-business-unit.hr-business-unit'
    >;
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-division.hr-division'
    >;
    code: Schema.Attribute.String;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-division.hr-division'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-division.hr-division'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrEducationHrEducation extends Struct.CollectionTypeSchema {
  collectionName: 'hr_educations';
  info: {
    description: 'Employee education record';
    displayName: 'HR Education';
    pluralName: 'hr-educations';
    singularName: 'hr-education';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    degree_title: Schema.Attribute.String & Schema.Attribute.Required;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    end_year: Schema.Attribute.Integer;
    field_of_study: Schema.Attribute.String;
    grade: Schema.Attribute.String;
    institution: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-education.hr-education'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    start_year: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrEmergencyContactHrEmergencyContact
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_emergency_contacts';
  info: {
    description: 'Employee emergency contact';
    displayName: 'HR Emergency Contact';
    pluralName: 'hr-emergency-contacts';
    singularName: 'hr-emergency-contact';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    address: Schema.Attribute.Text;
    alt_phone: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-emergency-contact.hr-emergency-contact'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    relationship: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrEmployeeDocumentHrEmployeeDocument
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_employee_documents';
  info: {
    description: 'Typed employee document attachment (resume, CNIC, passport, license, certificate)';
    displayName: 'HR Employee Document';
    pluralName: 'hr-employee-documents';
    singularName: 'hr-employee-document';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    document_type: Schema.Attribute.Enumeration<
      ['Resume', 'CNIC', 'Passport', 'DrivingLicense', 'Certificate', 'Other']
    > &
      Schema.Attribute.Required;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    expiry_date: Schema.Attribute.Date;
    file: Schema.Attribute.Media<'images' | 'files'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee-document.hr-employee-document'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    title: Schema.Attribute.String;
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
    bank_accounts: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-bank-account.hr-bank-account'
    >;
    blood_group: Schema.Attribute.Enumeration<
      [
        'A_Positive',
        'A_Negative',
        'B_Positive',
        'B_Negative',
        'AB_Positive',
        'AB_Negative',
        'O_Positive',
        'O_Negative',
      ]
    >;
    certifications: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-certification.hr-certification'
    >;
    cnic: Schema.Attribute.String;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date_of_birth: Schema.Attribute.Date;
    date_of_joining: Schema.Attribute.Date;
    department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    designation: Schema.Attribute.String;
    direct_reports: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee.hr-employee'
    >;
    documents: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee-document.hr-employee-document'
    >;
    educations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-education.hr-education'
    >;
    email: Schema.Attribute.String;
    emergency_contacts: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-emergency-contact.hr-emergency-contact'
    >;
    family_members: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-family-member.hr-family-member'
    >;
    gender: Schema.Attribute.Enumeration<['Male', 'Female', 'Other']>;
    leave_requests: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-leave-request.hr-leave-request'
    >;
    lifecycle_events: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-lifecycle-event.hr-lifecycle-event'
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
    marital_status: Schema.Attribute.Enumeration<
      ['Single', 'Married', 'Divorced', 'Widowed']
    >;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    nationality: Schema.Attribute.String;
    passport_number: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    position: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-position.hr-position'
    >;
    publishedAt: Schema.Attribute.DateTime;
    religion: Schema.Attribute.String;
    reports_to: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    salary_structure: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-salary-structure.pay-salary-structure'
    >;
    skills: Schema.Attribute.Relation<'oneToMany', 'api::hr-skill.hr-skill'>;
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
    work_experiences: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-work-experience.hr-work-experience'
    >;
  };
}

export interface ApiHrExpenseClaimHrExpenseClaim
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_expense_claims';
  info: {
    description: 'An employee expense reimbursement claim';
    displayName: 'HR Expense Claim';
    pluralName: 'hr-expense-claims';
    singularName: 'hr-expense-claim';
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
    category: Schema.Attribute.Enumeration<
      ['Medical', 'Travel', 'Fuel', 'Entertainment', 'Business', 'Other']
    > &
      Schema.Attribute.DefaultTo<'Other'>;
    claim_date: Schema.Attribute.Date & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    decided_at: Schema.Attribute.DateTime;
    decided_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    description: Schema.Attribute.Text;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-expense-claim.hr-expense-claim'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    receipt: Schema.Attribute.Media<'images' | 'files'>;
    rejection_reason: Schema.Attribute.Text;
    status: Schema.Attribute.Enumeration<
      ['Submitted', 'Approved', 'Rejected', 'Reimbursed']
    > &
      Schema.Attribute.DefaultTo<'Submitted'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrFamilyMemberHrFamilyMember
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_family_members';
  info: {
    description: 'Spouse / dependents / children';
    displayName: 'HR Family Member';
    pluralName: 'hr-family-members';
    singularName: 'hr-family-member';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    cnic: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date_of_birth: Schema.Attribute.Date;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    is_dependent: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-family-member.hr-family-member'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    relationship: Schema.Attribute.Enumeration<
      ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Other']
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrGeneratedDocumentHrGeneratedDocument
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_generated_documents';
  info: {
    description: 'A rendered letter issued to an employee';
    displayName: 'HR Generated Document';
    pluralName: 'hr-generated-documents';
    singularName: 'hr-generated-document';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    content: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    generated_at: Schema.Attribute.DateTime;
    generated_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-generated-document.hr-generated-document'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reference_no: Schema.Attribute.String;
    subject: Schema.Attribute.String;
    template: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-letter-template.hr-letter-template'
    >;
    type: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrGoalHrGoal extends Struct.CollectionTypeSchema {
  collectionName: 'hr_goals';
  info: {
    description: 'An employee objective within an appraisal cycle';
    displayName: 'HR Goal';
    pluralName: 'hr-goals';
    singularName: 'hr-goal';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    cycle: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-appraisal-cycle.hr-appraisal-cycle'
    >;
    description: Schema.Attribute.Text;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-goal.hr-goal'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    progress_percent: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['NotStarted', 'InProgress', 'Completed', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'NotStarted'>;
    target_date: Schema.Attribute.Date;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    weight: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
  };
}

export interface ApiHrGrievanceHrGrievance extends Struct.CollectionTypeSchema {
  collectionName: 'hr_grievances';
  info: {
    description: 'A confidential employee complaint';
    displayName: 'HR Grievance';
    pluralName: 'hr-grievances';
    singularName: 'hr-grievance';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<
      ['Harassment', 'Discrimination', 'Workload', 'Pay', 'Management', 'Other']
    > &
      Schema.Attribute.DefaultTo<'Other'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    is_anonymous: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-grievance.hr-grievance'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    resolution: Schema.Attribute.Text;
    resolved_at: Schema.Attribute.DateTime;
    resolved_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    status: Schema.Attribute.Enumeration<
      ['Open', 'UnderReview', 'Resolved', 'Closed']
    > &
      Schema.Attribute.DefaultTo<'Open'>;
    subject: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrHolidayCalendarHrHolidayCalendar
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_holiday_calendars';
  info: {
    description: 'A public/company holiday';
    displayName: 'HR Holiday';
    pluralName: 'hr-holiday-calendars';
    singularName: 'hr-holiday-calendar';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    description: Schema.Attribute.Text;
    is_recurring_yearly: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-holiday-calendar.hr-holiday-calendar'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrIncidentReportHrIncidentReport
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_incident_reports';
  info: {
    description: 'A health & safety incident';
    displayName: 'HR Incident Report';
    pluralName: 'hr-incident-reports';
    singularName: 'hr-incident-report';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    corrective_action: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    incident_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-incident-report.hr-incident-report'
    > &
      Schema.Attribute.Private;
    location: Schema.Attribute.String;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    photo: Schema.Attribute.Media<'images', true>;
    publishedAt: Schema.Attribute.DateTime;
    reported_by: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    severity: Schema.Attribute.Enumeration<
      ['Low', 'Medium', 'High', 'Critical']
    > &
      Schema.Attribute.DefaultTo<'Low'>;
    status: Schema.Attribute.Enumeration<
      ['Reported', 'UnderInvestigation', 'Resolved', 'Closed']
    > &
      Schema.Attribute.DefaultTo<'Reported'>;
    type: Schema.Attribute.Enumeration<
      ['Injury', 'NearMiss', 'PropertyDamage', 'Illness', 'Other']
    > &
      Schema.Attribute.DefaultTo<'Other'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrInterviewHrInterview extends Struct.CollectionTypeSchema {
  collectionName: 'hr_interviews';
  info: {
    description: 'A scheduled interview and its outcome';
    displayName: 'HR Interview';
    pluralName: 'hr-interviews';
    singularName: 'hr-interview';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    candidate: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-candidate.hr-candidate'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    feedback: Schema.Attribute.Text;
    interviewer: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-interview.hr-interview'
    > &
      Schema.Attribute.Private;
    mode: Schema.Attribute.Enumeration<['InPerson', 'Phone', 'Video']> &
      Schema.Attribute.DefaultTo<'InPerson'>;
    publishedAt: Schema.Attribute.DateTime;
    rating: Schema.Attribute.Decimal;
    recommendation: Schema.Attribute.Enumeration<['Proceed', 'Hold', 'Reject']>;
    round: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    scheduled_at: Schema.Attribute.DateTime & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['Scheduled', 'Completed', 'Cancelled', 'NoShow']
    > &
      Schema.Attribute.DefaultTo<'Scheduled'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrJobGradeHrJobGrade extends Struct.CollectionTypeSchema {
  collectionName: 'hr_job_grades';
  info: {
    description: 'Seniority/pay grade band';
    displayName: 'HR Job Grade';
    pluralName: 'hr-job-grades';
    singularName: 'hr-job-grade';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    designations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-designation.hr-designation'
    >;
    level: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-job-grade.hr-job-grade'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrJobRequisitionHrJobRequisition
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_job_requisitions';
  info: {
    description: 'A request to hire';
    displayName: 'HR Job Requisition';
    pluralName: 'hr-job-requisitions';
    singularName: 'hr-job-requisition';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    headcount: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    justification: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-job-requisition.hr-job-requisition'
    > &
      Schema.Attribute.Private;
    position: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-position.hr-position'
    >;
    publishedAt: Schema.Attribute.DateTime;
    requested_by: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Approved', 'Open', 'Filled', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    target_date: Schema.Attribute.Date;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrLeaveBalanceHrLeaveBalance
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_leave_balances';
  info: {
    description: 'Opening/brought-forward balance per employee, leave type and year \u2014 accrual and usage are computed live from policy + approved requests';
    displayName: 'HR Leave Balance';
    pluralName: 'hr-leave-balances';
    singularName: 'hr-leave-balance';
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
    encashed_days: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    leave_type: Schema.Attribute.Enumeration<
      ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other']
    > &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-leave-balance.hr-leave-balance'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    opening_balance: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    year: Schema.Attribute.Integer & Schema.Attribute.Required;
  };
}

export interface ApiHrLeavePolicyHrLeavePolicy
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_leave_policies';
  info: {
    description: 'Quota, accrual, carry-forward and encashment rules per leave type';
    displayName: 'HR Leave Policy';
    pluralName: 'hr-leave-policies';
    singularName: 'hr-leave-policy';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    accrual_method: Schema.Attribute.Enumeration<
      ['Yearly', 'Monthly', 'None']
    > &
      Schema.Attribute.DefaultTo<'Yearly'>;
    accrual_rate_per_period: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    annual_quota_days: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    carry_forward_allowed: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    encashment_allowed: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    leave_type: Schema.Attribute.Enumeration<
      ['Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Other']
    > &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-leave-policy.hr-leave-policy'
    > &
      Schema.Attribute.Private;
    max_carry_forward_days: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    max_encashment_days: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    requires_approval: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
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
    decided_at: Schema.Attribute.DateTime;
    decided_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
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
    rejection_reason: Schema.Attribute.Text;
    stage_key: Schema.Attribute.String;
    start_date: Schema.Attribute.Date & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['Pending', 'Approved', 'Rejected', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Pending'>;
    total_days: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrLetterTemplateHrLetterTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_letter_templates';
  info: {
    description: 'A variable-substituted letter body';
    displayName: 'HR Letter Template';
    pluralName: 'hr-letter-templates';
    singularName: 'hr-letter-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    available_variables: Schema.Attribute.JSON;
    body_template: Schema.Attribute.Text & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-letter-template.hr-letter-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    subject: Schema.Attribute.String;
    type: Schema.Attribute.Enumeration<
      [
        'Offer',
        'Experience',
        'Salary',
        'Confirmation',
        'Warning',
        'NOC',
        'Custom',
      ]
    > &
      Schema.Attribute.DefaultTo<'Custom'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrLifecycleEventHrLifecycleEvent
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_lifecycle_events';
  info: {
    description: 'Onboarding, confirmation, promotion, transfer, salary revision, resignation, exit \u2014 one timeline per employee';
    displayName: 'HR Lifecycle Event';
    pluralName: 'hr-lifecycle-events';
    singularName: 'hr-lifecycle-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    approved_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    details: Schema.Attribute.JSON;
    effective_date: Schema.Attribute.Date;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-lifecycle-event.hr-lifecycle-event'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Pending', 'Approved', 'Rejected', 'Completed']
    > &
      Schema.Attribute.DefaultTo<'Completed'>;
    type: Schema.Attribute.Enumeration<
      [
        'Onboarding',
        'Confirmation',
        'Probation',
        'Promotion',
        'Transfer',
        'SalaryRevision',
        'DepartmentChange',
        'Resignation',
        'ExitInterview',
        'Clearance',
        'FinalSettlement',
      ]
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrOfferHrOffer extends Struct.CollectionTypeSchema {
  collectionName: 'hr_offers';
  info: {
    description: 'An offer extended to a candidate';
    displayName: 'HR Offer';
    pluralName: 'hr-offers';
    singularName: 'hr-offer';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    candidate: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-candidate.hr-candidate'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    joining_date: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-offer.hr-offer'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    offer_date: Schema.Attribute.Date;
    offered_salary: Schema.Attribute.Decimal;
    publishedAt: Schema.Attribute.DateTime;
    requisition: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-job-requisition.hr-job-requisition'
    >;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Sent', 'Accepted', 'Declined', 'Withdrawn']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrOvertimeRuleHrOvertimeRule
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_overtime_rules';
  info: {
    description: 'Overtime pay multiplier and daily threshold';
    displayName: 'HR Overtime Rule';
    pluralName: 'hr-overtime-rules';
    singularName: 'hr-overtime-rule';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    applies_after_hours: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<8>;
    applies_to_pay_types: Schema.Attribute.JSON;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    company: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-company.hr-company'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-overtime-rule.hr-overtime-rule'
    > &
      Schema.Attribute.Private;
    multiplier: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1.5>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrPositionHrPosition extends Struct.CollectionTypeSchema {
  collectionName: 'hr_positions';
  info: {
    description: 'An org-chart seat, independent of who currently holds it';
    displayName: 'HR Position';
    pluralName: 'hr-positions';
    singularName: 'hr-position';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    cost_center: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-cost-center.hr-cost-center'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    department: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-department.hr-department'
    >;
    designation: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-designation.hr-designation'
    >;
    direct_report_positions: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-position.hr-position'
    >;
    employees: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-employee.hr-employee'
    >;
    headcount_planned: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<1>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    job_grade: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-job-grade.hr-job-grade'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-position.hr-position'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    reports_to_position: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-position.hr-position'
    >;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrRosterHrRoster extends Struct.CollectionTypeSchema {
  collectionName: 'hr_rosters';
  info: {
    description: "One employee's shift assignment for one date";
    displayName: 'HR Roster';
    pluralName: 'hr-rosters';
    singularName: 'hr-roster';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
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
      'api::hr-roster.hr-roster'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    shift: Schema.Attribute.Relation<'manyToOne', 'api::hr-shift.hr-shift'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrShiftHrShift extends Struct.CollectionTypeSchema {
  collectionName: 'hr_shifts';
  info: {
    description: 'A shift template (start/end time, break, grace period)';
    displayName: 'HR Shift';
    pluralName: 'hr-shifts';
    singularName: 'hr-shift';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    break_minutes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    end_time: Schema.Attribute.Time;
    grace_minutes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-shift.hr-shift'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    rosters: Schema.Attribute.Relation<'oneToMany', 'api::hr-roster.hr-roster'>;
    start_time: Schema.Attribute.Time;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrSkillHrSkill extends Struct.CollectionTypeSchema {
  collectionName: 'hr_skills';
  info: {
    description: 'Employee skill or language proficiency';
    displayName: 'HR Skill';
    pluralName: 'hr-skills';
    singularName: 'hr-skill';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    category: Schema.Attribute.Enumeration<['Skill', 'Language']> &
      Schema.Attribute.DefaultTo<'Skill'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-skill.hr-skill'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    proficiency: Schema.Attribute.Enumeration<
      ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    >;
    publishedAt: Schema.Attribute.DateTime;
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

export interface ApiHrTrainingEnrollmentHrTrainingEnrollment
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_training_enrollments';
  info: {
    description: "One employee's place on a session";
    displayName: 'HR Training Enrollment';
    pluralName: 'hr-training-enrollments';
    singularName: 'hr-training-enrollment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    certificate: Schema.Attribute.Media<'images' | 'files'>;
    completion_date: Schema.Attribute.Date;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    feedback: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-training-enrollment.hr-training-enrollment'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    score: Schema.Attribute.Decimal;
    session: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-training-session.hr-training-session'
    >;
    status: Schema.Attribute.Enumeration<
      ['Enrolled', 'Attended', 'Completed', 'Dropped']
    > &
      Schema.Attribute.DefaultTo<'Enrolled'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrTrainingSessionHrTrainingSession
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_training_sessions';
  info: {
    description: 'A scheduled delivery of a course';
    displayName: 'HR Training Session';
    pluralName: 'hr-training-sessions';
    singularName: 'hr-training-session';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    capacity: Schema.Attribute.Integer;
    course: Schema.Attribute.Relation<'manyToOne', 'api::hr-course.hr-course'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    end_date: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-training-session.hr-training-session'
    > &
      Schema.Attribute.Private;
    location: Schema.Attribute.String;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    start_date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['Scheduled', 'InProgress', 'Completed', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Scheduled'>;
    trainer: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHrWorkExperienceHrWorkExperience
  extends Struct.CollectionTypeSchema {
  collectionName: 'hr_work_experiences';
  info: {
    description: 'Employee prior work experience';
    displayName: 'HR Work Experience';
    pluralName: 'hr-work-experiences';
    singularName: 'hr-work-experience';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    company_name: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    end_date: Schema.Attribute.Date;
    job_title: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::hr-work-experience.hr-work-experience'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    start_date: Schema.Attribute.Date;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailAccountMailAccount extends Struct.CollectionTypeSchema {
  collectionName: 'mail_accounts';
  info: {
    description: 'A connected mailbox (personal or shared), read LIVE over IMAP \u2014 no sync, no mirror. Messages are only persisted when linked (import-on-demand, see docs/todo/email-program/). Credentials are AES-256-GCM ciphertext, never plaintext.';
    displayName: 'Mail Account';
    pluralName: 'mail-accounts';
    singularName: 'mail-account';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    access_roles: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email & Schema.Attribute.Required;
    from_name: Schema.Attribute.String;
    imap_host: Schema.Attribute.String & Schema.Attribute.Required;
    imap_password_enc: Schema.Attribute.Text & Schema.Attribute.Private;
    imap_port: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<993>;
    imap_secure: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    imap_username: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    kind: Schema.Attribute.Enumeration<['personal', 'shared']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'personal'>;
    last_checked_at: Schema.Attribute.DateTime;
    last_error: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-account.mail-account'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    provisioning_source: Schema.Attribute.Enumeration<['byo', 'mailcow']> &
      Schema.Attribute.DefaultTo<'byo'>;
    publishedAt: Schema.Attribute.DateTime;
    reply_to: Schema.Attribute.String;
    signature_html: Schema.Attribute.Text;
    smtp_host: Schema.Attribute.String & Schema.Attribute.Required;
    smtp_password_enc: Schema.Attribute.Text & Schema.Attribute.Private;
    smtp_port: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<465>;
    smtp_secure: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    smtp_username: Schema.Attribute.String;
    special_folders: Schema.Attribute.JSON;
    unseen_counts: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailAttachmentMailAttachment
  extends Struct.CollectionTypeSchema {
  collectionName: 'mail_attachments';
  info: {
    description: 'Attachment METADATA for an imported message. M2 deliberately stores no binary \u2014 the live gateway can still fetch the part from the mailbox while it exists; binary snapshots via the upload provider are the recorded M3+ upgrade (docs/todo/email-program/01-data-model.md).';
    displayName: 'Mail Attachment';
    pluralName: 'mail-attachments';
    singularName: 'mail-attachment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    checksum: Schema.Attribute.String;
    cid: Schema.Attribute.String;
    content_type: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    filename: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-attachment.mail-attachment'
    > &
      Schema.Attribute.Private;
    mail_message: Schema.Attribute.Relation<
      'manyToOne',
      'api::mail-message.mail-message'
    >;
    part_id: Schema.Attribute.Integer;
    publishedAt: Schema.Attribute.DateTime;
    size_bytes: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailContactMailContact extends Struct.CollectionTypeSchema {
  collectionName: 'mail_contacts';
  info: {
    description: "Address-book entry. scope 'personal' rows belong to their owner alone; 'global' rows are the company directory (Outlook GAL model) and are manager-maintained. Compose autocomplete merges these with the person spine and CRM contacts.";
    displayName: 'Mail Contact';
    pluralName: 'mail-contacts';
    singularName: 'mail-contact';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-contact.mail-contact'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    organization: Schema.Attribute.String;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    scope: Schema.Attribute.Enumeration<['personal', 'global']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'personal'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailLinkMailLink extends Struct.CollectionTypeSchema {
  collectionName: 'mail_links';
  info: {
    description: 'Polymorphic link between an imported mail-message and any ERP record (entity_uid + target_document_id \u2014 the work-item-* pattern). One row per attachment of a message to a person, contact, order, or ticket.';
    displayName: 'Mail Link';
    pluralName: 'mail-links';
    singularName: 'mail-link';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entity_uid: Schema.Attribute.String & Schema.Attribute.Required;
    link_kind: Schema.Attribute.Enumeration<['manual', 'auto', 'triage']> &
      Schema.Attribute.DefaultTo<'manual'>;
    linked_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-link.mail-link'
    > &
      Schema.Attribute.Private;
    mail_message: Schema.Attribute.Relation<
      'manyToOne',
      'api::mail-message.mail-message'
    >;
    publishedAt: Schema.Attribute.DateTime;
    target_document_id: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailMessageMailMessage extends Struct.CollectionTypeSchema {
  collectionName: 'mail_messages';
  info: {
    description: 'A materialized email \u2014 created ONLY via import-on-link or a shared-inbox triage action (docs/todo/email-program/01-data-model.md). The mailbox stays the source of truth for everything else.';
    displayName: 'Mail Message';
    pluralName: 'mail-messages';
    singularName: 'mail-message';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    account: Schema.Attribute.Relation<
      'manyToOne',
      'api::mail-account.mail-account'
    >;
    assigned_to: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    attachments: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-attachment.mail-attachment'
    >;
    bcc_json: Schema.Attribute.JSON;
    body_html: Schema.Attribute.Text;
    body_text: Schema.Attribute.Text;
    cc_json: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.DateTime;
    dedupe_hash: Schema.Attribute.String;
    direction: Schema.Attribute.Enumeration<['inbound', 'outbound']> &
      Schema.Attribute.DefaultTo<'inbound'>;
    folder: Schema.Attribute.String;
    from_email: Schema.Attribute.String;
    from_name: Schema.Attribute.String;
    has_attachments: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    headers_json: Schema.Attribute.JSON;
    imap_uid: Schema.Attribute.BigInteger;
    imported_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    links: Schema.Attribute.Relation<'oneToMany', 'api::mail-link.mail-link'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-message.mail-message'
    > &
      Schema.Attribute.Private;
    message_id: Schema.Attribute.String;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    size_bytes: Schema.Attribute.Integer;
    snippet: Schema.Attribute.String;
    subject: Schema.Attribute.String;
    to_json: Schema.Attribute.JSON;
    triage_status: Schema.Attribute.Enumeration<
      ['none', 'open', 'assigned', 'awaiting', 'closed', 'spam']
    > &
      Schema.Attribute.DefaultTo<'none'>;
    uidvalidity: Schema.Attribute.BigInteger;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailServerMailServer extends Struct.CollectionTypeSchema {
  collectionName: 'mail_servers';
  info: {
    description: 'Registered mail-server admin endpoints (mailcow-type first). Assigning an email to a user in rutba-users provisions the mailbox here automatically. The admin API key is stored encrypted (api_key_enc, AES-256-GCM via MAIL_CRED_KEY) and never returned.';
    displayName: 'Mail Server';
    pluralName: 'mail-servers';
    singularName: 'mail-server';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    api_key_enc: Schema.Attribute.Text & Schema.Attribute.Private;
    base_url: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    imap_host: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    kind: Schema.Attribute.Enumeration<['mailcow']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'mailcow'>;
    last_checked_at: Schema.Attribute.DateTime;
    last_error: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-server.mail-server'
    > &
      Schema.Attribute.Private;
    mail_domains: Schema.Attribute.JSON;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    smtp_host: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailSnippetMailSnippet extends Struct.CollectionTypeSchema {
  collectionName: 'mail_snippets';
  info: {
    description: "Canned reply fragment for compose (the Front/Missive 'snippets' feature shared inboxes live on). scope 'personal' rows belong to their owner; 'global' rows are manager-maintained team snippets. body_html is sanitized on write.";
    displayName: 'Mail Snippet';
    pluralName: 'mail-snippets';
    singularName: 'mail-snippet';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    body_html: Schema.Attribute.Text & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-snippet.mail-snippet'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    scope: Schema.Attribute.Enumeration<['personal', 'global']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'personal'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMailTagMailTag extends Struct.CollectionTypeSchema {
  collectionName: 'mail_tags';
  info: {
    description: 'Tag registry for the mail client. The slug is the IMAP custom keyword (rt_*) actually stored on messages \u2014 tags live on the mail server, survive without import, and appear in other IMAP clients. Manager-maintained; everyone reads.';
    displayName: 'Mail Tag';
    pluralName: 'mail-tags';
    singularName: 'mail-tag';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    color: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mail-tag.mail-tag'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.String & Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMarketplaceAccountMarketplaceAccount
  extends Struct.CollectionTypeSchema {
  collectionName: 'marketplace_accounts';
  info: {
    description: 'API credentials + sync state for a connected marketplace seller account (Daraz, Amazon, Shopify, ...)';
    displayName: 'Marketplace Account';
    pluralName: 'marketplace-accounts';
    singularName: 'marketplace-account';
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
    extra_config: Schema.Attribute.JSON & Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    last_connected_at: Schema.Attribute.DateTime;
    last_inventory_synced_at: Schema.Attribute.DateTime;
    last_messages_synced_at: Schema.Attribute.DateTime;
    last_orders_synced_at: Schema.Attribute.DateTime;
    last_status_pushed_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-account.marketplace-account'
    > &
      Schema.Attribute.Private;
    platform: Schema.Attribute.Enumeration<
      ['daraz', 'amazon', 'shopify', 'rutba']
    > &
      Schema.Attribute.Required;
    price_adjust_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    product_groups: Schema.Attribute.Relation<
      'manyToMany',
      'api::product-group.product-group'
    >;
    publishedAt: Schema.Attribute.DateTime;
    refresh_expires_at: Schema.Attribute.DateTime & Schema.Attribute.Private;
    refresh_token: Schema.Attribute.Text & Schema.Attribute.Private;
    region: Schema.Attribute.String;
    seller_id: Schema.Attribute.String;
    sync_fulfillment_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    sync_inventory_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    sync_logs: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-sync-log.marketplace-sync-log'
    >;
    sync_messages_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    sync_orders_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    token_expires_at: Schema.Attribute.DateTime & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMarketplaceListingMarketplaceListing
  extends Struct.CollectionTypeSchema {
  collectionName: 'marketplace_listings';
  info: {
    description: 'Per (account, product) listing config: whether the product is selected for a marketplace, its per-listing price adjustment, and the external listing/sku ids + push state. Pure datastore \u2014 the apps/sales/marketplace app reads/writes it.';
    displayName: 'Marketplace Listing';
    pluralName: 'marketplace-listings';
    singularName: 'marketplace-listing';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    external_listing_id: Schema.Attribute.String;
    external_sku_id: Schema.Attribute.String;
    last_pushed_at: Schema.Attribute.DateTime;
    listed_price: Schema.Attribute.Decimal;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-listing.marketplace-listing'
    > &
      Schema.Attribute.Private;
    marketplace_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::marketplace-account.marketplace-account'
    >;
    platform: Schema.Attribute.String;
    price_adjust_pct: Schema.Attribute.Decimal;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    product_name: Schema.Attribute.String;
    product_sku: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    push_error: Schema.Attribute.Text;
    selected: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    status: Schema.Attribute.Enumeration<
      ['draft', 'listed', 'delisted', 'error']
    > &
      Schema.Attribute.DefaultTo<'draft'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMarketplaceMappingMarketplaceMapping
  extends Struct.CollectionTypeSchema {
  collectionName: 'marketplace_mappings';
  info: {
    description: "Maps an internal taxonomy entity (category/brand/term/term-type) to a marketplace's taxonomy id. Pure reference data \u2014 the apps/sales/marketplace app reads/writes it; Strapi just stores it.";
    displayName: 'Marketplace Mapping';
    pluralName: 'marketplace-mappings';
    singularName: 'marketplace-mapping';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attributes: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    external_id: Schema.Attribute.String;
    external_name: Schema.Attribute.String;
    external_parent_id: Schema.Attribute.String;
    internal_document_id: Schema.Attribute.String;
    internal_name: Schema.Attribute.String;
    internal_uid: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    kind: Schema.Attribute.Enumeration<
      ['category', 'brand', 'term', 'term_type']
    > &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-mapping.marketplace-mapping'
    > &
      Schema.Attribute.Private;
    marketplace_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::marketplace-account.marketplace-account'
    >;
    platform: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMarketplacePriceRuleMarketplacePriceRule
  extends Struct.CollectionTypeSchema {
  collectionName: 'marketplace_price_rules';
  info: {
    description: "Per-account price adjustment scoped to a product category \u2014 a percentage and/or fixed amount (either direction) applied to that category's products when pushing to the marketplace. Highest priority wins. Pure datastore.";
    displayName: 'Marketplace Price Rule';
    pluralName: 'marketplace-price-rules';
    singularName: 'marketplace-price-rule';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    adjust_fixed: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    adjust_pct: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    category: Schema.Attribute.Relation<'manyToOne', 'api::category.category'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-price-rule.marketplace-price-rule'
    > &
      Schema.Attribute.Private;
    marketplace_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::marketplace-account.marketplace-account'
    >;
    note: Schema.Attribute.String;
    platform: Schema.Attribute.String;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMarketplaceSyncLogMarketplaceSyncLog
  extends Struct.CollectionTypeSchema {
  collectionName: 'marketplace_sync_logs';
  info: {
    description: 'Audit trail of marketplace sync runs (order pulls, inventory pushes, token refreshes)';
    displayName: 'Marketplace Sync Log';
    pluralName: 'marketplace-sync-logs';
    singularName: 'marketplace-sync-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attention: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    created: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    detail: Schema.Attribute.JSON;
    error: Schema.Attribute.Text;
    failed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    fetched: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    finished_at: Schema.Attribute.DateTime;
    kind: Schema.Attribute.Enumeration<
      ['orders', 'inventory', 'catalog', 'oauth', 'fulfillment', 'messages']
    > &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::marketplace-sync-log.marketplace-sync-log'
    > &
      Schema.Attribute.Private;
    marketplace_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::marketplace-account.marketplace-account'
    >;
    platform: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    pushed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    skipped: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    started_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['running', 'success', 'partial', 'error']
    > &
      Schema.Attribute.DefaultTo<'running'>;
    updated: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
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
    outputs: Schema.Attribute.Component<'mfg.bom-output', true>;
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

export interface ApiMfgJobWorkItemMfgJobWorkItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_job_work_items';
  info: {
    description: 'One sent stock unit on a job-work order. Created server-side at dispatch with a snapshot of the outgoing product/cost; resolved at receive as Returned (transformed in place: new product, cost = sent cost + service charge +/- adjustment), Lost or Damaged.';
    displayName: 'Job Work Item';
    pluralName: 'mfg-job-work-items';
    singularName: 'mfg-job-work-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    barcode: Schema.Attribute.String;
    cost_adjustment: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    job_work: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-job-work.mfg-job-work'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-job-work-item.mfg-job-work-item'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    returned_at: Schema.Attribute.DateTime;
    returned_cost: Schema.Attribute.Decimal;
    returned_product: Schema.Attribute.Relation<
      'manyToOne',
      'api::product.product'
    >;
    returned_selling_price: Schema.Attribute.Decimal;
    sent_cost: Schema.Attribute.Decimal;
    sent_product: Schema.Attribute.Relation<
      'manyToOne',
      'api::product.product'
    >;
    sent_selling_price: Schema.Attribute.Decimal;
    service_charge: Schema.Attribute.Decimal;
    status: Schema.Attribute.Enumeration<
      ['Dispatched', 'Returned', 'Lost', 'Damaged', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Dispatched'>;
    stock_item: Schema.Attribute.Relation<
      'manyToOne',
      'api::stock-item.stock-item'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMfgJobWorkMfgJobWork extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_job_works';
  info: {
    description: 'Outsourced processing (e.g. stitching) of serialized stock by a third-party vendor: Draft -> dispatch (units go AtJobWork) -> receive (units return transformed: new product/cost/price, or Lost/Damaged) -> close (vendor bill). Lines are created at dispatch as an immutable snapshot ledger.';
    displayName: 'Job Work Order';
    pluralName: 'mfg-job-works';
    singularName: 'mfg-job-work';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    agreed_rate: Schema.Attribute.Decimal;
    bill: Schema.Attribute.Relation<'oneToOne', 'api::acc-bill.acc-bill'>;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    closed_at: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deduction_amount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    dispatched_at: Schema.Attribute.DateTime;
    expected_return_date: Schema.Attribute.Date;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-job-work-item.mfg-job-work-item'
    >;
    jw_number: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-job-work.mfg-job-work'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    service_description: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      [
        'Draft',
        'Dispatched',
        'PartiallyReturned',
        'Returned',
        'Closed',
        'Cancelled',
      ]
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    stock_items: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
    total_charge: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    vendor: Schema.Attribute.Relation<'manyToOne', 'api::supplier.supplier'>;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
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

export interface ApiMfgProductionTemplateMfgProductionTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfg_production_templates';
  info: {
    description: 'Reusable product-type recipe: input/output category+kind slots + routing, instantiated into concrete versioned BOMs';
    displayName: 'Mfg Production Template';
    pluralName: 'mfg-production-templates';
    singularName: 'mfg-production-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    code: Schema.Attribute.UID<'name'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    default_track_mode: Schema.Attribute.Enumeration<['serialized', 'bulk']> &
      Schema.Attribute.DefaultTo<'serialized'>;
    description: Schema.Attribute.Text;
    input_lines: Schema.Attribute.Component<'mfg.template-input', true>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    local_name: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfg-production-template.mfg-production-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    output_category: Schema.Attribute.Relation<
      'manyToOne',
      'api::category.category'
    >;
    output_lines: Schema.Attribute.Component<'mfg.template-output', true>;
    publishedAt: Schema.Attribute.DateTime;
    routing_steps: Schema.Attribute.Component<'mfg.routing-step', true>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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
    assignee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
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
        'hr_workflow',
        'hr_lifecycle',
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
        'hr_workflow',
        'hr_lifecycle',
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
        'hr_workflow',
        'hr_lifecycle',
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
        'none',
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
        'hr_workflow',
        'hr_lifecycle',
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
    external_id: Schema.Attribute.String;
    internal_only: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    is_read: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::order-message.order-message'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    order: Schema.Attribute.Relation<'manyToOne', 'api::sale-order.sale-order'>;
    origin: Schema.Attribute.Enumeration<['local', 'remote']> &
      Schema.Attribute.DefaultTo<'local'>;
    publishedAt: Schema.Attribute.DateTime;
    sender_id: Schema.Attribute.String;
    sender_type: Schema.Attribute.Enumeration<['rider', 'customer', 'staff']> &
      Schema.Attribute.Required;
    sent_at: Schema.Attribute.DateTime;
    synced_at: Schema.Attribute.DateTime;
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
    disbursed_at: Schema.Attribute.DateTime;
    disbursement_method: Schema.Attribute.Enumeration<
      ['Cash', 'Bank', 'Mobile Wallet']
    >;
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

export interface ApiPayAdvancePayAdvance extends Struct.CollectionTypeSchema {
  collectionName: 'pay_advances';
  info: {
    description: 'A salary advance, recovered from a future payslip';
    displayName: 'Pay Advance';
    pluralName: 'pay-advances';
    singularName: 'pay-advance';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    decided_at: Schema.Attribute.DateTime;
    decided_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-advance.pay-advance'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Text;
    recovery_payslip: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payslip.pay-payslip'
    >;
    rejection_reason: Schema.Attribute.Text;
    requested_date: Schema.Attribute.Date;
    status: Schema.Attribute.Enumeration<
      ['Requested', 'Approved', 'Rejected', 'Recovered']
    > &
      Schema.Attribute.DefaultTo<'Requested'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayBonusPayBonus extends Struct.CollectionTypeSchema {
  collectionName: 'pay_bonuses';
  info: {
    description: 'A bonus/incentive payment for an employee';
    displayName: 'Pay Bonus';
    pluralName: 'pay-bonuses';
    singularName: 'pay-bonus';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-bonus.pay-bonus'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    payment_date: Schema.Attribute.Date;
    payslip: Schema.Attribute.Relation<
      'manyToOne',
      'api::pay-payslip.pay-payslip'
    >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['Pending', 'Approved', 'Paid']> &
      Schema.Attribute.DefaultTo<'Pending'>;
    type: Schema.Attribute.Enumeration<
      ['Performance', 'Festival', 'Annual', 'SignOn', 'Other']
    > &
      Schema.Attribute.DefaultTo<'Other'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayDeductionRulePayDeductionRule
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_deduction_rules';
  info: {
    description: 'Configurable statutory deduction or employer contribution applied during a payroll run (income tax, social security, pension, insurance, etc.). Generic by design \u2014 no jurisdiction is baked into code; each tenant defines the rules that apply to it.';
    displayName: 'Payroll Deduction Rule';
    pluralName: 'pay-deduction-rules';
    singularName: 'pay-deduction-rule';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    applies_to_pay_types: Schema.Attribute.JSON;
    base: Schema.Attribute.Enumeration<['gross', 'base_salary']> &
      Schema.Attribute.DefaultTo<'gross'>;
    brackets: Schema.Attribute.Component<'pay.tax-bracket', true>;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deduction_type: Schema.Attribute.Enumeration<
      ['tax', 'social_security', 'pension', 'insurance', 'union', 'other']
    > &
      Schema.Attribute.DefaultTo<'other'>;
    effective_from: Schema.Attribute.Date;
    effective_to: Schema.Attribute.Date;
    gl_account_key: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'STATUTORY_PAYABLE'>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-deduction-rule.pay-deduction-rule'
    > &
      Schema.Attribute.Private;
    max_amount: Schema.Attribute.Decimal;
    max_base: Schema.Attribute.Decimal;
    method: Schema.Attribute.Enumeration<['flat', 'percent', 'slab']> &
      Schema.Attribute.DefaultTo<'percent'>;
    min_amount: Schema.Attribute.Decimal;
    min_base: Schema.Attribute.Decimal;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    payer: Schema.Attribute.Enumeration<['employee', 'employer']> &
      Schema.Attribute.DefaultTo<'employee'>;
    payslip_category: Schema.Attribute.Enumeration<
      ['tax', 'eobi', 'provident_fund', 'deduction', 'other']
    > &
      Schema.Attribute.DefaultTo<'deduction'>;
    publishedAt: Schema.Attribute.DateTime;
    sequence: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<100>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    value: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiPayEmployeeProfilePayEmployeeProfile
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_employee_profiles';
  info: {
    description: 'Per-employee payroll setup (pay type, bank, statutory). Held behind the payroll role, deliberately off hr-employee to preserve the salary-data privacy wall.';
    displayName: 'Employee Pay Profile';
    pluralName: 'pay-employee-profiles';
    singularName: 'pay-employee-profile';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    bank_account_number: Schema.Attribute.String;
    bank_account_title: Schema.Attribute.String;
    bank_name: Schema.Attribute.String;
    base_salary_override: Schema.Attribute.Decimal;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    daily_rate: Schema.Attribute.Decimal;
    employee: Schema.Attribute.Relation<
      'oneToOne',
      'api::hr-employee.hr-employee'
    >;
    iban: Schema.Attribute.String;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-employee-profile.pay-employee-profile'
    > &
      Schema.Attribute.Private;
    overtime_eligible: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    overtime_rule: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-overtime-rule.hr-overtime-rule'
    >;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    pay_type: Schema.Attribute.Enumeration<
      ['monthly_salary', 'piece_rate', 'hybrid', 'daily_wage', 'contractor']
    > &
      Schema.Attribute.DefaultTo<'monthly_salary'>;
    publishedAt: Schema.Attribute.DateTime;
    statutory_no: Schema.Attribute.String;
    tax_id: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayLoanPayLoan extends Struct.CollectionTypeSchema {
  collectionName: 'pay_loans';
  info: {
    description: 'An employee loan, repaid via payslip deductions';
    displayName: 'Pay Loan';
    pluralName: 'pay-loans';
    singularName: 'pay-loan';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount_repaid: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    currency: Schema.Attribute.Relation<'manyToOne', 'api::currency.currency'>;
    decided_at: Schema.Attribute.DateTime;
    decided_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    installment_amount: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    installments_count: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<1>;
    interest_rate: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-loan.pay-loan'
    > &
      Schema.Attribute.Private;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    principal_amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Text;
    rejection_reason: Schema.Attribute.Text;
    start_date: Schema.Attribute.Date;
    status: Schema.Attribute.Enumeration<
      ['Requested', 'Approved', 'Rejected', 'Active', 'Closed']
    > &
      Schema.Attribute.DefaultTo<'Requested'>;
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
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payroll-run.pay-payroll-run'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    payslips: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payslip.pay-payslip'
    >;
    period_end: Schema.Attribute.Date & Schema.Attribute.Required;
    period_start: Schema.Attribute.Date & Schema.Attribute.Required;
    processed_at: Schema.Attribute.DateTime;
    processed_by: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    stage_key: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'Approved', 'Processed', 'Paid', 'Cancelled']
    > &
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
    bank_reference: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deductions: Schema.Attribute.Decimal;
    employee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    gross: Schema.Attribute.Decimal;
    journal_entry: Schema.Attribute.Relation<
      'oneToOne',
      'api::acc-journal-entry.acc-journal-entry'
    >;
    lines: Schema.Attribute.Component<'pay.payslip-line', true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-payslip.pay-payslip'
    > &
      Schema.Attribute.Private;
    net_pay: Schema.Attribute.Decimal;
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    paid_at: Schema.Attribute.DateTime;
    payment_method: Schema.Attribute.Enumeration<
      ['Cash', 'Bank', 'Mobile Wallet']
    >;
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
    pay_frequency: Schema.Attribute.Enumeration<
      ['Monthly', 'Biweekly', 'Weekly', 'Daily']
    > &
      Schema.Attribute.DefaultTo<'Monthly'>;
    publishedAt: Schema.Attribute.DateTime;
    salary_components: Schema.Attribute.Component<'pay.salary-component', true>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPayStatutoryRemittancePayStatutoryRemittance
  extends Struct.CollectionTypeSchema {
  collectionName: 'pay_statutory_remittances';
  info: {
    description: 'A payment of withheld statutory liabilities (tax / social security / pension, etc.) to the relevant authority. Settles a GL liability account.';
    displayName: 'Statutory Remittance';
    pluralName: 'pay-statutory-remittances';
    singularName: 'pay-statutory-remittance';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amount: Schema.Attribute.Decimal & Schema.Attribute.Required;
    authority: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gl_account_key: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'STATUTORY_PAYABLE'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::pay-statutory-remittance.pay-statutory-remittance'
    > &
      Schema.Attribute.Private;
    method: Schema.Attribute.Enumeration<['Cash', 'Bank', 'Mobile Wallet']> &
      Schema.Attribute.DefaultTo<'Bank'>;
    notes: Schema.Attribute.Text;
    paid_at: Schema.Attribute.DateTime;
    period_label: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<['Pending', 'Paid', 'Cancelled']> &
      Schema.Attribute.DefaultTo<'Pending'>;
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
    owners: Schema.Attribute.Relation<
      'manyToMany',
      'plugin::users-permissions.user'
    >;
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
    crm_contacts: Schema.Attribute.Relation<
      'oneToMany',
      'api::crm-contact.crm-contact'
    >;
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
    divisible: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    expiry_alert_days: Schema.Attribute.Integer;
    external_ids: Schema.Attribute.JSON;
    gallery: Schema.Attribute.Media<'images' | 'videos' | 'audios', true>;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_exchangeable: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    is_perishable: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
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
    qr_code: Schema.Attribute.String;
    reorder_level: Schema.Attribute.Integer;
    sellable_quantity: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    selling_price: Schema.Attribute.Decimal;
    seo_meta: Schema.Attribute.Relation<'oneToOne', 'api::seo-meta.seo-meta'>;
    shelf_life_days: Schema.Attribute.Integer;
    sku: Schema.Attribute.String;
    slug: Schema.Attribute.UID<'name'>;
    stock_batches: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-batch.stock-batch'
    >;
    stock_levels: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-level.stock-level'
    >;
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
      Schema.Attribute.DefaultTo<'Pending'>;
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

export interface ApiReorderPolicyReorderPolicy
  extends Struct.CollectionTypeSchema {
  collectionName: 'reorder_policies';
  info: {
    description: 'Per-(product, branch) replenishment policy: min/max/safety-stock, method, and how to source the replenishment. A null branch is the product-wide default.';
    displayName: 'Reorder Policy';
    pluralName: 'reorder-policies';
    singularName: 'reorder-policy';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    lead_time_days: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::reorder-policy.reorder-policy'
    > &
      Schema.Attribute.Private;
    max_stock: Schema.Attribute.Decimal;
    method: Schema.Attribute.Enumeration<
      ['MinMax', 'ReorderPoint', 'ParLevel', 'Manual']
    > &
      Schema.Attribute.DefaultTo<'MinMax'>;
    min_stock: Schema.Attribute.Decimal;
    preferred_supplier: Schema.Attribute.Relation<
      'manyToOne',
      'api::supplier.supplier'
    >;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    reorder_quantity: Schema.Attribute.Decimal;
    safety_stock: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    source: Schema.Attribute.Enumeration<
      ['Purchase', 'Manufacture', 'Transfer']
    > &
      Schema.Attribute.DefaultTo<'Purchase'>;
    source_branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
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

export interface ApiReturnPolicyReturnPolicy
  extends Struct.CollectionTypeSchema {
  collectionName: 'return_policies';
  info: {
    description: 'Return-window configuration, one row per app (keyed by app_slug) with one row flagged is_default. Per-product opt-out stays on product.non_returnable. Future: per-category / per-channel scope rows.';
    displayName: 'Return Policy';
    pluralName: 'return-policies';
    singularName: 'return-policy';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    app_slug: Schema.Attribute.String & Schema.Attribute.Unique;
    auto_approve_under_paisa: Schema.Attribute.BigInteger;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    exchange_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
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
    assignee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
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
    allocations: Schema.Attribute.JSON;
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
    sellable_qty: Schema.Attribute.Decimal;
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
    applies_to_web: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
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
    marketplaces: Schema.Attribute.Relation<
      'manyToMany',
      'api::marketplace-account.marketplace-account'
    >;
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
    assignee: Schema.Attribute.Relation<
      'manyToOne',
      'api::hr-employee.hr-employee'
    >;
    channel: Schema.Attribute.Enumeration<
      ['web', 'pos', 'manual', 'daraz', 'amazon', 'shopify', 'rutba']
    > &
      Schema.Attribute.DefaultTo<'web'>;
    channel_meta: Schema.Attribute.JSON;
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
    external_order_id: Schema.Attribute.String;
    external_order_number: Schema.Attribute.String;
    external_vendor_id: Schema.Attribute.String;
    label_generated_at: Schema.Attribute.DateTime;
    label_image: Schema.Attribute.Text;
    label_url: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sale-order.sale-order'
    > &
      Schema.Attribute.Private;
    marketplace_account: Schema.Attribute.Relation<
      'manyToOne',
      'api::marketplace-account.marketplace-account'
    >;
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
    pay_later: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    pay_later_at: Schema.Attribute.DateTime;
    pay_later_by: Schema.Attribute.String;
    pay_later_stock_status: Schema.Attribute.String;
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

export interface ApiSeedRunSeedRun extends Struct.CollectionTypeSchema {
  collectionName: 'seed_runs';
  info: {
    description: 'Audit trail of seed engine runs (full/partial), and the anchor content-type for api-pro seed endpoint policies.';
    displayName: 'Seed Run';
    pluralName: 'seed-runs';
    singularName: 'seed-run';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    created_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    error: Schema.Attribute.Text;
    failed_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    finished_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::seed-run.seed-run'
    > &
      Schema.Attribute.Private;
    mode: Schema.Attribute.Enumeration<['full', 'partial']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'partial'>;
    ok_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    only_keys: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    results: Schema.Attribute.JSON;
    skipped_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    source: Schema.Attribute.Enumeration<['cli', 'ui', 'deploy']> &
      Schema.Attribute.DefaultTo<'cli'>;
    started_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['running', 'ok', 'failed']> &
      Schema.Attribute.DefaultTo<'running'>;
    triggered_by: Schema.Attribute.String;
    updated_count: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
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

export interface ApiSiteSettingSiteSetting extends Struct.CollectionTypeSchema {
  collectionName: 'site_settings';
  info: {
    description: 'Per-app site configuration: branding, SEO defaults, promo banner, navigation labels. One row per app (keyed by app_slug), with one row flagged is_default as the fallback.';
    displayName: 'Site Settings';
    pluralName: 'site-settings';
    singularName: 'site-setting';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    app_slug: Schema.Attribute.String & Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    custom_body_end_html: Schema.Attribute.Text;
    custom_head_html: Schema.Attribute.Text;
    default_footer: Schema.Attribute.Relation<
      'oneToOne',
      'api::cms-footer.cms-footer'
    >;
    default_meta_description: Schema.Attribute.Text;
    default_meta_keywords: Schema.Attribute.String;
    default_meta_title: Schema.Attribute.String;
    default_og_image: Schema.Attribute.Media<'images'>;
    favicon: Schema.Attribute.Media<'images'>;
    ga_measurement_id: Schema.Attribute.String;
    gtm_container_id: Schema.Attribute.String;
    header_promo_cta_text: Schema.Attribute.String;
    header_promo_cta_url: Schema.Attribute.String;
    header_promo_enabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
    header_promo_text: Schema.Attribute.String;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::site-setting.site-setting'
    > &
      Schema.Attribute.Private;
    meta_pixel_id: Schema.Attribute.String;
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
    connection_type: Schema.Attribute.Enumeration<['api', 'browser']> &
      Schema.Attribute.DefaultTo<'api'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    extra_config: Schema.Attribute.JSON & Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    last_connected_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-account.social-account'
    > &
      Schema.Attribute.Private;
    page_id: Schema.Attribute.String;
    platform: Schema.Attribute.Enumeration<
      [
        'instagram',
        'facebook',
        'x',
        'linkedin',
        'tiktok',
        'youtube',
        'whatsapp',
      ]
    > &
      Schema.Attribute.Required;
    platform_user_id: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    refresh_token: Schema.Attribute.Text & Schema.Attribute.Private;
    target_name: Schema.Attribute.String;
    token_expires_at: Schema.Attribute.DateTime & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSocialAudioTrackSocialAudioTrack
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_audio_tracks';
  info: {
    description: 'Music bed for generated social videos. A track is either a foreign URL or a file on the media server; both are playable from `url`, so consumers never branch on where it came from.';
    displayName: 'Social Audio Track';
    pluralName: 'social-audio-tracks';
    singularName: 'social-audio-track';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    audio_file: Schema.Attribute.Media<'audios' | 'files'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    credit: Schema.Attribute.String;
    duration_seconds: Schema.Attribute.Decimal;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-audio-track.social-audio-track'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    start_offset: Schema.Attribute.Decimal;
    tags: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String & Schema.Attribute.Required;
    volume: Schema.Attribute.Decimal;
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
    media: Schema.Attribute.Media<'images' | 'videos', true>;
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
    replies_synced_at: Schema.Attribute.DateTime;
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
    video_settings: Schema.Attribute.JSON;
  };
}

export interface ApiSocialRelayProviderSocialRelayProvider
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_relay_providers';
  info: {
    description: 'Third-party aggregator APIs (Ayrshare, Postiz, Zernio, ...) that relay a post to multiple platforms through one key';
    displayName: 'Social Relay Provider';
    pluralName: 'social-relay-providers';
    singularName: 'social-relay-provider';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    api_key: Schema.Attribute.Text & Schema.Attribute.Private;
    api_url: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    extra_config: Schema.Attribute.JSON & Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    last_error: Schema.Attribute.Text;
    last_validated_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-relay-provider.social-relay-provider'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    platforms: Schema.Attribute.JSON;
    provider: Schema.Attribute.Enumeration<
      ['ayrshare', 'postiz', 'zernio', 'post_bridge', 'bundle_social', 'custom']
    > &
      Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    target_id: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
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
    parent_comment_id: Schema.Attribute.String;
    parent_reply: Schema.Attribute.Relation<
      'manyToOne',
      'api::social-reply.social-reply'
    >;
    platform: Schema.Attribute.Enumeration<
      [
        'instagram',
        'facebook',
        'x',
        'linkedin',
        'tiktok',
        'youtube',
        'whatsapp',
      ]
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

export interface ApiSocialVideoTemplateSocialVideoTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_video_templates';
  info: {
    description: 'A named look for generated social videos: a layer stack plus renderer options. Read by the Video Studio and the Social Poster so both produce the same picture from the same recipe.';
    displayName: 'Social Video Template';
    pluralName: 'social-video-templates';
    singularName: 'social-video-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    aspect: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    is_default: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    layers: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-video-template.social-video-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    options: Schema.Attribute.JSON;
    preview_image: Schema.Attribute.Media<'images'>;
    publishedAt: Schema.Attribute.DateTime;
    tags: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockAdjustmentStockAdjustment
  extends Struct.CollectionTypeSchema {
  collectionName: 'stock_adjustments';
  info: {
    description: 'Write-off / damage / loss / expiry of serialized stock-items. Post moves the selected InStock units to a loss status (dropping them from on-hand) and best-effort posts Dr SHRINKAGE_EXPENSE / Cr INVENTORY.';
    displayName: 'Stock Adjustment';
    pluralName: 'stock-adjustments';
    singularName: 'stock-adjustment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    adjusted_item_ids: Schema.Attribute.JSON;
    adjustment_number: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    gl_posted: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-adjustment.stock-adjustment'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    posted_at: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<['Draft', 'Posted', 'Cancelled']> &
      Schema.Attribute.DefaultTo<'Draft'>;
    stock_items: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
    total_cost: Schema.Attribute.Decimal;
    type: Schema.Attribute.Enumeration<
      ['WriteOff', 'Damage', 'Lost', 'Expired']
    > &
      Schema.Attribute.DefaultTo<'WriteOff'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockAlertStockAlert extends Struct.CollectionTypeSchema {
  collectionName: 'stock_alerts';
  info: {
    description: 'Persisted low-stock alerts upserted daily from the reorder suggestion engine. One row per (product, branch) triggered \u2014 idempotent by trigger_key; re-checked daily and auto-resolved when no longer low; user-acknowledgeable / dismissible.';
    displayName: 'Stock Alert';
    pluralName: 'stock-alerts';
    singularName: 'stock-alert';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    acknowledged_at: Schema.Attribute.DateTime;
    acknowledged_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    alert_number: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deficit: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    dismissed_at: Schema.Attribute.DateTime;
    dismissed_by: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    fallback: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    first_detected_at: Schema.Attribute.DateTime;
    last_checked_at: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-alert.stock-alert'
    > &
      Schema.Attribute.Private;
    max_stock: Schema.Attribute.Decimal;
    method: Schema.Attribute.String;
    min_stock: Schema.Attribute.Decimal;
    notes: Schema.Attribute.Text;
    on_hand: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    on_order: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    policy: Schema.Attribute.Relation<
      'manyToOne',
      'api::reorder-policy.reorder-policy'
    >;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    projected: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    resolved_at: Schema.Attribute.DateTime;
    safety_stock: Schema.Attribute.Decimal;
    severity: Schema.Attribute.Enumeration<
      ['Low', 'Medium', 'High', 'Critical']
    > &
      Schema.Attribute.DefaultTo<'Medium'>;
    source: Schema.Attribute.String;
    status: Schema.Attribute.Enumeration<
      ['Open', 'Acknowledged', 'Resolved', 'Dismissed']
    > &
      Schema.Attribute.DefaultTo<'Open'>;
    suggested_qty: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    trigger_key: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockBatchStockBatch extends Struct.CollectionTypeSchema {
  collectionName: 'stock_batches';
  info: {
    description: 'Optional batch/lot grouping for a product with manufacture/expiry dates. Groups serialized units (stock_items) and/or carries a quantity ledger for bulk products. The single batch/lot concept (finished goods + raw material).';
    displayName: 'Stock Batch';
    pluralName: 'stock-batches';
    singularName: 'stock-batch';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    batch_code: Schema.Attribute.String;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    expiry_date: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-batch.stock-batch'
    > &
      Schema.Attribute.Private;
    manufacture_date: Schema.Attribute.Date;
    notes: Schema.Attribute.Text;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    quantity_received: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    quantity_remaining: Schema.Attribute.Decimal &
      Schema.Attribute.DefaultTo<0>;
    quantity_reserved: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    received_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Active', 'Expired', 'Quarantined', 'Depleted', 'Recalled']
    > &
      Schema.Attribute.DefaultTo<'Active'>;
    stock_items: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-item.stock-item'
    >;
    supplier: Schema.Attribute.Relation<'manyToOne', 'api::supplier.supplier'>;
    unit_cost: Schema.Attribute.Decimal;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiStockCountStockCount extends Struct.CollectionTypeSchema {
  collectionName: 'stock_counts';
  info: {
    description: 'Physical cycle count / stock-take of a branch. Post compares counted vs system per product and books shortages as losses (units -> Lost).';
    displayName: 'Stock Count';
    pluralName: 'stock-counts';
    singularName: 'stock-count';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    count_number: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    lines: Schema.Attribute.Component<'inv.count-line', true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-count.stock-count'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    posted_at: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['Draft', 'Posted', 'Cancelled']> &
      Schema.Attribute.DefaultTo<'Draft'>;
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
    expiry_date: Schema.Attribute.Date;
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
    batch: Schema.Attribute.Relation<
      'manyToOne',
      'api::stock-batch.stock-batch'
    >;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    cost_price: Schema.Attribute.Decimal;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    discount: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    expiry_date: Schema.Attribute.Date;
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
    sellable_units: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<1>;
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
        'AtJobWork',
        'Reduced',
      ]
    > &
      Schema.Attribute.DefaultTo<'InStock'>;
    status_history: Schema.Attribute.Component<
      'pos.stock-status-history',
      true
    >;
    storage_location: Schema.Attribute.Relation<
      'manyToOne',
      'api::storage-location.storage-location'
    >;
    units_sold: Schema.Attribute.Decimal & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    work_order: Schema.Attribute.Relation<
      'manyToOne',
      'api::mfg-work-order.mfg-work-order'
    >;
  };
}

export interface ApiStockLevelStockLevel extends Struct.CollectionTypeSchema {
  collectionName: 'stock_levels';
  info: {
    description: 'Denormalised per-(product, branch) on-hand cache. NEVER hand-written \u2014 maintained by the stock-item lifecycle. Sum of quantity_on_hand across branches equals product.stock_quantity.';
    displayName: 'Stock Level';
    pluralName: 'stock-levels';
    singularName: 'stock-level';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    batch: Schema.Attribute.Relation<
      'manyToOne',
      'api::stock-batch.stock-batch'
    >;
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-level.stock-level'
    > &
      Schema.Attribute.Private;
    product: Schema.Attribute.Relation<'manyToOne', 'api::product.product'>;
    publishedAt: Schema.Attribute.DateTime;
    quantity_available: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    quantity_on_hand: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    quantity_reserved: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    storage_location: Schema.Attribute.Relation<
      'manyToOne',
      'api::storage-location.storage-location'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStockTransferStockTransfer
  extends Struct.CollectionTypeSchema {
  collectionName: 'stock_transfers';
  info: {
    description: "Two-sided transfer of serialized stock-items between branches: Draft -> dispatch (InTransit) -> receive (Received). In-transit units are status='Transferred' (not counted in any branch on-hand).";
    displayName: 'Stock Transfer';
    pluralName: 'stock-transfers';
    singularName: 'stock-transfer';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dispatched_at: Schema.Attribute.DateTime;
    from_branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-transfer.stock-transfer'
    > &
      Schema.Attribute.Private;
    notes: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    received_at: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['Draft', 'InTransit', 'PartiallyReceived', 'Received', 'Cancelled']
    > &
      Schema.Attribute.DefaultTo<'Draft'>;
    stock_items: Schema.Attribute.Relation<
      'manyToMany',
      'api::stock-item.stock-item'
    >;
    to_branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    to_location: Schema.Attribute.Relation<
      'manyToOne',
      'api::storage-location.storage-location'
    >;
    transfer_number: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiStorageLocationStorageLocation
  extends Struct.CollectionTypeSchema {
  collectionName: 'storage_locations';
  info: {
    description: 'A bin / shelf / zone inside a branch. Self-referential tree: zone -> aisle -> rack -> shelf -> bin.';
    displayName: 'Storage Location';
    pluralName: 'storage-locations';
    singularName: 'storage-location';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    branch: Schema.Attribute.Relation<'manyToOne', 'api::branch.branch'>;
    children: Schema.Attribute.Relation<
      'oneToMany',
      'api::storage-location.storage-location'
    >;
    code: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    is_active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_pickable: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    is_receivable: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::storage-location.storage-location'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    parent: Schema.Attribute.Relation<
      'manyToOne',
      'api::storage-location.storage-location'
    >;
    publishedAt: Schema.Attribute.DateTime;
    stock_items: Schema.Attribute.Relation<
      'oneToMany',
      'api::stock-item.stock-item'
    >;
    type: Schema.Attribute.Enumeration<
      ['zone', 'aisle', 'rack', 'shelf', 'bin', 'staging', 'quarantine']
    > &
      Schema.Attribute.DefaultTo<'bin'>;
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

export interface ApiWorkItemActivityWorkItemActivity
  extends Struct.CollectionTypeSchema {
  collectionName: 'work_item_activities';
  info: {
    description: 'Append-only audit trail for any workflow-driven work item, keyed by entity_uid + target_document_id (transitions, assignments, watch changes, comments).';
    displayName: 'Work Item Activity';
    pluralName: 'work-item-activities';
    singularName: 'work-item-activity';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    actor: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    actor_label: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    data: Schema.Attribute.JSON;
    entity_uid: Schema.Attribute.String & Schema.Attribute.Required;
    from_value: Schema.Attribute.String;
    kind: Schema.Attribute.Enumeration<
      [
        'created',
        'transition',
        'assigned',
        'unassigned',
        'watch',
        'unwatch',
        'comment',
        'note',
      ]
    > &
      Schema.Attribute.DefaultTo<'note'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::work-item-activity.work-item-activity'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    summary: Schema.Attribute.String;
    target_document_id: Schema.Attribute.String & Schema.Attribute.Required;
    to_value: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiWorkItemCommentWorkItemComment
  extends Struct.CollectionTypeSchema {
  collectionName: 'work_item_comments';
  info: {
    description: 'Discussion thread for any workflow-driven work item, keyed by entity_uid + target_document_id.';
    displayName: 'Work Item Comment';
    pluralName: 'work-item-comments';
    singularName: 'work-item-comment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    author: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    author_label: Schema.Attribute.String;
    body: Schema.Attribute.Text & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entity_uid: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::work-item-comment.work-item-comment'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    target_document_id: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiWorkItemWatchWorkItemWatch
  extends Struct.CollectionTypeSchema {
  collectionName: 'work_item_watches';
  info: {
    description: 'A user watching a workflow-driven work item (entity_uid + target_document_id). One row per user per item.';
    displayName: 'Work Item Watch';
    pluralName: 'work-item-watches';
    singularName: 'work-item-watch';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entity_uid: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::work-item-watch.work-item-watch'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    target_document_id: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    user_label: Schema.Attribute.String;
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
  export namespace Public {
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
      'api::cmp-audience.cmp-audience': ApiCmpAudienceCmpAudience;
      'api::cmp-campaign.cmp-campaign': ApiCmpCampaignCmpCampaign;
      'api::cmp-event.cmp-event': ApiCmpEventCmpEvent;
      'api::cmp-recipient.cmp-recipient': ApiCmpRecipientCmpRecipient;
      'api::cmp-run.cmp-run': ApiCmpRunCmpRun;
      'api::cmp-sending-identity.cmp-sending-identity': ApiCmpSendingIdentityCmpSendingIdentity;
      'api::cmp-template.cmp-template': ApiCmpTemplateCmpTemplate;
      'api::cms-footer.cms-footer': ApiCmsFooterCmsFooter;
      'api::cms-menu-item.cms-menu-item': ApiCmsMenuItemCmsMenuItem;
      'api::cms-menu.cms-menu': ApiCmsMenuCmsMenu;
      'api::cms-page-group.cms-page-group': ApiCmsPageGroupCmsPageGroup;
      'api::cms-page.cms-page': ApiCmsPageCmsPage;
      'api::contact-ticket.contact-ticket': ApiContactTicketContactTicket;
      'api::crm-activity.crm-activity': ApiCrmActivityCrmActivity;
      'api::crm-contact.crm-contact': ApiCrmContactCrmContact;
      'api::crm-lead.crm-lead': ApiCrmLeadCrmLead;
      'api::crm-segment.crm-segment': ApiCrmSegmentCrmSegment;
      'api::currency.currency': ApiCurrencyCurrency;
      'api::customer.customer': ApiCustomerCustomer;
      'api::delivery-method.delivery-method': ApiDeliveryMethodDeliveryMethod;
      'api::delivery-offer.delivery-offer': ApiDeliveryOfferDeliveryOffer;
      'api::delivery-zone.delivery-zone': ApiDeliveryZoneDeliveryZone;
      'api::employee.employee': ApiEmployeeEmployee;
      'api::hr-appraisal-cycle.hr-appraisal-cycle': ApiHrAppraisalCycleHrAppraisalCycle;
      'api::hr-appraisal-rating.hr-appraisal-rating': ApiHrAppraisalRatingHrAppraisalRating;
      'api::hr-appraisal.hr-appraisal': ApiHrAppraisalHrAppraisal;
      'api::hr-asset-assignment.hr-asset-assignment': ApiHrAssetAssignmentHrAssetAssignment;
      'api::hr-asset.hr-asset': ApiHrAssetHrAsset;
      'api::hr-attendance.hr-attendance': ApiHrAttendanceHrAttendance;
      'api::hr-bank-account.hr-bank-account': ApiHrBankAccountHrBankAccount;
      'api::hr-benefit-enrollment.hr-benefit-enrollment': ApiHrBenefitEnrollmentHrBenefitEnrollment;
      'api::hr-benefit-plan.hr-benefit-plan': ApiHrBenefitPlanHrBenefitPlan;
      'api::hr-business-unit.hr-business-unit': ApiHrBusinessUnitHrBusinessUnit;
      'api::hr-candidate.hr-candidate': ApiHrCandidateHrCandidate;
      'api::hr-certification.hr-certification': ApiHrCertificationHrCertification;
      'api::hr-company.hr-company': ApiHrCompanyHrCompany;
      'api::hr-competency.hr-competency': ApiHrCompetencyHrCompetency;
      'api::hr-compliance-item.hr-compliance-item': ApiHrComplianceItemHrComplianceItem;
      'api::hr-cost-center.hr-cost-center': ApiHrCostCenterHrCostCenter;
      'api::hr-course.hr-course': ApiHrCourseHrCourse;
      'api::hr-department.hr-department': ApiHrDepartmentHrDepartment;
      'api::hr-designation.hr-designation': ApiHrDesignationHrDesignation;
      'api::hr-disciplinary-action.hr-disciplinary-action': ApiHrDisciplinaryActionHrDisciplinaryAction;
      'api::hr-division.hr-division': ApiHrDivisionHrDivision;
      'api::hr-education.hr-education': ApiHrEducationHrEducation;
      'api::hr-emergency-contact.hr-emergency-contact': ApiHrEmergencyContactHrEmergencyContact;
      'api::hr-employee-document.hr-employee-document': ApiHrEmployeeDocumentHrEmployeeDocument;
      'api::hr-employee.hr-employee': ApiHrEmployeeHrEmployee;
      'api::hr-expense-claim.hr-expense-claim': ApiHrExpenseClaimHrExpenseClaim;
      'api::hr-family-member.hr-family-member': ApiHrFamilyMemberHrFamilyMember;
      'api::hr-generated-document.hr-generated-document': ApiHrGeneratedDocumentHrGeneratedDocument;
      'api::hr-goal.hr-goal': ApiHrGoalHrGoal;
      'api::hr-grievance.hr-grievance': ApiHrGrievanceHrGrievance;
      'api::hr-holiday-calendar.hr-holiday-calendar': ApiHrHolidayCalendarHrHolidayCalendar;
      'api::hr-incident-report.hr-incident-report': ApiHrIncidentReportHrIncidentReport;
      'api::hr-interview.hr-interview': ApiHrInterviewHrInterview;
      'api::hr-job-grade.hr-job-grade': ApiHrJobGradeHrJobGrade;
      'api::hr-job-requisition.hr-job-requisition': ApiHrJobRequisitionHrJobRequisition;
      'api::hr-leave-balance.hr-leave-balance': ApiHrLeaveBalanceHrLeaveBalance;
      'api::hr-leave-policy.hr-leave-policy': ApiHrLeavePolicyHrLeavePolicy;
      'api::hr-leave-request.hr-leave-request': ApiHrLeaveRequestHrLeaveRequest;
      'api::hr-letter-template.hr-letter-template': ApiHrLetterTemplateHrLetterTemplate;
      'api::hr-lifecycle-event.hr-lifecycle-event': ApiHrLifecycleEventHrLifecycleEvent;
      'api::hr-offer.hr-offer': ApiHrOfferHrOffer;
      'api::hr-overtime-rule.hr-overtime-rule': ApiHrOvertimeRuleHrOvertimeRule;
      'api::hr-position.hr-position': ApiHrPositionHrPosition;
      'api::hr-roster.hr-roster': ApiHrRosterHrRoster;
      'api::hr-shift.hr-shift': ApiHrShiftHrShift;
      'api::hr-skill.hr-skill': ApiHrSkillHrSkill;
      'api::hr-team.hr-team': ApiHrTeamHrTeam;
      'api::hr-training-enrollment.hr-training-enrollment': ApiHrTrainingEnrollmentHrTrainingEnrollment;
      'api::hr-training-session.hr-training-session': ApiHrTrainingSessionHrTrainingSession;
      'api::hr-work-experience.hr-work-experience': ApiHrWorkExperienceHrWorkExperience;
      'api::mail-account.mail-account': ApiMailAccountMailAccount;
      'api::mail-attachment.mail-attachment': ApiMailAttachmentMailAttachment;
      'api::mail-contact.mail-contact': ApiMailContactMailContact;
      'api::mail-link.mail-link': ApiMailLinkMailLink;
      'api::mail-message.mail-message': ApiMailMessageMailMessage;
      'api::mail-server.mail-server': ApiMailServerMailServer;
      'api::mail-snippet.mail-snippet': ApiMailSnippetMailSnippet;
      'api::mail-tag.mail-tag': ApiMailTagMailTag;
      'api::marketplace-account.marketplace-account': ApiMarketplaceAccountMarketplaceAccount;
      'api::marketplace-listing.marketplace-listing': ApiMarketplaceListingMarketplaceListing;
      'api::marketplace-mapping.marketplace-mapping': ApiMarketplaceMappingMarketplaceMapping;
      'api::marketplace-price-rule.marketplace-price-rule': ApiMarketplacePriceRuleMarketplacePriceRule;
      'api::marketplace-sync-log.marketplace-sync-log': ApiMarketplaceSyncLogMarketplaceSyncLog;
      'api::mfg-bom.mfg-bom': ApiMfgBomMfgBom;
      'api::mfg-bundle.mfg-bundle': ApiMfgBundleMfgBundle;
      'api::mfg-defect-type.mfg-defect-type': ApiMfgDefectTypeMfgDefectType;
      'api::mfg-job-work-item.mfg-job-work-item': ApiMfgJobWorkItemMfgJobWorkItem;
      'api::mfg-job-work.mfg-job-work': ApiMfgJobWorkMfgJobWork;
      'api::mfg-material-issue.mfg-material-issue': ApiMfgMaterialIssueMfgMaterialIssue;
      'api::mfg-material-lot.mfg-material-lot': ApiMfgMaterialLotMfgMaterialLot;
      'api::mfg-operation.mfg-operation': ApiMfgOperationMfgOperation;
      'api::mfg-piece-rate.mfg-piece-rate': ApiMfgPieceRateMfgPieceRate;
      'api::mfg-production-line.mfg-production-line': ApiMfgProductionLineMfgProductionLine;
      'api::mfg-production-template.mfg-production-template': ApiMfgProductionTemplateMfgProductionTemplate;
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
      'api::pay-advance.pay-advance': ApiPayAdvancePayAdvance;
      'api::pay-bonus.pay-bonus': ApiPayBonusPayBonus;
      'api::pay-deduction-rule.pay-deduction-rule': ApiPayDeductionRulePayDeductionRule;
      'api::pay-employee-profile.pay-employee-profile': ApiPayEmployeeProfilePayEmployeeProfile;
      'api::pay-loan.pay-loan': ApiPayLoanPayLoan;
      'api::pay-payroll-run.pay-payroll-run': ApiPayPayrollRunPayPayrollRun;
      'api::pay-payslip.pay-payslip': ApiPayPayslipPayPayslip;
      'api::pay-salary-structure.pay-salary-structure': ApiPaySalaryStructurePaySalaryStructure;
      'api::pay-statutory-remittance.pay-statutory-remittance': ApiPayStatutoryRemittancePayStatutoryRemittance;
      'api::payment.payment': ApiPaymentPayment;
      'api::person-dedup-audit.person-dedup-audit': ApiPersonDedupAuditPersonDedupAudit;
      'api::person.person': ApiPersonPerson;
      'api::product-group.product-group': ApiProductGroupProductGroup;
      'api::product.product': ApiProductProduct;
      'api::purchase-item.purchase-item': ApiPurchaseItemPurchaseItem;
      'api::purchase-return-item.purchase-return-item': ApiPurchaseReturnItemPurchaseReturnItem;
      'api::purchase-return.purchase-return': ApiPurchaseReturnPurchaseReturn;
      'api::purchase.purchase': ApiPurchasePurchase;
      'api::reorder-policy.reorder-policy': ApiReorderPolicyReorderPolicy;
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
      'api::seed-run.seed-run': ApiSeedRunSeedRun;
      'api::seo-meta.seo-meta': ApiSeoMetaSeoMeta;
      'api::site-setting.site-setting': ApiSiteSettingSiteSetting;
      'api::social-account.social-account': ApiSocialAccountSocialAccount;
      'api::social-audio-track.social-audio-track': ApiSocialAudioTrackSocialAudioTrack;
      'api::social-post.social-post': ApiSocialPostSocialPost;
      'api::social-relay-provider.social-relay-provider': ApiSocialRelayProviderSocialRelayProvider;
      'api::social-reply.social-reply': ApiSocialReplySocialReply;
      'api::social-video-template.social-video-template': ApiSocialVideoTemplateSocialVideoTemplate;
      'api::stock-adjustment.stock-adjustment': ApiStockAdjustmentStockAdjustment;
      'api::stock-alert.stock-alert': ApiStockAlertStockAlert;
      'api::stock-batch.stock-batch': ApiStockBatchStockBatch;
      'api::stock-count.stock-count': ApiStockCountStockCount;
      'api::stock-input.stock-input': ApiStockInputStockInput;
      'api::stock-item.stock-item': ApiStockItemStockItem;
      'api::stock-level.stock-level': ApiStockLevelStockLevel;
      'api::stock-transfer.stock-transfer': ApiStockTransferStockTransfer;
      'api::storage-location.storage-location': ApiStorageLocationStorageLocation;
      'api::supplier.supplier': ApiSupplierSupplier;
      'api::term-type.term-type': ApiTermTypeTermType;
      'api::term.term': ApiTermTerm;
      'api::work-item-activity.work-item-activity': ApiWorkItemActivityWorkItemActivity;
      'api::work-item-comment.work-item-comment': ApiWorkItemCommentWorkItemComment;
      'api::work-item-watch.work-item-watch': ApiWorkItemWatchWorkItemWatch;
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
