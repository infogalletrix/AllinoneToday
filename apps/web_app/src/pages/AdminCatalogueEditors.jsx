import {useEffect,useId,useRef,useState} from 'react';
import {request,uploadImage} from '../api/client';
import {StatusBadge} from './AdminDashboardParts';
import ListingPrice from '../components/common/ListingPrice';
import {getProductPricing,parseProductAmount,MRP_KEY,OFFER_PRICE_KEY,MAX_PRODUCT_PRICE} from '../productPricing';
import InlineCategorySelect,{mergeCategoryOptions} from './InlineCategorySelect';
import './AdminCatalogueEditors.css';

const imageTypes='image/jpeg,image/png,image/webp';
const kindFor=category=>(category?.module|| (category?.name==='Services'?'service':'product'))==='service'?'service':'product';
const reservedSpecifications=['Service area','Availability',MRP_KEY,OFFER_PRICE_KEY];

function initialPricing(item){
  const pricing=getProductPricing(item),explicitOffer=parseProductAmount(item.specifications?.[OFFER_PRICE_KEY]);
  const offerIsSaved=pricing.hasMrp&&(pricing.hasOffer||(explicitOffer!==null&&explicitOffer<=pricing.mrp));
  return {mrp:pricing.mrp===null?'':String(pricing.mrp),offer:offerIsSaved?String(pricing.price):''};
}

function Photo({path,onRemove,label}){
  if(!path)return null;
  return <div className="ait-catalogue-photo"><img src={path} alt={label}/><button type="button" className="ait-link" onClick={onRemove}>Remove {label.toLowerCase()}</button></div>;
}

function imageError(files){
  if(files.some(file=>file.size>8*1024*1024))return 'Choose images smaller than 8 MB each.';
  if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)))return 'Choose JPEG, PNG or WebP images.';
  return '';
}

