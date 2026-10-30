/** Row shape of public.ai_conversations and the messages it stores. */
export type CareerCard = { title: string; field: string; why: string; first_steps: string[]; day_in_life_query: string };

export type RelatedItem = { type: 'opportunity' | 'university' | 'course'; slug: string; title: string };

export type EssayReview = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  edits: Array<{ original: string; suggestion: string }>;
  fit: string[];
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  careers?: CareerCard[];
  /** Afriversity records the answer drew on (validated server-side). */
  related?: RelatedItem[];
  review?: EssayReview;
  /** 'library' = the AI was unavailable and the answer came from the careers table. */
  source?: 'ai' | 'library';
};

export type AiConversation = {
  id: string;
  user_id: string;
  kind: 'career' | 'lesson' | 'essay';
  lesson_id: string | null;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
};

/** limit null = unlimited (Pro). */
export type ChatUsage = { used: number; limit: number | null; plan: 'pro' | null };
