import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useAccount} from './AccountContext';
import {post,request,fetchListing} from './api/client';
import {isDemoCatalogueItem} from './catalogueAccess';

const Context=createContext(null);
const pendingKey='ait_pending_wishlist';
export const useWishlist=()=>useContext(Context);
export function WishlistProvider({children}){
  const {user,loading:accountLoading}=useAccount(),navigate=useNavigate(),location=useLocation();
  const owner=user&&!user.must_change_password?user.id:null,ownerRef=useRef(owner),generation=useRef(0),inFlight=useRef(new Set());
  ownerRef.current=owner;
  const [state,setState]=useState({owner:null,items:[],loading:false,error:''}),[pendingIds,setPendingIds]=useState([]),[notice,setNotice]=useState(''),[operationError,setOperationError]=useState('');
  const load=useCallback(async()=>{
    const version=++generation.current;
    setOperationError('');
    setState({owner,items:[],loading:Boolean(owner),error:''});
    if(!owner)return;
    try{
      let items=(await request('/profile/favorites')).filter(item=>!isDemoCatalogueItem(item));
      if(version!==generation.current||ownerRef.current!==owner)return;
      let pending=null;
      try{pending=JSON.parse(sessionStorage.getItem(pendingKey));}catch{}
      if(pending?.id&&Date.now()-pending.createdAt<15*60*1000){
        try{sessionStorage.removeItem(pendingKey);}catch{}
        if(!isDemoCatalogueItem({id:pending.id})&&!items.some(item=>item.id===pending.id)){
          const listing=await fetchListing(pending.id);
          if(isDemoCatalogueItem(listing))throw Error('This demo cannot be added to your wishlist.');
          if(version!==generation.current||ownerRef.current!==owner)return;
          await post('/profile/favorites',{listing_id:pending.id});
          if(version!==generation.current||ownerRef.current!==owner)return;
          items=(await request('/profile/favorites')).filter(item=>!isDemoCatalogueItem(item));
          if(ownerRef.current===owner)setNotice(items.some(item=>item.id===pending.id)?'Added to your wishlist.':'This product is no longer publicly available.');
        }
      }else if(pending){try{sessionStorage.removeItem(pendingKey);}catch{}}
      if(version===generation.current&&ownerRef.current===owner)setState({owner,items,loading:false,error:''});
    }catch(error){if(version===generation.current&&ownerRef.current===owner)setState({owner,items:[],loading:false,error:error.message});}
  },[owner]);
  useEffect(()=>{
    inFlight.current.clear();setPendingIds([]);setNotice('');setOperationError('');
    load();return()=>{generation.current++;};
  },[load]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
  async function toggle(id){
    if(accountLoading||isDemoCatalogueItem({id}))return;
    if(!owner){
      try{sessionStorage.setItem(pendingKey,JSON.stringify({id,createdAt:Date.now()}));}catch{}
      navigate('/login?next='+encodeURIComponent(location.pathname+location.search));return;
    }
    if(state.owner!==owner||state.loading||inFlight.current.has(id))return;
    if(state.error){setOperationError('Your wishlist could not be loaded. Retry before changing it.');return;}
    const actor=owner,removing=state.items.some(item=>item.id===id);
    inFlight.current.add(id);setPendingIds([...inFlight.current]);setOperationError('');setNotice('');
    try{
      await request('/profile/favorites'+(removing?'/'+encodeURIComponent(id):''),{method:removing?'DELETE':'POST',...(!removing?{body:JSON.stringify({listing_id:id})}:{})});
      if(ownerRef.current!==actor)return;
      const version=++generation.current;
      const items=(await request('/profile/favorites')).filter(item=>!isDemoCatalogueItem(item));
      if(ownerRef.current===actor&&version===generation.current)setState({owner:actor,items,loading:false,error:''});
      if(ownerRef.current===actor)setNotice(removing?'Removed from your wishlist.':items.some(item=>item.id===id)?'Added to your wishlist.':'This product is no longer publicly available.');
    }catch(error){if(ownerRef.current===actor)setOperationError(error.message);}
    finally{if(ownerRef.current===actor){inFlight.current.delete(id);setPendingIds([...inFlight.current]);}}
  }
  const current=state.owner===owner?state:{owner,items:[],loading:Boolean(owner),error:''};
  return <Context.Provider value={{...current,loading:accountLoading||current.loading,pendingIds,toggle,retry:load,notice,error:operationError||current.error,clearError:()=>setOperationError('')}}>{children}</Context.Provider>;
}
