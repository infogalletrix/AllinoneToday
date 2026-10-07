import {useEffect,useRef,useState} from 'react';
import {post,request} from '../../api/client';
export default function GoogleLogin({role='buyer',onSuccess,linked=false}){
  const container=useRef(null),callback=useRef(onSuccess),[error,setError]=useState(''),[available,setAvailable]=useState(null);
  callback.current=onSuccess;
  useEffect(()=>{
    let live=true;
    async function initialize(){
      try{const config=await request('/auth/config');if(!live)return;if(!config.googleWebClientId){setAvailable(false);return;}
        if(!window.google?.accounts?.id)await new Promise((resolve,reject)=>{let script=document.querySelector('script[data-ait-google]');if(!script){script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.dataset.aitGoogle='1';document.head.append(script);}script.addEventListener('load',resolve,{once:true});script.addEventListener('error',reject,{once:true});});
        if(!live)return;setAvailable(true);window.google.accounts.id.initialize({client_id:config.googleWebClientId,callback:async response=>{try{setError('');const result=await post('/auth/google',{idToken:response.credential,role});callback.current(result);}catch(error){setError(error.message);}}});
        window.google.accounts.id.renderButton(container.current,{theme:'outline',size:'large',text:linked?'continue_with':'signin_with',width:Math.min(350,container.current.parentElement.clientWidth)});
      }catch{if(live)setError('Google login could not load. You can use email login.');}
    }
    initialize();return()=>{live=false;};
  },[role,linked]);
  return <div className="ait-google-login"><div ref={container}/>{available===false&&<><button type="button" className="btn-secondary" disabled>Continue with Google</button><small>Google login is being configured. Please use email for now.</small></>}{error&&<p className="ait-error" role="alert">{error}</p>}</div>;
}
