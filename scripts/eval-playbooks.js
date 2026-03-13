#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const BOT_URL = process.argv.find((arg) => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';
const DATASET_PATH = process.argv.find((arg) => arg.startsWith('--dataset='))?.split('=')[1]
  || path.join('data', 'playbook-golden-dataset.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function readDataset() {
  const absolutePath = path.isAbsolute(DATASET_PATH)
    ? DATASET_PATH
    : path.join(process.cwd(), DATASET_PATH);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Dataset not found: ${absolutePath}`);
  }

  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function assertDatasetShape(dataset, playbooks) {
  const failures = [];

  if (!Array.isArray(dataset) || dataset.length === 0) {
    failures.push('Dataset must be a non-empty array.');
    return failures;
  }

  dataset.forEach((scenario, index) => {
    if (!scenario.id) failures.push(`Scenario ${index + 1} is missing id.`);
    if (!scenario.intent) failures.push(`Scenario ${scenario.id || index + 1} is missing intent.`);
    if (!playbooks[scenario.intent]) failures.push(`Scenario ${scenario.id || index + 1} references unknown intent "${scenario.intent}".`);
    if (!Array.isArray(scenario.turns) || scenario.turns.length === 0) {
      failures.push(`Scenario ${scenario.id || index + 1} must contain at least one turn.`);
      return;
    }

    scenario.turns.forEach((turn, turnIndex) => {
      if (!turn.user) failures.push(`Scenario ${scenario.id} turn ${turnIndex + 1} is missing user text.`);
      if (!Array.isArray(turn.expectContains)) failures.push(`Scenario ${scenario.id} turn ${turnIndex + 1} must define expectContains.`);
      if (turn.expectNotContains && !Array.isArray(turn.expectNotContains)) {
        failures.push(`Scenario ${scenario.id} turn ${turnIndex + 1} expectNotContains must be an array when present.`);
      }
    });
  });

  return failures;
}

async function callBot(messages, conversationId) {
  const response = await fetch(`${BOT_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, id: conversationId }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const raw = await response.text();
  let text = '';

  for (const line of raw.split('\n')) {
    const deltaMatch = line.match(/"type":"text-delta","delta":"(.*?)"/);
    if (deltaMatch) {
      try {
        text += JSON.parse(`"${deltaMatch[1]}"`);
      } catch {
        text += deltaMatch[1];
      }
    }

    const simpleMatch = line.match(/^0:"(.*)"/);
    if (simpleMatch) {
      try {
        text += JSON.parse(`"${simpleMatch[1]}"`);
      } catch {
        text += simpleMatch[1];
      }
    }
  }

  return {
    text: (text || raw).trim(),
    raw,
  };
}

function evaluateTurn(responseText, turn) {
  const normalized = responseText.toLowerCase();
  const failures = [];

  for (const token of turn.expectContains || []) {
    if (!normalized.includes(String(token).toLowerCase())) {
      failures.push(`missing "${token}"`);
    }
  }

  for (const token of turn.expectNotContains || []) {
    if (normalized.includes(String(token).toLowerCase())) {
      failures.push(`unexpected "${token}"`);
    }
  }

  return failures;
}

async function main() {
  const dataset = readDataset();
  const { RESPONSE_PLAYBOOKS } = await loadModule('src/lib/responsePlaybooks.ts');
  const shapeFailures = assertDatasetShape(dataset, RESPONSE_PLAYBOOKS);

  if (shapeFailures.length > 0) {
    console.error('Playbook dataset validation FAILED');
    shapeFailures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  if (DRY_RUN) {
    const byIntent = dataset.reduce((accumulator, scenario) => {
      accumulator[scenario.intent] = (accumulator[scenario.intent] || 0) + 1;
      return accumulator;
    }, {});

    console.log(`Playbook dry-run OK: ${dataset.length} scenarios`);
    Object.entries(byIntent).forEach(([intent, count]) => {
      console.log(`- ${intent}: ${count}`);
    });
    return;
  }

  let failures = 0;
  let totalTurns = 0;

  for (const scenario of dataset) {
    const messages = [];
    const conversationId = `playbook_${scenario.id}_${Date.now()}`;
    console.log(`\n[${scenario.id}] ${scenario.intent}`);

    for (let index = 0; index < scenario.turns.length; index += 1) {
      const turn = scenario.turns[index];
      totalTurns += 1;
      messages.push({ role: 'user', content: turn.user });

      const result = await callBot(messages, conversationId);
      messages.push({ role: 'assistant', content: result.text });

      const turnFailures = evaluateTurn(result.text, turn);
      if (turnFailures.length > 0) {
        failures += 1;
        console.log(`FAIL turn ${index + 1}: ${turnFailures.join(', ')}`);
        console.log(`  user: ${turn.user}`);
        console.log(`  bot:  ${result.text}`);
      } else {
        console.log(`PASS turn ${index + 1}: ${result.text}`);
      }
    }
  }

  console.log(`\nPlaybook eval complete: ${totalTurns - failures}/${totalTurns} turns passed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
