import {Link} from 'react-router-dom';
import {useSite} from '../../SiteContext';
import HeroSearch from './HeroSearch';
import CategoryGrid from './CategoryGrid';
import TrendingSection from './TrendingSection';
export default function ManagedHome(props){
  const {site,loading,error}=useSite();
  if(loading)return <section className="ait-page">Loading All in One Today…</section>;
  if(error)return <section className="ait-page"><p className="ait-error">{error}</p></section>;
  return <div className="figma-home-page">{site.sections.filter(section=>section.enabled).map(section=>{
    if(section.type==='hero')return <HeroSearch key={section.id} section={section}/>;
    if(section.type==='categories')return <CategoryGrid key={section.id} section={section}/>;
    if(section.type==='listings')return <TrendingSection key={section.id} section={section} {...props}/>;
    if(section.type==='downloads')return <section className="ait-home-section container" key={section.id}><div className="ait-download-banner"><div><h2>{section.title}</h2><p>{section.body}</p></div><Link className="btn-dark" to="/download">Download public app →</Link></div></section>;
    return <section className="ait-home-section container" key={section.id}><div className={`ait-panel ${section.type==='banner'?'ait-cms-banner':''}`}>
      {section.image&&<img className="ait-cms-image" src={section.image} alt="" loading="lazy"/>}<h2>{section.title}</h2><p className="ait-cms-copy">{section.body}</p>
      {section.type==='steps'&&<div className="ait-step-grid">{(section.items||[]).map((item,index)=><article key={index}><p className="ait-eyebrow">0{index+1}</p><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>}
      {section.type==='shops'&&<Link className="ait-link" to="/shops">Explore shops →</Link>}
      {section.link&&<a className="btn-primary" href={section.link}>{section.button||'Explore'}</a>}
    </div></section>;
  })}</div>;
}
