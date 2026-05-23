import { z } from 'zod';
import type { SafetyFlag } from '@usmender/shared';

const safetyFlagSchema = z.object({
  flagged: z.boolean(),
  reason: z.preprocess((value) => value ?? undefined, z.string().optional())
});

const draftInviteSchema = z.object({
  inviteMessageNeutral: z.string(),
  issueSummaryNeutral: z.string(),
  subjectLine: z.string(),
  safetyFlag: safetyFlagSchema
});

const intakeQuestionSchema = z.object({
  question: z.string(),
  whyThisQuestion: z.string().optional(),
  safetyFlag: safetyFlagSchema
});

const mediateTurnSchema = z.object({
  neutralSummary: z.string(),
  recipientView: z.string(),
  coachNote: z.string(),
  followUpQuestion: z.string().nullable().optional(),
  safetyFlag: safetyFlagSchema
});

const rephrasePerspectiveSchema = z.object({
  neutralSummary: z.string(),
  safetyFlag: safetyFlagSchema
});

const proposalSchema = z.object({
  proposal: z.object({
    title: z.string(),
    bullets: z.array(z.string()),
    acceptanceCriteria: z.array(z.string())
  }),
  toneNote: z.string().optional(),
  safetyFlag: safetyFlagSchema
});

const refineSchema = z.object({
  proposal: z.object({
    title: z.string(),
    bullets: z.array(z.string()),
    acceptanceCriteria: z.array(z.string())
  }),
  changeLog: z.array(z.string()),
  safetyFlag: safetyFlagSchema
});

const closeoutSchema = z.object({
  closureMessage: z.string(),
  nextSteps: z.array(z.string()),
  suggestedFollowUpWindowDays: z.number().int(),
  safetyFlag: safetyFlagSchema
});

export type DraftInviteInput = {
  initiatorNeedRaw: string;
  relationshipType: string;
  desiredOutcome?: string;
  boundaries?: string[];
};

export type DraftInviteResponse = z.infer<typeof draftInviteSchema>;

export type IntakeQuestionInput = {
  sessionSummary: string;
  who: 'INITIATOR' | 'INVITEE';
  lastUserMessage: string;
};

export type IntakeQuestionResponse = z.infer<typeof intakeQuestionSchema>;

export type MediateTurnInput = {
  rawText: string;
  who: 'INITIATOR' | 'INVITEE';
  sessionTopic: string;
  relationshipType?: string;
  sessionStatus: string;
  latestOtherSummary?: string | null;
  latestMediatorPrompt?: string | null;
  recentSharedMessages?: string[];
  proposalTitle?: string | null;
  proposalBullets?: string[];
};

export type MediateTurnResponse = z.infer<typeof mediateTurnSchema>;

export type RephrasePerspectiveInput = {
  rawText: string;
  who: 'INITIATOR' | 'INVITEE';
  sessionTopic: string;
  relationshipType?: string;
  boundaries?: string[];
};

export type RephrasePerspectiveResponse = z.infer<typeof rephrasePerspectiveSchema>;

export type ProposalV1Input = {
  neutralSummaryOfInitiator: string;
  neutralSummaryOfInvitee: string;
  constraints?: string[];
};

export type ProposalV1Response = z.infer<typeof proposalSchema>;

export type RefineProposalInput = {
  proposalV1: {
    title: string;
    bullets: string[];
    acceptanceCriteria: string[];
  };
  votes: Array<{ userId: string; value: string; comment?: string }>;
};

export type RefineProposalResponse = z.infer<typeof refineSchema>;

export type CloseoutGuidanceInput = {
  sessionSummary: string;
  blockers: string[];
};

export type CloseoutGuidanceResponse = z.infer<typeof closeoutSchema>;

type CatClientConfig = {
  label: 'primary' | 'support';
  baseUrl: string;
  apiKey: string | undefined;
  timeoutMs: number;
};

type SupportScope = 'proposal' | 'refinement' | 'closeout';

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value ?? fallback).trim().replace(/\/$/, '');
}

