import { MAX_MESSAGE_CHARS } from './types';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 60;
// Leave room in the message for the person's question.
const MAX_DOC_CHARS = Math.max(1000, MAX_MESSAGE_CHARS - 1500);
const TRUNCATED_NOTE = '\n[…document shortened to fit the message limit…]';
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json'];

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function clip(text: string): string {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= MAX_DOC_CHARS) return clean;
  return clean.slice(0, MAX_DOC_CHARS) + TRUNCATED_NOTE;
}

async function extractPdf(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('This PDF is larger than 15 MB. Try a smaller file or split it.');
  }
  const pdfjs = await import('pdfjs-dist');
  // @ts-ignore - Vite resolves the ?url suffix to the bundled worker file
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default as string;

  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'PasswordException') {
      throw new Error('This PDF is password protected. Remove the password and try again.');
    }
    throw new Error('Could not open this PDF. The file may be damaged.');
  }

  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    let out = '';
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) out += (out ? '\n\n' : '') + line;
      if (out.length > MAX_DOC_CHARS) break;
    }
    if (out.replace(/\s/g, '').length < 20) {
      throw new Error('No readable text found in this PDF. It may be a scanned document made of images.');
    }
    return out;
  } finally {
    void pdf.destroy();
  }
}

async function extractPlain(file: File): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) {
    throw new Error('This file is larger than 2 MB. Try a smaller file.');
  }
  const text = await file.text();
  if (text.includes('\u0000')) {
    throw new Error('This file looks binary, not text. Use a PDF, TXT, MD, CSV or JSON file.');
  }
  if (!text.trim()) {
    throw new Error('This file is empty.');
  }
  return text;
}

export async function extractDocument(file: File): Promise<{ name: string; text: string }> {
  const ext = extensionOf(file.name);
  const isPdf = ext === 'pdf' || file.type === 'application/pdf';
  const isText =
    TEXT_EXTENSIONS.includes(ext) ||
    file.type.startsWith('text/') ||
    file.type === 'application/json';

  if (!isPdf && !isText) {
    throw new Error('Unsupported file type. Attach a PDF, TXT, MD, CSV or JSON file.');
  }
  const raw = isPdf ? await extractPdf(file) : await extractPlain(file);
  return { name: file.name, text: clip(raw) };
}
