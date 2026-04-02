/**
 * Tests for the content classifier.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContentClassifier,
  contentClassifier,
  estimateTokens,
} from '../classifier.js';
import { ContentType, CompactMessage } from '../types.js';

describe('ContentClassifier', () => {
  let classifier: ContentClassifier;

  beforeEach(() => {
    classifier = new ContentClassifier();
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty content', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('   ')).toBe(0);
    });

    it('should estimate tokens for short text', () => {
      const text = 'Hello world';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate tokens for longer text', () => {
      const text =
        'This is a longer text with multiple words and some punctuation.';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(5);
    });
  });

  describe('classify - user intent', () => {
    it('should classify questions as user_intent', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'user',
        sender_name: 'Test User',
        content: 'Can you help me with this task?',
        timestamp: new Date().toISOString(),
        is_from_me: false,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.USER_INTENT);
      expect(result.valueScore).toBeGreaterThanOrEqual(95);
      expect(result.isCompressible).toBe(false);
    });

    it('should classify Chinese requests as user_intent', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'user',
        sender_name: 'Test User',
        content: '我需要你帮我处理这个数据',
        timestamp: new Date().toISOString(),
        is_from_me: false,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.USER_INTENT);
    });

    it('should classify "what" questions as user_intent', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'user',
        sender_name: 'Test User',
        content: 'What is the best way to do this?',
        timestamp: new Date().toISOString(),
        is_from_me: false,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.USER_INTENT);
    });
  });

  describe('classify - decision', () => {
    it('should classify decision statements', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: 'I decided to use TypeScript for this project.',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.DECISION);
      expect(result.valueScore).toBeGreaterThanOrEqual(85);
      expect(result.isCompressible).toBe(false);
    });

    it('should classify "using" statements as decision', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: 'Using: React for the frontend',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.DECISION);
    });
  });

  describe('classify - artifact', () => {
    it('should classify code blocks as artifact', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: '```typescript\nconst x = 1;\n```',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.ARTIFACT);
      expect(result.valueScore).toBeGreaterThanOrEqual(85);
      expect(result.isCompressible).toBe(false);
    });

    it('should classify file creation as artifact', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: 'Created file: config.json',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.ARTIFACT);
    });
  });

  describe('classify - tool result', () => {
    it('should classify tool results', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'system',
        sender_name: 'System',
        content: 'Tool result: {\n  "status": "success",\n  "data": []\n}',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.TOOL_RESULT);
      expect(result.isCompressible).toBe(true);
    });

    it('should classify JSON output as tool result or artifact', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'system',
        sender_name: 'System',
        content: '```json\n{"key": "value"}\n```',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      // JSON code blocks can be classified as either tool_result or artifact
      expect([ContentType.TOOL_RESULT, ContentType.ARTIFACT]).toContain(
        result.type,
      );
    });
  });

  describe('classify - error', () => {
    it('should classify error messages', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'system',
        sender_name: 'System',
        content: 'Error: Failed to connect to database',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.ERROR);
      expect(result.valueScore).toBeGreaterThanOrEqual(70);
      expect(result.isCompressible).toBe(true);
    });

    it('should classify timeout errors', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'system',
        sender_name: 'System',
        content: 'Request timed out after 30 seconds',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.ERROR);
    });

    it('should classify unable messages as error', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'system',
        sender_name: 'System',
        content: 'Unable to complete the operation',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.ERROR);
    });
  });

  describe('classify - exploration', () => {
    it('should classify exploration statements', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content:
          'Exploring: the codebase... I found several files that match the pattern.',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.EXPLORATION);
      expect(result.isCompressible).toBe(true);
    });

    it('should classify investigation statements', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: 'Let me check the configuration files.',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.EXPLORATION);
    });
  });

  describe('classify - reasoning', () => {
    it('should classify reasoning/thinking content', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: '<thinking>I should approach this step by step...</thinking>',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.REASONING);
      expect(result.isCompressible).toBe(true);
    });
  });

  describe('classify - conclusion', () => {
    it('should classify conclusion statements', () => {
      const message: CompactMessage = {
        id: '1',
        chat_jid: 'test@jid',
        sender: 'assistant',
        sender_name: 'Assistant',
        content: 'In conclusion, the best approach is...',
        timestamp: new Date().toISOString(),
        is_from_me: true,
        isCompacted: false,
      };

      const result = classifier.classify(message);
      expect(result.type).toBe(ContentType.CONCLUSION);
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple messages', () => {
      const messages: CompactMessage[] = [
        {
          id: '1',
          chat_jid: 'test@jid',
          sender: 'user',
          sender_name: 'User',
          content: 'Can you help me?',
          timestamp: new Date().toISOString(),
          is_from_me: false,
          isCompacted: false,
        },
        {
          id: '2',
          chat_jid: 'test@jid',
          sender: 'assistant',
          sender_name: 'Assistant',
          content: '```code```',
          timestamp: new Date().toISOString(),
          is_from_me: true,
          isCompacted: false,
        },
      ];

      const results = classifier.classifyBatch(messages);
      expect(results).toHaveLength(2);
      expect(results[0].metadata.type).toBe(ContentType.USER_INTENT);
      expect(results[1].metadata.type).toBe(ContentType.ARTIFACT);
    });
  });

  describe('getTypePriority', () => {
    it('should return correct priorities', () => {
      expect(classifier.getTypePriority(ContentType.USER_INTENT)).toBe(100);
      expect(classifier.getTypePriority(ContentType.ARTIFACT)).toBe(95);
      expect(classifier.getTypePriority(ContentType.DECISION)).toBe(90);
      expect(classifier.getTypePriority(ContentType.ERROR)).toBe(85);
      expect(classifier.getTypePriority(ContentType.TOOL_RESULT)).toBe(60);
      expect(classifier.getTypePriority(ContentType.CHAT)).toBe(20);
    });
  });

  describe('singleton', () => {
    it('should have a singleton instance', () => {
      expect(contentClassifier).toBeInstanceOf(ContentClassifier);
    });
  });
});
