const Stripe = require("stripe");

function stripeMode() {
  const mode = String(process.env.STRIPE_MODE || "live").toLowerCase();
  return mode === "test" ? "test" : "live";
}

function stripeKey() {
  const mode = stripeMode();
  if (mode === "test") {
    return process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  }
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY;
}

function isConfigured() {
  return Boolean(stripeKey());
}

function client() {
  const key = stripeKey();
  if (!key) {
    const err = new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (live) or STRIPE_TEST_SECRET_KEY (test)."
    );
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  if (!key.startsWith("sk_")) {
    const err = new Error("Stripe secret key is malformed. Expected a key starting with sk_live_ or sk_test_.");
    err.code = "STRIPE_BAD_KEY";
    throw err;
  }
  const mode = stripeMode();
  if (mode === "live" && key.startsWith("sk_test_")) {
    const err = new Error("STRIPE_MODE=live but the configured secret key is a test key.");
    err.code = "STRIPE_MODE_MISMATCH";
    throw err;
  }
  if (mode === "test" && key.startsWith("sk_live_")) {
    const err = new Error("STRIPE_MODE=test but the configured secret key is a live key.");
    err.code = "STRIPE_MODE_MISMATCH";
    throw err;
  }
  return new Stripe(key);
}

function dollars(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

async function getAccount() {
  const stripe = client();
  const [account, balance] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.balance.retrieve()
  ]);
  return {
    id: account.id,
    email: account.email || null,
    country: account.country,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    livemode: Boolean(balance.livemode),
    mode: stripeMode(),
    balance: {
      available: balance.available,
      pending: balance.pending
    }
  };
}

async function listAll(listFn, params, cap = 500) {
  const items = [];
  let starting_after;
  while (items.length < cap) {
    const page = await listFn({ ...params, limit: 100, starting_after });
    items.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    starting_after = page.data[page.data.length - 1].id;
  }
  return items;
}

function startOfUtcDay(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
}

function startOfUtcMonth(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}

async function getMetrics() {
  if (!isConfigured()) {
    return {
      configured: false,
      mode: stripeMode(),
      error: "Stripe secret key is not set"
    };
  }

  const stripe = client();
  const sinceDay = startOfUtcDay();
  const sinceMonth = startOfUtcMonth();

  const [account, balance, todayCharges, monthCharges, customersPage, productsPage, subscriptions, payouts] =
    await Promise.all([
      stripe.accounts.retrieve(),
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 100, created: { gte: sinceDay } }),
      stripe.charges.list({ limit: 100, created: { gte: sinceMonth } }),
      stripe.customers.list({ limit: 100 }),
      stripe.products.list({ limit: 100, active: true }),
      listAll(stripe.subscriptions.list.bind(stripe.subscriptions), { status: "active" }, 200),
      stripe.payouts.list({ limit: 10 })
    ]);

  const succeededToday = todayCharges.data.filter((c) => c.status === "succeeded" && c.paid);
  const failedToday = todayCharges.data.filter((c) => c.status === "failed");
  const succeededMonth = monthCharges.data.filter((c) => c.status === "succeeded" && c.paid);

  const dailyRevenue = succeededToday.reduce((sum, c) => sum + (c.amount || 0), 0) / 100;
  const monthRevenue = succeededMonth.reduce((sum, c) => sum + (c.amount || 0), 0) / 100;

  const mrr =
    subscriptions.reduce((sum, sub) => {
      const items = sub.items?.data || [];
      return (
        sum +
        items.reduce((itemSum, item) => {
          const price = item.price || {};
          const amount = (price.unit_amount || 0) * (item.quantity || 1);
          const interval = price.recurring?.interval;
          const count = price.recurring?.interval_count || 1;
          if (interval === "month") return itemSum + amount / count;
          if (interval === "year") return itemSum + amount / (12 * count);
          if (interval === "week") return itemSum + (amount * 52) / (12 * count);
          if (interval === "day") return itemSum + (amount * 30) / count;
          return itemSum;
        }, 0)
      );
    }, 0) / 100;

  const available = (balance.available || []).reduce((s, b) => s + (b.amount || 0), 0) / 100;
  const pending = (balance.pending || []).reduce((s, b) => s + (b.amount || 0), 0) / 100;

  return {
    configured: true,
    mode: stripeMode(),
    livemode: Boolean(balance.livemode),
    account: {
      id: account.id,
      email: account.email || null,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      country: account.country
    },
    balance: {
      available,
      pending,
      raw: { available: balance.available, pending: balance.pending }
    },
    mrr,
    dailyRevenue,
    monthRevenue,
    customers: customersPage.data.length + (customersPage.has_more ? 0 : 0),
    customersHasMore: customersPage.has_more,
    products: productsPage.data.length,
    activeSubscriptions: subscriptions.length,
    failedToday: failedToday.length,
    payouts: payouts.data.map((p) => ({
      id: p.id,
      amount: dollars(p.amount),
      status: p.status,
      arrivalDate: p.arrival_date
    })),
    recentCharges: todayCharges.data.slice(0, 12).map(serializeCharge)
  };
}

function serializeCharge(c) {
  return {
    id: c.id,
    amount: dollars(c.amount),
    currency: c.currency,
    status: c.status,
    paid: c.paid,
    description: c.description,
    failureMessage: c.failure_message || null,
    customer: c.customer,
    created: new Date(c.created * 1000).toISOString()
  };
}

async function listCharges(limit = 25) {
  const stripe = client();
  const charges = await stripe.charges.list({ limit });
  return charges.data.map(serializeCharge);
}

async function listCustomers(limit = 25) {
  const stripe = client();
  const customers = await stripe.customers.list({ limit });
  return customers.data.map((c) => ({
    id: c.id,
    email: c.email,
    name: c.name,
    created: new Date(c.created * 1000).toISOString()
  }));
}

async function publishOffer({ name, description, amountCents, currency = "usd", interval = "one_time" }) {
  const stripe = client();
  const product = await stripe.products.create({
    name,
    description: description || undefined,
    metadata: { source: "agent007" }
  });

  const pricePayload = {
    product: product.id,
    unit_amount: amountCents,
    currency,
    metadata: { source: "agent007" }
  };
  if (interval && interval !== "one_time") {
    pricePayload.recurring = { interval };
  }

  const price = await stripe.prices.create(pricePayload);
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: "Payment received. AGENT007 recorded this sale." } },
    metadata: { source: "agent007", offerName: name }
  });

  return {
    productId: product.id,
    priceId: price.id,
    paymentLinkId: link.id,
    paymentUrl: link.url,
    livemode: Boolean(link.livemode)
  };
}

async function createCheckoutSession({ priceId, successUrl, cancelUrl, mode }) {
  const stripe = client();
  return stripe.checkout.sessions.create({
    mode: mode || "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl
  });
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = client();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

async function recentSuccessfulCharges(limit = 50) {
  const stripe = client();
  const charges = await stripe.charges.list({ limit });
  return charges.data.filter((c) => c.status === "succeeded" && c.paid);
}

module.exports = {
  stripeMode,
  stripeKey,
  isConfigured,
  client,
  getAccount,
  getMetrics,
  listCharges,
  listCustomers,
  publishOffer,
  createCheckoutSession,
  constructWebhookEvent,
  recentSuccessfulCharges,
  dollars
};
