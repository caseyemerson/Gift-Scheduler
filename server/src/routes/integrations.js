const express = require('express');
const { logAudit } = require('../audit');

const router = express.Router();

// Integration definitions — maps provider names to their required env vars
const INTEGRATIONS = {
  amazon: {
    label: 'Amazon',
    category: 'retailer',
    description: 'Search products, check prices, and place orders via Amazon Product Advertising API',
    envVars: ['AMAZON_API_KEY', 'AMAZON_API_SECRET', 'AMAZON_PARTNER_TAG'],
    requiredVars: ['AMAZON_API_KEY', 'AMAZON_API_SECRET'],
    signupUrl: 'https://affiliate-program.amazon.com/',
  },
  etsy: {
    label: 'Etsy',
    category: 'retailer',
    description: 'Search handmade and unique gifts via Etsy Open API v3',
    envVars: ['ETSY_API_KEY'],
    requiredVars: ['ETSY_API_KEY'],
    signupUrl: 'https://www.etsy.com/developers',
  },
  walmart: {
    label: 'Walmart',
    category: 'retailer',
    description: 'Search products and check prices via Walmart Affiliate API',
    envVars: ['WALMART_API_KEY'],
    requiredVars: ['WALMART_API_KEY'],
    signupUrl: 'https://affiliates.walmart.com/',
  },
  '1800flowers': {
    label: '1-800-Flowers',
    category: 'florist',
    description: 'Order flower arrangements and floral gifts via 1-800-Flowers API',
    envVars: ['FLOWERS1800_API_KEY'],
    requiredVars: ['FLOWERS1800_API_KEY'],
    signupUrl: 'https://www.1800flowers.com/affiliate-program',
  },
  sendflowers: {
    label: 'SendFlowers',
    category: 'florist',
    description: 'Browse and order flower deliveries via SendFlowers API',
    envVars: ['SENDFLOWERS_API_KEY'],
    requiredVars: ['SENDFLOWERS_API_KEY'],
    signupUrl: 'https://www.sendflowers.com/affiliate',
  },
  avasflowers: {
    label: 'Avas Flowers',
    category: 'florist',
    description: 'Order hand-delivered floral arrangements via Avas Flowers API',
    envVars: ['AVASFLOWERS_API_KEY'],
    requiredVars: ['AVASFLOWERS_API_KEY'],
    signupUrl: 'https://www.avasflowers.net/affiliate',
  },
  google_shopping: {
    label: 'Google Shopping',
    category: 'aggregator',
    description: 'Cross-retailer product search and price comparison',
    envVars: ['GOOGLE_SHOPPING_API_KEY', 'GOOGLE_SHOPPING_ENGINE_ID'],
    requiredVars: ['GOOGLE_SHOPPING_API_KEY'],
    signupUrl: 'https://programmablesearchengine.google.com/',
  },
  claude: {
    label: 'Claude (Anthropic)',
    category: 'llm',
    description: 'Generate personalized card messages using Claude',
    envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'],
    requiredVars: ['ANTHROPIC_API_KEY'],
    signupUrl: 'https://console.anthropic.com/',
  },
  openai: {
    label: 'ChatGPT (OpenAI)',
    category: 'llm',
    description: 'Generate personalized card messages using ChatGPT',
    envVars: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
    requiredVars: ['OPENAI_API_KEY'],
    signupUrl: 'https://platform.openai.com/',
  },
  gemini: {
    label: 'Gemini (Google)',
    category: 'llm',
    description: 'Generate personalized card messages using Gemini',
    envVars: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
    requiredVars: ['GEMINI_API_KEY'],
    signupUrl: 'https://aistudio.google.com/apikey',
  },
  openai_compatible: {
    label: 'OpenAI-Compatible',
    category: 'llm',
    description: 'Generate card messages using any OpenAI-compatible API (Together AI, Groq, Ollama, etc.)',
    envVars: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_MODEL'],
    requiredVars: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_API_KEY'],
    signupUrl: null,
  },
};

// Helper: mask a secret value for safe display
function maskSecret(value) {
  if (!value) return null;
  return '••••••••' + value.slice(-4);
}

// Helper: check if a provider is configured via env vars
function getProviderStatus(providerKey) {
  const provider = INTEGRATIONS[providerKey];
  if (!provider) return null;

  const vars = {};
  let allRequiredSet = true;

  for (const envVar of provider.envVars) {
    const value = process.env[envVar];
    vars[envVar] = {
      set: !!value,
      masked: maskSecret(value),
      required: provider.requiredVars.includes(envVar),
    };
    if (provider.requiredVars.includes(envVar) && !value) {
      allRequiredSet = false;
    }
  }

  return {
    provider: providerKey,
    label: provider.label,
    category: provider.category,
    description: provider.description,
    status: allRequiredSet ? 'configured' : 'not_configured',
    signupUrl: provider.signupUrl,
    variables: vars,
  };
}

// Helper: detect which LLM provider is active
function getActiveLlmProvider() {
  const forced = process.env.LLM_PROVIDER;
  if (forced && INTEGRATIONS[forced] && INTEGRATIONS[forced].category === 'llm') {
    const status = getProviderStatus(forced);
    if (status.status === 'configured') return forced;
  }

  // Auto-detect in priority order
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) return 'openai_compatible';

  return null;
}

// GET /api/integrations — list all integrations and their status
router.get('/', (req, res) => {
  const activeLlm = getActiveLlmProvider();

  const categories = {
    retailers: [],
    florists: [],
    aggregators: [],
    llm: [],
  };

  for (const [key, def] of Object.entries(INTEGRATIONS)) {
    const status = getProviderStatus(key);

    if (def.category === 'llm') {
      status.active = (key === activeLlm);
    }

    if (def.category === 'retailer') categories.retailers.push(status);
    else if (def.category === 'florist') categories.florists.push(status);
    else if (def.category === 'aggregator') categories.aggregators.push(status);
    else if (def.category === 'llm') categories.llm.push(status);
  }

  res.json({
    retailers: categories.retailers,
    florists: categories.florists,
    aggregators: categories.aggregators,
    llm: {
      active_provider: activeLlm,
      forced: !!process.env.LLM_PROVIDER,
      fallback: activeLlm ? null : 'templates',
      providers: categories.llm,
    },
  });
});

// GET /api/integrations/:provider — get status for a specific provider
router.get('/:provider', (req, res) => {
  const status = getProviderStatus(req.params.provider);
  if (!status) return res.status(404).json({ error: 'Unknown integration provider' });

  if (INTEGRATIONS[req.params.provider].category === 'llm') {
    status.active = (req.params.provider === getActiveLlmProvider());
  }

  res.json(status);
});

module.exports = router;
module.exports.INTEGRATIONS = INTEGRATIONS;
module.exports.getActiveLlmProvider = getActiveLlmProvider;
