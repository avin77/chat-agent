import type { ResponseFieldSpec, ResponsePlaybook } from './responsePlaybooks';

function formatFieldList(fields: ResponseFieldSpec[]): string {
  if (fields.length === 0) {
    return '- None';
  }

  return fields
    .map((field) => {
      const aliasText = field.aliases?.length ? ` (aliases: ${field.aliases.join(', ')})` : '';
      return `- ${field.label} [${field.id}]${aliasText}: ${field.description}`;
    })
    .join('\n');
}

export function formatPlaybookForPrompt(playbook: ResponsePlaybook): string {
  const answerFirstSection = playbook.answerFirstPolicy
    ? `ANSWER-FIRST POLICY:\n- ${playbook.answerFirstPolicy}\n\n`
    : '';

  return [
    `PLAYBOOK: ${playbook.displayName} (${playbook.intent})`,
    '',
    `ENTRY CONFIRMATION: ${playbook.entryConfirmation}`,
    '',
    'REQUIRED FIELDS:',
    formatFieldList(playbook.requiredFields),
    '',
    'OPTIONAL FIELDS:',
    formatFieldList(playbook.optionalFields),
    '',
    'REPAIR GUIDELINES:',
    ...playbook.repairGuidelines.map((line) => `- ${line}`),
    '',
    `COMPLETION RULE: ${playbook.completionRule}`,
    `COMPLETION CONFIRMATION: ${playbook.completionConfirmation}`,
    '',
    'ESCALATION CRITERIA:',
    ...playbook.escalationCriteria.map((line) => `- ${line}`),
    '',
    answerFirstSection.trimEnd(),
    'PROMPT DIRECTIVES:',
    ...playbook.promptDirectives.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPlaybookForDocs(playbook: ResponsePlaybook): string {
  const aliases = playbook.aliases.length > 0 ? playbook.aliases.join(', ') : 'None';
  const answerFirstSection = playbook.answerFirstPolicy
    ? `\n## Answer-First Policy\n\n${playbook.answerFirstPolicy}\n`
    : '';

  return [
    `# ${playbook.displayName}`,
    '',
    `- Intent: \`${playbook.intent}\``,
    `- Aliases: ${aliases}`,
    '',
    '## Entry Confirmation',
    '',
    playbook.entryConfirmation,
    '',
    '## Required Fields',
    '',
    formatFieldList(playbook.requiredFields),
    '',
    '## Optional Fields',
    '',
    formatFieldList(playbook.optionalFields),
    '',
    '## Repair Guidelines',
    '',
    ...playbook.repairGuidelines.map((line) => `- ${line}`),
    '',
    '## Completion',
    '',
    `- Rule: ${playbook.completionRule}`,
    `- Confirmation: ${playbook.completionConfirmation}`,
    '',
    '## Escalation Criteria',
    '',
    ...playbook.escalationCriteria.map((line) => `- ${line}`),
    answerFirstSection.trimEnd(),
    '',
    '## Prompt Directives',
    '',
    ...playbook.promptDirectives.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join('\n');
}
