# Order & Delivery Management System — Merged Recovery Plan (Stepwise with Mandatory Stops)

## Consolidated Gap Checklist (Merged from both plans + current implementation)

### Already Implemented (partial/major)
- New Strapi content-types created: `delivery-zone`, `delivery-method`, `rider`, `delivery-offer`, `order-message`, `notification-template`, `notification-log`.
- `order` schema + `product-group` schema extended for delivery/rider fields.
- Core Strapi services created:
  - `delivery-cost-calculator`
  - `delivery-offer-service`
  - `order-state-machine`
  - `notification-service`
  - `easypost-service`
- Order/rider custom controllers and routes created.
- Email plugin config added in `pos-strapi/config/plugins.js`.
- `rutba-web` checkout delivery method flow mostly wired (shipping info -> method selection, selected method affects total, payload fields added).

### Major Remaining Gaps
1. Backend stabilization
   - Validate all new controller/service/router files compile and run in Strapi.
   - Resolve runtime mismatches in `order.js` and service contracts.

2. Security/permissions
   - Custom order/rider routes are still permissive in many places (`auth: false`) and must be tightened by role.

3. Checkout contract hardening
   - Confirm E2E create-order flow with new delivery fields for own-rider and courier/easypost paths.

4. Customer tracking + messaging surfaces
   - `rutba-web` tracking page is still missing.
   - `rutba-web-user` order tracking/detail enhancements are pending.

5. CMS operational UI
   - Missing pages: riders, delivery-methods, delivery-zones, notification-templates.
   - Orders page extensions for assignment/status actions pending.

6. Rider app workspace
   - `rutba-rider` workspace not yet created.

7. Infra wiring
   - Root workspace scripts, `packages/pos-shared/lib/roles.js`, hostinger config, and Docker wiring for rider app not completed.

8. International shipping completion
   - EasyPost service exists, but full operational flow and fallback behavior validation remains pending.

---

## Stepwise Execution Plan (Hard STOP after every step)

### Step 1 — Stabilize Strapi backend runtime and compile health
- Fix/verify all new delivery/order/rider files load correctly.
- Confirm Strapi boots without delivery-feature runtime errors.
- **STOP after Step 1. Do not proceed without explicit approval.**

### Step 2 — Lock down API auth and role enforcement
- Replace permissive route configs with proper auth.
- Enforce customer/rider/staff role checks per endpoint purpose.
- **STOP after Step 2. Do not proceed without explicit approval.**

### Step 3 — Finalize checkout E2E in `rutba-web`
- Validate shipping-info -> delivery-method -> place-order flow.
- Ensure totals, delivery selection state, and payload are correct.
- **STOP after Step 3. Do not proceed without explicit approval.**

### Step 4 — Validate order creation + rider offer trigger paths
- Confirm own-rider methods trigger delivery offer broadcast.
- Confirm non-rider methods create order cleanly.
- **STOP after Step 4. Do not proceed without explicit approval.**

### Step 5 — Complete customer tracking + messaging UI in `rutba-web`
- Add order tracking page.
- Bind status timeline, rider details, and message thread.
- **STOP after Step 5. Do not proceed without explicit approval.**

### Step 6 — Complete `rutba-web-user` order detail/tracking enhancements
- Add status badges, tracking links, and detail timeline.
- Show rider contact/message access when applicable.
- **STOP after Step 6. Do not proceed without explicit approval.**

### Step 7 — Build CMS delivery operations pages (`rutba-cms`)
- Implement Riders, Delivery Methods, Delivery Zones, Notification Templates pages.
- Extend Orders page for assignment/status operations.
- **STOP after Step 7. Do not proceed without explicit approval.**

### Step 8 — Finalize notifications and lifecycle triggers
- Validate template rendering, trigger mapping, and send behavior.
- Verify notification-log auditing for success/failure.
- **STOP after Step 8. Do not proceed without explicit approval.**

### Step 9 — Complete EasyPost international workflow
- Validate rate retrieval, order linkage, and fallback behavior.
- **STOP after Step 9. Do not proceed without explicit approval.**

### Step 10 — Create `rutba-rider` MVP workspace + API integration
- Scaffold workspace and auth.
- Implement offers list/detail, deliveries, status updates, messaging.
- **STOP after Step 10. Do not proceed without explicit approval.**

### Step 11 — Apply monorepo/infrastructure wiring for rider app
- Update root workspaces/scripts.
- Update shared app metadata, hostinger config, and Docker.
- **STOP after Step 11. Do not proceed without explicit approval.**

### Step 12 — Final integrated validation + release readiness report
- Run targeted builds/tests.
- Deliver completion matrix vs merged plan with residual risks.
- **STOP after Step 12 for final sign-off.**
