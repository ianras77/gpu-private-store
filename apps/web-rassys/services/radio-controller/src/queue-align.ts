export type QueueAlignmentResult = {
  entriesToConsume: number;
  poppedTrackId: string | null;
  consumedSnippetIds: string[];
  skippedTrackIds: string[];
  matched: boolean;
};

const toSnippetId = (value: string) => value.slice("snippet:".length);

export const alignQueueEntriesToStartedTrack = (
  queueEntries: string[],
  matchedTrackId?: string | null
): QueueAlignmentResult => {
  if (queueEntries.length === 0) {
    return {
      entriesToConsume: 0,
      poppedTrackId: null,
      consumedSnippetIds: [],
      skippedTrackIds: [],
      matched: false
    };
  }

  const matchId = matchedTrackId?.trim() ?? "";
  const matchingIndex = matchId ? queueEntries.findIndex((entry) => entry === matchId) : -1;

  if (matchingIndex >= 0) {
    const consumedEntries = queueEntries.slice(0, matchingIndex + 1);
    return {
      entriesToConsume: consumedEntries.length,
      poppedTrackId: matchId,
      consumedSnippetIds: consumedEntries
        .filter((entry) => entry.startsWith("snippet:"))
        .map((entry) => toSnippetId(entry)),
      skippedTrackIds: consumedEntries
        .slice(0, -1)
        .filter((entry) => !entry.startsWith("snippet:")),
      matched: true
    };
  }

  let leadingSnippetCount = 0;
  while (
    leadingSnippetCount < queueEntries.length &&
    queueEntries[leadingSnippetCount]?.startsWith("snippet:")
  ) {
    leadingSnippetCount += 1;
  }

  return {
    entriesToConsume: leadingSnippetCount,
    poppedTrackId: null,
    consumedSnippetIds: queueEntries
      .slice(0, leadingSnippetCount)
      .map((entry) => toSnippetId(entry)),
    skippedTrackIds: [],
    matched: false
  };
};

