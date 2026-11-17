import type { ChatMode } from './types';

export interface ToolDef {
  id: string;
  title: string;
  text: string;
  mode?: ChatMode;
  soon?: boolean;
}

export const TOOL_REGISTRY: ToolDef[] = [
  { id: 'chat', title: 'Chat', text: 'Ask anything and pick your AI provider and model.', mode: 'general' },
  { id: 'code', title: 'Code', text: 'Generate code, debug errors and build websites with a live preview.', mode: 'code' },
  { id: 'writing', title: 'Writing', text: 'Draft, rewrite and polish emails, posts and documents.', mode: 'writing' },
  { id: 'image', title: 'Image understanding', text: 'Attach a photo, chart or screenshot and ask about it.', mode: 'image' },
  { id: 'imagegen', title: 'Image generation', text: 'Turn a prompt into an image (OpenAI, paid service).', mode: 'imagegen' },
  { id: 'documents', title: 'Documents', text: 'Upload a PDF, TXT, MD, CSV or JSON file and ask questions about it.', mode: 'documents' },
  { id: 'voice', title: 'Voice', text: 'Dictate with the mic and hear replies read aloud.', mode: 'general' },
  { id: 'video', title: 'AI Video', text: 'Generate short video clips from a prompt.', soon: true },
  { id: 'academy', title: 'Academy', text: 'Guided lessons and study plans with an AI tutor.', soon: true },
  { id: 'business', title: 'Business', text: 'Plans, reports and customer messages for your business.', soon: true },
  { id: 'translate', title: 'Translate', text: 'Translate text and documents between languages.', soon: true },
  { id: 'research', title: 'Research', text: 'Gather sources and build cited briefs on any topic.', soon: true },
  { id: 'manager', title: 'Manager', text: 'Organise tasks, notes and schedules with AI help.', soon: true },
  { id: 'agents', title: 'AI Agents', text: 'Autonomous assistants that complete multi-step jobs.', soon: true }
];
