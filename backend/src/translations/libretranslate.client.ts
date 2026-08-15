import { Injectable, Logger } from '@nestjs/common';

// Splits `text` into chunks no longer than `maxLen`, breaking on paragraph
// boundaries first, then sentence boundaries, so a very long field never
// gets cut mid-word/mid-sentence for the translator. LibreTranslate/Argos
// Translate doesn't publish a hard request-size limit the way Google
// does, but very long input can slow translation down meaningfully on
// modest hardware — this is defensive, not a documented requirement, and
// keeps the contract stable if a different provider is ever swapped in
// later.
export function chunkText(text: string, maxLen = 5000): string[] {
  if (text.length <= maxLen) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLen) {
      // A single paragraph is still too long on its own — fall back to
      // sentence boundaries within it.
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + '\n\n' + sentence).length > maxLen) {
          pushCurrent();
        }
        current = current ? `${current}\n\n${sentence}` : sentence;
      }
      continue;
    }
    if ((current + '\n\n' + paragraph).length > maxLen) {
      pushCurrent();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  pushCurrent();

  return chunks;
}

export interface TranslateBatchResult {
  translations: string[];
  charCount: number;
}

// Thin wrapper around the self-hosted LibreTranslate container's REST API
// — reachable only over the internal Docker network (never exposed
// publicly, see docker-compose.yml), so there's no credential to send by
// default. Native fetch (Node 22, no SDK/axios dependency needed).
@Injectable()
export class LibreTranslateClient {
  private readonly logger = new Logger(LibreTranslateClient.name);
  private readonly baseUrl =
    process.env.LIBRETRANSLATE_URL ?? 'http://libretranslate:5000';

  async translateBatch(
    texts: string[],
    targetLocale: string,
  ): Promise<TranslateBatchResult> {
    if (texts.length === 0) return { translations: [], charCount: 0 };
    const charCount = texts.reduce((sum, t) => sum + t.length, 0);

    const batched = await this.tryBatchRequest(texts, targetLocale);
    if (batched) return { translations: batched, charCount };

    // Fall back to one request per string — still only one round trip per
    // field, just not combined into a single HTTP call. Covers
    // self-hosted LibreTranslate versions that don't accept an array `q`.
    this.logger.warn(
      'LibreTranslate did not accept a batched request; falling back to per-string requests',
    );
    const translations: string[] = [];
    for (const text of texts) {
      translations.push(await this.translateOne(text, targetLocale));
    }
    return { translations, charCount };
  }

  private async tryBatchRequest(
    texts: string[],
    targetLocale: string,
  ): Promise<string[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: texts,
          source: 'en',
          target: targetLocale,
          format: 'text',
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { translatedText: unknown };
      // A LibreTranslate instance that doesn't support array `q` either
      // errors (caught above) or silently treats it as a single string —
      // translatedText would then be a string, not an array of the same
      // length as the input. Only trust the array-batch result if the
      // shape genuinely matches what was sent.
      if (
        Array.isArray(data.translatedText) &&
        data.translatedText.length === texts.length &&
        data.translatedText.every((t) => typeof t === 'string')
      ) {
        return data.translatedText;
      }
      return null;
    } catch (error) {
      this.logger.warn(
        `Batched LibreTranslate request failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async translateOne(
    text: string,
    targetLocale: string,
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'en',
        target: targetLocale,
        format: 'text',
      }),
    });
    if (!res.ok) {
      throw new Error(
        `LibreTranslate request failed with status ${res.status}`,
      );
    }
    const data = (await res.json()) as { translatedText: string };
    return data.translatedText;
  }
}
