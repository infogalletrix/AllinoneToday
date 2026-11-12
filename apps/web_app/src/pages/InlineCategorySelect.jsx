import {useEffect,useRef,useState} from 'react';
import {post} from '../api/client';
import {useSite} from '../SiteContext';
import {isSupportedCategory} from '../listingScope';

const employmentWords=/(^|[^a-z])(jobs?|careers?|employment|recruitment)([^a-z]|$)/i;
const slugFor=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'');

export function mergeCategoryOptions(...lists){
  const result=[];
  for(const item of lists.flat()){
    if(!item)continue;
    const index=result.findIndex(category=>(item.id&&category.id===item.id)||category.name===item.name);
    if(index<0)result.push(item);else result[index]={...result[index],...item};
  }
  return result;
}

export default function InlineCategorySelect({label,categories,value,onChange,helper,disabled=false,onCreated,onEditingChange}){
  const site=useSite(),select=useRef(null),nameInput=useRef(null),saveLock=useRef(false);
  const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[name,setName]=useState(''),[module,setModule]=useState('product'),[description,setDescription]=useState(''),[error,setError]=useState('');
  const available=categories.filter(item=>item.enabled!==false&&isSupportedCategory(item)),slug=slugFor(name.trim());
  useEffect(()=>{if(open){nameInput.current?.focus({preventScroll:true});nameInput.current?.scrollIntoView({behavior:'instant',block:'center'});}},[open]);
  function focusSelect(){requestAnimationFrame(()=>{select.current?.focus({preventScroll:true});select.current?.scrollIntoView({behavior:'instant',block:'center'});});}
  function start(){if(disabled||saveLock.current)return;setName('');setModule('product');setDescription('');setError('');setOpen(true);onEditingChange(true);}
  function close(){if(saveLock.current)return;setOpen(false);setName('');setModule('product');setDescription('');setError('');onEditingChange(false);focusSelect();}
  async function create(){
    if(disabled||saveLock.current)return;
    setError('');const cleanName=name.trim(),cleanDescription=description.trim();
    if(cleanName.length<2||cleanName.length>50){setError('Enter a category name with 2–50 characters.');nameInput.current?.focus();return;}
    if(!/^[a-z0-9-]{2,60}$/.test(slug)){setError('Use at least two English letters or numbers in the name to create its category URL.');nameInput.current?.focus();return;}
    if(!['product','service'].includes(module)||!isSupportedCategory({name:cleanName,module})||employmentWords.test(cleanName)||employmentWords.test(slug)){setError('Choose a product or service category. Employment and recruitment categories are not offered.');return;}
    if(cleanDescription.length>200){setError('Keep the category description within 200 characters.');return;}
    if(categories.some(item=>item.name?.trim().toLowerCase()===cleanName.toLowerCase()||item.slug?.toLowerCase()===slug)){setError('A category with this name or URL already exists. Choose it from the list or use a different name.');return;}
    const positions=categories.map(item=>Number(item.position)).filter(Number.isFinite),position=Math.min(1000,Math.max(-1,...positions)+1);
    saveLock.current=true;setSaving(true);
    try{
      const created=await post('/admin/categories',{name:cleanName,slug,subtitle:cleanDescription,module,image_path:'',position,enabled:true});
      try{site.registerCategory?.(created);}catch{/* Keep the committed category available in this editor. */}
      onCreated(created);onChange(created.name);setOpen(false);setName('');setModule('product');setDescription('');onEditingChange(false);focusSelect();
      try{void Promise.resolve(site.refresh()).catch(()=>{});}catch{/* The selected category does not depend on refreshing the website. */}
    }catch(error){
      setError(/(?:email or record already exists|category.*already exists|duplicate key)/i.test(error.message)?'A category with this name or URL already exists. Use a different category name.':error.message);
    }finally{saveLock.current=false;setSaving(false);}
  }
  function change(setter){return event=>{setter(event.target.value);setError('');};}
  function handleKey(event){if(event.key==='Enter'&&!event.shiftKey&&event.target.tagName==='INPUT'){event.preventDefault();event.stopPropagation();create();}}
  return <div className="admin-category-field">
    <div className="admin-category-select-row"><label>{label}<select ref={select} aria-label={label} required disabled={disabled||saving||open} value={value} onChange={event=>onChange(event.target.value)}>
      <option value="">Choose a category</option>
      {value&&!available.some(item=>item.name===value)&&<option value={value} disabled>{value} (unavailable — choose another)</option>}
      {available.map(item=><option key={item.id||item.name} value={item.name}>{item.name}</option>)}
    </select></label>{!open&&<button type="button" className="btn-secondary admin-add-category" disabled={disabled} onClick={start}>Add category</button>}</div>
    {helper&&<small className="admin-category-help">{helper}</small>}
    {open&&<div className="admin-inline-category" role="group" aria-label="New category" onKeyDown={handleKey}>
      <h3>New category</h3><div className="ait-form-grid"><label>Category name<input ref={nameInput} aria-label="Category name" maxLength={50} value={name} disabled={saving||disabled} onChange={change(setName)} placeholder="e.g. Home appliances"/></label><label>Category type<select aria-label="Category type" value={module} disabled={saving||disabled} onChange={change(setModule)}><option value="product">Products</option><option value="service">Services</option></select></label></div>
      <label>Category description<textarea aria-label="Category description" rows={2} maxLength={200} value={description} disabled={saving||disabled} onChange={change(setDescription)} placeholder="Optional short description"/></label>
      {error&&<p className="ait-error" role="alert">{error}</p>}
      <div className="admin-inline-category-actions"><button type="button" className="btn-primary" disabled={saving||disabled} onClick={create}>{saving?'Creating…':'Create category'}</button><button type="button" className="btn-secondary" disabled={saving||disabled} onClick={close}>Cancel category</button></div>
      <small>Create or cancel this category before saving your {label==='Shop category'?'shop':'product'}.</small>
    </div>}
  </div>;
}
