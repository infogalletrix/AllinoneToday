import {createContext,useContext,useEffect,useState} from 'react';
import {request} from './api/client';
const Context=createContext(null);
export const useSite=()=>useContext(Context);
export function SiteProvider({children}){
  const [site,setSite]=useState({companyName:'All in One Today',categories:[],sections:[],popular:[],tagline:'Discover and connect with shops near you.',supportEmail:'',supportPhone:''}),[loading,setLoading]=useState(true),[error,setError]=useState('');
  async function refresh(){try{const data=await request('/site');setSite(data);setError('');for(const [key,value] of Object.entries(data.theme||{}))document.documentElement.style.setProperty(`--ait-${key}`,value);}catch(error){setError(error.message);}finally{setLoading(false);}}
  useEffect(()=>{refresh();},[]);
  return <Context.Provider value={{site,loading,error,refresh,categories:site.categories.map(item=>item.name)}}>{children}</Context.Provider>;
}
