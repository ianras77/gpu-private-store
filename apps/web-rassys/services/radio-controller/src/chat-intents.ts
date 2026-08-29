const normalizeIntentText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const MUSIC_CONTEXT_PATTERNS = [
  /\bwhy (?:this|that|the)\b/,
  /\bwhy .* right now\b/,
  /\bdeep cut\b/,
  /\bthis cut right now\b/,
  /\bwhat am i hearing\b/,
  /\bwhat should i hear\b/,
  /\btell me about\b/,
  /\btake me deeper\b/,
  /\bdeeper into\b/,
  /\blisten for\b/,
  /\bhistory\b/,
  /\brecord(?:ing|ed)\b/,
  /\bartist context\b/,
  /\balbum context\b/
];

const LANE_REQUEST_PATTERNS = [
  /\bmore like this\b/,
  /\bsame decade\b/,
  /\bsame artist\b/,
  /\bdeep cut(?:s)?\b/,
  /\balbum run\b/,
  /\bgenre pocket\b/,
  /\b(?:give me|find me|take me|put me|keep me|steer me|point me)\b.{0,48}\b(?:lane|mood|feel(?:ing)?|set|pocket|era|genre|decade|artist)\b/,
  /\b(?:i (?:need|want)|i'?m after)\b.{0,48}\b(?:lane|mood|feel(?:ing)?|set|pocket|era|genre|decade|artist)\b/,
  /\b(?:something|anything)\b.{0,32}\b(?:like this|deeper|warmer|colder|softer|harder|heavier|lighter)\b/
];

const DIRECT_REQUEST_PATTERNS = [
  /\b(?:play|spin|queue|put on|drop)\b/,
  /\b(?:can|could|would) you (?:play|spin|queue|put on|drop|keep|hold)\b/,
  /\b(?:keep|hold)\b.{0,48}\bon the line\b/,
  /\b(?:recommend|suggest)\b/,
  /\brequest line\b/,
  /\bi(?:'d| would)? love to hear\b/,
  /\bi (?:want|need) to hear\b/
];

const RECOMMENDATION_QUESTION_PATTERNS = [
  /\bwhat would you recommend\b/,
  /\bwhat do you recommend\b/,
  /\bwhat should i listen to\b/,
  /\bwhat should i hear\b/,
  /\bgot a recommendation\b/,
  /\bmake me a recommendation\b/,
  /\bpick (?:a|me a|something)\b/,
  /\bsurprise me\b/,
  /\bput me onto\b/,
  /\bpoint me at\b/
];

const DIRECT_SKIP_PATTERNS = [
  /\bskip\b/,
  /\bpass on\b/,
  /\bmove on\b/,
  /\bget this off\b/,
  /\bchange (?:it|this|the song|this song|that song)\b/,
  /\bnext song\b/,
  /\bnext one\b/,
  /\bcut (?:it|this|that|the song|this song|that song|this record|that record)\b/,
  /\bpull (?:it|this|that|the song|this song|that song)\b/,
  /\btake (?:it|this|that) off\b/
];

const STRONG_SKIP_REASON_PATTERN =
  /\b(because|since|again|repeat|repeating|same|fit|fits|fitting|mood|energy|drag|dragging|wrong|off|jarring|boring|long|already)\b/i;

export const looksLikeMusicContextQuestion = (message: string) => {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  return MUSIC_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const looksLikeSkipRequest = (message: string) => {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  if (looksLikeMusicContextQuestion(normalized)) {
    return false;
  }
  return DIRECT_SKIP_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const looksLikeBroadLaneRequest = (message: string) => {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  if (looksLikeMusicContextQuestion(normalized) || looksLikeSkipRequest(normalized)) {
    return false;
  }
  return LANE_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const looksLikeRecommendationRequest = (message: string) => {
  const normalized = normalizeIntentText(message);
  if (!normalized) return false;
  if (looksLikeMusicContextQuestion(normalized) || looksLikeSkipRequest(normalized)) {
    return false;
  }
  return (
    DIRECT_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    RECOMMENDATION_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    looksLikeBroadLaneRequest(normalized)
  );
};

export const hasStrongSkipReason = (message: string) =>
  message.trim().length >= 28 && STRONG_SKIP_REASON_PATTERN.test(message);
