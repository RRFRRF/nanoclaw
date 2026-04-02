/**
 * Content classifier for intelligent context compaction.
 *
 * Analyzes messages and classifies them by content type and value,
 * enabling intelligent compression decisions.
 */

import { logger } from '../logger.js';
import {
  ContentType,
  ContentMetadata,
  ClassifiedMessage,
  CompactMessage,
} from './types.js';

/**
 * Estimates token count from text content.
 * Uses a simple heuristic: ~4 characters per token on average.
 */
export function estimateTokens(content: string): number {
  if (!content || !content.trim()) return 0;
  // More accurate for code: count words and special tokens
  const words = content.trim().split(/\s+/).length;
  const chars = content.length;
  // Average English: ~0.75 tokens per word, ~4 chars per token
  return Math.ceil(Math.max(words * 0.75, chars / 4));
}

/**
 * Classifies message content based on patterns and heuristics.
 */
export class ContentClassifier {
  /** Patterns for identifying different content types */
  private patterns: Map<ContentType, RegExp[]>;

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Initialize pattern matchers for content types.
   */
  private initializePatterns(): Map<ContentType, RegExp[]> {
    const patterns = new Map<ContentType, RegExp[]>();

    // User intent patterns
    patterns.set(ContentType.USER_INTENT, [
      /^(?:我?需要?|请?|帮我|能否|可以|想要|想|要|希望)\s+/i,
      /^(?:please|can you|could you|I need|I want|help me)\s+/i,
      /\?$/,
      /^(?:what|how|why|when|where|who|which)\s+/i,
      /^(?:what|how|why|when|where|who|which)[\s\w]+\?$/i,
      /我需要你/,
    ]);

    // Decision patterns
    patterns.set(ContentType.DECISION, [
      /(?:决定|选择|采用|使用|选用)\s*[:：]/i,
      /(?:decided?|chosen?|selected|using|adopt|opt for)\s*[:：]/i,
      /(?:我会|我将|我决定|我选)\s+/i,
      /(?:I will|I'll|deciding to|choosing to)\s+/i,
      /(?:最终决定|最终选择|final decision|final choice)/i,
      /I decided to/i,
    ]);

    // Conclusion patterns
    patterns.set(ContentType.CONCLUSION, [
      /(?:结论|总结|总之|综上所述|in conclusion|to summarize)/i,
      /(?:总的来说|总体而言|overall|in summary)/i,
      /(?:最终|最后|finally|ultimately)\s*[:：]/i,
      /(?:结果是|结论是|result is|conclusion is)\s*[:：]/i,
    ]);

    // Artifact patterns
    patterns.set(ContentType.ARTIFACT, [
      /```[\s\S]+```/,
      /<code>[\s\S]+<\/code>/i,
      /(?:文件|文档|代码|脚本|配置)\s*[:：]/i,
      /(?:file|document|code|script|config)\s*[:：]/i,
      /(?:已创建|已生成|created|generated)\s+.+\.(js|ts|py|json|yaml|yml|md|txt)/i,
    ]);

    // Tool result patterns
    patterns.set(ContentType.TOOL_RESULT, [
      /^\[?(?:tool|工具|函数|function)\s*[:：]/i,
      /(?:result|结果|输出|output)\s*[:：]\s*\{/i,
      /(?:执行|调用|executed|called)\s+(?:工具|函数|tool|function)/i,
      /<tool_result>/i,
      /```json\s*\{[\s\S]*\}\s*```/,
      /\$\s*\w+\s+.+\n[\s\S]*\n\$/,
      /^Tool result:/i,
    ]);

    // Exploration patterns
    patterns.set(ContentType.EXPLORATION, [
      /(?:探索|调查|检查|查看|搜索|浏览)\s*[:：]/i,
      /(?:exploring|investigating|checking|looking at|searching|browsing)/i,
      /(?:让我|让我来|我来)\s*(?:看看|检查一下|搜索一下)/i,
      /(?:let me|I'll)\s+(?:check|search|look|explore)/i,
      /(?:发现|找到|found|discovered)\s*[:：]/i,
    ]);

    // Reasoning patterns
    patterns.set(ContentType.REASONING, [
      /<(thinking|internal|reasoning)>/i,
      /(?:思考|推理|分析|思路|thought process|thinking|reasoning)/i,
      /(?:让我想想|我在思考|let me think)/i,
      /(?:因为|原因是|since|because|the reason)/i,
    ]);

    // Error patterns
    patterns.set(ContentType.ERROR, [
      /(?:错误|失败|异常|error|failed|failure|exception|crash)/i,
      /(?:timeout|timed out|超时)/i,
      /(?:unable to|cannot|can't|couldn't|无法|不能)\s+/i,
      /(?:ERR_|Error:|Exception:|Failed:)/i,
      /^Error:/i,
    ]);

    // Chat patterns (default, lowest priority)
    patterns.set(ContentType.CHAT, [/.*/]);

    return patterns;
  }

  /**
   * Classify a single message and return its metadata.
   */
  classify(message: CompactMessage): ContentMetadata {
    const content = message.content || '';
    const scores = new Map<ContentType, number>();

    // Score each content type
    for (const [type, patterns] of this.patterns) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          score += matches.length;
          // Bonus for matches at the start
          if (content.search(pattern) === 0) {
            score += 2;
          }
        }
      }
      scores.set(type, score);
    }

    // Find the highest scoring type
    let bestType = ContentType.CHAT;
    let bestScore = 0;
    for (const [type, score] of scores) {
      if (score > bestScore && type !== ContentType.CHAT) {
        bestScore = score;
        bestType = type;
      }
    }

    // Calculate confidence based on score difference
    const chatScore = scores.get(ContentType.CHAT) || 0;
    const confidence = Math.min(bestScore / (chatScore + 1), 1);

    return {
      type: bestType,
      valueScore: this.calculateValueScore(bestType, message),
      isCompressible: this.isCompressible(bestType),
      confidence,
    };
  }

  /**
   * Calculate a value score (0-100) for content based on type.
   */
  private calculateValueScore(
    type: ContentType,
    message: CompactMessage,
  ): number {
    let baseScore: number;

    switch (type) {
      case ContentType.USER_INTENT:
        baseScore = 95;
        break;
      case ContentType.ARTIFACT:
        baseScore = 90;
        break;
      case ContentType.DECISION:
        baseScore = 85;
        break;
      case ContentType.ERROR:
        baseScore = 80;
        break;
      case ContentType.CONCLUSION:
        baseScore = 75;
        break;
      case ContentType.TOOL_RESULT:
        baseScore = 60;
        break;
      case ContentType.EXPLORATION:
        baseScore = 40;
        break;
      case ContentType.REASONING:
        baseScore = 30;
        break;
      case ContentType.CHAT:
        baseScore = 20;
        break;
      default:
        baseScore = 20;
    }

    // Adjust based on message characteristics
    const content = message.content || '';

    // Boost for messages from the user
    if (!message.is_from_me) {
      baseScore += 10;
    }

    // Boost for longer, more substantive content
    const tokenCount = estimateTokens(content);
    if (tokenCount > 50 && tokenCount < 500) {
      baseScore += 5;
    }

    // Penalty for very short messages
    if (tokenCount < 10) {
      baseScore -= 10;
    }

    // Boost for messages containing code or structured data
    if (content.includes('```') || /\{[\s\S]*\}/.test(content)) {
      baseScore += 5;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, baseScore));
  }

