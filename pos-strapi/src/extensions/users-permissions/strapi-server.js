const meRoute = require('./routes/me');
const meController = require('./controllers/me');
//const userSchema = require('./content-types/user/schema');

const isEdiding = false;

const meSchema = require('./content-types/me/schema.json');

//const providers = require('./services/providers')
//const email = require('./services/email')
//const payment = require('./services/payment')

if (!isEdiding) {
    module.exports = (plugin) => {
       // console.info('plugins', strapi.internal_config)

        const capi = plugin.routes['content-api'];

        plugin.routes['content-api'] = (...args) => {

            const resp = typeof capi === 'function' ? capi(...args) : capi;
            resp.routes.push(...meRoute);
            return resp;

        }
        plugin.contentTypes.user.schema.attributes.isStaff = {
            "type": "boolean"
        };

        console.log('Adding custom user permissions routes');
        //meRoute.forEach(route => capi.routes.push(route));
        //   Object.assign(, userSchema);
        plugin.contentTypes.me = { schema: meSchema }
        // Object.assign(plugin.controllers.user, meController);
        plugin.controllers.me = meController

        return plugin;
    }

} else {
    module.exports = (plugin) => {
        //console.log('Editing user permissions plugin');
        //plugin.contentTypes.me = { schema: meSchema }
        //plugin.controllers.me = meController
        return plugin;
    };
}