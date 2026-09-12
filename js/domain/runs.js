/** Immutable record of one exact Skill execution. */
import { immutable, invariant, nonEmpty } from './_value.js';
import { assertSkillId } from './feedback.js';

export function createRunRecord(input) {
  invariant(input && typeof input === 'object', 'run input is required');
  return immutable(
    {
      kind: 'skill-run',
      id: nonEmpty(input.id, 'run.id'),
      skillId: assertSkillId(input.skillId),
      localSkillId: nonEmpty(input.localSkillId, 'run.localSkillId'),
      revisionId: nonEmpty(input.revisionId, 'run.revisionId'),
      source: input.source || 'live',
      request: {
        prompt: String(input.request?.prompt ?? ''),
        language: String(input.request?.language ?? ''),
        provider: String(input.request?.provider ?? ''),
        model: String(input.request?.model ?? ''),
        effectivePromptHash: nonEmpty(
          input.request?.effectivePromptHash,
          'run.effectivePromptHash',
        ),
        componentHashes: input.request?.componentHashes || {},
      },
      response: {
        rawText: String(input.response?.rawText ?? ''),
        parsedOutput: input.response?.parsedOutput ?? null,
        rationale: String(input.response?.rationale ?? ''),
      },
      startedAt: nonEmpty(input.startedAt, 'run.startedAt'),
      latencyMs: Number.isFinite(input.latencyMs) ? input.latencyMs : 0,
    },
    'skill run',
  );
}
