import type { InviteDeliveryChannel } from './api';

export function inferInviteDeliveryChannel(value: string): InviteDeliveryChannel {
  return value.includes('@') ? 'EMAIL_LINK' : 'SMS_LINK';
}

export function syncInviteDeliveryChannel(
  value: string,
  current: InviteDeliveryChannel
): InviteDeliveryChannel {
  const trimmed = value.trim();
  if (!trimmed) {
    return current;
  }

  if (current === 'IN_APP' || current === 'IMESSAGE_HANDOFF') {
    return current;
  }

  return inferInviteDeliveryChannel(trimmed);
}
