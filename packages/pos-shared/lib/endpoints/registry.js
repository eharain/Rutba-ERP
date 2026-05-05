import { SalesEndpointsMeta } from './sales.js';
import { SaleItemsEndpointsMeta } from './sale-items.js';
import { SaleReturnsEndpointsMeta } from './sale-returns.js';
import { SaleReturnItemsEndpointsMeta } from './sale-return-items.js';
import { PurchasesEndpointsMeta } from './purchases.js';
import { PurchaseItemsEndpointsMeta } from './purchase-items.js';
import { PaymentsEndpointsMeta } from './payments.js';
import { CashRegisterTransactionEndpointsMeta } from './cash-register-transactions.js';
import { CashRegistersEndpointsMeta } from './cash-registers.js';
import { StockItemsEndpointsMeta } from './stock-items.js';
import { ProductsEndpointsMeta } from './products.js';
import { CustomersEndpointsMeta } from './customers.js';
import { BranchesEndpointsMeta } from './branches.js';
import { BrandsEndpointsMeta } from './brands.js';
import { CategoriesEndpointsMeta } from './categories.js';
import { SuppliersEndpointsMeta } from './suppliers.js';
import { CmsPagesEndpointsMeta } from './cms-pages.js';
import { UploadEndpointsMeta } from './upload.js';
import { EnumsEndpointsMeta } from './enums.js';
import { TermTypesEndpointsMeta, TermsEndpointsMeta } from './term-types.js';
import { CrmLeadsEndpointsMeta } from './crm-leads.js';
import { StockInputsEndpointsMeta } from './stock-inputs.js';
import { DisabledPlaceholderEndpoints } from './disabled-placeholders.js';

const IMPLEMENTED_ENDPOINT_META = [
    SalesEndpointsMeta,
    SaleItemsEndpointsMeta,
    SaleReturnsEndpointsMeta,
    SaleReturnItemsEndpointsMeta,
    PurchasesEndpointsMeta,
    PurchaseItemsEndpointsMeta,
    PaymentsEndpointsMeta,
    CashRegisterTransactionEndpointsMeta,
    CashRegistersEndpointsMeta,
    StockItemsEndpointsMeta,
    ProductsEndpointsMeta,
    CustomersEndpointsMeta,
    BranchesEndpointsMeta,
    BrandsEndpointsMeta,
    CategoriesEndpointsMeta,
    SuppliersEndpointsMeta,
    CmsPagesEndpointsMeta,
    UploadEndpointsMeta,
    EnumsEndpointsMeta,
    TermTypesEndpointsMeta,
    TermsEndpointsMeta,
    CrmLeadsEndpointsMeta,
    StockInputsEndpointsMeta,
];

const DISABLED_ENDPOINT_META = Object.values(DisabledPlaceholderEndpoints || {});

const ENDPOINT_METADATA_REGISTRY = {
    implemented: IMPLEMENTED_ENDPOINT_META,
    disabled: DISABLED_ENDPOINT_META,
    all: [
        ...IMPLEMENTED_ENDPOINT_META,
        ...DISABLED_ENDPOINT_META,
    ],
};

export {
    IMPLEMENTED_ENDPOINT_META,
    DISABLED_ENDPOINT_META,
    ENDPOINT_METADATA_REGISTRY,
};

