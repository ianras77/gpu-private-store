import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const nodeSchema = z.object({
  id: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  label: z.string().trim().min(1).max(140),
  shape: z.enum(["process", "decision", "start", "end", "database", "document", "actor", "cloud"]).default("process"),
  detail: z.string().trim().max(180).optional()
});
const edgeSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
  label: z.string().trim().max(40).optional(),
  style: z.enum(["solid", "dashed", "dotted"]).default("solid")
});

export type DiagramNode = z.infer<typeof nodeSchema>;
export type DiagramEdge = z.infer<typeof edgeSchema>;
type Layout = "vertical" | "horizontal" | "grid";
type DiagramPosition = DiagramNode & { x: number; y: number; width: number; height: number };

const NODE_WIDTH = 190;
const NODE_HEIGHT = 104;
const GAP_X = 104;
const GAP_Y = 56;
const PAD_X = 48;
const PAD_Y = 64;

const palette: Record<DiagramNode["shape"], { fill: string; stroke: string; ink: string; drawioShape: string; excalidrawShape: string }> = {
  process: { fill: "#173b36", stroke: "#65c8a8", ink: "#f3f8f6", drawioShape: "rounded=1", excalidrawShape: "rectangle" },
  decision: { fill: "#45391a", stroke: "#e3bd62", ink: "#fff8df", drawioShape: "rhombus", excalidrawShape: "diamond" },
  start: { fill: "#183b2b", stroke: "#70c890", ink: "#effff3", drawioShape: "ellipse", excalidrawShape: "ellipse" },
  end: { fill: "#48282b", stroke: "#df7f83", ink: "#fff2f2", drawioShape: "ellipse", excalidrawShape: "ellipse" },
  database: { fill: "#173548", stroke: "#6bb9df", ink: "#eefaff", drawioShape: "shape=cylinder", excalidrawShape: "rectangle" },
  document: { fill: "#302848", stroke: "#a58be0", ink: "#f7f2ff", drawioShape: "shape=document", excalidrawShape: "rectangle" },
  actor: { fill: "#3b2943", stroke: "#d29ae8", ink: "#fff4ff", drawioShape: "shape=umlActor", excalidrawShape: "ellipse" },
  cloud: { fill: "#203747", stroke: "#81c8e8", ink: "#f1fbff", drawioShape: "ellipse", excalidrawShape: "ellipse" }
};

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character).replace(/\n/g, "&#xa;");
}

function svgEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

