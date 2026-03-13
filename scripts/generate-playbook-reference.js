#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

async function main() {
  const [{ RESPONSE_PLAYBOOKS }, { formatPlaybookForDocs }] = await Promise.all([
    loadModule('src/lib/responsePlaybooks.ts'),
    loadModule('src/lib/responsePlaybookFormatter.ts'),
  ]);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const sections = Object.values(RESPONSE_PLAYBOOKS)
    .map((playbook) => formatPlaybookForDocs(playbook))
    .join('\n\n---\n\n');

  const output = `# Response Playbooks\n\nGenerated: ${generatedAt}\nSource: \`src/lib/responsePlaybooks.ts\`\n\nThis document is generated from the canonical response playbook registry used by prompts, routing, and eval tooling.\n\n---\n\n${sections}\n`;

  const outputPath = path.join(process.cwd(), 'docs', 'response-playbooks.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');

  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
