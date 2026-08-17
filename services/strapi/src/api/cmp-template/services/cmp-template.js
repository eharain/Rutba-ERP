'use strict';

// Template service. The rendering logic itself lives in utils/template-render.js
// so it can be exercised without Strapi — this file is the Strapi-facing shell
// (document reads, sending-identity resolution, MTA calls).
//
// The division of labour with Rutba-MTA is documented in template-render.js and
// is the thing to keep straight: a real send passes placeholders through for the
// MTA to render per recipient; only preview and test-send render here.

const { createCoreService } = require('@strapi/strapi').factories;
const mta = require('../../../utils/mta-client');
const {
  extractMergeKeys,
  renderWith,
  missingKeys,
  withUtm,
} = require('../../../utils/template-render');

const UID = 'api::cmp-template.cmp-template';
const IDENTITY_UID = 'api::cmp-sending-identity.cmp-sending-identity';

module.exports = createCoreService(UID, ({ strapi }) => ({

  extractMergeKeys,
  renderWith,
  withUtm,

  /**
   * The payload a campaign hands to the MTA: placeholders intact, UTM applied.
   * @param {object} template
   * @param {object} opts  { subject?, utm? } — campaign-level overrides
   */
  buildSendPayload(template, { subject, utm } = {}) {
    const html = template.append_utm === false
      ? (template.body_html || '')
      : withUtm(template.body_html || '', utm || {});
    return {
      subject: subject || template.subject || '',
      html,
      text: template.body_text || '',
    };
  },

  /**
   * Fully-rendered preview for the studio. `data` is whatever sample values the
   * caller supplies; missing keys render empty and are reported back so the UI
   * can show what an audience will have to provide.
   */
  async preview(documentId, { data = {}, utm } = {}) {
    const template = await strapi.documents(UID).findOne({ documentId });
    if (!template) {
      const e = new Error('Template not found.');
      e.status = 404;
      throw e;
    }

    const keys = extractMergeKeys(template.subject, template.body_html, template.body_text);
    const html = template.append_utm === false
      ? (template.body_html || '')
      : withUtm(template.body_html || '', utm || {});

    return {
      subject: renderWith(template.subject, data),
      html: renderWith(html, data),
      text: renderWith(template.body_text, data),
      mergeKeys: keys,
      missingKeys: missingKeys(keys, data),
    };
  },

  /**
   * Send one rendered copy to a real address, so an operator can see it in a
   * real client before committing an audience to it.
   *
   * Goes out via /v1/send, whose default class is `transactional` — it bypasses
   * marketing pacing (correct for a single operator-triggered message) and keeps
   * test sends out of the marketing reputation stats.
   */
  async sendTest(documentId, { to, data = {}, identityDocId } = {}) {
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
      const e = new Error('A valid recipient address is required.');
      e.status = 400;
      throw e;
    }

    const rendered = await this.preview(documentId, { data });

    const identityService = strapi.service(IDENTITY_UID);
    const identity = identityDocId
      ? await strapi.documents(IDENTITY_UID).findOne({ documentId: identityDocId })
      : await identityService.resolveDefault();

    if (!identity) {
      const e = new Error('No sending identity configured. Add one in Settings first.');
      e.status = 409;
      throw e;
    }

    const token = await identityService.tokenFor(identity);
    if (!token) {
      const e = new Error(`Sending identity "${identity.name}" is not registered with the MTA yet.`);
      e.status = 409;
      throw e;
    }

    await mta.sendOne(token, {
      to,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });

    return { ok: true, to, missingKeys: rendered.missingKeys };
  },

  /** Copy a template into a new Draft, so a working design can be branched. */
  async duplicate(documentId) {
    const src = await strapi.documents(UID).findOne({ documentId });
    if (!src) {
      const e = new Error('Template not found.');
      e.status = 404;
      throw e;
    }
    return strapi.documents(UID).create({
      data: {
        name: `${src.name} (copy)`,
        folder: src.folder,
        description: src.description,
        channel: src.channel,
        subject: src.subject,
        body_html: src.body_html,
        body_text: src.body_text,
        design_json: src.design_json,
        merge_keys: src.merge_keys,
        tracking_enabled: src.tracking_enabled,
        append_utm: src.append_utm,
        status: 'Draft',
      },
    });
  },
}));