function parseTimeout(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSupportScope(value: string): value is SupportScope {
  return value === 'proposal' || value === 'refinement' || value === 'closeout';
}

const primaryCat: CatClientConfig = {
  label: 'primary',
  baseUrl: normalizeBaseUrl(process.env.CAT_BASE_URL, 'http://cat:80'),
  apiKey: process.env.CAT_API_KEY,
  timeoutMs: parseTimeout(process.env.CAT_TIMEOUT_MS, 12000)
};

const supportBaseUrl = normalizeBaseUrl(process.env.CAT_SUPPORT_BASE_URL, '');
const supportCat: CatClientConfig | null = supportBaseUrl
  ? {
      label: 'support',
      baseUrl: supportBaseUrl,
      apiKey: process.env.CAT_SUPPORT_API_KEY,
      timeoutMs: parseTimeout(process.env.CAT_SUPPORT_TIMEOUT_MS, primaryCat.timeoutMs)
    }
  : null;

const supportScopes = new Set<SupportScope>(
  (process.env.CAT_SUPPORT_SCOPE ?? 'proposal,refinement,closeout')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(isSupportScope)
);

function buildHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function callCatEndpoint<T>(
  client: CatClientConfig,
  path: string,
  payload: unknown
): Promise<T> {
  const url = `${client.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(client.timeoutMs),
    headers: buildHeaders(client.apiKey),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${client.label} cat call failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

function supportScopeEnabled(scope: SupportScope) {
  return Boolean(supportCat) && supportScopes.has(scope);
}

function orderedCats(preferredSupportScope?: SupportScope): CatClientConfig[] {
  const candidates =
    preferredSupportScope && supportScopeEnabled(preferredSupportScope)
      ? [supportCat, primaryCat]
      : [primaryCat, supportCat];

  return candidates
    .filter((candidate): candidate is CatClientConfig => Boolean(candidate))
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (entry) => entry.baseUrl === candidate.baseUrl && entry.apiKey === candidate.apiKey
        ) === index
    );
}

async function callCat<T>(
  path: string,
  payload: unknown,
  options?: { supportScope?: SupportScope }
): Promise<T> {
  const clients = orderedCats(options?.supportScope);
  let lastError: unknown;

  for (const client of clients) {
    try {
      return await callCatEndpoint<T>(client, path, payload);
    } catch (error) {
      lastError = error;
      if (clients.length > 1) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[cat] ${client.label} failed for ${path}: ${detail}`);
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(`Cat call failed for ${path}`));
}

const SAFE_FLAG: SafetyFlag = { flagged: false };

export async function draftInvite(input: DraftInviteInput): Promise<DraftInviteResponse> {
  const fallback: DraftInviteResponse = {
    inviteMessageNeutral:
      'Hi there. I would like to have a calm, mediated conversation to work through something important. If you are open to it, we can take this step by step.',
    issueSummaryNeutral: `A request to discuss a ${input.relationshipType} concern with a neutral mediator.`,
    subjectLine: 'A gentle request to talk',
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/draft_invite', input);
    return draftInviteSchema.parse(data);
  } catch {
    return fallback;
  }
}

export async function intakeQuestion(
  input: IntakeQuestionInput
): Promise<IntakeQuestionResponse> {
  const fallback: IntakeQuestionResponse = {
    question: 'What is one change that would make this feel fairer for you?',
    whyThisQuestion: 'Clarify a concrete need',
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/intake_question', input);
    return intakeQuestionSchema.parse(data);
  } catch {
    return fallback;
  }
}

function fallbackCoachNote(input: MediateTurnInput) {
  if (
    input.sessionStatus === 'VOTING_V1' ||
    input.sessionStatus === 'VOTING_V2' ||
    input.sessionStatus === 'PROPOSAL_V1' ||
    input.sessionStatus === 'PROPOSAL_V2' ||
    input.sessionStatus === 'REFINEMENT'
  ) {
    return 'Anchor this in what feels workable, what does not, and one concrete adjustment you want.';
  }

  if (input.latestOtherSummary) {
    return 'Acknowledge what the other person is trying to protect, then make one clear request.';
  }

  return 'Lead with impact, keep it specific, and end with one doable next step.';
}

