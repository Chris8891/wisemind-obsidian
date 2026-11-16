import type {AssistantChatMessage, AssistantChatSession, ChatCitation} from '../../../types';

export type ChatRole = 'user' | 'assistant';

// model, referencePaths and citations are optional extras persisted with assistant replies.
export type ChatMessage = AssistantChatMessage & {
  role: ChatRole;
  model?: string;
  referencePaths?: string[];
  citations?: ChatCitation[];
};

export type ChatSession = AssistantChatSession & {
  messages: ChatMessage[];
};

export type MentionTextSegment =
  | {type: 'text'; text: string; start: number; end: number}
  | {type: 'mention'; path: string; title: string; start: number; end: number};

export type ComposerInputOptions = {focus?: boolean; cursor?: number};
