import { AppContextEndpoints } from '@rutba/api-provider/endpoints';

// Side-effect: ensure SSR / Node fetches carry the `X-Rutba-App: web` header.
// `_app.tsx` already calls `setAppName('web')` on mount, but Next.js loads
// the page module (which transitively pulls this barrel) BEFORE `_app.tsx`
// when running `getServerSideProps`. Without this, SSR-side calls to the
// storefront's app-scoped public routes (e.g. `requireApp(ctx, 'web')` on
// `/products/public/by-id/:id`) are 404'd before they reach the handler.
AppContextEndpoints.setAppName('web');

export * from '@rutba/api-provider/endpoints/web/index.js';
