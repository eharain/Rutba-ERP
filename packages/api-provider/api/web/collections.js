export const WebCollectionsEndpoints = {
  list: () => ({
    path: 'collections',
    method: 'get',
    params: {
      pagination: { limit: -1 },
      populate: ['image'],
    },
  }),
};
