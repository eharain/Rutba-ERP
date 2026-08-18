'use strict';

/**
 * "A product with no image does not go out."
 *
 * The storefront has enforced this at render time for a while (see
 * _sellableProductIds / publicAvailabilityFor in the product service): an
 * image-less product drops out of every grid and its detail page renders
 * "temporarily offline". But nothing stopped it being PUBLISHED in the first
 * place, so the catalog accumulated published rows that can never be sold and
 * that every downstream consumer has to re-filter.
 *
 * This closes the publish end of it as a DOCUMENT-SERVICE MIDDLEWARE rather
 * than a controller check, because publish has four callers and a controller
 * only covers one:
 *   - POST /products/:id/publish        (apps/content/cms, single + bulk)
 *   - the Strapi admin content-manager Publish button (bypasses our routes)
 *   - any server-side documents().publish() call
 *   - services/core's /api/products/:id/publish, when RUTBA_BACKEND is core|both
 *     (registered separately in services/core/src/modules/catalog.js — core has
 *     its own documents() implementation, mirroring this seam)
 *
 * The image test is NOT re-implemented here. It delegates to
 * utils/public-product.js — the same helper the storefront gate uses — because
 * the interesting cases are the ones a naive `!gallery.length && !logo` gets
 * wrong: a parent whose photos all live on its colour variants, and a variant
 * that shares its parent's photo. Both are normal in this catalog and both must
 * stay publishable.
 *
 * ── Draft variants count here, but not on the storefront ──────────────────
 * documentHasAnyImage credits variants at ANY status; the storefront's
 * imagedProductIdSet credits only PUBLISHED ones. That divergence is
 * deliberate. The storefront asks "can this render right now?", and a draft
 * variant's photo is not live. The publish gate asks "does this product have
 * photography at all?" — and answering that published-only would make the
 * parent unpublishable until its variants were published, while the variants
 * are typically published from the parent's page after it exists. That
 * ordering trap would block a legitimate flow to catch nothing: such a product
 * is still withheld from every storefront grid by the listing gate until a
 * variant goes live. Publish is the weaker gate on purpose.
 */

const { ValidationError } = require('@strapi/utils').errors;
const { documentHasAnyImage } = require('../../utils/public-product');

const PRODUCT_UID = 'api::product.product';

// Names the actual reason. apps/content/cms surfaces the server message in its toast,
// so this string is what the operator reads — it has to say what to do.
const NO_IMAGE_MESSAGE =
  'Add at least one image before publishing. This product has no photo of its own and none on its variants, so it cannot be shown to customers.';

/**
 * Throws ValidationError (→ HTTP 400) when the product being published has no
 * image anywhere. Safe to call for any documentId.
 */
async function validateProductPublish(strapi, { documentId }) {
  if (!documentId) return;
  if (await documentHasAnyImage(strapi, documentId)) return;
  throw new ValidationError(NO_IMAGE_MESSAGE);
}

/**
 * Was this error THIS gate refusing, as opposed to any other validation error?
 * Callers that legitimately continue after a refusal (the Rutba↔Rutba catalog
 * ingest, which has already written the row and simply leaves it a draft) need
 * to tell the two apart — catching every ValidationError there would swallow
 * real problems.
 */
function isNoImageError(err) {
  return !!err && err.name === 'ValidationError' && err.message === NO_IMAGE_MESSAGE;
}

/**
 * Register the gate on a documents() implementation. Shared by services/strapi's
 * register() and services/core's catalog module so the rule has one definition
 * and both backends enforce it identically.
 */
function registerPublishImageGuard(documents, strapi) {
  documents.use(async (context, next) => {
    if (context.uid === PRODUCT_UID && context.action === 'publish') {
      await validateProductPublish(strapi, { documentId: context.params?.documentId });
    }
    return next();
  });
}

module.exports = {
  PRODUCT_UID,
  NO_IMAGE_MESSAGE,
  validateProductPublish,
  registerPublishImageGuard,
  isNoImageError,
};
