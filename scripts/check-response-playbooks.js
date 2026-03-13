#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stageArg = process.argv.find((arg) => arg.startsWith('--stage='));
const stage = stageArg ? stageArg.split('=')[1] : 'contract';

const fileExists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function checkContractStage() {
  const playbookFile = 'src/lib/responsePlaybooks.ts';
  const formatterFile = 'src/lib/responsePlaybookFormatter.ts';

  expect(fileExists(playbookFile), `${playbookFile} is missing`);
  expect(fileExists(formatterFile), `${formatterFile} is missing`);

  if (!fileExists(playbookFile)) return;

  const content = read(playbookFile);
  [
    'maid_hire',
    'complaint',
    'maid_registration',
    'general',
    'helper_reg',
    'normalizeIntentId',
    'getResponsePlaybook',
  ].forEach((token) => expect(content.includes(token), `playbook registry is missing "${token}"`));

  [
    'phone',
    'location',
    'service_type',
    'schedule',
    'issue_summary',
    'severity',
    'callback_preference',
    'role_service_offered',
    'availability_window',
    'preferred_areas',
  ].forEach((fieldId) => expect(content.includes(fieldId), `playbook registry is missing field "${fieldId}"`));
}

function checkIntegrationStage() {
  const promptFile = 'src/lib/prompts-enhanced.ts';
  const routeFile = 'src/app/api/chat/route.ts';
  const maidFlowFile = 'src/flows/MaidHiringFlow.ts';
  const agenticFile = 'src/flows/agenticMaidHire.ts';

  [promptFile, routeFile, maidFlowFile, agenticFile].forEach((relativePath) => {
    expect(fileExists(relativePath), `${relativePath} is missing`);
  });

  if (fileExists(promptFile)) {
    const promptContent = read(promptFile);
    expect(promptContent.includes('maid_registration'), 'prompts-enhanced does not expose maid_registration');
    expect(promptContent.includes('getResponsePlaybook') || promptContent.includes('RESPONSE_PLAYBOOKS'), 'prompts-enhanced is not wired to the playbook contract');
  }

  if (fileExists(routeFile)) {
    const routeContent = read(routeFile);
    expect(routeContent.includes('normalizeIntentId'), 'route.ts is not using normalizeIntentId');
    expect(!routeContent.includes("intent === 'helper_reg'"), 'route.ts still branches on helper_reg as a primary intent');
  }

  if (fileExists(maidFlowFile)) {
    const maidFlowContent = read(maidFlowFile);
    expect(maidFlowContent.includes('getResponsePlaybook') || maidFlowContent.includes('MAID_HIRE_PLAYBOOK'), 'MaidHiringFlow does not consume the shared playbook contract');
  }

  if (fileExists(agenticFile)) {
    const agenticContent = read(agenticFile);
    expect(agenticContent.includes('getResponsePlaybook') || agenticContent.includes('MAID_HIRE_PLAYBOOK'), 'agenticMaidHire does not consume the shared playbook contract');
  }
}

function checkFullStage() {
  const docsFile = 'docs/response-playbooks.md';
  const datasetFile = 'data/playbook-golden-dataset.json';
  const evalFile = 'scripts/eval-playbooks.js';
  const packageFile = 'package.json';

  [docsFile, datasetFile, evalFile, packageFile].forEach((relativePath) => {
    expect(fileExists(relativePath), `${relativePath} is missing`);
  });

  if (fileExists(docsFile)) {
    const docsContent = read(docsFile);
    ['maid_hire', 'complaint', 'maid_registration', 'general'].forEach((token) => {
      expect(docsContent.includes(token), `response playbook docs are missing "${token}"`);
    });
  }

  if (fileExists(datasetFile)) {
    const datasetContent = read(datasetFile);
    ['maid_hire', 'complaint', 'maid_registration', 'general'].forEach((token) => {
      expect(datasetContent.includes(token), `playbook dataset is missing "${token}" coverage`);
    });
  }

  if (fileExists(evalFile)) {
    const evalContent = read(evalFile);
    expect(evalContent.includes('playbook-golden-dataset'), 'eval-playbooks.js is not wired to the playbook dataset');
  }

  if (fileExists(packageFile)) {
    const packageContent = read(packageFile);
    ['docs:playbooks', 'eval:playbooks'].forEach((token) => {
      expect(packageContent.includes(`"${token}"`), `package.json is missing script "${token}"`);
    });
  }
}

checkContractStage();

if (stage === 'integration' || stage === 'full') {
  checkIntegrationStage();
}

if (stage === 'full') {
  checkFullStage();
}

if (failures.length > 0) {
  console.error(`Response playbook check FAILED (${stage})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Response playbook check passed (${stage})`);
