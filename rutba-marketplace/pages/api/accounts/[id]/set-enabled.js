import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/set-enabled  { is_active?, sync_orders_enabled?, sync_inventory_enabled? }
// Operator-facing enable toggles. Sync (manual + cron) is gated on these flags.
export default operatorAction((req) => engine.setAccountEnabled(req.query.id, req.body || {}));
