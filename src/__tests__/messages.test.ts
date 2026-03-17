import { describe, expect, test } from 'vitest';
import {
  formatTelegramMessage,
  splitTelegramMessage,
  splitTelegramMessageChunks,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
  TELEGRAM_MESSAGE_SOFT_LIMIT,
} from '../messages.js';

// ── formatTelegramMessage ────────────────────────────────────────────────────

describe('formatTelegramMessage', () => {
  test('returns empty string for empty input', () => {
    expect(formatTelegramMessage('')).toBe('');
  });

  test('escapes special characters for MarkdownV2', () => {
    const result = formatTelegramMessage('price is $10 + tax');
    expect(result).toContain('\\+');
  });

  test('preserves bold and italic formatting', () => {
    const result = formatTelegramMessage('**bold** _italic_');
    expect(result).toContain('*');
  });

  test('preserves code blocks', () => {
    const result = formatTelegramMessage("```js\nconsole.log('hi')\n```");
    expect(result).toContain('```');
  });

  test('strips leading frontmatter', () => {
    const input = '---\ntitle: hello\n---\nActual content';
    const result = formatTelegramMessage(input);
    expect(result).not.toContain('title: hello');
    expect(result).toContain('Actual content');
  });
});

// ── splitTelegramMessage ─────────────────────────────────────────────────────

describe('splitTelegramMessage', () => {
  test('returns empty array for empty input', () => {
    expect(splitTelegramMessage('', TELEGRAM_MESSAGE_LIMIT)).toEqual([]);
  });

  test('returns single chunk for short message', () => {
    const chunks = splitTelegramMessage('Hello world', TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
  });

  test('splits long message into multiple chunks', () => {
    const longText = 'A'.repeat(8000);
    const chunks = splitTelegramMessage(longText, TELEGRAM_MESSAGE_LIMIT);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('every chunk fits within the limit', () => {
    const longText = 'word '.repeat(2000);
    const chunks = splitTelegramMessage(longText, TELEGRAM_MESSAGE_LIMIT);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    }
  });

  test('no content is lost during splitting', () => {
    const original = 'Section one.\n\nSection two.\n\nSection three.';
    const chunks = splitTelegramMessage(original, TELEGRAM_MESSAGE_LIMIT);
    const reconstructed = chunks.join('');
    // The formatted result should contain all original words
    for (const word of ['Section', 'one', 'two', 'three']) {
      expect(reconstructed).toContain(word);
    }
  });

  test('respects caption limit', () => {
    const text = 'caption '.repeat(200);
    const chunks = splitTelegramMessage(text, TELEGRAM_CAPTION_LIMIT);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_CAPTION_LIMIT);
    }
  });
});

// ── splitTelegramMessageChunks ───────────────────────────────────────────────

describe('splitTelegramMessageChunks', () => {
  test('returns empty array for empty input', () => {
    expect(splitTelegramMessageChunks('', TELEGRAM_MESSAGE_LIMIT)).toEqual([]);
  });

  test('returns both raw and formatted for each chunk', () => {
    const chunks = splitTelegramMessageChunks('Hello **world**', TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].raw).toBe('Hello **world**');
    expect(chunks[0].formatted).toBeTruthy();
  });

  test('handles fenced code blocks correctly', () => {
    const message = 'Before code\n```js\nconst x = 1;\n```\nAfter code';
    const chunks = splitTelegramMessageChunks(message, TELEGRAM_MESSAGE_LIMIT);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const allRaw = chunks.map((c) => c.raw).join('');
    expect(allRaw).toContain('const x = 1');
  });

  test('splits oversized code block into multiple chunks', () => {
    const longCode = Array.from(
      { length: 500 },
      (_, i) => `const variable${i} = "value_${i}_${'x'.repeat(20)}";`,
    ).join('\n');
    const message = `\`\`\`js\n${longCode}\n\`\`\``;
    const chunks = splitTelegramMessageChunks(message, TELEGRAM_MESSAGE_LIMIT);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.formatted.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    }
  });

  test('prefers natural split boundaries', () => {
    const paragraphs = Array.from(
      { length: 30 },
      (_, i) => `Paragraph ${i}: ${'content '.repeat(40)}`,
    ).join('\n\n');
    const chunks = splitTelegramMessageChunks(paragraphs, TELEGRAM_MESSAGE_LIMIT);

    // Each chunk (except possibly the last) should end at a natural boundary
    for (const chunk of chunks.slice(0, -1)) {
      const endsNaturally =
        chunk.raw.endsWith('\n\n') || chunk.raw.endsWith('\n') || chunk.raw.endsWith(' ');
      expect(endsNaturally).toBe(true);
    }
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('single character message', () => {
    const chunks = splitTelegramMessage('A', TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
  });

  test('message at exact limit boundary', () => {
    // A message whose formatted form is close to the limit
    const text = 'a'.repeat(3900);
    const chunks = splitTelegramMessage(text, TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
  });

  test('message with only whitespace', () => {
    const chunks = splitTelegramMessage('   \n\n  ', TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
  });

  test('message with many special characters needing escape', () => {
    const special = 'Price: $100 + $50 = $150 (total) [link](http://example.com)';
    const chunks = splitTelegramMessage(special, TELEGRAM_MESSAGE_LIMIT);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBeGreaterThan(special.length); // escaping adds characters
  });

  test('mixed code and text splitting preserves all content', () => {
    const message =
      "# Title\n\nSome text here.\n\n```python\nprint('hello')\n```\n\nMore text after.";
    const chunks = splitTelegramMessageChunks(message, TELEGRAM_MESSAGE_LIMIT);
    const allRaw = chunks.map((c) => c.raw).join('');
    expect(allRaw).toBe(message);
  });

  test('constants have correct values', () => {
    expect(TELEGRAM_MESSAGE_LIMIT).toBe(4096);
    expect(TELEGRAM_MESSAGE_SOFT_LIMIT).toBe(4000);
    expect(TELEGRAM_CAPTION_LIMIT).toBe(1024);
  });
});
