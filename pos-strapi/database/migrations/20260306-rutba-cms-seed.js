"use strict";

/**
 * Simple Strapi bootstrap-style script to seed CMS pages, footer, and
 * improve product descriptions for rutba.pk based on existing products.
 *
 * NOTE: This is not executed automatically by Strapi; you should wire it
 * into your bootstrap or run it manually via a custom script. Keep it
 * idempotent so it can safely run multiple times.
 */

module.exports = {
  /**
   * Run the seed/migration.
   * @param {object} params
   * @param {object} params.strapi - Strapi instance (passed from bootstrap)
   */
  async up({ strapi }) {
    // Create/update a default footer
    const footerSlug = "rutba-default";

    const existingFooter = await strapi.db
      .query("api::cms-footer.cms-footer")
      .findOne({ where: { slug: footerSlug } });

    const footerData = {
      name: "Rutba Default Footer",
      slug: footerSlug,
      phone: "+92 300 0000000",
      email: "info@rutba.pk",
      address:
        "Rutba.pk, Lahore, Pakistan. Reliable everyday essentials delivered at your doorstep.",
      opening_hours: {
        mon_fri: "10:00 AM – 8:00 PM",
        sat: "10:00 AM – 10:00 PM",
        sun: "Closed (online orders only)",
      },
      social_links: {
        facebook: "https://facebook.com/rutba.pk",
        instagram: "https://instagram.com/rutba.pk",
        whatsapp: "https://wa.me/923000000000",
      },
      copyright_text: "© " + new Date().getFullYear() + " Rutba.pk. All rights reserved.",
    };

    const footer = existingFooter
      ? await strapi.db
          .query("api::cms-footer.cms-footer")
          .update({ where: { id: existingFooter.id }, data: footerData })
      : await strapi.db
          .query("api::cms-footer.cms-footer")
          .create({ data: footerData });

    // Helper to upsert a CMS page by slug
    async function upsertPage(slug, data) {
      const existing = await strapi.db
        .query("api::cms-page.cms-page")
        .findOne({ where: { slug } });

      const baseData = {
        page_type: "page",
        sort_order: 0,
        footer: footer?.id ? footer.id : null,
        ...data,
      };

      if (existing) {
        return strapi.db
          .query("api::cms-page.cms-page")
          .update({ where: { id: existing.id }, data: baseData });
      }
      return strapi.db
        .query("api::cms-page.cms-page")
        .create({ data: baseData });
    }

    // Seed key marketing/pages for rutba.pk
    await upsertPage("index", {
      title: "Premium Everyday Essentials – Rutba.pk",
      excerpt:
        "Shop curated everyday essentials at Rutba.pk. Authentic brands, transparent pricing, and fast delivery across Pakistan.",
      content:
        "<h2>Welcome to Rutba.pk</h2>" +
        "<p>Rutba.pk is your trusted online destination for premium everyday essentials. " +
        "We carefully curate products across multiple categories so you can shop with confidence, knowing you are getting authentic items at fair prices.</p>" +
        "<h3>Why shop with Rutba.pk?</h3>" +
        "<ul>" +
        "<li>Original, authenticated products only</li>" +
        "<li>Clear and competitive pricing</li>" +
        "<li>Friendly support before and after purchase</li>" +
        "<li>Fast nationwide delivery</li>" +
        "</ul>" +
        "<p>Browse our featured collections and discover products selected for quality, consistency and real everyday value.</p>",
      sort_order: 1,
    });

    await upsertPage("about", {
      title: "About Rutba.pk",
      excerpt:
        "Learn how Rutba.pk helps customers across Pakistan access reliable, authentic products at the right price.",
      content:
        "<h2>Our Story</h2>" +
        "<p>Rutba.pk was created with a simple promise: to make quality products easier to discover and buy online. " +
        "We work directly with trusted distributors and suppliers to reduce uncertainty for customers and ensure a consistent experience.</p>" +
        "<h3>What we believe in</h3>" +
        "<ul>" +
        "<li>Transparency in pricing and product information</li>" +
        "<li>Honest descriptions backed by real product knowledge</li>" +
        "<li>Long-term relationships with customers and partners</li>" +
        "</ul>" +
        "<p>Behind Rutba.pk is a team focused on operations, technology and customer care. " +
        "We continue to refine our catalog and experience based on real feedback from buyers like you.</p>",
      sort_order: 2,
    });

    await upsertPage("contact", {
      title: "Contact Rutba.pk",
      excerpt:
        "Have a question about your order or a product listed on Rutba.pk? Reach out to our support team.",
      content:
        "<h2>We are here to help</h2>" +
        "<p>You can reach our customer care team through phone, email or WhatsApp. " +
        "Share your order number or product link for faster support.</p>" +
        "<h3>Contact channels</h3>" +
        "<ul>" +
        "<li>Phone: +92 300 0000000 (10:00 AM – 8:00 PM)</li>" +
        "<li>Email: support@rutba.pk</li>" +
        "<li>WhatsApp: +92 300 0000000</li>" +
        "</ul>" +
        "<p>You can also use the contact form on this page to send us a message at any time.</p>",
      sort_order: 3,
    });

    await upsertPage("faq", {
      title: "Frequently Asked Questions – Rutba.pk",
      excerpt:
        "Answers to common questions about ordering, shipping, returns and product authenticity at Rutba.pk.",
      content:
        "<h2>Frequently Asked Questions</h2>" +
        "<h3>Are all products original?</h3>" +
        "<p>Yes. We work with trusted suppliers and do not list counterfeit items. " +
        "Each product goes through checks before being added to our catalog.</p>" +
        "<h3>How long does delivery take?</h3>" +
        "<p>Delivery time depends on your city, but most orders arrive within 2–5 working days.</p>" +
        "<h3>What is your return policy?</h3>" +
        "<p>If you receive a defective or wrong item, please contact us within 3 days of delivery. " +
        "Our team will guide you through the replacement or refund process.</p>",
      sort_order: 4,
    });

    await upsertPage("privacy-policy", {
      title: "Privacy Policy – Rutba.pk",
      excerpt: "Read about how we collect, use, and protect your personal information.",
      content:
        "<h2>Privacy Policy</h2>" +
        "<p>At Rutba.pk, your privacy is important to us. This Privacy Policy outlines how we collect, use, and protect your personal information.</p>" +
        "<h3>Information We Collect</h3>" +
        "<p>We collect information you provide directly to us, such as your name, email address, phone number, shipping address, and payment information when you make a purchase.</p>" +
        "<h3>How We Use Your Information</h3>" +
        "<ul>" +
        "<li>To process and fulfill your orders</li>" +
        "<li>To communicate with you about your orders and promotional offers</li>" +
        "<li>To improve our website and services</li>" +
        "</ul>" +
        "<h3>Data Protection</h3>" +
        "<p>We implement security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>",
      sort_order: 5,
    });

    await upsertPage("terms-and-conditions", {
      title: "Terms & Conditions – Rutba.pk",
      excerpt: "Terms and conditions for using the Rutba.pk website and purchasing products.",
      content:
        "<h2>Terms & Conditions</h2>" +
        "<p>Welcome to Rutba.pk. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions.</p>" +
        "<h3>Use of the Website</h3>" +
        "<p>You agree to use this website only for lawful purposes and in a way that does not infringe the rights of, restrict, or inhibit anyone else's use and enjoyment of the website.</p>" +
        "<h3>Product Authenticity</h3>" +
        "<p>We guarantee that all products sold on our platform are 100% authentic and sourced from authorized distributors or manufacturers.</p>" +
        "<h3>Returns and Refunds</h3>" +
        "<p>Please refer to our Return Policy for information regarding product returns and refunds.</p>",
      sort_order: 6,
    });

    // Improve product descriptions in-place, based on current data.
    // This does not change prices or stock; it only updates summary/description fields
    // when they are empty or too short.
    const products = await strapi.db
      .query("api::product.product")
      .findMany({ where: { }, limit: 2000 });

    for (const product of products) {
      const name = product.name || "Product";

      const baseSummary = product.summary || "";
      const baseDescription = product.description || "";

      const shouldUpdateSummary = !baseSummary || baseSummary.length < 40;
      const shouldUpdateDescription = !baseDescription || baseDescription.length < 80;

      if (!shouldUpdateSummary && !shouldUpdateDescription) {
        continue;
      }

      const categoryNames = [];
      if (Array.isArray(product.categories)) {
        for (const c of product.categories) {
          if (c && c.name) categoryNames.push(c.name);
        }
      }

      const categoryPart =
        categoryNames.length > 0
          ? ` in the ${categoryNames.join(", ")} category`
          : "";

      const improvedSummary =
        baseSummary && !shouldUpdateSummary
          ? baseSummary
          : `${name} is a carefully selected item${categoryPart} available on Rutba.pk, chosen for everyday reliability and value.`;

      const improvedDescription =
        baseDescription && !shouldUpdateDescription
          ? baseDescription
          :
            `<p>${name} is part of our curated selection at Rutba.pk${categoryPart}. ` +
            `We focus on products that offer dependable quality, consistent performance and good value for money.</p>` +
            `<p>Every item is sourced from trusted partners and checked before it is made available online. ` +
            `Details such as packaging, batch and expiry may vary by lot, but the functional performance of the product remains aligned with manufacturer standards.</p>` +
            `<p>For questions about suitability, usage or availability, please contact our support team and share this product link or SKU (${product.sku ||
              "N/A"}).</p>`;

      await strapi.db
        .query("api::product.product")
        .update({
          where: { id: product.id },
          data: {
            summary: improvedSummary,
            description: improvedDescription,
          },
        });
    }
  },

  // Optional down method to revert changes (kept minimal on purpose)
  async down() {
    // Intentionally left blank; consider writing manual cleanup if needed.
  },
};
