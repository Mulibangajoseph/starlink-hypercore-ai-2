// Server-side configuration, read from c.env. Values are set as environment
// variables / secrets on the host; they are never sent to the browser.
export interface Env {
  /** OpenAI key (secret). Chat and image generation. Never logged or returned. */
  OPENAI_API_KEY?: string;
  /** Anthropic (Claude) key (secret). */
  ANTHROPIC_API_KEY?: string;
  /** Google Gemini key (secret). */
  GEMINI_API_KEY?: string;
  /** DeepSeek key (secret). */
  DEEPSEEK_API_KEY?: string;
  /** Requests allowed per device per day, as a number string (default 100). */
  DAILY_LIMIT?: string;
  /** Optional OpenAI-compatible fallback key (secret). Never logged or returned. */
  AI_API_KEY?: string;
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 */
  AI_BASE_URL?: string;
  /** Model id; use a vision-capable model for Image mode. */
  AI_MODEL?: string;
  /** Optional key for a future video-generation provider. */
  VIDEO_API_KEY?: string;
}
