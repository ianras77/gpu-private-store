import { resolveRassyChannel, type RassyRequestContext } from "@rassys/mr-rassy-core";

export const isAgentAllowedForContext = (
  agentId: string,
  context: RassyRequestContext | undefined,
): boolean => {
  if (!context) return true;
  const channel = resolveRassyChannel(context.channelId);
  if (!channel || !channel.allowedAgentIds.includes(agentId)) return false;
  if (channel.visibility === "admin" && !context.permissions.includes("admin")) return false;
  if (channel.visibility === "family" && !["family", "admin"].some((role) => context.viewer.kind === role || context.viewer.roles.includes(role))) return false;
  return true;
};
