export type MentionCandidate = {
  userId?: string;
  name: string;
};

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

const MAX_MENTION_QUERY_LENGTH = 40;

export function findActiveMention(
  input: string,
  caretPosition = input.length,
): ActiveMention | null {
  const caret = Math.max(0, Math.min(caretPosition, input.length));
  const beforeCaret = input.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;
  if (atIndex > 0 && !/\s/.test(beforeCaret[atIndex - 1])) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (
    query.length > MAX_MENTION_QUERY_LENGTH ||
    /[@\n\r,;:!?()[\]{}]/.test(query) ||
    /^\s/.test(query) ||
    /\s{2,}/.test(query)
  ) {
    return null;
  }

  return { start: atIndex, end: caret, query };
}

export function getMentionSuggestions(
  candidates: MentionCandidate[],
  query: string,
  currentUserId?: string,
  limit = 6,
): MentionCandidate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();

  return candidates
    .filter((candidate) => {
      if (!candidate.name.trim() || candidate.userId === currentUserId) return false;
      const key = (candidate.userId || candidate.name).toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return candidate.name.toLocaleLowerCase().includes(normalizedQuery);
    })
    .sort((left, right) => {
      const leftStarts = left.name.toLocaleLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.name.toLocaleLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

export function insertMention(
  input: string,
  activeMention: ActiveMention,
  displayName: string,
): { value: string; caretPosition: number } {
  const mention = `@${displayName} `;
  const suffix = input.slice(activeMention.end);
  const value =
    input.slice(0, activeMention.start) +
    mention +
    (suffix.startsWith(" ") ? suffix.slice(1) : suffix);
  return {
    value,
    caretPosition: activeMention.start + mention.length,
  };
}
