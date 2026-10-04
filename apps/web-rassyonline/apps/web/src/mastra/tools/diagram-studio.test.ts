import { describe, expect, it } from "vitest";
import { buildDiagramFiles, diagramInputSchema } from "./diagram-studio";

const sample = {
  title: "Local order flow",
  layout: "grid" as const,
  nodes: [
    { id: "start", label: "Customer submits order", shape: "start" as const },
    { id: "validate", label: "Validate payment", shape: "decision" as const, detail: "Check card and stock" },
    { id: "store", label: "Order database", shape: "database" as const },
    { id: "finish", label: "Confirm order", shape: "end" as const }
  ],
  edges: [
    { from: "start", to: "validate", label: "new order", style: "solid" as const },
    { from: "validate", to: "store", label: "approved", style: "solid" as const },
    { from: "validate", to: "start", label: "declined", style: "dashed" as const },
    { from: "store", to: "finish", style: "solid" as const }
  ]
};

describe("diagram studio native service formats", () => {
  it("produces a preview, editable draw.io XML, and an Excalidraw scene with connected shapes", () => {
    const parsed = diagramInputSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const output = buildDiagramFiles(parsed.data);
    const scene = JSON.parse(output.excalidrawJson) as { type: string; version: number; elements: Array<Record<string, unknown>>; appState: { viewBackgroundColor: string }; files: Record<string, unknown> };
    const elementIds = new Set(scene.elements.map((element) => element.id));
    const arrows = scene.elements.filter((element) => element.type === "arrow");

    expect(output).toMatchObject({ nodeCount: 4, connectionCount: 4 });
    expect(output.previewSvg).toContain('role="img"');
    expect(output.previewSvg).toContain("Customer submits order");
    expect(output.drawioXml).toContain("<mxGraphModel");
    expect(output.drawioXml.match(/vertex="1"/g)).toHaveLength(4);
    expect(output.drawioXml.match(/edge="1"/g)).toHaveLength(4);
    expect(scene).toMatchObject({ type: "excalidraw", version: 2, files: {} });
    expect(scene.appState.viewBackgroundColor).toBe("#0b0d0d");
    expect(scene.elements.filter((element) => element.type === "text" && element.containerId).length).toBe(4);
    expect(arrows).toHaveLength(4);
    for (const arrow of arrows) {
      expect(elementIds.has((arrow.startBinding as { elementId: string }).elementId)).toBe(true);
      expect(elementIds.has((arrow.endBinding as { elementId: string }).elementId)).toBe(true);
      expect(arrow.points).toEqual(expect.arrayContaining([expect.arrayContaining([expect.any(Number), expect.any(Number)])]));
      expect(Number.isFinite(arrow.width)).toBe(true);
      expect(Number.isFinite(arrow.height)).toBe(true);
    }
  });

  it("escapes user labels for XML and SVG while preserving readable text in the native scene", () => {
    const unsafeLabel = "<script>alert(1)</script> & approve";
    const input = diagramInputSchema.parse({
      title: "A & B",
      layout: "vertical",
      nodes: [{ id: "one", label: unsafeLabel }, { id: "two", label: "Finish" }],
      edges: [{ from: "one", to: "two", label: "safe < yes" }]
    });
    const output = buildDiagramFiles(input);
    const scene = JSON.parse(output.excalidrawJson) as { elements: Array<{ text?: string; originalText?: string }> };

    expect(output.previewSvg).not.toContain("<script>");
    expect(output.previewSvg).toContain("&lt;script&gt;");
    expect(output.drawioXml).not.toContain("<script>");
    expect(output.drawioXml).toContain("&lt;script&gt;");
    expect(scene.elements.some((element) => element.originalText === unsafeLabel)).toBe(true);
  });

  it("rejects duplicate ids and connections that point outside the supplied node set", () => {
    expect(diagramInputSchema.safeParse({ ...sample, nodes: [sample.nodes[0], sample.nodes[0]] }).success).toBe(false);
    expect(diagramInputSchema.safeParse({ ...sample, edges: [{ from: "missing", to: "finish" }] }).success).toBe(false);
    expect(diagramInputSchema.safeParse({ ...sample, edges: [{ from: "start", to: "finish", label: "x".repeat(41) }] }).success).toBe(false);
  });

  it("wraps concise connection labels inside the space between nodes", () => {
    const label = "Payment service approves transaction";
    const input = diagramInputSchema.parse({
      title: "Approval flow",
      layout: "vertical",
      nodes: [{ id: "start", label: "Request" }, { id: "finish", label: "Approved" }],
      edges: [{ from: "start", to: "finish", label }]
    });
    const output = buildDiagramFiles(input);
    const scene = JSON.parse(output.excalidrawJson) as { elements: Array<{ type: string; text?: string; originalText?: string; width?: number }> };
    const edgeLabel = scene.elements.find((element) => element.type === "text" && element.originalText === label);

    expect(output.previewSvg.match(/<tspan/g)).toHaveLength(3);
    expect(edgeLabel?.text?.split("\n")).toHaveLength(3);
    expect(edgeLabel?.width).toBeLessThanOrEqual(96);
  });

  it("keeps self loops and connections routed in any direction finite and represented", () => {
    const input = diagramInputSchema.parse({
      title: "Feedback loop",
      layout: "horizontal",
      nodes: [{ id: "a", label: "Retry" }, { id: "b", label: "Recover" }],
      edges: [{ from: "a", to: "a", label: "again" }, { from: "b", to: "a", label: "back" }]
    });
    const output = buildDiagramFiles(input);
    const scene = JSON.parse(output.excalidrawJson) as { elements: Array<Record<string, unknown>> };
    const arrows = scene.elements.filter((element) => element.type === "arrow");

    expect(arrows).toHaveLength(2);
    expect(output.previewSvg).toContain("C");
    expect(output.previewSvg).not.toMatch(/NaN|Infinity/);
    expect(output.drawioXml).not.toMatch(/NaN|Infinity/);
    for (const arrow of arrows) expect((arrow.points as number[][]).flat().every(Number.isFinite)).toBe(true);
  });
});
