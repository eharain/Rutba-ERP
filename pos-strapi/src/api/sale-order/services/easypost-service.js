'use strict';

/**
 * EasyPost Service
 * Wraps the EasyPost API for address validation, rate fetching, and label purchase.
 */

let _easypost = null;

function getClient() {
    if (!_easypost) {
        const EasyPost = require('@easypost/api');
        _easypost = new EasyPost(process.env.EASYPOST_API_KEY);
    }
    return _easypost;
}

module.exports = {
    /**
     * Validate a shipping address.
     * @param {{ street1, city, state, zip, country, phone }} address
     */
    async validateAddress(address) {
        const client = getClient();
        const result = await client.Address.create({
            verify: true,
            street1: address.street_address || address.address,
            city:    address.city,
            state:   address.state,
            zip:     address.zip_code,
            country: address.country,
            phone:   address.phone_number,
        });
        return {
            isVerified: result.verifications?.delivery?.success ?? false,
            data: result.verifications,
        };
    },

    /**
     * Get shipping rates from EasyPost.
     * @param {object} toAddress
     * @param {object} fromAddress
     * @param {object} parcel  - { weight, length, width, height }
     * @returns {Promise<{ shipmentId, rates }>}
     */
    async getRates(toAddress, fromAddress, parcel) {
        const client = getClient();

        const shipment = await client.Shipment.create({
            to_address: {
                street1: toAddress.address,
                city:    toAddress.city,
                state:   toAddress.state,
                zip:     toAddress.zip_code,
                country: toAddress.country,
                name:    toAddress.name,
                phone:   toAddress.phone_number,
            },
            from_address: {
                street1: fromAddress.address,
                city:    fromAddress.city,
                state:   fromAddress.state,
                zip:     fromAddress.zip_code,
                country: fromAddress.country || 'PK',
                name:    fromAddress.name || 'Rutba Store',
            },
            parcel: {
                weight: parcel.weight || 1,
                length: parcel.length || 10,
                width:  parcel.width  || 10,
                height: parcel.height || 5,
            },
        });

        return {
            shipmentId: shipment.id,
            rates: shipment.rates || [],
        };
    },

    /**
     * Purchase a shipping label.
     * @param {string} shipmentId
     * @param {string} rateId
     */
    async buyLabel(shipmentId, rateId) {
        const client = getClient();
        const bought = await client.Shipment.buy(shipmentId, rateId);
        return {
            trackingCode: bought.tracking_code,
            trackingUrl:  bought.tracker?.public_url,
            labelUrl:     bought.postage_label?.label_url,
            raw:          bought,
        };
    },
};
