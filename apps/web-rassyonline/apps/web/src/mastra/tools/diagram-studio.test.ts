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
    expect(output.mermaid).toContain("flowchart TD");
    expect(output.mermaid).toContain('n_2{"Validate payment — Check card and stock"}');
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

  it("auto-layers nodes from their connections and keeps feedback cycles bounded", () => {
    const input = diagramInputSchema.parse({
      title: "Pipeline",
      nodes: [
        { id: "target", label: "Target", shape: "end" },
        { id: "isolated", label: "Independent" },
        { id: "source", label: "Source", shape: "start" },
        { id: "middle", label: "Middle" }
      ],
      edges: [{ from: "source", to: "middle" }, { from: "middle", to: "target" }, { from: "target", to: "source", label: "feedback" }]
    });
    expect(input.layout).toBe("auto");
    const output = buildDiagramFiles(input);
    const nodeY = (id: string) => Number(output.drawioXml.match(new RegExp(`<mxCell id="node_${id}"[\\s\\S]*?<mxGeometry x="[^"]+" y="([^"]+)"`))?.[1]);

    expect(nodeY("source")).toBeLessThan(nodeY("middle"));
    expect(nodeY("middle")).toBeLessThan(nodeY("target"));
    expect(output.height).toBeLessThan(1_000);
    expect(output.previewSvg).not.toMatch(/NaN|Infinity/);
  });

  it("preserves connector direction and line style in draw.io, Excalidraw, Mermaid, and SVG", () => {
    const input = diagramInputSchema.parse({
      title: "Service links",
      layout: "horizontal",
      nodes: [{ id: "api", label: "API" }, { id: "queue", label: "Queue", shape: "database" }],
      edges: [
        { from: "api", to: "queue", label: "publish", direction: "forward", style: "solid" },
        { from: "api", to: "queue", label: "consume", direction: "backward", style: "dashed" },
        { from: "api", to: "queue", label: "sync", direction: "both", style: "solid" },
        { from: "api", to: "queue", label: "related", direction: "none", style: "dotted" }
      ]
    });
    const output = buildDiagramFiles(input);
    const scene = JSON.parse(output.excalidrawJson) as { elements: Array<{ type: string; startArrowhead?: string | null; endArrowhead?: string | null }> };
    const arrows = scene.elements.filter((element) => element.type === "arrow");

    expect(arrows).toHaveLength(4);
    expect(arrows.map(({ startArrowhead, endArrowhead }) => [startArrowhead, endArrowhead])).toEqual([
      [null, "arrow"], ["arrow", null], ["arrow", "arrow"], [null, null]
    ]);
    expect(output.drawioXml).toContain("startArrow=block;startFill=1;endArrow=block");
    expect(output.drawioXml).toContain("startArrow=none;startFill=1;endArrow=none");
    expect(output.mermaid).toContain("n_1 -->|publish| n_2");
    expect(output.mermaid).toContain("n_2 -.->|consume| n_1");
    expect(output.mermaid).toContain("n_1 <-->|sync| n_2");
    expect(output.mermaid).toContain("n_1 -..-|related| n_2");
    expect(output.previewSvg.match(/<polygon points=/g)).toHaveLength(4);
  });

  it("escapes Mermaid labels and exports every node with a parser-safe identifier", () => {
    const input = diagramInputSchema.parse({
      title: "A & B",
      layout: "auto",
      nodes: [{ id: "end", label: 'API "one" <ready>', shape: "actor" }, { id: "2-next", label: "Done" }],
      edges: [{ from: "end", to: "2-next", label: "ready & safe" }]
    });
    const output = buildDiagramFiles(input);

    expect(output.mermaid).toContain('n_1>"API #quot;one#quot; &lt;ready&gt;"]');
    expect(output.mermaid).toContain("n_2");
    expect(output.mermaid).toContain("ready &amp; safe");
    expect(output.mermaid).not.toContain("end[");
  });
});
