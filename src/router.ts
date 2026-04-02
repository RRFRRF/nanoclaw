import { Channel, NewMessage } from './types.js';
import { formatLocalTime } from './timezone.js';
import { compactEngine } from './compact/index.js';
import { logger } from './logger.js';
import { CompressionLevel, CompactMessage } from './compact/types.js';

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(
  messages: NewMessage[],
  timezone: string,
  sessionId?: string,
): string {
  if (!messages || messages.length === 0) {
    return `<context timezone="${escapeXml(timezone)}" />\n<messages>\n</messages>`;
  }

  let finalMessages: CompactMessage[] = messages as CompactMessage[];
  let compressionMetadata = '';

  // Apply intelligent context compaction if sessionId is provided
  if (sessionId) {
    try {
      const compactMessages = messages.map((m) => ({
        ...m,
        isCompacted: false,
      }));

      const result = compactEngine.compact(compactMessages, sessionId);

      if (result.level !== CompressionLevel.NONE) {
        finalMessages = result.messages;
        compressionMetadata = ` compact_level="${result.level}" original_messages="${result.stats.totalMessages}" compacted="${result.stats.compactedCount}" tokens_before="${result.stats.tokensBefore}" tokens_after="${result.stats.tokensAfter}" compression_ratio="${result.stats.compressionRatio.toFixed(2)}"`;
      }
    } catch (err) {
      logger.error(
        { err, sessionId },
        'Error during message compaction, falling back to original messages',
      );
      // Fallback to original messages
      finalMessages = messages as CompactMessage[];
    }
  }

  const lines = finalMessages.map((m) => {
    const displayTime = formatLocalTime(m.timestamp, timezone);
    const compactAttr = m.isCompacted
      ? ` compacted="true" compact_level="${m.compactLevel}"`
      : '';
    return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}"${compactAttr}>${escapeXml(m.content)}</message>`;
  });

  const header = `<context timezone="${escapeXml(timezone)}"${compressionMetadata} />\n`;

  return `${header}<messages>\n${lines.join('\n')}\n</messages>`;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
