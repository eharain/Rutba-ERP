'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { slugify, formatName, findByName, findByOrderId } = require('../services/process-helpers');

module.exports = createCoreController('api::stock-input.stock-input', ({ strapi }) => ({

  /**
   * POST /stock-inputs/bulk
   * Create multiple stock-input records at once.
   * Body: { rows: [ { productName, quantity, ... }, ... ] }
   */
  async bulk(ctx) {
    const { rows } = ctx.request.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return ctx.badRequest('rows array is required');
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.productName || !row.quantity || row.quantity < 1) {
        errors.push({ index: i, message: 'productName and quantity > 0 are required' });
        continue;
      }
      try {
        const entry = await strapi.documents('api::stock-input.stock-input').create({
          data: {
            productName: row.productName,
            quantity: Number(row.quantity) || 0,
            sellableUnits: Number(row.sellableUnits) || 1,
            costPrice: row.costPrice != null ? Number(row.costPrice) : null,
            sellingPrice: row.sellingPrice != null ? Number(row.sellingPrice) : null,
            offerPrice: row.offerPrice != null ? Number(row.offerPrice) : null,
            supplierName: row.supplierName || null,
            brandName: row.brandName || null,
            categoryName: row.categoryName || null,
            orderId: row.orderId || null,
            supplierCode: row.supplierCode || null,
            importName: row.importName || 'bulk-ui',
            keywords: row.keywords || [],
            process: true,
            processed: false,
          },
        });
        created.push(entry);
      } catch (err) {
        errors.push({ index: i, message: err.message });
      }
    }

    return ctx.send({ created: created.length, errors, data: created });
  },

  /**
   * POST /stock-inputs/process
   * Process unprocessed stock-input records.
   * Body (optional): { documentIds: [...] } — limit to specific records.
   * If omitted, processes all records where process=true & processed=false.
   */
  async process(ctx) {
    const { documentIds } = ctx.request.body || {};

    // Build filters
    const filters = { process: true, processed: false };
    if (Array.isArray(documentIds) && documentIds.length > 0) {
      filters.documentId = { $in: documentIds };
    }

    // Fetch unprocessed stock-inputs
    const inputs = await strapi.documents('api::stock-input.stock-input').findMany({
      filters,
      limit: 500,
    });

    if (!inputs || inputs.length === 0) {
      return ctx.send({ processed: 0, message: 'No unprocessed stock inputs found' });
    }

    // Load reference data caches
    const [brands, categories, suppliers, products, purchases] = await Promise.all([
      strapi.documents('api::brand.brand').findMany({ limit: -1 }),
      strapi.documents('api::category.category').findMany({ limit: -1 }),
      strapi.documents('api::supplier.supplier').findMany({ limit: -1 }),
      strapi.documents('api::product.product').findMany({ limit: -1, populate: { brands: true, categories: true, suppliers: true } }),
      strapi.documents('api::purchase.purchase').findMany({ limit: -1, populate: { suppliers: true } }),
    ]);

    const cache = { brands: [...brands], categories: [...categories], suppliers: [...suppliers], products: [...products], purchases: [...purchases] };

    const results = [];

    for (const si of inputs) {
      try {
        // 1. Ensure brand
        let brandObj = null;
        if (si.brandName) {
          brandObj = findByName(cache.brands, si.brandName);
          if (!brandObj) {
            brandObj = await strapi.documents('api::brand.brand').create({
              data: { name: formatName(si.brandName), slug: slugify(si.brandName), keywords: [si.brandName] },
              status: 'published',
            });
            cache.brands.push(brandObj);
          }
        }

        // 2. Ensure category
        let catObj = null;
        if (si.categoryName) {
          catObj = findByName(cache.categories, si.categoryName);
          if (!catObj) {
            catObj = await strapi.documents('api::category.category').create({
              data: { name: formatName(si.categoryName), slug: slugify(si.categoryName), keywords: [si.categoryName] },
              status: 'published',
            });
            cache.categories.push(catObj);
          }
        }

        // 3. Ensure supplier
        let supObj = null;
        if (si.supplierName) {
          supObj = findByName(cache.suppliers, si.supplierName);
          if (!supObj) {
            supObj = await strapi.documents('api::supplier.supplier').create({
              data: { name: formatName(si.supplierName), keywords: [si.supplierName] },
              status: 'published',
            });
            cache.suppliers.push(supObj);
          }
        }

        // 4. Ensure product
        let productObj = findByName(cache.products, si.productName);
        const connects = {};
        if (brandObj) connects.brands = { connect: [brandObj.documentId] };
        if (catObj) connects.categories = { connect: [catObj.documentId] };
        if (supObj) connects.suppliers = { connect: [supObj.documentId] };

        if (!productObj) {
          productObj = await strapi.documents('api::product.product').create({
            data: {
              name: formatName(si.productName),
              keywords: [si.productName],
              cost_price: si.costPrice || undefined,
              offer_price: si.offerPrice || undefined,
              selling_price: si.sellingPrice || undefined,
              stock_quantity: si.quantity || 0,
              is_active: true,
              ...connects,
            },
            status: 'published',
          });
          cache.products.push(productObj);
        } else {
          // Connect relations if new
          if (Object.keys(connects).length > 0) {
            await strapi.documents('api::product.product').update({
              documentId: productObj.documentId,
              data: connects,
            });
          }
        }

        // 5. Ensure purchase order
        let poObj = null;
        if (si.orderId) {
          poObj = findByOrderId(cache.purchases, si.orderId);
          if (!poObj) {
            const poConnects = {};
            if (supObj) poConnects.suppliers = { connect: [supObj.documentId] };
            poObj = await strapi.documents('api::purchase.purchase').create({
              data: {
                orderId: si.orderId,
                order_date: new Date().toISOString(),
                order_recieved_date: new Date().toISOString(),
                status: 'Received',
                approval_status: 'Approved',
                ...poConnects,
              },
            });
            cache.purchases.push(poObj);
          }
        }

        // 6. Create purchase item
        let poItemObj = null;
        if (poObj && productObj) {
          poItemObj = await strapi.documents('api::purchase-item.purchase-item').create({
            data: {
              quantity: si.quantity,
              received_quantity: si.quantity,
              price: si.costPrice || si.sellingPrice || 0,
              unit_price: si.costPrice || si.sellingPrice || 0,
              total: (si.costPrice || si.sellingPrice || 0) * (si.quantity || 0),
              status: 'Received',
              purchase: { connect: [poObj.documentId] },
              product: { connect: [productObj.documentId] },
            },
          });
        }

        // 7. Create stock items
        const seed = ((poItemObj?.id ?? si.id) || Date.now()).toString(36);
        const quantity = si.quantity || 0;
        const sellableUnits = si.sellableUnits || 1;
        const stockItemIds = [];

        for (let i = 0; i < quantity; i++) {
          const barcode = seed + (i + 1).toString(36).padStart(3, '0');
          const siConnects = {};
          if (poItemObj) siConnects.purchase_item = { connect: [poItemObj.documentId] };
          if (productObj) siConnects.product = { connect: [productObj.documentId] };

          const stockItem = await strapi.documents('api::stock-item.stock-item').create({
            data: {
              name: productObj.name,
              status: 'InStock',
              cost_price: si.costPrice || si.sellingPrice || 0,
              selling_price: si.sellingPrice || 0,
              offer_price: si.offerPrice || undefined,
              sellable_units: sellableUnits,
              barcode,
              ...siConnects,
            },
          });
          stockItemIds.push(stockItem.documentId);
        }

        // 8. Mark stock-input as processed and link relations
        const updateConnects = {};
        if (productObj) updateConnects.product = { connect: [productObj.documentId] };
        if (supObj) updateConnects.supplier = { connect: [supObj.documentId] };
        if (brandObj) updateConnects.brand = { connect: [brandObj.documentId] };
        if (catObj) updateConnects.category = { connect: [catObj.documentId] };
        if (poObj) updateConnects.purchase = { connect: [poObj.documentId] };
        if (poItemObj) updateConnects.purchaseItem = { connect: [poItemObj.documentId] };
        if (stockItemIds.length > 0) updateConnects.stockItems = { connect: stockItemIds };

        await strapi.documents('api::stock-input.stock-input').update({
          documentId: si.documentId,
          data: {
            processed: true,
            processedOk: true,
            processedAt: new Date().toISOString(),
            ...updateConnects,
          },
        });

        results.push({ documentId: si.documentId, productName: si.productName, ok: true, stockItems: stockItemIds.length });

      } catch (err) {
        // Mark as processed with error
        await strapi.documents('api::stock-input.stock-input').update({
          documentId: si.documentId,
          data: {
            processed: true,
            processedOk: false,
            processedAt: new Date().toISOString(),
            lastError: err.message,
          },
        }).catch(() => {});

        results.push({ documentId: si.documentId, productName: si.productName, ok: false, error: err.message });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;

    return ctx.send({ processed: results.length, ok: okCount, failed: failCount, results });
  },
}));
