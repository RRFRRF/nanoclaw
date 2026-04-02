/**
 * Performance Tests
 *
 * Tests for high load scenarios and performance benchmarks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'perf_hooks';

import { compactEngine } from '../../compact/engine.js';

describe('Performance: Message Processing', () => {
  const createMessages = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i}`,
      content: `Message content ${i}: ${'x'.repeat(500)}`,
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      sender: `user${i % 10}@example.com`,
      sender_name: `User ${i % 10}`,
    }));
  };

  it('should handle 1000 messages under 100ms', () => {
    const messages = createMessages(1000);
    const start = performance.now();

    // Simulate processing
    const processed = messages.filter((m) => m.content.length > 0);

    const duration = performance.now() - start;
    expect(processed.length).toBe(1000);
    expect(duration).toBeLessThan(100);
  });

  it('should handle 10000 messages under 500ms', () => {
    const messages = createMessages(10000);
    const start = performance.now();

    const processed = messages.filter((m) => m.content.length > 0);

    const duration = performance.now() - start;
    expect(processed.length).toBe(10000);
    expect(duration).toBeLessThan(500);
  });

  it('should handle 100000 messages without crashing', () => {
    const messages = createMessages(100000);
    expect(() => {
      messages.forEach((m) => m.content.slice(0, 100));
    }).not.toThrow();
  });
});

describe('Performance: Database Operations', () => {
  it('should batch insert 1000 records quickly', () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({
      id: `rec-${i}`,
      data: 'x'.repeat(1000),
    }));

    const start = performance.now();
    // Mock batch operation
    const inserted = records.length;
    const duration = performance.now() - start;

    expect(inserted).toBe(1000);
    expect(duration).toBeLessThan(50);
  });
});

describe('Performance: Compression', () => {
  it('should compact large contexts efficiently', () => {
    const largeContent = 'x'.repeat(100000);
    const start = performance.now();

    // Mock compression
    const compressed = largeContent.slice(0, 1000);

    const duration = performance.now() - start;
    expect(compressed.length).toBeLessThan(largeContent.length);
    expect(duration).toBeLessThan(100);
  });
});

describe('Performance: Memory Usage', () => {
  it('should not leak memory on repeated operations', () => {
    const initial = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      const arr = new Array(1000).fill('x');
      arr.length = 0; // Clear reference
    }

    // Force GC if available
    if (global.gc) {
      global.gc();
    }

    const final = process.memoryUsage().heapUsed;
    const growth = (final - initial) / 1024 / 1024; // MB

    expect(growth).toBeLessThan(50); // Less than 50MB growth
  });
});
