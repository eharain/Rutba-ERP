'use strict';

/**
 * Rutba auth primitives, shared by every workspace app and by services/core.
 *
 * `./jws` is the one verifier for all three token layers; `./oidc` is the
 * browser-facing client that logs a person in. Split because the instance uses
 * only the first, and a Next app should not pull crypto it never calls.
 */

module.exports = {
  ...require('./jws'),
  ...require('./oidc'),
};