export function ShopEditor({value,categories,busy,onSave,onCancel,onDelete,onCredentials}){
  const [provisionOwner,setProvisionOwner]=useState(!value.id),[owner,setOwner]=useState({name:'',email:'',phone:'',user_id:'',temporary_password:''});
  const [passwordVisible,setPasswordVisible]=useState(false),ownerPasswordId=useId();
  const [form,setForm]=useState(()=>({name:value.name||'',category:value.category||'',location:value.location||'',phone:value.phone||'',description:value.description||'',image_path:value.image_path||'',branches:value.branches||1,status:value.id?(value.status==='active'&&!value.moderated_hidden?'active':'inactive'):'active',subscription_amount:value.subscription_amount_minor?value.subscription_amount_minor/100:''}));
  const [uploading,setUploading]=useState(false),[error,setError]=useState(''),[addedCategories,setAddedCategories]=useState([]),[categoryEditing,setCategoryEditing]=useState(false);
  const editorCategories=mergeCategoryOptions(addedCategories,categories),saveDisabled=busy||uploading||categoryEditing;
  const field=key=>({value:form[key],onChange:event=>setForm(previous=>({...previous,[key]:event.target.value}))});
  async function upload(event){
    const file=event.target.files?.[0];if(!file)return;const invalid=imageError([file]);if(invalid){setError(invalid);event.target.value='';return;}
    setUploading(true);setError('');
    try{const image_path=await uploadImage(file);setForm(previous=>({...previous,image_path}));}
    catch(error){setError(error.message);}finally{setUploading(false);event.target.value='';}
  }
  function generatePassword(){
    try{
      const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const password=Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>alphabet[byte&63]).join('')+'Aa1!';
      setOwner(previous=>({...previous,temporary_password:password}));setPasswordVisible(false);setError('');
    }catch{setError('Secure password generation is unavailable. Enter a temporary password, or leave it blank to generate when saving.');}
  }
  function submit(event){
    event.preventDefault();if(saveDisabled)return;setError('');
    const status=event.nativeEvent.submitter?.value||form.status;
    if(!['active','inactive'].includes(status)){setError('Choose whether to publish the shop or save a draft.');return;}
    if(form.name.trim().length<2){setError('Use at least two characters for the shop name.');return;}
    if(!editorCategories.some(category=>category.name===form.category&&category.enabled!==false)){setError('Choose an available shop category.');return;}
    if(form.phone.trim()&&form.phone.trim().length<7){setError('Enter a phone number with at least seven characters, or leave it empty.');return;}
    const branches=Number(form.branches);if(!Number.isInteger(branches)||branches<1||branches>100){setError('Enter a whole number of branches from 1 to 100.');return;}
    const subAmount = form.subscription_amount !== '' && Number(form.subscription_amount) > 0 ? Number(form.subscription_amount) : null;
    if(!value.id&&provisionOwner&&(owner.name.trim().length<2||!owner.email.trim())){setError('Enter the shop owner’s name and email to create their login.');return;}
    if(!value.id&&provisionOwner&&owner.user_id.trim()&&!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(owner.user_id.trim())){setError('Use 3–32 letters, numbers, dots, underscores or hyphens for the user ID.');return;}
    if(!value.id&&provisionOwner&&owner.temporary_password&&!(owner.temporary_password.length>=10&&owner.temporary_password.length<=128&&/[A-Z]/.test(owner.temporary_password)&&/[a-z]/.test(owner.temporary_password)&&/[0-9]/.test(owner.temporary_password)&&/[^a-zA-Z0-9\s]/.test(owner.temporary_password))){setError('Use 10–128 characters with an uppercase letter, lowercase letter, number and symbol for the temporary password.');return;}
    onSave({...form,status,name:form.name.trim(),location:form.location.trim(),phone:form.phone.trim(),description:form.description.trim(),branches,subscription_amount:subAmount,...(!value.id&&provisionOwner?{owner:{name:owner.name.trim(),email:owner.email.trim(),phone:owner.phone.trim(),...(owner.user_id.trim()?{user_id:owner.user_id.trim()}:{}),...(owner.temporary_password?{temporary_password:owner.temporary_password}:{})}}:{}),...(value.id?{contentVersion:value.family_review_version}:{})});
  }
  const savedActive=value.id&&value.status==='active'&&!value.moderated_hidden;
  return <form className="ait-panel ait-form" onInvalidCapture={()=>setError('Check the highlighted fields before saving.')} onSubmit={submit}>
    <div className="admin-editor-heading"><div><h2>{value.id?'Edit shop':'New shop'}</h2><p>{value.id?'Update the details customers see.':'Start with the name, category, description and photo.'}</p></div><StatusBadge>{value.id?'Saved shop':'Unsaved shop'}</StatusBadge></div>
    <fieldset className="ait-listing-fields" disabled={busy||uploading}>
      {!value.id&&<section className="admin-owner-setup"><div><h3>Shop owner access</h3><p>Create the owner’s account with a unique user ID and a temporary password. They must choose a new password before managing products.</p></div><label className="ait-checkbox"><input type="checkbox" checked={provisionOwner} onChange={event=>setProvisionOwner(event.target.checked)}/>Create a login for the shop owner</label>{provisionOwner&&<div className="ait-form-grid"><label>Owner’s full name<input required minLength={2} maxLength={100} autoComplete="off" value={owner.name} onChange={event=>setOwner(previous=>({...previous,name:event.target.value}))}/></label><label>Owner’s email<input required type="email" maxLength={254} autoComplete="off" value={owner.email} onChange={event=>setOwner(previous=>({...previous,email:event.target.value}))}/></label><label>Owner’s phone<input type="tel" maxLength={30} value={owner.phone} onChange={event=>setOwner(previous=>({...previous,phone:event.target.value}))}/></label><label>Unique user ID<input maxLength={32} autoComplete="off" value={owner.user_id} onChange={event=>setOwner(previous=>({...previous,user_id:event.target.value}))}/><small>Optional. Leave blank to generate one. Use letters, numbers, dots, underscores or hyphens.</small></label><div className="admin-owner-password"><label htmlFor={ownerPasswordId}>Temporary password</label><div className="admin-owner-password-input"><input id={ownerPasswordId} type={passwordVisible?'text':'password'} autoComplete="new-password" minLength={10} maxLength={128} aria-describedby={ownerPasswordId+'-hint'} value={owner.temporary_password} onChange={event=>setOwner(previous=>({...previous,temporary_password:event.target.value}))}/><button type="button" aria-label={passwordVisible?'Hide temporary password':'Show temporary password'} onClick={()=>setPasswordVisible(previous=>!previous)}>{passwordVisible?'Hide':'Show'}</button></div><button type="button" className="btn-secondary" onClick={generatePassword}>Generate password</button><small id={ownerPasswordId+'-hint'}>Leave blank to generate securely when you save. Use 10–128 characters with an uppercase letter, lowercase letter, number and symbol.</small></div><p className="admin-owner-hint">Login details appear after saving. Reopen them from the shop’s Login details button until the owner changes their password.</p></div>}{!provisionOwner&&<small>You will manage this shop from the administrator account.</small>}</section>}
      <label>Shop name<input required minLength={2} maxLength={120} placeholder="e.g. Green Market" {...field('name')}/></label>
      <InlineCategorySelect label="Shop category" helper="This describes your shop in the directory; choose each product category separately." categories={editorCategories} value={form.category} disabled={busy||uploading} onChange={category=>setForm(previous=>({...previous,category}))} onCreated={category=>setAddedCategories(previous=>mergeCategoryOptions(previous,[category]))} onEditingChange={setCategoryEditing}/>
      <label>Description<textarea aria-label="Description" rows={4} maxLength={2000} placeholder="What does this shop offer?" {...field('description')}/></label>
      <label>Upload shop image<input aria-label="Upload shop image" type="file" accept={imageTypes} onChange={upload}/><small>Optional · JPEG, PNG or WebP · up to 8 MB</small></label>
      <Photo path={form.image_path} label="Shop image" onRemove={()=>setForm(previous=>({...previous,image_path:''}))}/>
      <div className="ait-form-grid"><label>Location<input maxLength={180} placeholder="City or area" {...field('location')}/></label><label>Phone<input type="tel" maxLength={30} placeholder="Shop contact number" {...field('phone')}/></label></div>
      <label>Branches<input type="number" step="any" inputMode="numeric" {...field('branches')}/><small>One branch is included by default.</small></label>
      <label>Monthly AutoPay subscription fee (₹ / month)<input type="number" min="0" max="100000" step="1" placeholder="e.g. 499 (leave empty or 0 for free)" value={form.subscription_amount} onChange={event=>setForm(previous=>({...previous,subscription_amount:event.target.value}))}/><small>The shop owner will pay this exact monthly amount and set up AutoPay via Razorpay before their shop is published. Leave empty or 0 for free admin-managed access.</small></label>
    </fieldset>
    {uploading&&<p role="status">Uploading image…</p>}{error&&<p role="alert" className="ait-error">{error}</p>}
    <div className={'admin-editor-actions'+(categoryEditing?' is-category-editing':'')}><div className="ait-actions">
      <button type="submit" value={value.id?form.status:'active'} className="btn-primary" disabled={saveDisabled}>{busy?'Saving…':value.id?'Save changes':'Save and publish shop'}</button>
      {value.id&&!savedActive?<button type="submit" value="active" className="btn-secondary" disabled={saveDisabled}>Publish shop</button>:<button type="submit" value="inactive" className="btn-secondary" disabled={saveDisabled}>Save draft</button>}
      <button type="button" className="btn-secondary admin-editor-cancel" disabled={saveDisabled} onClick={onCancel}>Cancel</button>
      {value.id&&onCredentials&&<button type="button" data-preserve-draft="true" className="btn-secondary" disabled={saveDisabled} onClick={onCredentials}>Owner login details</button>}
      {value.id&&onDelete&&<button type="button" data-preserve-draft="true" className="btn-secondary admin-delete-button" disabled={saveDisabled} onClick={onDelete}>Delete shop</button>}
    </div><small>{value.id?'Save changes keeps the current visibility. Publishing is confirmed after saving.':'Save and publish shop adds it to the public directory once confirmed. Save draft keeps it private.'}</small></div>
  </form>;
}

