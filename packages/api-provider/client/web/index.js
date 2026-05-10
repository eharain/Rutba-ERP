export { createWebClientProxy } from './createWebClientProxy.js';

export { WebAuthEndpoints } from '../../api/web/auth.js';
export { WebBannersEndpoints } from '../../api/web/banners.js';
export { WebBrandsEndpoints } from '../../api/web/brands.js';
export { WebCategoriesEndpoints } from '../../api/web/categories.js';
export { WebCheckoutEndpoints } from '../../api/web/checkout.js';
export { WebCmsPagesEndpoints } from '../../api/web/cms-pages.js';
export { WebCollectionsEndpoints } from '../../api/web/collections.js';
export { WebDeliveryEndpoints } from '../../api/web/delivery.js';
export { WebLeadsEndpoints } from '../../api/web/leads.js';
export { WebOrdersEndpoints } from '../../api/web/orders.js';
export { WebProductGroupsEndpoints } from '../../api/web/product-groups.js';
export { WebProductsEndpoints } from '../../api/web/products.js';
export { WebReviewsEndpoints } from '../../api/web/reviews.js';
export { WebSiteSettingsEndpoints } from '../../api/web/site-settings.js';

export { createWebAuthService } from './auth.js';
export { createWebBannersService } from './banners.js';
export { createWebBrandsService } from './brands.js';
export { createWebCategoriesService } from './categories.js';
export { createWebCheckoutService } from './checkout.js';
export {
  createWebCmsPagesService,
  getCmsPagesSSR,
  getCmsPagesByTypeSSR,
  getCmsPageBySlugSSR,
} from './cms-pages.js';
export { createWebDeliveryService } from './delivery.js';
export { createWebLeadsService } from './leads.js';
export { createWebOrdersService } from './orders.js';
export { createWebProductGroupsService } from './product-groups.js';
export { createWebProductsService } from './products.js';
export { createWebReviewsService } from './reviews.js';
export { createWebSiteSettingsService, SITE_SETTINGS_DEFAULTS } from './site-settings.js';

