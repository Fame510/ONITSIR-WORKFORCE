#!/usr/bin/env node
/**
 * Static build step for GitHub Pages (unified).
 *
 * Ported from agentosirus/scripts/build-agent-index.mjs and extended per
 * SYNERGY #1 (Unify the specialist roster into one source of truth):
 *
 *   - BUG FIX: the original `divisions` array excluded `strategy/` and most
 *     of `integrations/` despite those directories having real persona
 *     files. Both are now included, so agents inside them are indexed and
 *     show up in GET /api/divisions / GET /api/agents.
 *   - NEW: also emits `public/roster.json` in the EXACT shape
 *     onitsir-core's `Roster.load()` expects (id/name/category/description/
 *     keywords/persona_path), using the same stopword-based
 *     keyword-extraction approach as ONITSIR's original
 *     `scripts/gen_roster.py` (lowercased word tokens from the
 *     name+description, minus a stopword list, deduped).
 *
 * Output:
 *   public/agents-index.json   -> metadata for every agent (no bodies)
 *   public/agents-content/*.md -> the system prompt body for each agent
 *   public/roster.json         -> onitsir-core-shaped roster (SYNERGY #1)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public");
const CONTENT_DIR = path.join(OUT_DIR, "agents-content");
const PERSONA_ROOT = path.join(ROOT, "personas");

// SYNERGY #1 bug fix: "strategy" and "integrations" are now included --
// previously excluded despite having real persona markdown files.
const divisions = [
  { id: "engineering", name: "Engineering Division", emoji: "\u{1F4BB}", color: "sky", description: "Building the future, one commit at a time." },
  { id: "design", name: "Design Division", emoji: "\u{1F3A8}", color: "pink", description: "Making it beautiful, usable, and delightful." },
  { id: "paid-media", name: "Paid Media Division", emoji: "\u{1F4B0}", color: "emerald", description: "Turning ad spend into measurable business outcomes." },
  { id: "sales", name: "Sales Division", emoji: "\u{1F4BC}", color: "indigo", description: "Turning pipeline into revenue through craft." },
  { id: "marketing", name: "Marketing Division", emoji: "\u{1F4E2}", color: "orange", description: "Growing your audience, one authentic interaction at a time." },
  { id: "product", name: "Product Division", emoji: "\u{1F680}", color: "purple", description: "Building the right thing at the right time." },
  { id: "project-management", name: "Project Management", emoji: "\u{1F3AC}", color: "cyan", description: "Keeping the trains running on time (and under budget)." },
  { id: "testing", name: "Testing Division", emoji: "\u{1F9EA}", color: "red", description: "Breaking things so users don't have to." },
  { id: "support", name: "Support Division", emoji: "\u{1F6E0}", color: "teal", description: "The backbone of the operation." },
  { id: "spatial-computing", name: "Spatial Computing", emoji: "\u{1F97D}", color: "violet", description: "Building the immersive future." },
  { id: "specialized", name: "Specialized Division", emoji: "\u{1F3AF}", color: "yellow", description: "The unique specialists who don't fit in a box." },
  { id: "game-development", name: "Game Development", emoji: "\u{1F3AE}", color: "rose", description: "Building worlds, systems, and experiences." },
  // --- SYNERGY #1 bug fix: previously missing from this array ---
  { id: "strategy", name: "Strategy Division", emoji: "\u{1F9ED}", color: "amber", description: "Charting the course before anyone starts building." },
  { id: "integrations", name: "Integrations Division", emoji: "\u{1F50C}", color: "lime", description: "Wiring the agency into every tool it needs." }
];

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out = out.concat(walk(full));
    else if (entry.endsWith(".md") && !entry.toLowerCase().endsWith("readme.md")) out.push(full);
  }
  return out;
}

function titleCase(id, category) {
  const stripped = id.replace(new RegExp("^" + category + "-"), "");
  return stripped.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAgentFile(filePath, category) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const id = path.basename(filePath, ".md");
  const frontmatter = {};
  let content = raw;

  if (raw.startsWith("---")) {
    const parts = raw.split("---");
    if (parts.length >= 3) {
      for (const line of parts[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      content = parts.slice(2).join("---").trim();
    }
  }

  return {
    id,
    name: frontmatter.name || titleCase(id, category),
    description: frontmatter.description || "Specialized AI Agent within The Agency.",
    color: frontmatter.color || "indigo",
    emoji: frontmatter.emoji || "\u{1F916}",
    vibe: frontmatter.vibe || "",
    category,
    filePath: "/" + path.relative(ROOT, filePath).split(path.sep).join("/"),
    content
  };
}

// --- SYNERGY #1: stopword-based keyword extraction, mirroring ONITSIR's
// original scripts/gen_roster.py approach (lowercase word tokens from the
// name+description, minus a stopword list, deduped, order-preserving). ---
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "for", "to", "with",
  "is", "are", "who", "specializing", "specialized", "expert", "focused",
  "within", "into", "at", "by", "as", "this", "that", "your", "you", "will",
  "master", "masters", "their", "its", "it's"
]);

function extractKeywords(name, description, category) {
  const text = (category + " " + name + " " + description).toLowerCase();
  const words = text.match(/[a-z][a-z0-9+#-]{1,}/g) || [];
  const seen = new Set();
  const keywords = [];
  for (const w of words) {
    if (STOPWORDS.has(w) || w.length < 3) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    keywords.push(w);
  }
  return keywords;
}

fs.mkdirSync(CONTENT_DIR, { recursive: true });
for (const stale of fs.readdirSync(CONTENT_DIR)) {
  if (stale.endsWith(".md")) fs.unlinkSync(path.join(CONTENT_DIR, stale));
}

const index = [];
const rosterRecords = []; // SYNERGY #1: onitsir-core-shaped output
const seen = new Set();

for (const div of divisions) {
  for (const filePath of walk(path.join(PERSONA_ROOT, div.id))) {
    const agent = parseAgentFile(filePath, div.id);
    let slug = agent.id;
    if (seen.has(slug)) slug = div.id + "--" + agent.id;
    seen.add(slug);

    fs.writeFileSync(path.join(CONTENT_DIR, slug + ".md"), agent.content, "utf-8");
    const { content, ...meta } = agent;
    index.push({ ...meta, contentFile: slug + ".md" });

    // SYNERGY #1: onitsir-core's Roster.load() shape.
    const personaRelPath = path.relative(PERSONA_ROOT, filePath).split(path.sep).join("/");
    rosterRecords.push({
      id: agent.id,
      name: agent.name,
      category: agent.category,
      description: agent.description,
      keywords: extractKeywords(agent.name, agent.description, agent.category),
      persona_path: personaRelPath
    });
  }
}

index.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
rosterRecords.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

fs.writeFileSync(path.join(OUT_DIR, "agents-index.json"), JSON.stringify({ divisions, agents: index }, null, 0), "utf-8");
fs.writeFileSync(path.join(OUT_DIR, "roster.json"), JSON.stringify(rosterRecords, null, 2), "utf-8");
fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "", "utf-8");

console.log("Indexed " + index.length + " agents across " + divisions.length + " divisions.");
console.log("Wrote onitsir-core-shaped roster.json with " + rosterRecords.length + " records (SYNERGY #1).");
