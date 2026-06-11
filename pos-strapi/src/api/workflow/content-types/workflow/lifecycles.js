'use strict';

const engine = require('../../../../utils/workflow-engine');

// Workflow definitions are cached by the engine — drop the cache on any change
// so edits take effect immediately instead of after the TTL.
module.exports = {
  afterCreate() { engine.invalidate(); },
  afterUpdate() { engine.invalidate(); },
  afterDelete() { engine.invalidate(); },
};
