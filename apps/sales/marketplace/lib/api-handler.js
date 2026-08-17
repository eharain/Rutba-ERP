'use strict';

const { requireOperator } = require('./operator-auth');

// Wrap an operator-only route for a given method. Verifies the caller holds a
// marketplace role (the engine then runs with the service token) and normalizes
// method + error handling so each route file is a one-liner.
function operatorRoute(method, fn) {
  return async (req, res) => {
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const op = await requireOperator(req, res);
    if (!op) return undefined; // requireOperator already responded
    try {
      const out = await fn(req, op);
      return res.status(200).json(out);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'Request failed' });
    }
  };
}

const operatorAction = (fn) => operatorRoute('POST', fn); // mutating triggers
const operatorGet = (fn) => operatorRoute('GET', fn);     // reads (spec, entity lists)

module.exports = { operatorRoute, operatorAction, operatorGet };
