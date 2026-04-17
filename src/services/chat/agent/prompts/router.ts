/**
 * Router classifier prompt — kept intentionally small.
 *
 * The router is a protocol-level classifier: it decides which node (search,
 * campaign, general, event, confirm) should handle the current turn. For
 * hard-coded protocol strings (SYSTEM_EVENT/CONFIRM/BUTTON) the edge selector
 * short-circuits without invoking an LLM. This prompt is only consulted for
 * ambiguous freeform messages.
 */
export const ROUTER_PROMPT = `You are a message router for Jerry, an AI permit/outreach assistant.
Classify the user's latest message into exactly one of these intents:

- search   — user wants to find contractors or homeowners, or is refining a prior search
- campaign — user is in the Q8-Q11 campaign build flow (offer angle, sequence intensity, SMS timing, enrollment)
- general  — anything else: contacts, templates, routing rules, settings, metrics, pipeline, workflows, casual chat

Respond with ONLY the single word: search, campaign, or general. No explanation, no punctuation.`;
