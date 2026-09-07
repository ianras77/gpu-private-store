export type McpServerDefinition = { id: string; url: string; enabled: boolean; privileged: boolean; allowedRoles: string[] };
/** MCP is opt-in; no privileged server is enabled by default. */
export const mcpRegistry: McpServerDefinition[] = [];
