'use strict';

/**
 * "A product with no image does not go out" — the social end of it.
 *
 * A social post is NOT simply a mirror of a product. It carries its own
 * creative: a cover and a media gallery, frequently a Video Studio render made
 * specifically for the campaign. That creative can legitimately exist for a
 * product with no catalogue photo — a designed graphic for a product still being
 * shot, say — and blocking those would break a real flow for no benefit.
 *
 * So the rule here is deliberately narrower than the publish gate's. It refuses
 * exactly one thing: a post that links products and has NOTHING to show — no
 * cover, no media of its own, and no image on any product it links. That post
 * cannot render as anything but text on a grid of photos, and it is the case
 * where "promote this product" was the intent and the product has no picture.
 *
 * What this deliberately does NOT do:
 *   - block a post whose own cover/media exist (designed creative — allowed)
 *   - block publishToProviders / publishToRelays, which push the POST's media,
 *     not the product's. Gating there would kill designed-creative posts at the
 *     last step, after all the work.
 */

const { ValidationError } = require('@strapi/utils').errors;
const { documentHasAnyImage } = require('../../utils/public-product');

const POST_UID = 'api::social-post.social-post';

const NOTHING_TO_SHOW_MESSAGE =
  'This post has no image. Add a cover or media to the post, or pick a product that has a photo — a post promoting a product needs something to show.';

/**
 * Product documentIds referenced by a relation payload. Strapi accepts several
 * shapes for the same thing (`{ set: [...] }`, `{ connect: [...] }`, a bare
 * array, a bare id), and a gate that understood only one would be trivially
 * bypassed by a client using another.
 */
function relationDocumentIds(rel) {
  if (!rel) return [];
  const flatten = (v) =>
    (Array.isArray(v) ? v : [v])
      .map((x) => (x && typeof x === 'object' ? x.documentId ?? x.id : x))
      .filter((x) => typeof x === 'string' && x.length > 0);

  if (Array.isArray(rel)) return flatten(rel);
  if (typeof rel === 'string') return [rel];
  if (typeof rel === 'object') {
    return [...flatten(rel.set), ...flatten(rel.connect)];
  }
  return [];
}

/** Does the post carry creative of its own? */
function postHasOwnMedia(data) {
  if (!data) return false;
  const cover = data.cover;
  const hasCover = Array.isArray(cover) ? cover.length > 0 : cover != null && cover !== '';
  if (hasCover) return true;
  const media = data.media;
  if (Array.isArray(media)) return media.length > 0;
  return media != null && media !== '';
}

/**
 * Throws ValidationError (→ HTTP 400) for a product post with nothing to show.
 * A no-op for posts that link no products, or that carry their own creative.
 */
async function validateProductPostMedia(strapi, data) {
  if (!data) return;
  if (postHasOwnMedia(data)) return;

  const productIds = relationDocumentIds(data.products);
  if (productIds.length === 0) return; // not a product post — not this gate's business

  for (const documentId of productIds) {
    if (await documentHasAnyImage(strapi, documentId)) return; // one photo is enough
  }
  throw new ValidationError(NOTHING_TO_SHOW_MESSAGE);
}

/**
 * Register the gate on a documents() implementation — the same seam the publish
 * gate uses, and for the same reason: `create` has more than one caller. In
 * pos-strapi the REST core controller and the admin panel both land here, and
 * in rutba-core plain CRUD is served by a generic handler built on documents()
 * rather than by the ported controller, so a controller override would miss it
 * entirely whenever RUTBA_BACKEND is core or both.
 */
function registerProductPostImageGuard(documents, strapi) {
  documents.use(async (context, next) => {
    if (context.uid === POST_UID && context.action === 'create') {
      await validateProductPostMedia(strapi, context.params?.data);
    }
    return next();
  });
}

module.exports = {
  POST_UID,
  NOTHING_TO_SHOW_MESSAGE,
  validateProductPostMedia,
  registerProductPostImageGuard,
  relationDocumentIds,
  postHasOwnMedia,
};