function hash32(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function shortId(value: string): string {
  return hash32(value).toString(36).padStart(7, "0").slice(-8);
}

function wrapLabel(value: string, max = 25, maxLines = 4): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const pieces = word.length > max ? word.match(new RegExp(`.{1,${max}}`, "g")) ?? [word] : [word];
    for (const piece of pieces) {
      if (line && `${line} ${piece}`.length > max) { lines.push(line); line = ""; }
      line = line ? `${line} ${piece}` : piece;
      if (lines.length === maxLines - 1 && pieces[pieces.length - 1] !== piece) break;
    }
    if (lines.length >= maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…?$/, "").slice(0, max - 1)}…`;
  return lines.length ? lines : [""];
}

function svgEdgeLabel(value: string, x: number, y: number): string {
  const lines = wrapLabel(value, 14, 3);
  const firstY = y - (lines.length - 1) * 9;
  return `<text class="diagram-edge-label" x="${x.toFixed(1)}" y="${firstY.toFixed(1)}" text-anchor="middle">${lines.map((line, index) => `<tspan x="${x.toFixed(1)}" dy="${index === 0 ? 0 : 18}">${svgEscape(line)}</tspan>`).join("")}</text>`;
}

function placeNodes(nodes: DiagramNode[], layout: Layout): { nodes: DiagramPosition[]; width: number; height: number } {
  const columns = layout === "vertical" ? 1 : layout === "horizontal" ? nodes.length : Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / columns);
  const positioned = nodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { ...node, x: PAD_X + column * (NODE_WIDTH + GAP_X), y: PAD_Y + row * (NODE_HEIGHT + GAP_Y), width: NODE_WIDTH, height: NODE_HEIGHT };
  });
  return { nodes: positioned, width: Math.max(720, PAD_X * 2 + columns * NODE_WIDTH + (columns - 1) * GAP_X), height: PAD_Y * 2 + rows * NODE_HEIGHT + (rows - 1) * GAP_Y };
}

function connection(source: DiagramPosition, target: DiagramPosition): { x1: number; y1: number; x2: number; y2: number; ux: number; uy: number } {
  const sx = source.x + source.width / 2; const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2; const ty = target.y + target.height / 2;
  if (source.id === target.id) return { x1: sx - 34, y1: source.y, x2: sx + 34, y2: source.y, ux: 0, uy: 1 };
  const dx = tx - sx; const dy = ty - sy;
  const length = Math.hypot(dx, dy) || 1; const ux = dx / length; const uy = dy / length;
  const endpoint = (node: DiagramPosition, dirX: number, dirY: number) => {
    if (node.shape === "decision") {
      const scale = 1 / (Math.abs(dirX) / (node.width / 2) + Math.abs(dirY) / (node.height / 2));
      return { x: node.x + node.width / 2 + dirX * scale, y: node.y + node.height / 2 + dirY * scale };
    }
    if (node.shape === "start" || node.shape === "end" || node.shape === "actor" || node.shape === "cloud") {
      const scale = 1 / Math.sqrt((dirX * dirX) / ((node.width / 2) ** 2) + (dirY * dirY) / ((node.height / 2) ** 2));
      return { x: node.x + node.width / 2 + dirX * scale, y: node.y + node.height / 2 + dirY * scale };
    }
    const scale = 1 / Math.max(Math.abs(dirX) / (node.width / 2), Math.abs(dirY) / (node.height / 2));
    return { x: node.x + node.width / 2 + dirX * scale, y: node.y + node.height / 2 + dirY * scale };
  };
  const from = endpoint(source, ux, uy); const to = endpoint(target, -ux, -uy);
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, ux, uy };
}

function makePreviewSvg(title: string, positioned: DiagramPosition[], edges: DiagramEdge[], width: number, height: number): string {
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const edgeMarkup = edges.map((edge, index) => {
    const from = byId.get(edge.from)!; const to = byId.get(edge.to)!;
    const line = connection(from, to); const dash = edge.style === "dashed" ? "8 6" : edge.style === "dotted" ? "2 6" : "";
    if (edge.from === edge.to) {
      const centerX = from.x + from.width / 2;
      const label = edge.label ? svgEdgeLabel(edge.label, centerX, from.y - 20) : "";
      return `<g class="diagram-edge"><path d="M${(centerX - 34).toFixed(1)} ${from.y}C${(centerX - 56).toFixed(1)} ${(from.y - 64).toFixed(1)} ${(centerX + 56).toFixed(1)} ${(from.y - 64).toFixed(1)} ${(centerX + 34).toFixed(1)} ${from.y}" fill="none" ${dash ? `stroke-dasharray="${dash}"` : ""}/><polygon points="${(centerX + 34).toFixed(1)},${from.y} ${(centerX + 30).toFixed(1)},${(from.y - 10).toFixed(1)} ${(centerX + 41).toFixed(1)},${(from.y - 8).toFixed(1)}"/>${label}</g>`;
    }
    const baseX = line.x2 - line.ux * 12; const baseY = line.y2 - line.uy * 12;
    const perpX = -line.uy * 5; const perpY = line.ux * 5;
    const label = edge.label ? svgEdgeLabel(edge.label, (line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2 - 8) : "";
    return `<g class="diagram-edge"><line x1="${line.x1.toFixed(1)}" y1="${line.y1.toFixed(1)}" x2="${baseX.toFixed(1)}" y2="${baseY.toFixed(1)}" ${dash ? `stroke-dasharray="${dash}"` : ""}/><polygon points="${line.x2.toFixed(1)},${line.y2.toFixed(1)} ${(baseX + perpX).toFixed(1)},${(baseY + perpY).toFixed(1)} ${(baseX - perpX).toFixed(1)},${(baseY - perpY).toFixed(1)}"/>${label}</g>`;
  }).join("");
  const nodeMarkup = positioned.map((node) => {
    const style = palette[node.shape]; const lines = wrapLabel([node.label, ...(node.detail ? [node.detail] : [])].join(" — "), 24, 4);
    const left = node.x; const top = node.y; const centerX = left + node.width / 2; const centerY = top + node.height / 2;
    let shape = `<rect class="diagram-node-shape" x="${left}" y="${top}" width="${node.width}" height="${node.height}" rx="12"/>`;
    if (node.shape === "decision") shape = `<polygon class="diagram-node-shape" points="${centerX},${top} ${left + node.width},${centerY} ${centerX},${top + node.height} ${left},${centerY}"/>`;
    else if (["start", "end", "actor", "cloud"].includes(node.shape)) shape = `<ellipse class="diagram-node-shape" cx="${centerX}" cy="${centerY}" rx="${node.width / 2}" ry="${node.height / 2}"/>`;
    else if (node.shape === "database") shape = `<path class="diagram-node-shape" d="M${left} ${top + 13}C${left} ${top - 5} ${left + node.width} ${top - 5} ${left + node.width} ${top + 13}V${top + node.height - 13}C${left + node.width} ${top + node.height + 5} ${left} ${top + node.height + 5} ${left} ${top + node.height - 13}Z"/>`;
    else if (node.shape === "document") shape = `<path class="diagram-node-shape" d="M${left} ${top}H${left + node.width - 23}L${left + node.width} ${top + 23}V${top + node.height}H${left}Z"/>`;
    const text = lines.map((line, index) => `<text class="diagram-node-label" x="${centerX}" y="${(centerY - (lines.length - 1) * 9 + index * 18).toFixed(1)}" text-anchor="middle">${svgEscape(line)}</text>`).join("");
    return `<g class="diagram-node ${node.shape}">${shape}${text}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="diagram-preview" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${svgEscape(title)}"><rect class="diagram-canvas" width="100%" height="100%"/><text class="diagram-title" x="${PAD_X}" y="40">${svgEscape(title)}</text>${edgeMarkup}${nodeMarkup}</svg>`;
}

