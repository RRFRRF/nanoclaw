/**
 * Unit Tests: Router
 *
 * Tests for message routing and formatting functions.
 */

import { describe, it, expect, vi } from 'vitest';
import { formatMessages, escapeXml, findChannel } from '../../router.js';
import { createTestMessage } from '../helpers/test-utils.js';
import type { Channel, NewMessage } from '../../types.js';

// Mock dependencies
vi.mock('../../config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  TIMEZONE: 'UTC',
  TRIGGER_PATTERN: /@Andy\b/i,
}));

describe('Router', () => {
  describe('formatMessages', () => {
    it('should format single message correctly', () => {
      const messages = [createTestMessage({ content: 'Hello' })];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('<messages>');
      expect(result).toContain('</messages>');
      expect(result).toContain('Hello');
      expect(result).toContain('sender="Test User"');
    });

    it('should format multiple messages', () => {
      const messages = [
        createTestMessage({ content: 'First', is_from_me: false }),
        createTestMessage({ content: 'Second', is_from_me: true }),
      ];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('should escape XML special characters', () => {
      const messages = [
        createTestMessage({ content: '<script>alert("xss")</script>' }),
      ];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should handle empty messages array', () => {
      const result = formatMessages([], 'UTC');

      expect(result).toContain('<messages>');
      expect(result).toContain('</messages>');
    });

    it('should include context timezone', () => {
      const result = formatMessages([], 'America/New_York');

      expect(result).toContain('timezone="America/New_York"');
    });

    it('should include compression metadata when sessionId provided', () => {
      const messages = Array.from({ length: 5 }, () =>
        createTestMessage({ content: 'x'.repeat(1000) }),
      );
      const result = formatMessages(messages, 'UTC', 'test-session');

      // Should contain context with compression info if compression was applied
      expect(result).toContain('<context');
    });
  });

  describe('escapeXml', () => {
    it('should escape less than', () => {
      expect(escapeXml('<')).toBe('&lt;');
    });

    it('should escape greater than', () => {
      expect(escapeXml('>')).toBe('&gt;');
    });

    it('should escape ampersand', () => {
      expect(escapeXml('&')).toBe('&amp;');
    });

    it('should escape double quotes', () => {
      expect(escapeXml('"')).toBe('&quot;');
    });

    it('should handle multiple special characters', () => {
      const input = '<div class="test">Hello & welcome</div>';
      const expected =
        '&lt;div class=&quot;test&quot;&gt;Hello &amp; welcome&lt;/div&gt;';
      expect(escapeXml(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(escapeXml('')).toBe('');
    });

    it('should handle string without special characters', () => {
      expect(escapeXml('Hello World')).toBe('Hello World');
    });
  });

  describe('findChannel', () => {
    it('should find channel that owns the JID', () => {
      const mockChannel = {
        ownsJid: vi.fn().mockReturnValue(true),
        name: 'test-channel',
      } as unknown as Channel;

      const channels = [mockChannel];
      const result = findChannel(channels, 'test@example.com');

      expect(result).toBe(mockChannel);
      expect(mockChannel.ownsJid).toHaveBeenCalledWith('test@example.com');
    });

    it('should return undefined when no channel owns the JID', () => {
      const mockChannel = {
        ownsJid: vi.fn().mockReturnValue(false),
      } as unknown as Channel;

      const channels = [mockChannel];
      const result = findChannel(channels, 'test@example.com');

      expect(result).toBeUndefined();
    });

    it('should return first matching channel', () => {
      const mockChannel1 = {
        ownsJid: vi.fn().mockReturnValue(false),
      } as unknown as Channel;

      const mockChannel2 = {
        ownsJid: vi.fn().mockReturnValue(true),
        name: 'second',
      } as unknown as Channel;

      const channels = [mockChannel1, mockChannel2];
      const result = findChannel(channels, 'test@example.com');

      expect(result).toBe(mockChannel2);
    });

    it('should handle empty channels array', () => {
      const result = findChannel([], 'test@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('Message Format Edge Cases', () => {
    it('should handle very long content', () => {
      const longContent = 'x'.repeat(10000);
      const messages = [createTestMessage({ content: longContent })];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain(longContent);
      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle unicode characters', () => {
      const messages = [createTestMessage({ content: '🎉 你好 café' })];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('🎉');
      expect(result).toContain('你好');
      expect(result).toContain('café');
    });

    it('should handle newlines in content', () => {
      const messages = [
        createTestMessage({ content: 'Line 1\nLine 2\nLine 3' }),
      ];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });

    it('should handle timestamps correctly', () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      const messages = [createTestMessage({ timestamp })];
      const result = formatMessages(messages, 'UTC');

      expect(result).toContain('Jan 15, 2024');
      expect(result).toContain('10:30 AM');
    });
  });
});
