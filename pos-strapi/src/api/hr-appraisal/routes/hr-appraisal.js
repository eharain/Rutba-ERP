'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::hr-appraisal.hr-appraisal');

// Custom routes must precede the core router so literal paths (/mine, /team)
// are not swallowed by the core /:documentId matcher.
const customRoutes = [
  { method: 'GET', path: '/hr-appraisals/mine', handler: 'api::hr-appraisal.hr-appraisal.myAppraisals' },
  { method: 'GET', path: '/hr-appraisals/team', handler: 'api::hr-appraisal.hr-appraisal.teamAppraisals' },
  { method: 'POST', path: '/hr-appraisals/:documentId/self-assessment', handler: 'api::hr-appraisal.hr-appraisal.submitSelfAssessment' },
  { method: 'POST', path: '/hr-appraisals/:documentId/manager-review', handler: 'api::hr-appraisal.hr-appraisal.submitManagerReview' },
];

module.exports = {
  get routes() {
    return [...customRoutes, ...defaultRouter.routes];
  },
};
