module.exports = ({ env }) => ({
  auth: {
        secret: env('ADMIN_JWT_SECRET'),
        sessions: {
            maxRefreshTokenLifespan: 2592000, // Maximum refresh token lifespan in seconds (e.g., 30 days)
            maxSessionLifespan: 2592000,       // Maximum session duration in seconds (e.g., 30 days)
        },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});
