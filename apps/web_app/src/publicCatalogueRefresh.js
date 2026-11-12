import {request} from './api/client.js';

const watchers=new WeakMap();

export const publicCatalogueUnavailable=error=>error?.status===404||error?.status===403;
export function publicCatalogueDetailFailure(previous,error){
  if(publicCatalogueUnavailable(error))return {...previous,loading:false,item:null,shop:null,items:[],unavailable:true,error:''};
  return {...previous,loading:false,unavailable:false,error:error.message||'Please try again.'};
}

// Home sections and public routes share one small revision request per document.
export function watchPublicCatalogue(onChange,{windowTarget=window,documentTarget=document,timers=globalThis,loadVersion=signal=>request('/catalogue/version',{cache:'no-store',signal}),needsRefresh=()=>false}={}) {
  let watcher=watchers.get(documentTarget);
  if(!watcher){
    const listeners=new Map();
    let live=true,inFlight=false,controller,timeout,version,visibleTicks=0,epoch=0;
    const notify=reason=>{visibleTicks=0;for(const listener of listeners.keys())listener(reason);};
    async function checkVersion(){
      if(!live||inFlight||documentTarget.visibilityState!=='visible')return;
      inFlight=true;const currentEpoch=epoch,abort=new AbortController();controller=abort;
      timeout=timers.setTimeout(()=>abort.abort(),15000);
      try{
        const result=await loadVersion(abort.signal);
        if(!live||abort.signal.aborted||currentEpoch!==epoch||documentTarget.visibilityState!=='visible')return;
        if(typeof result?.version!=='string'||!result.version.trim())return;
        const previous=version;version=result.version;
        if(previous!==version)notify(previous===undefined?'initial':'changed');
        else for(const [listener,dirty] of listeners)if(dirty())listener('retry');
      }catch{/* Older/offline services retain the thirty-second full refresh fallback. */}
      finally{timers.clearTimeout(timeout);inFlight=false;}
    }
    const tick=()=>{
      if(documentTarget.visibilityState!=='visible')return;
      if(++visibleTicks>=6)notify('fallback');
      void checkVersion();
    };
    const resume=()=>{
      if(documentTarget.visibilityState!=='visible'){epoch++;controller?.abort();return;}
      notify('resume');void checkVersion();
    };
    const timer=timers.setInterval(tick,5000);
    windowTarget.addEventListener('focus',resume);windowTarget.addEventListener('online',resume);
    documentTarget.addEventListener('visibilitychange',resume);
    watcher={listeners,stop:()=>{
      live=false;epoch++;controller?.abort();timers.clearTimeout(timeout);timers.clearInterval(timer);
      windowTarget.removeEventListener('focus',resume);windowTarget.removeEventListener('online',resume);
      documentTarget.removeEventListener('visibilitychange',resume);watchers.delete(documentTarget);
    }};
    watchers.set(documentTarget,watcher);
  }
  watcher.listeners.set(onChange,needsRefresh);
  let subscribed=true;
  return ()=>{if(!subscribed)return;subscribed=false;watcher.listeners.delete(onChange);if(!watcher.listeners.size)watcher.stop();};
}

// Refresh a mounted section without overlapping loads or accepting late route responses.
export function startPublicCatalogueRefresh({load,onData,onError,onPending=()=>{},onSettled=()=>{},...watchOptions}) {
  const documentTarget=watchOptions.documentTarget||document;
  let live=true,inFlight=false,controller,pending=false,retryNeeded=false,epoch=0;
  async function refresh() {
    if(!live||documentTarget.visibilityState!=='visible')return;
    if(inFlight){pending=true;return;}
    inFlight=true;const abort=new AbortController(),currentEpoch=epoch;controller=abort;
    onPending();
    try {
      const data=await load(abort.signal);
      if(live&&currentEpoch===epoch&&!abort.signal.aborted&&!pending)retryNeeded=onData(data)===false;
    } catch(error) {
      if(live&&currentEpoch===epoch&&!pending&&error.name!=='AbortError'){retryNeeded=!publicCatalogueUnavailable(error);onError(error);}
    } finally {
      if(live&&currentEpoch===epoch){inFlight=false;if(pending){pending=false;void refresh();}else onSettled();}
    }
  }
  const unwatch=watchPublicCatalogue(refresh,{...watchOptions,needsRefresh:()=>retryNeeded&&!inFlight});
  const hidden=()=>{if(documentTarget.visibilityState!=='visible'){epoch++;controller?.abort();inFlight=false;pending=false;retryNeeded=true;}};
  documentTarget.addEventListener('visibilitychange',hidden);
  void refresh();
  return ()=>{
    live=false;epoch++;controller?.abort();unwatch();documentTarget.removeEventListener('visibilitychange',hidden);
  };
}
