export type ItemKind =
  | 'word_basic'
  | 'sense'
  | 'sense_concept'
  | 'sense_history'
  | 'example'
  | 'collocation'
  | 'synonym'
  | 'antonym';

export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'reanalyzing';
export type EvidenceType = 'verified' | 'sourced' | 'ai_inferred' | 'unverified';

export type Item = {
  id: string;
  wordId: string;
  parentId: string | null;
  kind: ItemKind;
  seq: number;
  pos: string | null;
  payload: Record<string, unknown>;
  status: ItemStatus;
  evidenceType: EvidenceType;
  origin: 'ai' | 'human';
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type Word = {
  id: string;
  lemma: string;
  status: 'queued' | 'studied';
  createdAt: string;
  updatedAt: string;
};

export type WordSummary = Word & {
  itemCount: number;
  pendingCount: number;
  approvedCount: number;
  senseCount: number;
  phonetic: string;
  pos: string[];
  senses: Array<{ senseNo: number; pos: string; cnGloss: string }>;
};

export type Stats = {
  wordCount: number;
  studiedWordCount: number;
  pendingItemCount: number;
  approvedItemCount: number;
  rejectedItemCount: number;
  totalItemCount: number;
};

export type Job = {
  id: string;
  type: string;
  wordId: string;
  status: 'running' | 'succeeded' | 'failed';
  progress: string[];
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemCounts = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};

export type WordDetailResponse = {
  word: Word;
  items: Item[];
  stats: ItemCounts;
  runningJob: Job | null;
};

export type WordListResponse = {
  words: WordSummary[];
  stats: Stats;
};

export type ItemVersion = {
  id: string;
  versionNo: number;
  payload: Record<string, unknown>;
  changeSource: 'ai_initial' | 'ai_revision' | 'human_edit';
  feedback: string | null;
  note: string | null;
  model: string | null;
  createdAt: string;
};

export type ReviewEvent = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  versionNo: number | null;
  createdAt: string;
};

export type QueueItem = Item & { lemma: string };

export type ReviewQueueResponse = {
  status: string;
  total: number;
  items: QueueItem[];
};
