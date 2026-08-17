'use strict';

// Keep `merge_keys` derived from the body rather than client-supplied.
//
// The composer validates a campaign by intersecting the template's required
// merge keys with the keys the audience can actually fill. That check is only
// worth anything if `merge_keys` cannot drift from the body — so it is
// recomputed here on every write and any value the client sent is discarded.
//
// beforeUpdate sees a PARTIAL payload (Strapi sends only changed fields), so a
// save that touches just the subject would otherwise recompute keys from an
// undefined body and wipe them. Hence the merge with the stored row.

const { extractMergeKeys } = require('../../../../utils/template-render');

const UID = 'api::cmp-template.cmp-template';

const keysFor = (subject, html, text) => extractMergeKeys(subject, html, text);

module.exports = {
  async beforeCreate(event) {
    const d = event.params.data;
    if (!d) return;
    d.merge_keys = keysFor(d.subject, d.body_html, d.body_text);
  },

  async beforeUpdate(event) {
    const d = event.params.data;
    if (!d) return;

    // Only the three source fields matter; if none of them is in this write,
    // the stored keys are already correct and recomputing risks clobbering them.
    const touchesBody = ['subject', 'body_html', 'body_text'].some((k) => k in d);
    if (!touchesBody) return;

    let current = {};
    try {
      const where = event.params.where || {};
      current = (await strapi.db.query(UID).findOne({
        where,
        select: ['subject', 'body_html', 'body_text'],
      })) || {};
    } catch (e) {
      strapi.log.warn(`[campaigns] merge-key recompute could not read the current template: ${e.message}`);
    }

    d.merge_keys = keysFor(
      'subject' in d ? d.subject : current.subject,
      'body_html' in d ? d.body_html : current.body_html,
      'body_text' in d ? d.body_text : current.body_text,
    );
  },
};
