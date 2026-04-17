import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export type ActiveFlow =
  | 'idle'
  | 'contractor_search'
  | 'homeowner_search'
  | 'campaign_build'
  | 'enrollment'
  | 'workflow'
  | null;

export interface SearchContext {
  trade?: string;
  targetingIntent?: string;
  city?: string;
  state?: string;
  geoId?: string;
  permitTypes?: string[];
  dateRanges?: string[];
  maxResults?: number;
  channels?: string[];
  revenueRange?: string;
  searchId?: string;
  searchStatus?: string;
  resultCount?: number;
}

export interface CampaignContext {
  offerAngle?: string;
  sequenceIntensity?: string;
  smsTiming?: string;
  campaignId?: string;
  contactCount?: number;
  skippedCount?: number;
}

export interface PendingConfirmation {
  actionId: string;
  toolName: string;
  toolInput: Record<string, any>;
  description: string;
}

export const JerryState = Annotation.Root({
  ...MessagesAnnotation.spec,

  conversationId: Annotation<string>(),
  userId: Annotation<string | null>({
    reducer: (current, update) => (update === undefined ? current ?? null : update),
    default: () => null,
  }),

  activeFlow: Annotation<ActiveFlow>({
    reducer: (current, update) => update ?? current ?? 'idle',
    default: () => 'idle',
  }),

  searchContext: Annotation<SearchContext | null>({
    reducer: (current, update) => {
      if (update === null) return null;
      if (update === undefined) return current;
      return { ...(current ?? {}), ...update };
    },
    default: () => null,
  }),

  campaignContext: Annotation<CampaignContext | null>({
    reducer: (current, update) => {
      if (update === null) return null;
      if (update === undefined) return current;
      return { ...(current ?? {}), ...update };
    },
    default: () => null,
  }),

  pendingConfirmation: Annotation<PendingConfirmation | null>({
    reducer: (_current, update) => update ?? null,
    default: () => null,
  }),

  toolCallCount: Annotation<number>({
    reducer: (current, update) => update ?? current ?? 0,
    default: () => 0,
  }),

  // Classification output written by RouterNode, consumed by the edge selector
  nextNode: Annotation<
    'search' | 'campaign' | 'general' | 'event' | 'confirm' | 'end' | null
  >({
    reducer: (_current, update) => update ?? null,
    default: () => null,
  }),
});

export type JerryStateType = typeof JerryState.State;
export type JerryStateUpdate = typeof JerryState.Update;
