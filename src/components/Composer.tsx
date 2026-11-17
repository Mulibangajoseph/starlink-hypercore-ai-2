import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Camera, FileText, ImagePlus, Mic, MicOff, Paperclip, Send, Square, X } from 'lucide-react';
import { MAX_MESSAGE_CHARS } from '../types';
import type { ComposerProps } from '../types';
import { fileToDataUrl } from '../api';
import { extractDocument } from '../documents';
import { startDictation, voiceInputSupported } from '../voice';

const PLACEHOLDER: Record<ComposerProps['mode'], string> = {
  general: 'Message STARLINK HYPERCORE AI',
  code: 'Paste code, describe the bug or the website you want',
  writing: 'Paste your text or describe what to write',
  image: 'Ask something about the attached photo',
  imagegen: 'Describe the image you want to create',
  documents: 'Ask a question about the attached document'
};

const DOC_ACCEPT = '.pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json';

export default function Composer({ mode, disabled, sendOnEnter, streaming, onStop, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ name: string; text: string } | null>(null);
  const [busyImage, setBusyImage] = useState(false);
  const [busyDoc, setBusyDoc] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const stopDictationRef = useRef<(() => void) | null>(null);
  const baseTextRef = useRef('');
  const voiceOk = voiceInputSupported();

  const isImageMode = mode === 'image';
  const isDocMode = mode === 'documents';
  const length = text.length;
  const over = length > MAX_MESSAGE_CHARS;
  const nearLimit = length > MAX_MESSAGE_CHARS * 0.8;
  const trimmed = text.trim();
  const busyFile = busyImage || busyDoc;
  const canSend = !disabled && !busyFile && trimmed.length > 0 && !over;

  // Auto-grow the textarea up to its CSS max-height.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const stopListening = useCallback(() => {
    const stop = stopDictationRef.current;
    stopDictationRef.current = null;
    if (stop) stop();
    setListening(false);
  }, []);

  // Leaving a mode drops its attachment.
  useEffect(() => {
    if (!isImageMode) setImage(null);
    if (!isDocMode) setDoc(null);
    setFileError(null);
  }, [isImageMode, isDocMode]);

  // Stop the microphone when the composer goes away.
  useEffect(() => () => {
    const stop = stopDictationRef.current;
    stopDictationRef.current = null;
    if (stop) stop();
  }, []);

  const submit = useCallback(() => {
    if (!canSend) return;
    stopListening();
    onSend(trimmed, isImageMode && image ? image : undefined, isDocMode && doc ? doc : undefined);
    setText('');
    setImage(null);
    setDoc(null);
    setFileError(null);
    areaRef.current?.focus();
  }, [canSend, onSend, trimmed, isImageMode, isDocMode, image, doc, stopListening]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    if (sendOnEnter) {
      if (!e.shiftKey) {
        e.preventDefault();
        submit();
      }
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFileError('Only image files can be attached. Choose a JPEG, PNG or WebP photo.');
      return;
    }
    setFileError(null);
    setBusyImage(true);
    try {
      const url = await fileToDataUrl(file);
      setImage(url);
    } catch (err) {
      setFileError(err instanceof Error && err.message ? err.message : 'Could not read that image. Try another photo.');
    } finally {
      setBusyImage(false);
    }
  };

  const onPickDoc = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    setBusyDoc(true);
    try {
      const result = await extractDocument(file);
      setDoc(result);
    } catch (err) {
      setDoc(null);
      setFileError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not read that document. Use a PDF, TXT, MD, CSV or JSON file.'
      );
    } finally {
      setBusyDoc(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening();
      return;
    }
    if (!voiceOk) return;
    setFileError(null);
    baseTextRef.current = text.trim();
    try {
      const stop = startDictation(
        (t) => {
          const base = baseTextRef.current;
          setText(base ? `${base} ${t}` : t);
        },
        () => {
          stopDictationRef.current = null;
          setListening(false);
        },
        (m) => {
          stopDictationRef.current = null;
          setListening(false);
          setFileError(m || 'Voice input failed. Check microphone permission and try again.');
        }
      );
      stopDictationRef.current = stop;
      setListening(true);
    } catch {
      setListening(false);
      setFileError('Voice input could not start. Check microphone permission and try again.');
    }
  };

  const hint = sendOnEnter ? 'Enter to send · Shift+Enter for a new line' : 'Ctrl+Enter to send · Enter for a new line';
  const micLabel = !voiceOk
    ? 'Voice input is not supported in this browser'
    : listening
      ? 'Stop dictation'
      : 'Dictate with microphone';

  return (
    <form
      className="composer"
      style={{ flexWrap: 'wrap', paddingBottom: 'max(var(--space-3), env(safe-area-inset-bottom))' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (streaming) return;
        submit();
      }}
    >
      {isImageMode && (image || busyImage) && (
        <div className="row" style={{ flexBasis: '100%' }}>
          {image ? (
            <>
              <img
                src={image}
                alt="Attached photo preview"
                style={{
                  width: 'var(--space-8)',
                  height: 'var(--space-8)',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)'
                }}
              />
              <span className="muted" style={{ fontSize: 'var(--text-sm)', flex: 1 }}>
                Photo attached · sent as a JPEG up to 1024 px
              </span>
              <button type="button" className="icon-btn" aria-label="Remove attached photo" onClick={() => setImage(null)}>
                <X size={20} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }} role="status">
              Preparing photo…
            </span>
          )}
        </div>
      )}

      {isDocMode && (doc || busyDoc) && (
        <div className="row" style={{ flexBasis: '100%' }}>
          {doc ? (
            <>
              <FileText size={20} strokeWidth={1.75} aria-hidden="true" />
              <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {doc.name}
                <span className="muted"> · {doc.text.length.toLocaleString()} characters read</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Remove ${doc.name}`} onClick={() => setDoc(null)}>
                <X size={20} strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }} role="status">
              Reading document…
            </span>
          )}
        </div>
      )}

      {isImageMode && (
        <>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} aria-label="Choose a photo" />
          <button
            type="button"
            className="icon-btn"
            aria-label={image ? 'Replace photo' : 'Attach photo'}
            disabled={busyImage}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={22} strokeWidth={1.75} />
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onPickFile}
            aria-label="Take a photo with the camera"
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Take photo"
            title="Take photo"
            disabled={busyImage}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera size={22} strokeWidth={1.75} />
          </button>
        </>
      )}

      {isDocMode && (
        <>
          <input ref={docRef} type="file" accept={DOC_ACCEPT} hidden onChange={onPickDoc} aria-label="Choose a document" />
          <button
            type="button"
            className="icon-btn"
            aria-label={doc ? 'Replace document' : 'Attach document (PDF, TXT, MD, CSV or JSON)'}
            title="PDF, TXT, MD, CSV or JSON"
            disabled={busyDoc}
            onClick={() => docRef.current?.click()}
          >
            <Paperclip size={22} strokeWidth={1.75} />
          </button>
        </>
      )}

      <label htmlFor="composer-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Message
      </label>
      <textarea
        id="composer-input"
        ref={areaRef}
        className={over ? 'field-error' : undefined}
        rows={1}
        value={text}
        placeholder={listening ? 'Listening… speak now' : PLACEHOLDER[mode]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        aria-invalid={over}
        aria-describedby="composer-help"
        enterKeyHint={sendOnEnter ? 'send' : 'enter'}
        style={{ outlineOffset: 2 }}
        onFocus={(e) => (e.currentTarget.style.outline = '2px solid var(--accent)')}
        onBlur={(e) => (e.currentTarget.style.outline = 'none')}
      />

      <button
        type="button"
        className="icon-btn"
        aria-label={micLabel}
        title={micLabel}
        aria-pressed={voiceOk ? listening : undefined}
        disabled={!voiceOk}
        onClick={toggleMic}
        style={listening ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
      >
        {voiceOk ? <Mic size={22} strokeWidth={1.75} /> : <MicOff size={22} strokeWidth={1.75} />}
      </button>

      {streaming ? (
        <button type="button" className="icon-btn primary" aria-label="Stop generating" onClick={() => onStop?.()}>
          <Square size={20} strokeWidth={1.75} />
        </button>
      ) : (
        <button type="submit" className="icon-btn primary" aria-label="Send message" disabled={!canSend}>
          <Send size={20} strokeWidth={1.75} />
        </button>
      )}

      <div
        id="composer-help"
        aria-live="polite"
        className="row"
        style={{ flexBasis: '100%', justifyContent: 'space-between', fontSize: 'var(--text-xs)', gap: 'var(--space-2)', flexWrap: 'wrap' }}
      >
        <span className={over ? undefined : 'muted'} style={over ? { color: 'var(--danger)' } : undefined}>
          {over
            ? `Message is too long: remove ${(length - MAX_MESSAGE_CHARS).toLocaleString()} characters to send.`
            : streaming
              ? 'Replying… press Stop to cancel.'
              : listening
                ? 'Listening… tap the microphone to finish.'
                : !voiceOk
                  ? `Voice input is not supported in this browser. ${hint}`
                  : isDocMode && !doc && !busyDoc
                    ? `Attach a PDF, TXT, MD, CSV or JSON file with the paperclip. ${hint}`
                    : hint}
        </span>
        {(nearLimit || over) && (
          <span className="muted" style={{ fontVariantNumeric: 'tabular-nums', ...(over ? { color: 'var(--danger)' } : null) }}>
            {length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()}
          </span>
        )}
      </div>

      {fileError && (
        <p className="field-error-text" role="alert" style={{ flexBasis: '100%', marginTop: 0 }}>
          {fileError}
        </p>
      )}
    </form>
  );
}
