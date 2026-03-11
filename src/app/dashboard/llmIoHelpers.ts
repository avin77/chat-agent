export interface LlmIoConversationSummary {
  conversation_id: string;
  detected_intent: string;
  current_state: string | null;
  last_activity: string | null;
  log_count: number;
  shadow_count: number;
  has_production: boolean;
  has_shadow: boolean;
}

export function mergeLlmIoConversations(
  production: LlmIoConversationSummary[],
  shadow: LlmIoConversationSummary[],
): LlmIoConversationSummary[] {
  const merged = new Map<string, LlmIoConversationSummary>();

  for (const item of [...production, ...shadow]) {
    const existing = merged.get(item.conversation_id);

    if (!existing) {
      merged.set(item.conversation_id, { ...item });
      continue;
    }

    const existingActivity = existing.last_activity ?? '';
    const nextActivity = item.last_activity ?? '';

    merged.set(item.conversation_id, {
      ...existing,
      detected_intent: existing.detected_intent || item.detected_intent,
      current_state: existing.current_state || item.current_state,
      last_activity: nextActivity > existingActivity ? item.last_activity : existing.last_activity,
      log_count: existing.log_count + item.log_count,
      shadow_count: existing.shadow_count + item.shadow_count,
      has_production: existing.has_production || item.has_production,
      has_shadow: existing.has_shadow || item.has_shadow,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    (b.last_activity ?? '').localeCompare(a.last_activity ?? ''),
  );
}
