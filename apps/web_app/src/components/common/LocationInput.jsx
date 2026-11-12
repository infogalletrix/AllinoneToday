import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, LocateFixed, MapPin, X } from 'lucide-react';
import { request } from '../../api/client';
import './LocationInput.css';

let automaticDetectionAttempted = false;
let deniedOnThisPage = false;
export function stopAutomaticLocationForPage() { automaticDetectionAttempted = true; }

async function locationPermission() {
  try { return (await navigator.permissions?.query({ name: 'geolocation' }))?.state || 'unknown'; }
  catch { return 'unknown'; }
}

async function detectPlace({ automatic = false, active = () => true } = {}) {
  if (!navigator.geolocation) return Promise.reject(new Error('Your browser can’t detect location. Enter a city or area.'));
  const permission = await locationPermission();
  // Browsing a page never opens the permission prompt. A visitor can request
  // it once from Use my location; already granted access can fill an empty field.
  if (automatic && permission !== 'granted') return null;
  if (!active()) return null;
  if (permission === 'denied' || (permission !== 'granted' && deniedOnThisPage)) {
    throw new Error('Location access is blocked. Allow location in your browser settings or enter a city or area.');
  }
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, error => {
    if (error.code === 1) deniedOnThisPage = true;
    reject(new Error(error.code === 1
      ? 'Location access is blocked. Allow location in your browser or enter a city or area.'
      : error.code === 3 ? 'Location detection timed out. Enter a city or area, or try again.'
        : 'We couldn’t detect your location. Enter a city or area, or try again.'));
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }))
    .then(position => active() ? request('/locations/reverse', {
      method: 'POST',
      body: JSON.stringify({ latitude: Number(position.coords.latitude.toFixed(3)), longitude: Number(position.coords.longitude.toFixed(3)) }),
    }) : null)
    .then(place => {
      if (!place && !active()) return null;
      if (!place || typeof place.value !== 'string' || !place.value.trim()) throw new Error('We couldn’t find your city or area. Enter it manually.');
      return place;
    });
}

