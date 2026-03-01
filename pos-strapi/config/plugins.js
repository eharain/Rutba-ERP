function toSeconds(value, fallback) {
    const v = String(value ?? fallback).trim().toLowerCase();
    const match = v.match(/^(\d+)([smhd]?)$/);

    if (!match) return fallback;

    const amount = Number(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
        case 'm': return amount * 60;
        case 'h': return amount * 60 * 60;
        case 'd': return amount * 24 * 60 * 60;
        default: return amount;
    }
}

module.exports = ({ env }) => ({
    'users-permissions': {
        config: {
            register: {
                allowedFields: ['displayName',"isStaff"], // add your custom fields here
            },
            jwtManagement: 'refresh',
            sessions: {
                accessTokenLifespan: toSeconds(env('UP_ACCESS_TOKEN_LIFESPAN', '120m'), 7200),
                maxRefreshTokenLifespan: toSeconds(env('UP_MAX_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
                idleRefreshTokenLifespan: toSeconds(env('UP_IDLE_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
            },
        },
    },
});