  /**
   * Determine if a content type is compressible.
   */
  private isCompressible(type: ContentType): boolean {
    switch (type) {
      case ContentType.USER_INTENT:
      case ContentType.DECISION:
      case ContentType.ARTIFACT:
        return false; // Never compress these
      case ContentType.ERROR:
      case ContentType.CONCLUSION:
        return true; // Compressible but high value
      case ContentType.TOOL_RESULT:
      case ContentType.EXPLORATION:
      case ContentType.REASONING:
      case ContentType.CHAT:
        return true; // Compressible
      default:
        return true;
    }
  }

  /**
   * Classify multiple messages and return classified messages.
   */
  classifyBatch(messages: CompactMessage[]): ClassifiedMessage[] {
    return messages.map((msg) => {
      const metadata = this.classify(msg);
      return {
        ...msg,
        metadata,
        tokenCount: estimateTokens(msg.content),
      };
    });
  }

  /**
   * Get content type priority for sorting.
   * Higher values = more important to preserve.
   */
  getTypePriority(type: ContentType): number {
    switch (type) {
      case ContentType.USER_INTENT:
        return 100;
      case ContentType.ARTIFACT:
        return 95;
      case ContentType.DECISION:
        return 90;
      case ContentType.ERROR:
        return 85;
      case ContentType.CONCLUSION:
        return 80;
      case ContentType.TOOL_RESULT:
        return 60;
      case ContentType.EXPLORATION:
        return 40;
      case ContentType.REASONING:
        return 30;
      case ContentType.CHAT:
        return 20;
      default:
        return 20;
    }
  }
}

/**
 * Singleton classifier instance for reuse.
 */
export const contentClassifier = new ContentClassifier();
