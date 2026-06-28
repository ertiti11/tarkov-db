const API = 'https://api.tarkov.dev/graphql';

const RETRIES = Number.parseInt(process.env.TARKOV_GQL_RETRIES || '6', 10);
const TIMEOUT_MS = Number.parseInt(process.env.TARKOV_GQL_TIMEOUT_MS || '45000', 10);
const BASE_DELAY_MS = Number.parseInt(process.env.TARKOV_GQL_RETRY_BASE_MS || '1000', 10);
const MAX_DELAY_MS = Number.parseInt(process.env.TARKOV_GQL_RETRY_MAX_MS || '30000', 10);

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GraphQLResponseError extends Error {
  constructor(errors) {
    super('GraphQL errors');
    this.name = 'GraphQLResponseError';
    this.errors = errors;
    this.retryable = false;
  }
}

function retryAfterMs(res) {
  const value = res.headers.get('retry-after');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

function backoffMs(attempt, res) {
  const fromHeader = res ? retryAfterMs(res) : null;
  if (fromHeader != null) return Math.min(fromHeader, MAX_DELAY_MS);

  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * Math.min(1000, exponential));
  return exponential + jitter;
}

async function readErrorBody(res) {
  const text = await res.text().catch(() => '');
  return text ? `: ${text.slice(0, 500)}` : '';
}

export async function gql(query, { label = 'query', retries = RETRIES } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await readErrorBody(res);
        lastError = new Error(`GraphQL ${res.status} ${res.statusText}${body}`);
        lastError.status = res.status;
        lastError.retryable = RETRYABLE_STATUS.has(res.status);

        if (!lastError.retryable || attempt > retries) {
          throw lastError;
        }

        const wait = backoffMs(attempt, res);
        console.warn(`[graphql] ${label} failed with ${res.status}; retry ${attempt}/${retries} in ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }

      const json = await res.json();
      if (json.errors) {
        console.error(json.errors);
        throw new GraphQLResponseError(json.errors);
      }

      return json.data;
    } catch (error) {
      lastError = error;

      if (error?.retryable === false) break;

      if (attempt > retries) break;

      const wait = backoffMs(attempt);
      const message = error?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : error.message;
      console.warn(`[graphql] ${label} failed (${message}); retry ${attempt}/${retries} in ${Math.round(wait)}ms`);
      await sleep(wait);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}
