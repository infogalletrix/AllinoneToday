import {Fragment} from 'react';
import {Link} from 'react-router-dom';
import {useSite} from '../../SiteContext';
import HeroSearch from './HeroSearch';
import CategoryGrid from './CategoryGrid';
import TrendingSection from './TrendingSection';
import PublishedShops from './PublishedShops';
export default function ManagedHome(props){
  const {site,loading,error}=useSite();
  if(loading)return <section className="ait-page">Loading All in One Today…</section>;
  if(error)return <section className="ait-page"><p className="ait-error">{error}</p></section>;
  const sections=site.sections.filter(section=>section.enabled && section.type!=='downloads'),hasShops=site.sections.some(section=>section.type==='shops');
  const categoryIndex=sections.findIndex(section=>section.type==='categories'),heroIndex=sections.findIndex(section=>section.type==='hero');
  const insertionIndex=categoryIndex>=0?categoryIndex:heroIndex;
  function renderSection(section){
    if(section.type==='hero')return <HeroSearch key={section.id} section={section}/>;
    if(section.type==='categories')return <CategoryGrid key={section.id} section={section}/>;
    if(section.type==='listings')return <TrendingSection key={section.id} section={section} {...props}/>;
    if(section.type==='shops')return <PublishedShops key={section.id} section={section}/>;
    return <section className="ait-home-section container" key={section.id}><div className={`ait-panel ${section.type==='banner'?'ait-cms-banner':''}`}>
      {section.image&&<img className="ait-cms-image" src={section.image} alt="" loading="lazy"/>}<h2>{section.title}</h2><p className="ait-cms-copy">{section.body}</p>
      {section.type==='steps'&&<div className="ait-step-grid">{(section.items||[]).map((item,index)=><article key={index}><p className="ait-eyebrow">0{index+1}</p><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>}
      {section.link&&<a className="btn-primary" href={section.link}>{section.button||'Explore'}</a>}
    </div></section>;
  }
  return <div className="figma-home-page">{sections.map((section,index)=><Fragment key={section.id}>{renderSection(section)}{!hasShops&&index===insertionIndex&&<PublishedShops/>}</Fragment>)}{!hasShops&&insertionIndex<0&&<PublishedShops/>}<section className="ait-home-section container"><div className="ait-panel"><p className="ait-eyebrow">FOR LOCAL BUSINESSES</p><h2>Your business, easy to find.</h2><p>All in One Today is a local business directory and listings platform. Our website business subscription covers your profile, product and service listings and registered branches. Customer enquiries go directly to each shop or listing owner. Buyers browse free and arrange purchases directly with sellers.</p><div className="ait-actions"><Link className="btn-primary" to="/pricing">View subscription pricing</Link><Link className="btn-secondary" to="/about">How the platform works</Link></div></div></section></div>;
}