function makeDrawioXml(title: string, positioned: DiagramPosition[], edges: DiagramEdge[], width: number, height: number): string {
  const cells = positioned.map((node) => {
    const color = palette[node.shape];
    const id = `node_${node.id}`;
    const shape = `${color.drawioShape};whiteSpace=wrap;html=1;fillColor=${color.fill};strokeColor=${color.stroke};fontColor=${color.ink};fontSize=14;align=center;verticalAlign=middle;spacing=8;`;
    const label = xmlEscape([node.label, ...(node.detail ? [node.detail] : [])].join("\n"));
    return `<mxCell id="${id}" value="${label}" style="${shape}" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/></mxCell>`;
  });
  const byId = new Map(positioned.map((node) => [node.id, node]));
  edges.forEach((edge, index) => {
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeWidth=2;strokeColor=#8ca9a1;fontColor=#314a44;fontSize=12;${edge.style === "dashed" ? "dashed=1;" : edge.style === "dotted" ? "dashed=1;dashPattern=1 4;" : ""}`;
    cells.push(`<mxCell id="edge_${index + 1}" value="${xmlEscape(edge.label ?? "")}" style="${style}" edge="1" parent="1" source="node_${byId.get(edge.from)!.id}" target="node_${byId.get(edge.to)!.id}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  });
  const diagramId = shortId(title);
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Rassy Online" version="24.7.17" type="device"><diagram id="${diagramId}" name="${xmlEscape(title.slice(0, 31))}"><mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

type ExcalidrawElement = Record<string, unknown> & { id: string };
function makeExcalidrawJson(title: string, positioned: DiagramPosition[], edges: DiagramEdge[], layout: Layout, width: number, height: number): string {
  const now = Date.now();
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const bound = new Map(positioned.map((node) => [node.id, [] as Array<{ id: string; type: "text" | "arrow" }>]));
  const arrows = edges.map((edge, index): ExcalidrawElement => {
    const source = byId.get(edge.from)!; const target = byId.get(edge.to)!;
    const sourceId = `n_${shortId(source.id)}`; const targetId = `n_${shortId(target.id)}`;
    const elementId = `e_${index.toString(36)}_${shortId(`${edge.from}:${edge.to}:${index}`)}`;
    bound.get(edge.from)!.push({ id: elementId, type: "arrow" });
    if (edge.to !== edge.from) bound.get(edge.to)!.push({ id: elementId, type: "arrow" });
    const sourceX = source.x + source.width / 2; const sourceY = source.y + source.height / 2;
    const targetX = target.x + target.width / 2; const targetY = target.y + target.height / 2;
    const loop = edge.from === edge.to;
    const originX = loop ? sourceX - 48 : Math.min(sourceX, targetX);
    const originY = loop ? source.y - 54 : Math.min(sourceY, targetY);
    const points: Array<[number, number]> = loop
      ? [[0, 54], [0, 0], [96, 0], [96, 54]]
      : [[sourceX - originX, sourceY - originY], [targetX - originX, targetY - originY]];
    return { id: elementId, type: "arrow", x: originX, y: originY, width: loop ? 96 : Math.abs(targetX - sourceX), height: loop ? 54 : Math.abs(targetY - sourceY), angle: 0, strokeColor: "#8ca9a1", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: edge.style === "solid" ? "solid" : "dashed", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: hash32(elementId), version: 1, versionNonce: hash32(`${elementId}:nonce`), isDeleted: false, boundElements: edge.label ? [{ id: `et_${shortId(elementId)}`, type: "text" }] : [], updated: now, created: now, link: null, locked: false, points, startBinding: { elementId: sourceId, focus: 0, gap: 4 }, endBinding: { elementId: targetId, focus: 0, gap: 4 }, startArrowhead: null, endArrowhead: "arrow", elbowed: !loop && layout !== "horizontal", moveMidPointsWithElement: true };
  });
  const edgeLabels = edges.flatMap((edge, index): ExcalidrawElement[] => {
    if (!edge.label) return [];
    const source = byId.get(edge.from)!; const target = byId.get(edge.to)!;
    const x = edge.from === edge.to ? source.x + source.width / 2 : (source.x + target.x) / 2 + NODE_WIDTH / 2;
    const lines = wrapLabel(edge.label, 14, 3);
    const labelWidth = 96;
    const labelHeight = lines.length * 18;
    const y = edge.from === edge.to ? source.y - 68 : (source.y + target.y) / 2 + NODE_HEIGHT / 2 - labelHeight / 2;
    const id = `et_${shortId(`e_${index.toString(36)}_${edge.from}:${edge.to}:${index}`)}`;
    return [{ id, type: "text", x: x - labelWidth / 2, y, width: labelWidth, height: labelHeight, angle: 0, strokeColor: "#d0ded9", backgroundColor: "#0b0d0d", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, index: `a${(index + 1).toString(36)}`, roundness: null, seed: hash32(id), version: 1, versionNonce: hash32(`${id}:nonce`), isDeleted: false, boundElements: [], updated: now, created: now, link: null, locked: false, text: lines.join("\n"), fontSize: 14, fontFamily: 2, textAlign: "center", verticalAlign: "middle", containerId: null, originalText: edge.label, autoResize: false, lineHeight: 1.25 }];
  });
  const shapes = positioned.flatMap((node): ExcalidrawElement[] => {
    const colors = palette[node.shape]; const shapeId = `n_${shortId(node.id)}`; const textId = `t_${shortId(node.id)}`;
    const labelText = [node.label, ...(node.detail ? [node.detail] : [])].join("\n");
    const fillStyle = "solid";
    const common = { x: node.x, y: node.y, width: node.width, height: node.height, angle: 0, strokeColor: colors.stroke, backgroundColor: colors.fill, fillStyle, strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, seed: hash32(shapeId), version: 1, versionNonce: hash32(`${shapeId}:nonce`), isDeleted: false, boundElements: [{ id: textId, type: "text" }, ...bound.get(node.id)!], updated: now, created: now, link: null, locked: false };
    const shape: ExcalidrawElement = { id: shapeId, type: colors.excalidrawShape, ...common };
    const lines = wrapLabel(labelText, 19, 4);
    const text: ExcalidrawElement = { id: textId, type: "text", x: node.x + 8, y: node.y + Math.max(6, (node.height - lines.length * 22) / 2), width: node.width - 16, height: Math.min(node.height - 12, lines.length * 22), angle: 0, strokeColor: colors.ink, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, index: `a${(positioned.indexOf(node) + 1).toString(36)}`, roundness: null, seed: hash32(textId), version: 1, versionNonce: hash32(`${textId}:nonce`), isDeleted: false, boundElements: [], updated: now, created: now, link: null, locked: false, fontSize: 18, fontFamily: 2, text: lines.join("\n"), originalText: labelText, textAlign: "center", verticalAlign: "middle", containerId: shapeId, autoResize: false, lineHeight: 1.25 };
    return [shape, text];
  });
  return JSON.stringify({ type: "excalidraw", version: 2, source: "https://draw.rasies.com/", elements: [...arrows, ...edgeLabels, ...shapes], appState: { gridSize: null, viewBackgroundColor: "#0b0d0d" }, files: {} }, null, 2);
}

export function buildDiagramFiles(input: { title: string; nodes: DiagramNode[]; edges: DiagramEdge[]; layout: Layout }) {
  const placed = placeNodes(input.nodes, input.layout);
  return {
    previewSvg: makePreviewSvg(input.title, placed.nodes, input.edges, placed.width, placed.height),
    drawioXml: makeDrawioXml(input.title, placed.nodes, input.edges, placed.width, placed.height),
    excalidrawJson: makeExcalidrawJson(input.title, placed.nodes, input.edges, input.layout, placed.width, placed.height),
    nodeCount: input.nodes.length,
    connectionCount: input.edges.length,
    width: placed.width,
    height: placed.height
  };
}

export const diagramInputSchema = z.object({
  title: z.string().trim().min(1).max(140),
  layout: z.enum(["vertical", "horizontal", "grid"]).default("grid"),
  nodes: z.array(nodeSchema).min(1).max(24),
  edges: z.array(edgeSchema).max(60).default([])
}).superRefine((input, ctx) => {
  const ids = new Set<string>();
  input.nodes.forEach((node, index) => {
    if (ids.has(node.id)) ctx.addIssue({ code: "custom", message: `node id '${node.id}' is duplicated`, path: ["nodes", index, "id"] });
    ids.add(node.id);
  });
  input.edges.forEach((edge, index) => {
    if (!ids.has(edge.from)) ctx.addIssue({ code: "custom", message: `unknown source node '${edge.from}'`, path: ["edges", index, "from"] });
    if (!ids.has(edge.to)) ctx.addIssue({ code: "custom", message: `unknown target node '${edge.to}'`, path: ["edges", index, "to"] });
  });
});

export const diagramStudioTool = createTool({
  id: "diagram-studio",
  description: "Create a complete, editable diagram for the Rasies diagram and drawing services. Use diagramStudio when users ask for a flowchart, architecture, workflow, sequence, ER, org chart, mind map, decision tree, system map, or visual plan. Return both native draw.io XML (one-click opens directly in https://diagram.rasies.com) and a native Excalidraw .excalidraw scene (download and open in https://draw.rasies.com), plus an in-chat SVG preview. Define every node with a stable id and concise visible label; put explanatory text in detail; connect them with directed edges and labels. Choose vertical for top-to-bottom flow, horizontal for a short sequence, grid for maps. Do not invent facts or relationships. Include the relevant steps, actors, systems, data stores, branches, and labeled decisions so the result is useful and editable. Keep diagrams to at most 24 nodes and 60 connections; split larger systems into overview and detail diagrams.",
  inputSchema: diagramInputSchema,
  outputSchema: z.object({ kind: z.literal("service-diagram"), title: z.string(), layout: z.string(), previewSvg: z.string(), drawioXml: z.string(), excalidrawJson: z.string(), nodeCount: z.number(), connectionCount: z.number(), width: z.number(), height: z.number(), diagramUrl: z.literal("https://diagram.rasies.com"), drawUrl: z.literal("https://draw.rasies.com") }),
  execute: async ({ title, layout, nodes, edges }) => ({ kind: "service-diagram" as const, title, layout, ...buildDiagramFiles({ title, layout, nodes, edges }), diagramUrl: "https://diagram.rasies.com" as const, drawUrl: "https://draw.rasies.com" as const })
});
