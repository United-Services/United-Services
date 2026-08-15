import { LibreTranslateClient, chunkText } from './libretranslate.client';

describe('chunkText', () => {
  it('returns the whole string as a single chunk when under the limit', () => {
    expect(chunkText('short text', 5000)).toEqual(['short text']);
  });

  it('splits an oversized field into multiple chunks on paragraph boundaries', () => {
    const paragraph = 'x'.repeat(3000);
    const text = [paragraph, paragraph, paragraph].join('\n\n'); // ~9006 chars
    const chunks = chunkText(text, 5000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(5000);
    }
    // No content lost across the split.
    expect(chunks.join('\n\n')).toContain(paragraph);
  });

  it('falls back to sentence boundaries when a single paragraph alone exceeds the limit', () => {
    const sentence = 'This is one sentence. ';
    const hugeParagraph = sentence.repeat(400); // one giant paragraph, no blank-line breaks
    const chunks = chunkText(hugeParagraph, 5000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(5000);
    }
  });
});

describe('LibreTranslateClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns immediately with zero calls when given no texts', async () => {
    const client = new LibreTranslateClient();
    const result = await client.translateBatch([], 'ar');
    expect(result).toEqual({ translations: [], charCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a single batched request when the instance supports array q', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ translatedText: ['مرحبا', 'وداعا'] }),
    });

    const client = new LibreTranslateClient();
    const result = await client.translateBatch(['hello', 'goodbye'], 'ar');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.translations).toEqual(['مرحبا', 'وداعا']);
    expect(result.charCount).toBe('hello'.length + 'goodbye'.length);
  });

  it('falls back to one request per string when the instance does not support array q', async () => {
    // Simulates an older LibreTranslate version that silently treats
    // array `q` as invalid and returns a single string instead of an
    // array matching the input length.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ translatedText: 'not-an-array-response' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ translatedText: 'مرحبا' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ translatedText: 'وداعا' }),
      });

    const client = new LibreTranslateClient();
    const result = await client.translateBatch(['hello', 'goodbye'], 'ar');

    // 1 failed batch attempt + 2 per-string fallback requests.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.translations).toEqual(['مرحبا', 'وداعا']);
  });

  it('falls back to per-string requests when the batched request errors outright', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ translatedText: 'مرحبا' }),
      });

    const client = new LibreTranslateClient();
    const result = await client.translateBatch(['hello'], 'ar');

    expect(result.translations).toEqual(['مرحبا']);
  });

  it('propagates an error when even the per-string fallback fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const client = new LibreTranslateClient();
    await expect(client.translateBatch(['hello'], 'ar')).rejects.toThrow();
  });
});
