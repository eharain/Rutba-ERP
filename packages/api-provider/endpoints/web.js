export const WebAuthEndpointsMeta = {
  uid: null,
  basePath: '/auth',
  methodActions: {
    localSignIn: 'create',
    localRegister: 'create',
    providerCallback: 'find',
  },
};

export const WebAuthEndpointRules = {
  localSignIn: {},
  localRegister: {},
  providerCallback: {},
};

export const WebCheckoutEndpointsMeta = {
  uid: 'api::sale-order.sale-order',
  basePath: '/orders/checkout',
  methodActions: {
    validateAddress: 'create',
    shippingRate: 'create',
  },
};

export const WebCheckoutEndpointRules = {
  validateAddress: {},
  shippingRate: {},
};

export const WebDeliveryEndpointsMeta = {
  uid: 'api::sale-order.sale-order',
  basePath: '/orders',
  methodActions: {
    calculateDelivery: 'create',
    tracking: 'findOne',
    getMessages: 'find',
    sendMessage: 'create',
  },
};

export const WebDeliveryEndpointRules = {
  calculateDelivery: {},
  tracking: {},
  getMessages: {},
  sendMessage: {},
};

export const WebLeadsEndpointsMeta = {
  uid: 'api::crm-lead.crm-lead',
  basePath: '/crm-leads',
  methodActions: {
    create: 'create',
  },
};

export const WebLeadsEndpointRules = {
  create: {},
};