function fallbackRecipientView(input: MediateTurnInput) {
  if (
    input.sessionStatus === 'VOTING_V1' ||
    input.sessionStatus === 'VOTING_V2' ||
    input.sessionStatus === 'PROPOSAL_V1' ||
    input.sessionStatus === 'PROPOSAL_V2' ||
    input.sessionStatus === 'REFINEMENT'
  ) {
    return 'The other person will receive a calmer summary tied to what feels workable in the current plan.';
  }

  return 'The other person will receive a calmer summary focused on impact, needs, and next steps.';
}

function fallbackFollowUpQuestion(input: MediateTurnInput) {
  if (
    input.sessionStatus === 'VOTING_V1' ||
    input.sessionStatus === 'VOTING_V2' ||
    input.sessionStatus === 'PROPOSAL_V1' ||
    input.sessionStatus === 'PROPOSAL_V2' ||
    input.sessionStatus === 'REFINEMENT'
  ) {
    return 'What would make the current plan feel more workable or fair to you?';
  }

  if (input.latestOtherSummary) {
    return 'What feels most important for the other person to understand before the plan is drafted?';
  }

  return 'What is one change that would make this feel fairer for you?';
}

export async function mediateTurn(input: MediateTurnInput): Promise<MediateTurnResponse> {
  const fallback: MediateTurnResponse = {
    neutralSummary: `A perspective was shared about ${input.sessionTopic}.`,
    recipientView: fallbackRecipientView(input),
    coachNote: fallbackCoachNote(input),
    followUpQuestion: fallbackFollowUpQuestion(input),
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/mediate_turn', input);
    return mediateTurnSchema.parse(data);
  } catch {
    return fallback;
  }
}

export async function rephrasePerspective(
  input: RephrasePerspectiveInput
): Promise<RephrasePerspectiveResponse> {
  const fallback: RephrasePerspectiveResponse = {
    neutralSummary: `A perspective was shared about ${input.sessionTopic}.`,
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/rephrase_perspective', input);
    return rephrasePerspectiveSchema.parse(data);
  } catch {
    return fallback;
  }
}

export async function proposeResolutionV1(
  input: ProposalV1Input
): Promise<ProposalV1Response> {
  const fallback: ProposalV1Response = {
    proposal: {
      title: 'A steady way forward',
      bullets: [
        'Agree on one shared expectation for the next two weeks.',
        'Name a check-in time that works for both people.',
        'List one concrete request from each side.'
      ],
      acceptanceCriteria: [
        'Both people can restate the plan in their own words.',
        'Both agree the plan feels respectful and realistic.'
      ]
    },
    toneNote: 'Keep the language soft and practical.',
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/propose_resolution_v1', input, {
      supportScope: 'proposal'
    });
    return proposalSchema.parse(data);
  } catch {
    return fallback;
  }
}

export async function refineResolutionV2(
  input: RefineProposalInput
): Promise<RefineProposalResponse> {
  const fallback: RefineProposalResponse = {
    proposal: {
      title: input.proposalV1.title,
      bullets: input.proposalV1.bullets.concat('Add a short reset ritual if tensions rise.'),
      acceptanceCriteria: input.proposalV1.acceptanceCriteria.concat(
        'Both agree the timeline feels workable.'
      )
    },
    changeLog: ['Incorporated feedback into a clearer, softer draft.'],
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/refine_resolution_v2', input, {
      supportScope: 'refinement'
    });
    return refineSchema.parse(data);
  } catch {
    return fallback;
  }
}

export async function closeoutGuidance(
  input: CloseoutGuidanceInput
): Promise<CloseoutGuidanceResponse> {
  const fallback: CloseoutGuidanceResponse = {
    closureMessage: 'It is okay to pause here. You both showed up with care and clarity.',
    nextSteps: [
      'Take a little time before revisiting the plan.',
      'Return to the room if you want to clarify or revise anything together.'
    ],
    suggestedFollowUpWindowDays: 7,
    safetyFlag: SAFE_FLAG
  };

  try {
    const data = await callCat<unknown>('/custom/usmender/closeout_guidance', input, {
      supportScope: 'closeout'
    });
    return closeoutSchema.parse(data);
  } catch {
    return fallback;
  }
}
