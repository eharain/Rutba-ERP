export * from './endpoints';

export { createWebAuthService } from './auth';
export { createWebBannersService } from './banners';
export { createWebBrandsService } from './brands';
export { createWebCategoriesService } from './categories';
export { createWebCheckoutService } from './checkout';
export { createWebCmsPagesService, getCmsPagesSSR, getCmsPagesByTypeSSR, getCmsPageBySlugSSR } from './cms-pages';
export { createWebDeliveryService } from './delivery';
export { createWebLeadsService } from './leads';
export { createMeAddressesService } from './me-addresses';
export type { CustomerAddress, AddressInput } from './me-addresses';
export { createWebOrdersService } from './orders';
export { createWebProductGroupsService } from './product-groups';
export { createWebProductsService, getProductDetailSSR } from './products';
export { createWebReturnsService } from './return-requests';
export type { CreateReturnInput, ReturnLineInput } from './return-requests';
export { createWebReviewsService } from './reviews';
export { createWebSiteSettingsService, SITE_SETTINGS_DEFAULTS } from './site-settings';

