/**
 * order controller
 */

const { factories } = require("@strapi/strapi");
// const EasyPost = require("@easypost/api");
// const Stripe = require("stripe");
/*
const easyPost = new EasyPost(process.env.EASYPOST_API_KEY);
const stripe = new Stripe(process.env.STRIPE_API_KEY, {
    apiVersion: "2023-08-16",
});
*/
module.exports = factories.createCoreController(
    "api::order.order",
    ({ strapi }) => ({
        // async create(ctx) {
        //     const items = ctx.request.body.data.items;
        //     const shipping = ctx.request.body.data.shipping;
        //     const customer = ctx.request.body.data.customer;
        //     let userID = null;

        //     if (!items) return ctx.badRequest("items data is missing");
        //     if (!shipping) return ctx.badRequest("shipping data is missing");
        //     if (!customer) return ctx.badRequest("customer data is missing");

        //     if (ctx.state.user) {
        //         userID = ctx.state.user.id.toString();
        //     }

        //     const orderID = new Date().getTime().toString();
        //     const orderSecret = (
        //         Math.floor(Math.random() * 90000) + 10000
        //     ).toString();

        //     const payment = await stripe.checkout.sessions.create({
        //         success_url: `${process.env.FRONTEND_URL}/transaction/${orderID}?secret=${orderSecret}`,
        //         cancel_url: process.env.FRONTEND_URL,
        //         shipping_options: [
        //             {
        //                 shipping_rate_data: {
        //                     display_name: shipping.name,
        //                     type: "fixed_amount",
        //                     fixed_amount: {
        //                         amount: parseFloat((shipping.price * 100).toFixed(2)),
        //                         currency: "usd",
        //                     },
        //                 },
        //             },
        //         ],
        //         line_items: items.map(item => ({
        //             price_data: {
        //                 currency: "usd",
        //                 product_data: {
        //                     images: [item.image],
        //                     name: item.display_name,
        //                 },
        //                 unit_amount: parseFloat((item.price * 100).toFixed(2)),
        //             },
        //             quantity: item.qty,
        //         })),
        //         metadata: { order_id: orderID },
        //         payment_intent_data: {
        //             metadata: { order_id: orderID },
        //         },
        //         mode: "payment",
        //     });

        //     const subTotal = items
        //         .reduce((total, item) => total + (item?.price ?? 0) * item.qty, 0)
        //         .toFixed(2);

        //     await strapi.services["api::order.order"].create({
        //         data: {
        //             user_id: userID,
        //             order_id: orderID,
        //             payment_status: "UNPAID",
        //             shipping_status: "WAITING",
        //             order_secret: orderSecret,
        //             customer_contact: {
        //                 name: customer.name,
        //                 email: customer.email,
        //                 phone_number: customer.phone_number,
        //                 address: customer.street_address,
        //                 country: customer.country,
        //                 state: customer.state,
        //                 city: customer.city,
        //                 zip_code: customer.zip_code,
        //             },
        //             products: {
        //                 items: items.map(item => ({
        //                     product: item.id,
        //                     quantity: item.qty,
        //                     price: item.price,
        //                     total: (item.price * item.qty).toFixed(2),
        //                     variant: item.variant_name,
        //                     product_name: item.display_name,
        //                 })),
        //             },
        //             shipping_id: shipping.id,
        //             rate_id: shipping.id_rate,
        //             shipping_name: shipping.name,
        //             stripe_id: payment.id,
        //             stripe_url: payment.url,
        //             stripe_request: payment,
        //             subtotal: subTotal,
        //             shipping_price: shipping.price,
        //             total: parseFloat(shipping.price) + parseFloat(subTotal),
        //         },
        //     });

        //     return { url: payment.url };
        // },

        // async webhookStripe(ctx) {
        //     const event = ctx.request.body.data;

        //     let paymentStatus = "UNPAID";
        //     const listStatus = [
        //         "EXPIRED",
        //         "SUCCEEDED",
        //         "ON PROCESS",
        //         "CANCELED",
        //         "FAILED",
        //     ];

        //     switch (event.type) {
        //         case "checkout.session.expired":
        //             paymentStatus = "EXPIRED";
        //             break;
        //         case "charged.succeeded":
        //         case "payment_intent.succeeded":
        //             paymentStatus = "SUCCEEDED";
        //             break;
        //         case "payment_intent.payment_failed":
        //             paymentStatus = "FAILED";
        //             break;
        //         case "payment_intent.processing":
        //             paymentStatus = "ON PROCESS";
        //             break;
        //         case "payment_intent.canceled":
        //             paymentStatus = "CANCELED";
        //             break;
        //         default:
        //             paymentStatus = event.type;
        //     }

        //     if (!listStatus.includes(paymentStatus)) {
        //         return ctx.badRequest("status not handled");
        //     }

        //     let buyLabel = null;

        //     const orderData = await strapi.db.query("api::order.order").findOne({
        //         where: {
        //             order_id: event.data.object.metadata.order_id,
        //         },
        //     });

        //     if (
        //         paymentStatus === "SUCCEEDED" &&
        //         orderData.payment_status !== "SUCCEEDED" &&
        //         !orderData.tracking_code
        //     ) {
        //         buyLabel = await this.buyLabel(
        //             orderData.shipping_id,
        //             orderData.rate_id
        //         );
        //     }

        //     await strapi.db.query("api::order.order").update({
        //         where: {
        //             order_id: event.data.object.metadata.order_id,
        //         },
        //         data: {
        //             payment_status: paymentStatus,
        //             stripe_response_webhook: event,
        //             shipping_label: buyLabel,
        //             tracking_code: buyLabel?.tracking_code,
        //             tracking_url: buyLabel?.tracker?.public_url,
        //             label_image: buyLabel?.postage_label?.label_url,
        //         },
        //     });

        //     return true;
        // },

        // async buyLabel(id, rate_id) {
        //     return easyPost.Shipment.buy(id, rate_id);
        // },

        async validateAddress(ctx) {
            const data = ctx.request.body.data;

            const address = await easyPost.Address.create({
                verify: true,
                street1: data.street_address,
                city: data.city,
                state: data.state,
                zip: data.zip_code,
                country: data.country,
                phone: data.phone_number,
            });

            return {
                isVerified: address.verifications?.delivery?.success ?? false,
                data: address.verifications,
            };
        },
    })
);
