/**
 * Live activity bus.
 *
 * The mind map subscribes to this to visualise what agents are doing in real
 * time. Any part of the app can publish node/edge updates without prop drilling.
 */
export type NodeState = "idle" | "thinking" | "streaming" | "done" | "error";

export interface MindNode {
  id: string;
  label: string;
  emoji: string;
  state: NodeState;
  detail: string;
  provider?: string;
  model?: string;
  startedAt: number;
  endedAt?: number;
  tokens?: number;
}

export interface MindEdge {
  from: string;
  to: string;
}

export interface MindGraph {
  title: string;
  nodes: MindNode[];
  edges: MindEdge[];
  running: boolean;
}

type Listener = (graph: MindGraph) => void;

const listeners = new Set<Listener>();

let graph: MindGraph = { title: "Idle", nodes: [], edges: [], running: false };

function emit(): void {
  const snapshot: MindGraph = {
    title: graph.title,
    running: graph.running,
    nodes: graph.nodes.map((n) => ({ ...n })),
    edges: graph.edges.map((e) => ({ ...e }))
  };
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeGraph(fn: Listener): () => void {
  listeners.add(fn);
  fn(graph);
  return () => listeners.delete(fn);
}

export function getGraph(): MindGraph {
  return graph;
}

export function startRun(title: string): void {
  graph = { title, nodes: [], edges: [], running: true };
  emit();
}

export function endRun(): void {
  graph.running = false;
  graph.nodes.forEach((n) => {
    if (n.state === "thinking" || n.state === "streaming") {
      n.state = "done";
      n.endedAt = Date.now();
    }
  });
  emit();
}

export function addNode(node: Omit<MindNode, "startedAt">): void {
  const existing = graph.nodes.find((n) => n.id === node.id);
  if (existing) {
    Object.assign(existing, node);
  } else {
    graph.nodes.push({ ...node, startedAt: Date.now() });
  }
  emit();
}

export function updateNode(id: string, patch: Partial<MindNode>): void {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return;
  Object.assign(node, patch);
  if (patch.state === "done" || patch.state === "error") node.endedAt = Date.now();
  emit();
}

export function linkNodes(from: string, to: string): void {
  if (graph.edges.some((e) => e.from === from && e.to === to)) return;
  graph.edges.push({ from, to });
  emit();
}

export function resetGraph(): void {
  graph = { title: "Idle", nodes: [], edges: [], running: false };
  emit();
}
