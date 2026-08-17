/**
 * CMS Pages Seed Script
 *
 * Creates sample pages for all four page types: shop, blog, news, info
 * Skips any page whose slug already exists (idempotent).
 *
 * Usage:
 *   node scripts/seed-cms-pages.js <strapi-jwt-token>
 *
 * Example:
 *   node scripts/seed-cms-pages.js eyJhbGci...
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4010/api/";
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error("Usage: node scripts/seed-cms-pages.js <strapi-jwt-token>");
  process.exit(1);
}

const PAGES = [
  // ── SHOP ──────────────────────────────────────────────────────────────────
  {
    title: "Summer Collection 2025",
    slug: "summer-collection-2025",
    page_type: "shop",
    sort_order: 10,
    excerpt:
      "Discover our hand-picked summer collection featuring lightweight fabrics, bold colours and everyday comfort. New arrivals every week.",
    content: `## Welcome to Summer 2025

Our summer collection brings together the best in lightweight, breathable fabrics designed for Pakistan's warm climate.

### What's New

- **Linen Essentials** — crisp, cool and versatile
- **Cotton Basics** — timeless whites, navies and earth tones
- **Active Wear** — moisture-wicking performance fabrics

### Shop by Category

Browse our curated selection and find exactly what you need for the season ahead.

> Free delivery on orders above Rs 2,000. Returns accepted within 14 days.
`,
  },
  {
    title: "Home & Living",
    slug: "home-and-living",
    page_type: "shop",
    sort_order: 20,
    excerpt:
      "Upgrade your living space with our curated home essentials — from kitchen must-haves to bedroom comfort.",
    content: `## Transform Your Home

At Rutba.pk we believe your home should reflect your style without breaking the bank.

### Featured Ranges

#### Kitchen & Dining
Quality cookware, storage solutions and table accessories that make every meal special.

#### Bedroom Comfort
Premium bedding, pillows and soft furnishings for a restful night's sleep.

#### Bathroom Essentials
Towels, organisers and accessories that bring spa-like calm to your daily routine.

*All home products come with a 30-day satisfaction guarantee.*
`,
  },

  // ── BLOG ──────────────────────────────────────────────────────────────────
  {
    title: "5 Ways to Style a White Kurta This Season",
    slug: "5-ways-to-style-white-kurta",
    page_type: "blog",
    sort_order: 10,
    excerpt:
      "A white kurta is the most versatile piece in any wardrobe. Here are five fresh ways to wear it this season.",
    content: `A well-fitted white kurta is the unsung hero of Pakistani fashion. It pairs with almost anything and works across every occasion — from casual Friday meetups to formal family dinners.

## 1. Pair with Straight-Cut Trousers

Keep it clean and minimal. Dark navy or charcoal trousers balance the brightness of a white kurta perfectly. Add simple leather sandals and you're done.

## 2. Layer with a Waistcoat

A textured or embroidered waistcoat instantly elevates a plain white kurta for semi-formal events. Choose a contrasting colour like deep maroon or forest green for maximum impact.

## 3. Go Casual with Jeans

Straight or slim-fit jeans work surprisingly well under a slightly longer white kurta. Roll the cuffs slightly and wear with clean white sneakers for a modern, relaxed look.

## 4. Add a Printed Dupatta

For a more traditional flair, drape a block-printed or embroidered dupatta over the shoulder. This look works well for Eid gatherings and weddings.

## 5. Go Monochrome

White on white. Pair with white shalwar or palazzo pants and minimal jewellery for an effortlessly chic ensemble that photographs beautifully.

---

*Which style is your favourite? Let us know in the comments or tag us on Instagram.*
`,
  },
  {
    title: "The Ultimate Guide to Caring for Cotton Clothes",
    slug: "guide-to-caring-for-cotton-clothes",
    page_type: "blog",
    sort_order: 20,
    excerpt:
      "Cotton is comfortable, breathable and affordable — but it needs the right care to last. Here's everything you need to know.",
    content: `Cotton is the backbone of everyday Pakistani wardrobes — and for good reason. It's breathable, soft and widely available. But without proper care, cotton garments shrink, fade and lose their shape faster than they should.

## Washing Cotton Correctly

**Water Temperature**
Always wash cotton in cold or warm water (30–40°C). Hot water causes fibres to shrink and colours to bleed.

**Detergent Choice**
Use a mild, colour-safe detergent. Avoid bleach on coloured cottons — it weakens fibres and causes irreversible fading.

**Wash Cycle**
A gentle or normal cycle works well. Avoid the high-spin setting for delicate or embroidered pieces.

## Drying Tips

- **Avoid direct sunlight** for coloured garments — it fades dyes quickly.
- **White cotton** can be dried in the sun to naturally brighten the fabric.
- Reshape garments while damp and hang on wide hangers to prevent stretching.

## Ironing

Iron cotton while slightly damp on a medium-high setting. This removes creases most effectively and protects the fabric from scorch marks.

## Storage

Fold (don't hang) heavy cotton kurtas to prevent shoulder dimples. Store in a cool, dry place with a cedar block to deter moths.

---

Follow these simple steps and your cotton favourites will look great for years to come.
`,
  },
  {
    title: "How We Source Our Products: Behind the Scenes at Rutba.pk",
    slug: "how-we-source-our-products",
    page_type: "blog",
    sort_order: 30,
    excerpt:
      "Ever wondered how products end up on Rutba.pk? We take you behind the scenes of our sourcing and quality verification process.",
    content: `At Rutba.pk, every product goes through a rigorous sourcing and quality check before it reaches you. Here's a transparent look at how we do it.

## Step 1: Identifying Trusted Suppliers

Our buying team researches suppliers through trade fairs, manufacturer referrals and community recommendations. We prioritise suppliers who have demonstrable quality controls and consistent production standards.

## Step 2: Sample Evaluation

Before listing any product, we order samples and evaluate them against a checklist covering:

- Material quality and finish
- Stitching consistency (for garments)
- Labelling accuracy
- Packaging suitability

## Step 3: Trial Orders

Small trial orders are placed and tracked through our warehouse before any product goes live. This lets us catch fulfilment issues early.

## Step 4: Customer Feedback Loop

Once a product is live, we monitor reviews and return rates closely. Anything with recurring quality complaints is reviewed with the supplier or delisted.

## Our Promise

We only list what we would confidently buy ourselves. That's the Rutba.pk standard.
`,
  },

  // ── NEWS ──────────────────────────────────────────────────────────────────
  {
    title: "Rutba.pk Now Offers Free Delivery Across All Major Cities",
    slug: "free-delivery-major-cities",
    page_type: "news",
    sort_order: 10,
    excerpt:
      "We are excited to announce free delivery on all orders above Rs 2,000 to Karachi, Lahore, Islamabad, Peshawar and Quetta.",
    content: `**Rutba.pk, April 2025** — We are thrilled to announce the expansion of our free delivery service to all major cities across Pakistan.

## What's Changing

Effective immediately, all orders above **Rs 2,000** qualify for free standard delivery to:

- Karachi
- Lahore
- Islamabad / Rawalpindi
- Peshawar
- Quetta
- Faisalabad
- Multan

Orders below Rs 2,000 continue to attract a flat delivery fee of Rs 150.

## Delivery Timelines

| City | Standard Delivery |
|---|---|
| Karachi | 1–2 business days |
| Lahore | 1–2 business days |
| Islamabad | 2–3 business days |
| Other cities | 3–5 business days |

## Same-Day Delivery (Karachi)

For customers in Karachi, same-day delivery is available on orders placed before 12:00 PM. A small additional fee applies.

We are committed to making quality products accessible to everyone, everywhere in Pakistan.
`,
  },
  {
    title: "Introducing Our New Returns Policy: 14 Days, No Questions Asked",
    slug: "new-returns-policy-14-days",
    page_type: "news",
    sort_order: 20,
    excerpt:
      "We have updated our returns policy to give you 14 days to change your mind — no questions asked, no hassle.",
    content: `**Rutba.pk, March 2025** — We have listened to your feedback and we are making returns easier than ever.

## The New Policy

From today, every purchase on Rutba.pk is covered by our **14-Day No-Questions-Asked Returns Policy**.

### What This Means for You

- You have **14 days** from the date of delivery to initiate a return.
- No reason required — if you're not happy, that's enough.
- **Full refund** issued within 3–5 business days of receiving the returned item.
- Free return pickup available in Karachi and Lahore.

### What's Not Covered

The following items are excluded from this policy:

- Personalised or custom-made items
- Perishable goods
- Items damaged through misuse

### How to Initiate a Return

1. Log in to your Rutba.pk account
2. Go to **My Orders**
3. Select the order and click **Request Return**
4. A courier will be arranged within 24 hours

We believe shopping should be risk-free. This policy reflects that commitment.
`,
  },
  {
    title: "Rutba.pk Partners with Two New Premium Brands",
    slug: "new-brand-partnerships-2025",
    page_type: "news",
    sort_order: 30,
    excerpt:
      "We are welcoming two exciting new brands to the Rutba.pk platform, bringing expanded choices in home textiles and personal care.",
    content: `**Rutba.pk, February 2025** — We are excited to announce new partnerships with two premium Pakistani brands that will expand our product offering significantly.

## Brand 1: Casa Linen Co.

Casa Linen Co. is a Lahore-based manufacturer of premium bed and bath textiles. Their products are made from 100% combed cotton, woven in their own facility to consistent quality standards.

**New on Rutba.pk from Casa Linen Co.:**
- Egyptian Cotton Bedsheets (3-piece sets)
- 600-GSM Bath Towels
- Bamboo-blend Hand Towels

## Brand 2: Pure & Co. Personal Care

Pure & Co. produces a range of natural, fragrance-free personal care products formulated for sensitive skin. Their entire lineup is dermatologist-tested and free from harsh chemicals.

**New on Rutba.pk from Pure & Co.:**
- Natural Body Wash (unscented, rose, and eucalyptus)
- Shea Butter Moisturising Cream
- Gentle Exfoliating Scrub

## Availability

Both brands are now live on the platform. Look for the **New Arrival** badge on their product listings.

We continue to grow our catalogue with brands that meet our strict quality standards.
`,
  },

  // ── INFO ──────────────────────────────────────────────────────────────────
  {
    title: "Privacy Policy",
    slug: "privacy-policy",
    page_type: "info",
    sort_order: 10,
    excerpt:
      "How Rutba.pk collects, uses and protects your personal information.",
    content: `## Privacy Policy

*Last updated: April 2025*

Rutba.pk is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights regarding your data.

## Information We Collect

**Information you provide:**
- Name, email address and phone number when you create an account
- Delivery address when you place an order
- Payment details (processed securely via our payment provider — we never store card numbers)

**Information collected automatically:**
- Browser type and device information
- Pages visited and time spent on site
- IP address and approximate location

## How We Use Your Information

- To process and deliver your orders
- To send order confirmations and delivery updates
- To respond to your customer service enquiries
- To improve our website and services
- To send promotional emails (you can unsubscribe at any time)

## Data Sharing

We do not sell your personal data. We share it only with:
- Delivery partners (name and address only)
- Payment processors (payment details only)
- Analytics providers (anonymised data only)

## Your Rights

You have the right to:
- Access the personal data we hold about you
- Request correction of inaccurate data
- Request deletion of your data
- Opt out of marketing communications

To exercise any of these rights, email us at **privacy@rutba.pk**.

## Cookies

We use cookies to improve your browsing experience. You can disable cookies in your browser settings, though some features may not work correctly.

## Changes to This Policy

We may update this policy from time to time. We will notify you of significant changes by email or via a notice on our website.
`,
  },
  {
    title: "Terms & Conditions",
    slug: "terms-and-conditions",
    page_type: "info",
    sort_order: 20,
    excerpt:
      "The terms governing your use of Rutba.pk and any purchases you make.",
    content: `## Terms & Conditions

*Last updated: April 2025*

Please read these terms carefully before using Rutba.pk or placing an order.

## 1. Acceptance of Terms

By accessing or using Rutba.pk, you agree to be bound by these terms. If you do not agree, please do not use the site.

## 2. Eligibility

You must be at least 18 years old to create an account and place orders. By using the site, you confirm that you meet this requirement.

## 3. Orders and Payment

- Prices are listed in Pakistani Rupees (PKR) and include applicable taxes.
- An order is confirmed only after you receive an order confirmation email.
- We reserve the right to cancel orders in cases of pricing errors or stock unavailability. A full refund will be issued in such cases.

## 4. Delivery

- Delivery timelines are estimates and not guarantees.
- Risk of loss passes to you upon delivery to the address you specified.

## 5. Returns and Refunds

Returns are governed by our separate **Returns Policy**. Refunds are processed within 3–5 business days of receiving the returned item.

## 6. Intellectual Property

All content on Rutba.pk — including text, images and logos — is owned by or licensed to Rutba.pk. You may not reproduce or redistribute it without our written consent.

## 7. Limitation of Liability

To the maximum extent permitted by law, Rutba.pk is not liable for any indirect, incidental or consequential damages arising from your use of the site or any products purchased.

## 8. Governing Law

These terms are governed by the laws of Pakistan. Any disputes will be subject to the exclusive jurisdiction of the courts of Karachi.

## 9. Contact

For any questions regarding these terms, email us at **legal@rutba.pk**.
`,
  },
  {
    title: "About Us",
    slug: "about-us",
    page_type: "info",
    sort_order: 5,
    excerpt:
      "Learn about the story behind Rutba.pk and our mission to make quality everyday essentials accessible to everyone in Pakistan.",
    content: `## About Rutba.pk

Rutba.pk was founded with a simple belief: quality everyday essentials should be accessible to everyone in Pakistan, not just those who can afford premium import prices.

## Our Story

We started as a small team passionate about raising the standard of online shopping in Pakistan. Too often, customers received counterfeit products, misleading descriptions or items that looked nothing like the photos.

We decided to do something different.

Every product on Rutba.pk is sourced directly from verified manufacturers or authorised distributors. Every listing is reviewed by our team before going live. Every claim is backed by the product itself.

## What We Stand For

**Authenticity** — We only sell what we can verify is genuine.

**Transparency** — Clear pricing, honest descriptions and no hidden fees.

**Reliability** — Consistent quality, dependable delivery and responsive customer support.

**Accessibility** — Competitive prices so more people can access products they can trust.

## Our Team

We are a small, dedicated team based in Karachi with fulfilment operations serving customers nationwide. We are constantly growing — if you are passionate about e-commerce and quality, we would love to hear from you.

## Get in Touch

- **Email:** hello@rutba.pk
- **Phone:** +92 300 000 0000
- **Address:** Karachi, Pakistan

Follow us on social media for new arrivals, styling tips and behind-the-scenes updates.
`,
  },
  {
    title: "Contact Us",
    slug: "contact-us",
    page_type: "info",
    sort_order: 6,
    excerpt:
      "Have a question or need help? Reach out to the Rutba.pk team — we are always happy to assist.",
    content: `## Contact Us

We are here to help. Whether you have a question about an order, a product or anything else, our team is ready to assist.

## Customer Support

**Email:** support@rutba.pk
**Phone:** +92 300 000 0000
**Hours:** Monday – Saturday, 10:00 AM – 7:00 PM PKT

We aim to respond to all emails within 4 business hours.

## Order Enquiries

For questions about an existing order, please have your **order number** ready and contact us via:
- Email: support@rutba.pk
- WhatsApp: +92 300 000 0000

## Returns & Refunds

To initiate a return, log in to your account and go to **My Orders → Request Return**. For further assistance, email us at returns@rutba.pk.

## Business & Wholesale Enquiries

Interested in stocking Rutba.pk products or exploring a bulk purchase? Email us at **business@rutba.pk** with details about your requirements.

## Feedback

Your feedback helps us improve. We read every message and take all suggestions seriously.

---

*We look forward to hearing from you.*
`,
  },
];

async function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getExistingSlugs() {
  const res = await apiRequest(
    "GET",
    `${BASE_URL}cms-pages?pagination[pageSize]=100&fields[0]=slug&status=draft`
  );
  if (res.status !== 200) throw new Error(`Failed to fetch pages: ${res.status}`);
  return new Set((res.body.data || []).map((p) => p.slug));
}

async function createPage(page) {
  const res = await apiRequest("POST", `${BASE_URL}cms-pages`, { data: page });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `Failed to create "${page.slug}": ${JSON.stringify(res.body?.error || res.body)}`
    );
  }
  return res.body.data;
}

async function publishPage(documentId) {
  const res = await apiRequest(
    "POST",
    `${BASE_URL}cms-pages/${documentId}/publish`,
    {}
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to publish ${documentId}: ${res.status}`);
  }
}

async function main() {
  console.log(`\nSeeding ${PAGES.length} CMS pages to ${BASE_URL}\n`);

  let existingSlugs;
  try {
    existingSlugs = await getExistingSlugs();
    console.log(`Found ${existingSlugs.size} existing page(s) — skipping duplicates.\n`);
  } catch (err) {
    console.error("Could not fetch existing pages:", err.message);
    process.exit(1);
  }

  const results = { created: 0, skipped: 0, failed: 0 };

  for (const page of PAGES) {
    if (existingSlugs.has(page.slug)) {
      console.log(`  SKIP   [${page.page_type}] ${page.slug}`);
      results.skipped++;
      continue;
    }

    try {
      const created = await createPage(page);
      await publishPage(created.documentId);
      console.log(`  CREATE [${page.page_type}] ${page.slug}  →  id:${created.id}`);
      results.created++;
    } catch (err) {
      console.error(`  FAIL   [${page.page_type}] ${page.slug}  →  ${err.message}`);
      results.failed++;
    }
  }

  console.log(`\nDone. Created: ${results.created}  Skipped: ${results.skipped}  Failed: ${results.failed}\n`);
  if (results.failed > 0) process.exit(1);
}

main();