export function ListingEditor({value,categories,user,busy,onSave,onCancel,savedProductNotice}){
  const ownerMode=user.role==='merchant';
  const titleInput=useRef(null);
  const [form,setForm]=useState(()=>({title:value.title||'',category:value.category||'',subcategory:value.subcategory||'',location:value.location||'',description:value.description||'',image_path:value.image_path||'',gallery:Array.isArray(value.gallery)?value.gallery:[],shop_id:value.shop_id||'',status:value.status||'active'}));
  const [mrp,setMrp]=useState(()=>initialPricing(value).mrp),[offerPrice,setOfferPrice]=useState(()=>initialPricing(value).offer);
  const [specs,setSpecs]=useState(()=>Object.entries(value.specifications||{}).filter(([name])=>!reservedSpecifications.includes(name)).map(([name,value])=>({name,value:String(value)})));
  const [serviceArea,setServiceArea]=useState(value.specifications?.['Service area']||''),[availability,setAvailability]=useState(value.specifications?.Availability||'');
  const [shops,setShops]=useState([]),[shopLoading,setShopLoading]=useState(true),[shopError,setShopError]=useState(''),[shopAttempt,setShopAttempt]=useState(0),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[moreOpen,setMoreOpen]=useState(false),[photosOpen,setPhotosOpen]=useState(false),[addedCategories,setAddedCategories]=useState([]),[categoryEditing,setCategoryEditing]=useState(false);
  const editorCategories=mergeCategoryOptions(addedCategories,categories),saveDisabled=busy||uploading||shopLoading||categoryEditing;
  const category=editorCategories.find(item=>item.name===form.category),kind=kindFor(category);
  const selectedShop=shops.find(shop=>shop.id===form.shop_id);
  const parsedMrp=parseProductAmount(mrp),hasOfferValue=offerPrice.trim()!=='',parsedOffer=parseProductAmount(offerPrice);
  const previewPrice=parsedMrp!==null&&(!hasOfferValue||(parsedOffer!==null&&parsedOffer<=parsedMrp))?(hasOfferValue?parsedOffer:parsedMrp):null;
  const reservedCount=1+(hasOfferValue?1:0)+(kind==='service'?2:availability.trim()?1:0),maximumGenericSpecs=30-reservedCount;
  useEffect(()=>{
    if(savedProductNotice&&!value.id){titleInput.current?.focus({preventScroll:true});titleInput.current?.scrollIntoView({behavior:'instant',block:'center'});}
  },[savedProductNotice,value.id]);
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      setShopLoading(true);setShopError('');
      try{const all=[];if(ownerMode){all.push(...await request('/shops/mine'));}else{for(let offset=0;offset<=100000;offset+=100){const page=await request('/admin/shops?offset='+offset);all.push(...page.filter(shop=>shop.admin_managed));if(page.length<100)break;}}if(!cancelled){setShops(all);if(ownerMode&&!value.id&&!form.shop_id&&all.length===1)setForm(previous=>({...previous,shop_id:all[0].id}));}}
      catch(error){if(!cancelled)setShopError(error.message);}finally{if(!cancelled)setShopLoading(false);}
    }
    load();return()=>{cancelled=true;};
  },[user.id,ownerMode,shopAttempt]);
  const field=key=>({value:form[key],onChange:event=>setForm(previous=>({...previous,[key]:event.target.value}))});
  async function upload(event,gallery=false){
    const files=Array.from(event.target.files||[]);if(!files.length)return;const invalid=imageError(files);if(invalid){setError(invalid);event.target.value='';return;}
    if(gallery&&form.gallery.length+files.length>6){setError('Choose at most six gallery images in total.');event.target.value='';return;}
    setUploading(true);setError('');
    try{for(const file of files){const path=await uploadImage(file);setForm(previous=>gallery?{...previous,gallery:[...previous.gallery,path]}:{...previous,image_path:path});}}
    catch(error){setError(error.message);}finally{setUploading(false);event.target.value='';}
  }
  function submit(event){
    event.preventDefault();if(saveDisabled)return;setError('');
    const addAnother=!value.id&&event.nativeEvent.submitter?.name==='add-another';
    const status=event.nativeEvent.submitter?.value||form.status;if(!['active','removed'].includes(status)){setError('Choose whether to publish this item or save a draft.');return;}
    if(form.title.trim().length<3){setError('Use at least three characters for the title.');return;}
    if(!category||category.enabled===false){setError('Choose an available category.');return;}
    if(form.description.trim().length<10){setError('Use at least ten characters for the description.');return;}
    if(parsedMrp===null){setError('Enter a valid MRP with at most two decimal places.');return;}
    if(hasOfferValue&&parsedOffer===null){setError('Enter a valid offer price with at most two decimal places, or leave it empty.');return;}
    if(hasOfferValue&&parsedOffer>parsedMrp){setError('Offer price cannot exceed MRP.');return;}
    const price=hasOfferValue?parsedOffer:parsedMrp;
    if(kind==='service'&&(!serviceArea.trim()||!availability.trim())){setError('Complete the service area and availability.');return;}
    const parent=shops.find(shop=>shop.id===form.shop_id);if((ownerMode&&!form.shop_id)||(form.shop_id&&!parent&&!shopError)){setError(ownerMode?'Choose one of your shops.':'Choose a managed shop, or select No shop.');return;}
    if(status==='active'&&parent&&(parent.status!=='active'||parent.moderated_hidden)){setError('Publish the selected shop first, or choose Save draft.');return;}
    if(status==='active'&&ownerMode&&parent?.publication_enabled===false){setError('This shop cannot publish products yet. Choose Hidden in Public visibility to save your product, or contact the administrator about shop access.');return;}
    if(!form.image_path){setError('Upload a main image before saving.');return;}
    const specifications={[MRP_KEY]:parsedMrp.toFixed(2),...(hasOfferValue?{[OFFER_PRICE_KEY]:parsedOffer.toFixed(2)}:{})};
    for(const entry of specs){const name=entry.name.trim(),value=entry.value.trim();if(!name||!value){setMoreOpen(true);setError('Complete each specification or remove the empty row.');return;}if([MRP_KEY,OFFER_PRICE_KEY].includes(name)){setMoreOpen(true);setError('Set MRP and Offer price in the pricing fields, not specifications.');return;}if(Object.hasOwn(specifications,name)||reservedSpecifications.includes(name)){setMoreOpen(true);setError('Use a different name for each specification.');return;}specifications[name]=value;}
    if(availability.trim())specifications.Availability=availability.trim();
    if(kind==='service')specifications['Service area']=serviceArea.trim();
    if(Object.keys(specifications).length>30){setMoreOpen(true);setError('Use at most 30 specifications, including pricing and service details. Remove an extra specification to continue.');return;}
    onSave({...form,status,title:form.title.trim(),description:form.description.trim(),location:form.location.trim(),subcategory:form.subcategory.trim(),price,shop_id:form.shop_id||null,kind,specifications,...(value.id?{contentVersion:value.family_review_version}:{})},{addAnother});
  }
  return <form className="ait-panel ait-form" onInvalidCapture={()=>setError('Check the highlighted fields before saving.')} onSubmit={submit}>
    <div className="admin-editor-heading"><div><h2>{value.id?'Edit product or service':'New product or service'}</h2><p>{value.id?'Update the photo, price and details.':'Choose a shop and add the details customers need.'}</p></div><StatusBadge>{value.id?'Saved item':'Unsaved item'}</StatusBadge></div>
    {typeof savedProductNotice==='string'&&savedProductNotice&&<p className="ait-notice" role="status">{savedProductNotice}</p>}
    <fieldset className="ait-listing-fields" disabled={busy||uploading}>
      <label>Title<input ref={titleInput} required minLength={3} maxLength={150} placeholder="Product or service name" {...field('title')}/></label>
      <label>Shop<select required={ownerMode} {...field('shop_id')} disabled={shopLoading||Boolean(shopError)}><option value="">{ownerMode?'Choose your shop':'No shop'}</option>{form.shop_id&&!shops.some(shop=>shop.id===form.shop_id)&&<option value={form.shop_id}>Current shop</option>}{shops.map(shop=><option value={shop.id} key={shop.id}>{shop.name}{shop.status!=='active'||shop.moderated_hidden?' (draft)':''}</option>)}</select></label>
      {shopLoading&&<p role="status">Loading your shops…</p>}{shopError&&<div role="alert" className="ait-error">Unable to load shops: {shopError}<div className="ait-actions"><button type="button" className="btn-secondary" onClick={()=>setShopAttempt(previous=>previous+1)}>Reload shops</button></div></div>}
      {selectedShop&&<div className="admin-selected-shop"><strong>Adding products to {selectedShop.name}</strong><span>Choose a category for this product below. You can change the shop above.</span></div>}
      {ownerMode?<label>Product category<select aria-label="Product category" required value={form.category} onChange={event=>setForm(previous=>({...previous,category:event.target.value}))}><option value="">Choose a category</option>{editorCategories.filter(item=>item.enabled!==false).map(item=><option key={item.id||item.name} value={item.name}>{item.name}</option>)}</select><small>Choose the category this product belongs to.</small></label>:<InlineCategorySelect label="Product category" helper="Each product has its own category. Your shop can contain products from different categories." categories={editorCategories} value={form.category} disabled={busy||uploading} onChange={category=>setForm(previous=>({...previous,category}))} onCreated={category=>setAddedCategories(previous=>mergeCategoryOptions(previous,[category]))} onEditingChange={setCategoryEditing}/>}
      <label>Public visibility<select aria-label="Public visibility" {...field('status')}><option value="active">Public — show to customers</option><option value="removed">Hidden — only visible in your dashboard</option></select><small>Hidden products stay in your catalogue and can be published later.</small></label>
      <div className="ait-form-grid"><label>MRP (₹)<input aria-label="MRP (₹)" type="number" required min={0} max={MAX_PRODUCT_PRICE} step="0.01" value={mrp} onChange={event=>setMrp(event.target.value)}/></label><label>Offer price (₹)<input aria-label="Offer price (₹)" type="number" min={0} max={MAX_PRODUCT_PRICE} step="0.01" value={offerPrice} onChange={event=>setOfferPrice(event.target.value)}/><small>Optional. Leave blank to sell at MRP.</small></label></div>
      {previewPrice!==null&&<div className="admin-price-preview"><span>Customer price</span><ListingPrice item={{price:previewPrice,specifications:{[MRP_KEY]:parsedMrp}}}/></div>}
      <label>Description<textarea aria-label="Description" required minLength={10} maxLength={5000} rows={4} placeholder="Describe what you offer. Include at least ten characters." {...field('description')}/></label>
      <label>Upload main image<input aria-label="Upload main image" type="file" accept={imageTypes} onChange={event=>upload(event)}/><small>Required · JPEG, PNG or WebP · up to 8 MB</small></label>
      <Photo path={form.image_path} label="Main image" onRemove={()=>setForm(previous=>({...previous,image_path:''}))}/>
      {kind==='service'&&<section className="admin-editor-section"><h3>Service details</h3><label>Service area<input required maxLength={300} placeholder="Where is this service available?" value={serviceArea} onChange={event=>setServiceArea(event.target.value)}/></label><label>Availability<input required maxLength={300} placeholder="Days or hours available" value={availability} onChange={event=>setAvailability(event.target.value)}/></label></section>}
      <details className="admin-editor-more" open={moreOpen} onToggle={event=>setMoreOpen(event.currentTarget.open)}><summary>More product details</summary><div>
        <div className="ait-form-grid"><label>Subcategory<input maxLength={80} {...field('subcategory')}/></label><label>Location<input maxLength={180} {...field('location')}/></label></div>
        {kind!=='service'&&<label>Availability<input maxLength={300} placeholder="e.g. In stock" value={availability} onChange={event=>setAvailability(event.target.value)}/></label>}
        <div><h3>Specifications</h3>{specs.map((entry,index)=><div className="ait-catalogue-spec" key={index}><label>Specification name {index+1}<input maxLength={60} placeholder="e.g. Material" value={entry.name} onChange={event=>setSpecs(previous=>previous.map((item,i)=>i===index?{...item,name:event.target.value}:item))}/></label><label>Specification value {index+1}<input maxLength={300} placeholder="e.g. Solid wood" value={entry.value} onChange={event=>setSpecs(previous=>previous.map((item,i)=>i===index?{...item,value:event.target.value}:item))}/></label><button type="button" className="ait-link" onClick={()=>setSpecs(previous=>previous.filter((_,i)=>i!==index))}>Remove specification {index+1}</button></div>)}<button type="button" className="btn-secondary" disabled={specs.length>=maximumGenericSpecs} onClick={()=>setSpecs(previous=>[...previous,{name:'',value:''}])}>Add specification</button><small className="admin-spec-count">{specs.length+reservedCount}/30 details, including pricing{kind==='service'?' and required service details':''}</small></div>
      </div></details>
      <details className="admin-editor-more" open={photosOpen} onToggle={event=>setPhotosOpen(event.currentTarget.open)}><summary>More photos{form.gallery.length?' ('+form.gallery.length+')':''}</summary><div>
        <label>Upload gallery images (up to 6)<input aria-label="Upload gallery images (up to 6)" type="file" accept={imageTypes} multiple onChange={event=>upload(event,true)} disabled={form.gallery.length>=6}/><small>{form.gallery.length}/6 images · up to 8 MB each</small></label>
        <div className="ait-catalogue-gallery">{form.gallery.map((path,index)=><Photo key={path+index} path={path} label={`Gallery image ${index+1}`} onRemove={()=>setForm(previous=>({...previous,gallery:previous.gallery.filter((_,i)=>i!==index)}))}/>)}</div>
      </div></details>
    </fieldset>
    {uploading&&<p role="status">Uploading images…</p>}{error&&<p role="alert" className="ait-error">{error}</p>}
    <div className={'admin-editor-actions'+(categoryEditing?' is-category-editing':'')}><div className="ait-actions">
      <button type="submit" value={form.status} className="btn-primary" disabled={saveDisabled}>{busy?'Saving…':value.id?'Save changes':form.status==='removed'?'Save hidden product':kind==='service'?'Save and publish service':'Save and publish product'}</button>
      {!value.id&&<button type="submit" name="add-another" value={form.status} className="btn-secondary" disabled={saveDisabled}>Save and add another</button>}
      {value.id&&value.status!=='active'?<button type="submit" value="active" className="btn-secondary" disabled={saveDisabled}>{kind==='service'?'Publish service':'Publish product'}</button>:<button type="submit" value="removed" className="btn-secondary" disabled={saveDisabled}>Save draft</button>}
      <button type="button" className="btn-secondary admin-editor-cancel" disabled={saveDisabled} onClick={onCancel}>Cancel</button>
    </div><small>{value.id?'Save changes keeps the current visibility. Publishing is confirmed after saving.':'Save and publish makes this item public once confirmed. Save draft keeps it private.'}</small></div>
  </form>;
}
