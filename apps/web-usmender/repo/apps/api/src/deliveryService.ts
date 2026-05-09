import { Buffer } from 'node:buffer';

export type DeliveryAttemptStatus = 'PENDING' | 'SIMULATED' | 'SENT' | 'DELIVERED' | 'FAILED';
export type DeliveryChannel = 'IN_APP' | 'SMS_LINK' | 'EMAIL_LINK' | 'IMESSAGE_HANDOFF';

type InviteDeliveryInput = {
  inviteToken: string;
  sessionId: string;
  topic: string;
  destination: string;
  deliveryChannel: DeliveryChannel;
};

export type DeliveryResult = {
  provider: string;
  status: DeliveryAttemptStatus;
  recipient: string;
  providerMessageId?: string;
  payload?: Record<string, unknown>;
  errorMessage?: string;
  sentAt?: Date;
  deliveredAt?: Date;
};

function getPublicWebUrl() {
  return (process.env.USMENDER_PUBLIC_WEB_URL ?? 'http://localhost:3294').replace(/\/$/, '');
}

export function buildInviteUrl(inviteToken: string) {
  return `${getPublicWebUrl()}/invites/${inviteToken}`;
}

export function buildSessionLoginUrl(sessionId: string) {
  return `${getPublicWebUrl()}/login?next=${encodeURIComponent(`/sessions/${sessionId}`)}`;
}

export function maskDestination(destination: string) {
  if (destination.includes('@')) {
    const [localPart = '', domain = ''] = destination.split('@');
    const visibleLocal =
      localPart.length <= 2 ? `${localPart[0] ?? ''}*` : `${localPart.slice(0, 2)}***`;
    return `${visibleLocal}@${domain}`;
  }

  const digits = destination.replace(/\D/g, '');
  if (digits.length <= 4) {
    return `***${digits}`;
  }

  return `***${digits.slice(-4)}`;
}

function buildInviteShareText(input: InviteDeliveryInput) {
  const inviteUrl = buildInviteUrl(input.inviteToken);
  return `You are invited to a calm, mediated USMender conversation about "${input.topic}". Join here: ${inviteUrl}`;
}

function buildMessageNudgeText(sessionId: string, topic: string) {
  const loginUrl = buildSessionLoginUrl(sessionId);
  return `A new mediated message is waiting for you in USMender about "${topic}". Open the room: ${loginUrl}`;
}

function getSmsProvider() {
  return (process.env.USMENDER_SMS_PROVIDER ?? 'console').toLowerCase();
}

function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    statusCallbackUrl: process.env.USMENDER_TWILIO_STATUS_CALLBACK_URL
  };
}

function canSendTwilioSms() {
  const config = getTwilioConfig();
  return Boolean(
    config.accountSid &&
      config.authToken &&
      (config.fromNumber || config.messagingServiceSid)
  );
}

async function sendTwilioSms(to: string, body: string): Promise<DeliveryResult> {
  const config = getTwilioConfig();

  if (!config.accountSid || !config.authToken || (!config.fromNumber && !config.messagingServiceSid)) {
    return {
      provider: 'twilio',
      status: 'FAILED',
      recipient: to,
      errorMessage: 'Twilio is selected but not fully configured.'
    };
  }

  const payload = new URLSearchParams({
    To: to,
    Body: body
  });

  if (config.messagingServiceSid) {
    payload.set('MessagingServiceSid', config.messagingServiceSid);
  } else if (config.fromNumber) {
    payload.set('From', config.fromNumber);
  }

  if (config.statusCallbackUrl) {
    payload.set('StatusCallback', config.statusCallbackUrl);
  }

  const authValue = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authValue}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    }
  );

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    return {
      provider: 'twilio',
      status: 'FAILED',
      recipient: to,
      errorMessage:
        typeof data.message === 'string' ? data.message : `Twilio request failed (${response.status}).`,
      payload: {
        responseStatus: response.status
      }
    };
  }

  const providerMessageId = typeof data.sid === 'string' ? data.sid : null;

  return {
    provider: 'twilio',
    status: 'SENT',
    recipient: to,
    ...(providerMessageId ? { providerMessageId } : {}),
    sentAt: new Date(),
    payload: data
  };
}

export async function sendInviteLink(input: InviteDeliveryInput): Promise<DeliveryResult> {
  const shareText = buildInviteShareText(input);
  const inviteUrl = buildInviteUrl(input.inviteToken);

  if (input.deliveryChannel !== 'SMS_LINK') {
    return {
      provider: input.deliveryChannel === 'IMESSAGE_HANDOFF' ? 'handoff' : 'console',
      status: 'SIMULATED',
      recipient: input.destination,
      sentAt: new Date(),
      payload: {
        inviteUrl,
        shareText,
        deliveryChannel: input.deliveryChannel
      }
    };
  }

  if (getSmsProvider() === 'twilio' && canSendTwilioSms()) {
    return sendTwilioSms(input.destination, shareText);
  }

  return {
    provider: getSmsProvider(),
    status: 'SIMULATED',
    recipient: input.destination,
    sentAt: new Date(),
    payload: {
      inviteUrl,
      shareText,
      deliveryChannel: input.deliveryChannel
    }
  };
}

export async function sendMessageNudge(input: {
  sessionId: string;
  topic: string;
  destination: string;
}): Promise<DeliveryResult> {
  const shareText = buildMessageNudgeText(input.sessionId, input.topic);

  if (getSmsProvider() === 'twilio' && canSendTwilioSms()) {
    return sendTwilioSms(input.destination, shareText);
  }

  return {
    provider: getSmsProvider(),
    status: 'SIMULATED',
    recipient: input.destination,
    sentAt: new Date(),
    payload: {
      shareText,
      loginUrl: buildSessionLoginUrl(input.sessionId)
    }
  };
}
