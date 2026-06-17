module.exports = ({ env }) => {
  // CORS_ORIGINS is auto-computed by scripts/load-env.js from every
  // URL value found in the active .env.<ENVIRONMENT> file.
  const corsOrigins = env('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return [
    'strapi::logger',
    'strapi::errors',
    'strapi::security',
    {
      name: 'strapi::cors',
      config: {
        origin: corsOrigins,
        headers: [
          'Content-Type',
          'Authorization',
          'X-Rutba-App',
          'X-Rutba-App-Role',
          'X-Rutba-App-Admin',
          'Origin',
          'Accept',
        ],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        keepHeaderOnError: true,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    {
      name: 'strapi::body',
      config: {
        // Expose the raw request body (ctx.request.body[Symbol.for('unparsedBody')])
        // so inbound webhook HMAC signatures (e.g. Meta's X-Hub-Signature-256)
        // can be verified against the exact bytes sent, not a re-serialization.
        includeUnparsed: true,
      },
    },
    'strapi::session',
    'strapi::favicon',
    'global::video-range',
    'strapi::public',
  ];
};