export default function LocationInput({ name = 'location', value, defaultValue = '', onChange, autoDetect = false, cancelPendingOnSubmit = false, variant = 'standard', placeholder = 'Location' }) {
  const controlled = value !== undefined;
  const [entered, setEntered] = useState(defaultValue);
  const currentValue = String(controlled ? value : entered);
  const [items, setItems] = useState([]), [open, setOpen] = useState(false), [focused, setFocused] = useState(false), [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false), [locating, setLocating] = useState(false), [message, setMessage] = useState(''), [suggestionError, setSuggestionError] = useState(''), [position, setPosition] = useState(null);
  const root = useRef(null), control = useRef(null), input = useRef(null), panel = useRef(null), mounted = useRef(false);
  const changeCallback = useRef(onChange);
  const edits = useRef(0), locationSequence = useRef(0), suggestionSequence = useRef(0), automaticTask = useRef(null), initialEmpty = useRef(!currentValue.trim());
  const id = useId(), listId = id + '-suggestions';
  useEffect(() => { changeCallback.current = onChange; }, [onChange]);
  useEffect(()=>{
    if(!cancelPendingOnSubmit)return;
    const form=root.current?.closest('form');
    const submitted=()=>{
      // Search uses the field as displayed now. A late device/reverse lookup
      // must not add a location to a name-only search or its next submission.
      edits.current++;locationSequence.current++;suggestionSequence.current++;
      setLocating(false);setLoading(false);setItems([]);setOpen(false);setActiveIndex(-1);setMessage('');setSuggestionError('');
    };
    form?.addEventListener('submit',submitted,true);
    return()=>form?.removeEventListener('submit',submitted,true);
  },[cancelPendingOnSubmit]);
  const applyValue = useCallback(next => {
    if (!controlled) setEntered(next);
    changeCallback.current?.(next);
  }, [controlled]);

  const trackDetection = useCallback(task => {
    const version = ++locationSequence.current, editVersion = edits.current;
    const originalValue = input.current?.value || '';
    setLocating(true); setMessage(''); setOpen(false);
    task.then(place => {
      if (!place || !mounted.current || locationSequence.current !== version || edits.current !== editVersion || input.current?.value !== originalValue) return;
      applyValue(place.value); setMessage('Location detected. Press Search to use this area.'); setItems([]);
    }).catch(error => {
      if (mounted.current && locationSequence.current === version && edits.current === editVersion) setMessage(error.message || 'We couldn’t detect your location. Enter a city or area.');
    }).finally(() => {
      if (mounted.current && locationSequence.current === version) setLocating(false);
    });
  }, [applyValue]);

  useEffect(() => {
    mounted.current = true;
    if (autoDetect && initialEmpty.current) {
      if (!automaticDetectionAttempted) {
        automaticDetectionAttempted = true;
        const editVersion = edits.current;
        automaticTask.current = detectPlace({ automatic: true, active: () => mounted.current && edits.current === editVersion });
      }
      // Reattach to this instance's task after StrictMode's effect cleanup.
      if (automaticTask.current) trackDetection(automaticTask.current);
    }
    return () => { mounted.current = false; locationSequence.current += 1; };
  }, [autoDetect, trackDetection]);

  useEffect(() => {
    const version = ++suggestionSequence.current, abort = new AbortController();
    const query = currentValue.trim();
    if (!open || !focused || query.length < 2) { setLoading(false); setItems([]); return () => abort.abort(); }
    setItems([]); setActiveIndex(-1); setSuggestionError('');
    const timer = setTimeout(() => {
      setLoading(true);
      request('/locations/suggest?' + new URLSearchParams({ q: query.slice(0, 100) }), { signal: abort.signal })
        .then(rows => {
          if (abort.signal.aborted || suggestionSequence.current !== version) return;
          if (!Array.isArray(rows)) throw new Error('Location suggestions are unavailable. Enter a city or area.');
          const unique = new Map();
          for (const place of rows) if (typeof place?.value === 'string' && place.value.trim()) unique.set(place.id || place.label || place.value, place);
          setItems([...unique.values()].slice(0, 6));
        })
        .catch(error => {
          if (!abort.signal.aborted && suggestionSequence.current === version && error.name !== 'AbortError') setSuggestionError('Location suggestions are unavailable. You can still enter a city or area.');
        })
        .finally(() => { if (!abort.signal.aborted && suggestionSequence.current === version) setLoading(false); });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [currentValue, focused, open]);

  const expanded = open && focused && currentValue.trim().length >= 2;
  useEffect(() => {
    if (!expanded) return;
    function placePanel() {
      const box = control.current?.getBoundingClientRect();
      if (!box) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0, viewportTop = viewport?.offsetTop || 0;
      const viewportWidth = viewport?.width || window.innerWidth, viewportHeight = viewport?.height || window.innerHeight;
      const width = Math.min(Math.max(box.width, 310), viewportWidth - 24);
      const left = Math.max(viewportLeft + 12, Math.min(box.left, viewportLeft + viewportWidth - width - 12));
      let below = viewportTop + viewportHeight - box.bottom - 16;
      const above = box.top - viewportTop - 16;
      const submit = control.current.closest('form')?.querySelector('button[type="submit"], button:not([type])')?.getBoundingClientRect();
      // A stacked mobile form places Search directly below this field. Keep it
      // reachable while the suggestions or manual-entry guidance are open.
      if (submit && submit.top >= box.bottom - 2 && submit.right > left && submit.left < left + width) below = Math.min(below, submit.top - box.bottom - 16);
      const useAbove = below < 190 && above > below;
      setPosition({ width, left, maxHeight: Math.max(48, Math.min(370, useAbove ? above : below)), ...(useAbove ? { bottom: window.innerHeight - box.top + 8 } : { top: box.bottom + 8 }) });
    }
    function outside(event) {
      if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) { setOpen(false); setFocused(false); }
    }
    placePanel();
    window.addEventListener('resize', placePanel); window.addEventListener('scroll', placePanel, true); window.visualViewport?.addEventListener('resize', placePanel); window.visualViewport?.addEventListener('scroll', placePanel); document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('resize', placePanel); window.removeEventListener('scroll', placePanel, true); window.visualViewport?.removeEventListener('resize', placePanel); window.visualViewport?.removeEventListener('scroll', placePanel); document.removeEventListener('pointerdown', outside); };
  }, [expanded]);

  function select(place) {
    stopAutomaticLocationForPage();
    edits.current += 1; locationSequence.current += 1; suggestionSequence.current += 1;
    setLocating(false); setLoading(false); applyValue(place.value); setItems([]); setOpen(false); setActiveIndex(-1); setMessage(''); input.current?.focus();
  }
  function clear() {
    stopAutomaticLocationForPage();
    edits.current += 1; locationSequence.current += 1; suggestionSequence.current += 1;
    setLocating(false); setLoading(false); applyValue(''); setItems([]); setOpen(false); setActiveIndex(-1); setSuggestionError(''); setMessage('Location cleared. Search all areas.'); input.current?.focus();
  }
  function blur(event) {
    if (!root.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) { setFocused(false); setOpen(false); }
  }
  function keyboard(event) {
    if (event.key === 'Escape') { if (open) event.preventDefault(); setOpen(false); setActiveIndex(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (items.length) setActiveIndex(previous => event.key === 'ArrowDown' ? (previous + 1) % items.length : (previous <= 0 ? items.length - 1 : previous - 1));
    } else if (event.key === 'Enter' && expanded && activeIndex >= 0 && items[activeIndex]) { event.preventDefault(); select(items[activeIndex]); }
  }
  return <div ref={root} className={'location-input location-input-' + variant} onBlur={blur}>
    <div ref={control} className="location-input-control">
      <input ref={input} id={id} type="text" role="combobox" name={name} aria-label="Location" placeholder={placeholder} autoComplete="off" maxLength={180}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && activeIndex >= 0 ? id + '-option-' + activeIndex : undefined}
        aria-describedby={message || locating ? id + '-status' : undefined} value={currentValue}
        onFocus={() => { setFocused(true); setOpen(true); }} onKeyDown={keyboard}
        onChange={event => { stopAutomaticLocationForPage(); edits.current += 1; locationSequence.current += 1; suggestionSequence.current += 1; setLocating(false); setLoading(false); applyValue(event.target.value); setItems([]); setActiveIndex(-1); setOpen(true); setFocused(true); setMessage(''); setSuggestionError(''); }} />
      {(currentValue || locating) && <button type="button" className="location-clear-button" aria-label="Clear location" title="Clear location" onClick={clear}><X size={16} aria-hidden="true" /></button>}
      <button type="button" className="location-detect-button" aria-label={locating ? 'Detecting location…' : 'Use my location'} title={locating ? 'Detecting location…' : 'Use my location'} disabled={locating}
        onClick={() => { if (!locating) { const editVersion = edits.current; trackDetection(detectPlace({ active: () => mounted.current && edits.current === editVersion })); } }}>{locating ? <LoaderCircle size={17} className="location-input-spinner" aria-hidden="true" /> : <LocateFixed size={17} aria-hidden="true" />}</button>
    </div>
    {(locating || message) && <p id={id + '-status'} className="location-input-status" role="status">{locating ? 'Detecting location…' : message}</p>}
    {expanded && position && createPortal(<div ref={panel} className="location-suggestions" style={position} onBlur={blur}>
      <div id={listId} role="listbox" aria-label="Location suggestions">
        {items.map((place, index) => <button key={place.id || place.label || place.value} type="button" role="option" id={id + '-option-' + index} aria-selected={activeIndex === index} tabIndex={-1}
          className={'location-suggestion' + (activeIndex === index ? ' is-active' : '')} onMouseDown={event => event.preventDefault()} onClick={() => select(place)}>
          <MapPin size={17} aria-hidden="true" /><span><strong>{place.label || place.value}</strong>{place.detail && <small>{place.detail}</small>}</span>
        </button>)}
      </div>
      {loading ? <p className="location-suggestions-message" role="status">Finding locations…</p> : suggestionError ? <p className="location-suggestions-message" role="status">{suggestionError}</p> : !items.length && <p className="location-suggestions-message">Enter a city or area, or keep your typed location.</p>}
      <a className="location-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>, document.body)}
  </div>;
}
