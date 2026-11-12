import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {request} from './api/client';
import {isSupportedCategory,isEmploymentCategory,isEmploymentLink} from './listingScope';
const Context=createContext(null);
export const useSite=()=>useContext(Context);
export function SiteProvider({children}){
  const [site,setSite]=useState({companyName:'All in One Today',categories:[],sections:[],popular:[],tagline:'Discover and connect with shops near you.',supportEmail:'',supportPhone:''}),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const categoryVersion=useRef(0),refreshSequence=useRef(0),refreshController=useRef(null);
  function registerCategory(category){
    if(!category?.id||typeof category.name!=='string'||!category.name.trim()||category.enabled===false||!isSupportedCategory(category))return;
    categoryVersion.current+=1;
    setSite(previous=>({...previous,categories:[...previous.categories.filter(item=>item.id!==category.id&&item.name!==category.name),category].sort((a,b)=>(a.position||0)-(b.position||0)||a.name.localeCompare(b.name))}));
  }
  async function refresh(){
    const version=categoryVersion.current,sequence=++refreshSequence.current,abort=new AbortController();
    refreshController.current?.abort();refreshController.current=abort;
    let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;abort.abort();},15000);
    try{const data=await request('/site',{signal:abort.signal});if(version!==categoryVersion.current||sequence!==refreshSequence.current)return;setSite({...data,categories:(data.categories||[]).filter(isSupportedCategory),popular:(data.popular||[]).filter(item=>!isEmploymentCategory(item.category)&&!isEmploymentCategory(item.label)),sections:(data.sections||[]).filter(section=>!isEmploymentCategory(section.category)&&!isEmploymentLink(section.link))});setError('');for(const [key,value] of Object.entries(data.theme||{}))document.documentElement.style.setProperty(`--ait-${key}`,value);}
    catch(error){if(version===categoryVersion.current&&sequence===refreshSequence.current)setError(timedOut?'Site information could not refresh. Check your connection and try again.':error.message);}
    finally{clearTimeout(timeout);if(sequence===refreshSequence.current)setLoading(false);}
  }
  useEffect(()=>{refresh();const visible=()=>{if(document.visibilityState==='visible')refresh();};const timer=setInterval(visible,30000);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);refreshSequence.current++;refreshController.current?.abort();window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};},[]);
  return <Context.Provider value={{site,loading,error,refresh,registerCategory,categories:site.categories.map(item=>item.name)}}>{children}</Context.Provider>;
}
