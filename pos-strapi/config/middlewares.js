module.exports = ({ env }) => {
  // CORS_ORIGINS is auto-computed by scripts/load-env.js from every
  // URL value found in the active .env.<ENVIRONMENT> file.
  const corsOrigins = env('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // MEDIA_BASE_URL (the standalone media-fileserver origin, see the
  // `upload` provider config in plugins.js) needs to be CSP-allowlisted for
  // img-src/media-src or the admin panel silently fails to render previews.
  const mediaOrigin = (() => {
    const raw = env('MEDIA_BASE_URL', '');
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  })();

  return [
    'strapi::logger',
    'strapi::errors',
    mediaOrigin
      ? {
          name: 'strapi::security',
          config: {
            contentSecurityPolicy: {
              useDefaults: true,
              directives: {
                'img-src': ["'self'", 'data:', 'blob:', mediaOrigin],
                'media-src': ["'self'", 'data:', 'blob:', mediaOrigin],
              },
            },
          },
        }
      : 'strapi::security',
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
        // The upload plugin's `sizeLimit` is NOT the ceiling an upload actually
        // hits. This middleware parses the multipart body first, and formidable
        // defaults to 200 MB — anything larger is rejected here with 413
        // "FileTooBig" before the upload plugin ever sees the file. Left unset,
        // raising UPLOAD_MAX_FILE_SIZE silently does nothing. Keep this on the
        // same env var as plugins.js so one knob moves the real limit.
        formidable: {
          maxFileSize: env.int('UPLOAD_MAX_FILE_SIZE', 250 * 1024 * 1024),
        },
      },
    },
    'strapi::session',
    'strapi::favicon',
    'global::video-range',
    'strapi::public',
  ];
};
