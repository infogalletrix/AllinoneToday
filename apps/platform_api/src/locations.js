import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';

// Photon supports autocomplete and reverse lookup, including locality layers:
// https://github.com/komoot/photon/blob/master/docs/api-v1.md
// Its public service has reasonable-use limits and no availability guarantee:
// https://github.com/komoot/photon#public-demo-server
const providerOrigin='https://photon.komoot.io';
const layers=['city','locality','district'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
const unavailable=()=>fail(503,'Location suggestions are temporarily unavailable. You can still enter a city or area manually.');
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,160):'';
const distinct=values=>[...new Map(values.filter(Boolean).map(value=>[value.toLowerCase(),value])).values()];
const reverseSchema=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict();
const suggestSchema=z.object({q:z.string().trim().max(100).default('')}).strict();

export function locationResults(body,{reverse=false}={}){
  if(!body||!Array.isArray(body.features))throw unavailable();
  const results=[],seen=new Set();
  for(const feature of body.features.slice(0,32)){
    const p=feature?.properties;
    if(!p||typeof p!=='object')continue;
    const name=clean(p.name),city=clean(p.city),district=clean(p.district),county=clean(p.county),state=clean(p.state),country=clean(p.country);
    const placeLayer=layers.includes(p.type)||layers.includes(p.layer)||p.osm_key==='place'&&['city','town','village','hamlet','suburb','neighbourhood','quarter','locality'].includes(p.osm_value);
    // Prefer a known city for automatic detection: a nearby suburb alone can
    // exclude shops whose catalogue stores only the city. Explicit suggestions
    // still retain neighbourhood choices for people entering a narrower area.
    const value=(reverse?city:'')||(placeLayer?name:'')||city||district||county||name||state;
    if(!value)continue;
    const details=distinct([reverse&&placeLayer?name:'',city,district,county,state,country]).filter(part=>part.toLowerCase()!==value.toLowerCase());
    const detail=details.join(', ').slice(0,240),label=distinct([value,state,country]).join(', ').slice(0,340);
    const key=(value+'|'+detail).toLowerCase();if(seen.has(key))continue;seen.add(key);
    const osmId=String(p.osm_id??'').replace(/[^0-9]/g,'').slice(0,24),osmType=String(p.osm_type||'').replace(/[^A-Za-z]/g,'').slice(0,4);
    results.push({id:osmId?'osm-'+osmType+'-'+osmId:'place-'+results.length+'-'+value.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80),label,value,...(detail?{detail}:{})});
    if(results.length===(reverse?1:6))break;
  }
  return results;
}

async function boundedJson(response,maxBytes=65536){
  if(!response.ok||!response.body)throw unavailable();
  if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body.cancel();throw unavailable();}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw unavailable();}chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{throw unavailable();}finally{reader.releaseLock();}
}

export function createLocationService({fetchImpl=globalThis.fetch,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),intervalMs=1000,timeoutMs=4000,cacheTtlMs=600000,maxCacheEntries=512,maxPending=4}={}){
  const cache=new Map(),inFlight=new Map();let queue=Promise.resolve(),pending=0,nextStart=0;
  async function lookup(key,url,{reverse=false}={}){
    const cached=cache.get(key);if(cached&&cached.expires>now())return cached.data;
    if(inFlight.has(key))return inFlight.get(key);
    if(pending>=maxPending)throw unavailable();
    pending++;
    const task=queue.then(async()=>{
      const pause=Math.max(0,nextStart-now());if(pause)await wait(pause);
      nextStart=now()+intervalMs;
      try{
        const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'AllInOneToday/1.0 (+https://allinonetoday.com/contact)'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
        const data=locationResults(await boundedJson(response),{reverse});
        cache.delete(key);cache.set(key,{data,expires:now()+cacheTtlMs});
        while(cache.size>maxCacheEntries)cache.delete(cache.keys().next().value);
        return data;
      }catch{throw unavailable();}
    });
    queue=task.catch(()=>{});
    const result=task.finally(()=>{pending--;inFlight.delete(key);});inFlight.set(key,result);
    return result;
  }
  function providerUrl(path,selectedLayers=layers){const url=new URL(path,providerOrigin);url.searchParams.set('lang','en');for(const layer of selectedLayers)url.searchParams.append('layer',layer);return url;}
  return {
    async suggest(input){
      const parsed=suggestSchema.safeParse(input);if(!parsed.success)throw fail(400,'Enter a city or area using no more than 100 characters.');
      const query=parsed.data.q;if(query.length<2)return [];
      const url=providerUrl('/api/');url.searchParams.set('q',query);url.searchParams.set('limit','8');
      return lookup('suggest:'+query.toLowerCase(),url);
    },
    async reverse(input){
      const parsed=reverseSchema.safeParse(input);if(!parsed.success)throw fail(400,'A valid latitude and longitude are required to detect your area.');
      // City/area lookup does not require retaining or forwarding exact GPS precision.
      const latitude=Number(parsed.data.latitude.toFixed(3)),longitude=Number(parsed.data.longitude.toFixed(3));
      // Photon can classify a place:city as a district (for example Chennai),
      // while its closest locality has no city property. Ask for the actual
      // city tag first; a city centre may be outside the default nearby radius.
      // Both filters and radius are documented common reverse parameters:
      // https://github.com/komoot/photon/blob/master/docs/api-v1.md
      const cityUrl=providerUrl('/reverse',['city','district']);
      cityUrl.searchParams.set('osm_tag','place:city');cityUrl.searchParams.set('radius','25');
      cityUrl.searchParams.set('lat',latitude);cityUrl.searchParams.set('lon',longitude);cityUrl.searchParams.set('limit','1');
      let [place]=await lookup('reverse-city:'+latitude+','+longitude,cityUrl,{reverse:true});
      if(!place){
        // Rural areas without a nearby city retain the nearest area fallback.
        const areaUrl=providerUrl('/reverse');areaUrl.searchParams.set('lat',latitude);areaUrl.searchParams.set('lon',longitude);areaUrl.searchParams.set('limit','1');
        [place]=await lookup('reverse-area:'+latitude+','+longitude,areaUrl,{reverse:true});
      }
      if(!place)throw fail(404,'We could not identify your city or area. Please enter it manually.');
      return place;
    },
  };
}

export function locationRouter({service=createLocationService(),windowMs=60000,suggestLimit=60,reverseLimit=10}={}){
  const router=Router();
  const limit=count=>rateLimit({windowMs,limit:count,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({success:false,message:'Please wait a moment before trying location suggestions again. You can enter a location manually.'})});
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/suggest',limit(suggestLimit),async(req,res)=>res.json({success:true,data:await service.suggest({q:req.query.q})}));
  router.post('/reverse',limit(reverseLimit),async(req,res)=>res.json({success:true,data:await service.reverse(req.body)}));
  return router;
}
