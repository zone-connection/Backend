import {
  INTERMEDIACAO_KEY_SET,
  sanitizeKnownValues,
} from './intermediacao-fields';
import type { ExtractedField, FieldConfidence } from './intermediacao-fields';

function confidenceFromSource(): FieldConfidence {
  return 'media';
}

export async function interpretWithOpenAi(params: {
  text: string;
  apiKey: string;
}): Promise<{ fields: ExtractedField[]; values: Record<string, string> } | null> {
  const snippet = params.text.slice(0, 12000);
  const body = {
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Extraia dados de contrato de intermediação imobiliária. Responda só JSON com chaves conhecidas. Não invente. Concatene dois nomes/CPFs da mesma parte com " / ".',
      },
      {
        role: 'user',
        content: `Chaves permitidas: ${[...INTERMEDIACAO_KEY_SET].join(', ')}.\nTexto:\n${snippet}`,
      },
    ],
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const values = sanitizeKnownValues(parsed);
    const fields: ExtractedField[] = Object.entries(values).map(([key, value]) => ({
      key: key as ExtractedField['key'],
      value,
      confidence: confidenceFromSource(),
      snippet: value.slice(0, 80),
    }));
    return { fields, values };
  } catch {
    return null;
  }
}
