import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Info, PencilLine, X } from 'lucide-react';
import './DialogProvider.css';

const DialogContext = createContext(null);
const canceledValue = kind => kind === 'confirm' ? false : kind === 'prompt' ? null : undefined;

export function useDialogs() {
  const dialogs = useContext(DialogContext);
  if (!dialogs) throw new Error('Dialogs must be used inside DialogProvider.');
  return dialogs;
}

function AppDialog({ request, onFinish }) {
  const { kind, options } = request;
  const id = useId(), element = useRef(null), input = useRef(null), cancelButton = useRef(null), acceptButton = useRef(null);
  const [value, setValue] = useState(String(options.initialValue ?? '')), [error, setError] = useState('');
  const cancel = useCallback(() => onFinish(request.id, canceledValue(kind)), [kind, onFinish, request.id]);
  useEffect(() => {
    const previous = document.activeElement, dialog = element.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    (kind === 'prompt' ? input.current : kind === 'confirm' ? cancelButton.current : acceptButton.current)?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus?.();
    };
  }, [kind]);

  function submit(event) {
    event.preventDefault();
    if (kind === 'prompt') {
      const length = options.inputType === 'password' ? value.length : value.trim().length;
      const invalid = options.required && !length ? 'Please enter a value.'
        : length && options.minLength && length < options.minLength ? `Enter at least ${options.minLength} characters.`
        : options.maxLength && value.length > options.maxLength ? `Use no more than ${options.maxLength} characters.` : '';
      if (invalid) { setError(invalid); input.current?.focus(); return; }
    }
    onFinish(request.id, kind === 'confirm' ? true : kind === 'prompt' ? value : undefined);
  }
  const Icon = options.tone === 'danger' ? CircleAlert : kind === 'prompt' ? PencilLine : Info;
  return createPortal(<dialog ref={element} className={'ait-dialog' + (options.tone === 'danger' ? ' ait-dialog-danger' : '')}
    aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={options.message ? id + '-message' : undefined}
    onCancel={event => { event.preventDefault(); cancel(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...element.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(control => control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = element.current.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel();
    }}>
    <form className="ait-dialog-form" onSubmit={submit} noValidate>
      <div className="ait-dialog-heading"><span className="ait-dialog-icon"><Icon size={24} aria-hidden="true" /></span><button type="button" className="ait-dialog-close" onClick={cancel} aria-label="Close dialog"><X size={20} aria-hidden="true" /></button></div>
      <h2 id={id + '-title'}>{options.title || (kind === 'confirm' ? 'Please confirm' : kind === 'prompt' ? 'Enter details' : 'Notice')}</h2>
      {options.message && <p id={id + '-message'} className="ait-dialog-message">{options.message}</p>}
      {kind === 'prompt' && <label className="ait-dialog-field" htmlFor={id + '-input'}>{options.inputLabel || 'Your response'}
        <input ref={input} id={id + '-input'} type={options.inputType || 'text'} value={value}
          autoComplete={options.inputType === 'password' ? 'current-password' : 'off'}
          required={options.required} minLength={options.minLength} maxLength={options.maxLength}
          aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined}
          onChange={event => { setValue(event.target.value); setError(''); }} />
      </label>}
      {error && <p id={id + '-error'} className="ait-dialog-error" role="alert">{error}</p>}
      <div className="ait-dialog-actions">
        {kind !== 'alert' && <button ref={cancelButton} type="button" className="ait-dialog-button ait-dialog-cancel" onClick={cancel}>{options.cancelLabel || 'Cancel'}</button>}
        <button ref={acceptButton} type="submit" className="ait-dialog-button ait-dialog-accept">{options.confirmLabel || (kind === 'alert' ? 'OK' : 'Continue')}</button>
      </div>
    </form>
  </dialog>, document.body);
}

export function DialogProvider({ children }) {
  const [active, setActive] = useState(null);
  const current = useRef(null), queue = useRef([]), sequence = useRef(0), mounted = useRef(true);
  const finish = useCallback((id, value) => {
    if (current.current?.id !== id) return;
    const completed = current.current;
    current.current = queue.current.shift() || null;
    setActive(current.current);
    completed.resolve(value);
  }, []);
  const open = useCallback((kind, options = {}) => new Promise(resolve => {
    if (!mounted.current) { resolve(canceledValue(kind)); return; }
    const request = { id: ++sequence.current, kind, options, resolve };
    if (current.current) queue.current.push(request);
    else { current.current = request; setActive(request); }
  }), []);
  const confirm = useCallback(options => open('confirm', options), [open]);
  const prompt = useCallback(options => open('prompt', options), [open]);
  const alert = useCallback(options => open('alert', options), [open]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of [current.current, ...queue.current]) request?.resolve(canceledValue(request.kind));
      current.current = null; queue.current = [];
    };
  }, []);
  return <DialogContext.Provider value={{ confirm, prompt, alert }}>{children}{active && <AppDialog key={active.id} request={active} onFinish={finish} />}</DialogContext.Provider>;
}
