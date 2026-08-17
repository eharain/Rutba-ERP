import { operatorAction } from '../../../../lib/api-handler';
import engine from '../../../../lib/engine';

// POST /api/accounts/:id/taxonomy?kind=category|brand|category_attributes
// Pulls the marketplace's taxonomy so the operator can map ours onto it.
export default operatorAction((req) => engine.pullTaxonomy(
    req.query.id,
    req.query.kind || 'category',
    { offset: req.query.offset, limit: req.query.limit, categoryId: req.query.categoryId },
));
