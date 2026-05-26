/**
 * Embedding adapter.
 * Resolution order: Voyage → OpenAI → deterministic hash-based fallback.
 *
 * The fallback is *only* for dev/demo without keys — it produces semantically
 * meaningless vectors. Never rely on it in production.
 *
 * Dimension: 1024 by default (Voyage-3 / hash). Switch by editing
 * TenantAIConfig.embeddingDim and rerunning the post-push.sql with the new size.
 */
const DIM = Number(process.env.EMBEDDING_DIM ?? 1024);

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (process.env.VOYAGE_API_KEY) return embedVoyage(texts);
  if (process.env.OPENAI_API_KEY) return embedOpenAI(texts);
  return texts.map(deterministicHashEmbed);
}

async function embedVoyage(inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: inputs, output_dimension: DIM }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

async function embedOpenAI(inputs: string[]): Promise<number[][]> {
  const model = DIM === 1536 ? 'text-embedding-3-small' : 'text-embedding-3-large';
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, input: inputs, dimensions: DIM }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

/**
 * Deterministic fallback: token frequency mapped onto a fixed-dim float vector.
 * Roughly resembles a bag-of-words embedding; demos work, but ANN is nonsensical.
 */
function deterministicHashEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const tok of tokens) {
    const h = murmur32(tok);
    vec[h % DIM] += 1;
  }
  // L2 normalise
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
  return vec;
}

function murmur32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
