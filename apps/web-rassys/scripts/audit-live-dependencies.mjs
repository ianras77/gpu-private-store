import { spawnSync } from "node:child_process";

const liveProjects = [
  "web",
  "radio-controller",
  "rassy-intelligence",
  "minecraft-bridge",
  "cheshire-proxy",
];

function run(args) {
  const result = spawnSync("pnpm", args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  return result;
}

function parseJson(result, label) {
  const objectStart = result.stdout.indexOf("{");
  const arrayStart = result.stdout.indexOf("[");
  const isArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
  const start = isArray ? arrayStart : objectStart;
  const end = result.stdout.lastIndexOf(isArray ? "]" : "}");
  if (start < 0 || end < start) {
    throw new Error(`${label} returned no JSON: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.slice(start, end + 1));
}

function collectProductionVersions(project) {
  const result = run([
    "--filter",
    project,
    "list",
    "--prod",
    "--depth",
    "100",
    "--json",
  ]);
  if (result.status !== 0) {
    throw new Error(`Could not inspect production dependencies for ${project}: ${result.stderr}`);
  }

  const [root] = parseJson(result, `pnpm list (${project})`);
  const versions = new Map();
  const visit = (dependencies = {}) => {
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (dependency.version) {
        const known = versions.get(name) ?? new Set();
        known.add(dependency.version);
        versions.set(name, known);
      }
      visit(dependency.dependencies);
      visit(dependency.optionalDependencies);
    }
  };

  visit(root.dependencies);
  visit(root.optionalDependencies);
  return versions;
}

const audit = run(["audit", "--prod", "--json"]);
let report;
try {
  report = parseJson(audit, "pnpm audit");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (audit.status !== 0 && Object.keys(report.advisories ?? {}).length === 0) {
  console.error(audit.stderr || "pnpm audit failed without reporting advisories.");
  process.exit(1);
}

const productionVersions = new Map();
for (const project of liveProjects) {
  productionVersions.set(project, collectProductionVersions(project));
}

const liveFindings = [];
const otherFindings = new Map();
for (const advisory of Object.values(report.advisories ?? {})) {
  const affectedVersions = new Set(
    advisory.findings.map((finding) => finding.version),
  );
  const affectedInLive = liveProjects.flatMap((project) => {
    const versions = productionVersions.get(project).get(advisory.module_name);
    return [...(versions ?? [])]
      .filter((version) => affectedVersions.has(version))
      .map((version) => `${project}: ${advisory.module_name}@${version}`);
  });

  if (affectedInLive.length > 0) {
    liveFindings.push({ advisory, affectedInLive });
  } else {
    otherFindings.set(advisory.module_name, advisory);
  }
}

if (liveFindings.length > 0) {
  for (const { advisory, affectedInLive } of liveFindings) {
    console.error(`${advisory.severity}: ${advisory.title}`);
    console.error(`  ${affectedInLive.join(", ")}`);
    console.error(`  ${advisory.url}`);
  }
  process.exit(1);
}

console.log(`Live production dependencies are clear (${liveProjects.join(", ")}).`);
if (otherFindings.size > 0) {
  console.warn("Advisories outside the live production dependency trees:");
  for (const advisory of otherFindings.values()) {
    console.warn(`  ${advisory.severity}: ${advisory.module_name} — ${advisory.title}`);
    console.warn(`    ${advisory.url}`);
  }
}
