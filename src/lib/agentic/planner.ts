import { google } from '@ai-sdk/google';
import { generateText, type LanguageModel } from 'ai';
import { getPlaybook } from './playbooks.ts';
import type { AgentPlan, PlannerContext } from './types.ts';

const PLANNER_SYSTEM_PROMPT = `
ROLE: EzyBot Agent Planner (Judge Persona)
GOAL: Audit conversation history and decide the best next action for the domestic help intake bot in Bengaluru.

AUDIT CRITERIA (The Judge's Rules):
1. NO DUPLICATE ASKS: If the user already provided a field (phone, location, service), DO NOT ask for it again. Check history and collected data carefully.
2. EMPATHY FIRST: If the user expresses frustration, anger, or a specific problem (e.g., "my maid didn't show up"), acknowledge and empathize before moving to the next data collection step.
3. LOGICAL CONTINUITY: Ensure the next action follows naturally from the last message.
4. CONFIDENCE SCORING: 
   - 100: User clearly provided exactly what was asked.
   - 80: User provided requested info but with extra irrelevant text.
   - 50: User's response is ambiguous or covers multiple fields partially.
   - 20: User ignored the question or changed the topic entirely.

OUTPUT FORMAT (JSON ONLY):
{
  "reflection": "Brief analysis of what the user said, what we have, and why this next action is chosen. Mention any Judge-specific observations (e.g., 'Avoid duplicate ask for phone').",
  "nextAction": "The internal state or field to target next (e.g., 'ASK_LOCATION', 'COMPLETE', 'ASK_PHONE')",
  "confidence": 0-100,
  "displayText": "The exact message to send to the user (max 2 sentences)."
}
`;

export class AgentPlanner {
  private model: LanguageModel;

  constructor(model?: LanguageModel) {
    this.model = model || google('gemma-3-27b-it');
  }

  async createPlan(context: PlannerContext, previousPlan?: AgentPlan): Promise<AgentPlan> {
    const playbook = getPlaybook(context.activeIntent);
    const playbookContext = `
Intent: ${context.activeIntent}
Required Fields: ${playbook.requiredFields.join(', ')}
Optional Fields: ${playbook.optionalFields.join(', ')}
Collected Data: ${JSON.stringify(context.collectedData)}
Current State: ${context.currentState}
    `;

    const reflectionPrompt = previousPlan 
      ? `\n\nPREVIOUS DRAFT:
${JSON.stringify(previousPlan, null, 2)}
CRITIQUE: The previous plan had a confidence of ${previousPlan.confidence}%. If it was < 70%, it was rejected. Please reflect on why it was low and improve it. Ensure you are not asking for data already present in Collected Data or History.`
      : '';

    try {
      const { text } = await generateText({
        model: this.model,
        system: PLANNER_SYSTEM_PROMPT + reflectionPrompt,
        messages: [
          { role: 'system', content: `CONTEXT:\n${playbookContext}` },
          ...context.history,
        ],
      });

      // Handle markdown-wrapped JSON if necessary
      const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const plan = JSON.parse(cleaned) as AgentPlan;
      
      // Post-process/Sanitize confidence
      plan.confidence = Math.max(0, Math.min(100, plan.confidence || 0));
      
      return plan;
    } catch (error) {
      console.error('[AgentPlanner] Planning failed:', error);
      // Fallback plan
      return {
        reflection: 'Error during planning, falling back to basic continuity.',
        nextAction: context.currentState,
        confidence: 0,
        displayText: 'I understand. Could you please tell me more about your requirement?',
      };
    }
  }
}
