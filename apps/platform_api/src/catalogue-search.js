// Shared public catalogue matching. SQL identifiers are application constants;
// all search text, patterns and pagination values remain bound parameters.
import {z} from 'zod';

const textileWords=new Set(['textile','textiles','fabric','fabrics','garment','garments','clothing','apparel','fashion','readymade','readymades','ready-made','ready made']);
const textileCategoryQuery='textile | fabric | garment | clothing | apparel | fashion | readymade';
const genericShopWords=new Set(['shop','shops','store','stores']);
export const shopPaginationSchema=z.object({
  limit:z.coerce.number().int().min(1).max(100).default(100),
  offset:z.coerce.number().int().min(0).max(1000000).default(0),
});
export const escapeLike=value=>String(value).replace(/[\\%_]/g,'\\$&');

export function relatedCategoryQuery(query){
  const words=String(query).toLowerCase().trim().split(/\s+/).filter(word=>!genericShopWords.has(word));
  return textileWords.has(words.join(' '))?textileCategoryQuery:null;
}

export function catalogueSearchSql(query,values,{kind='shop',alias=kind==='shop'?'s':'l'}={}){
  if(!['shop','listing'].includes(kind)||!/^[_a-z][_a-z0-9]*$/i.test(alias))throw Error('Use a fixed catalogue SQL alias.');
  const term=String(query||'').trim().slice(0,100);
  if(!term)return 'true';
  values.push('%'+escapeLike(term)+'%');const pattern='$'+values.length;
  values.push(term);const text='$'+values.length;
  const related=relatedCategoryQuery(term);
  let relatedText;
  if(related){values.push(related);relatedText='$'+values.length;}
  const matching=(fields,category)=>{
    const clauses=[...fields.map(field=>`${field} ILIKE ${pattern} ESCAPE E'\\\\'`),`to_tsvector('english',concat_ws(' ',${fields.join(',')})) @@ plainto_tsquery('english',${text})`];
    const categoryFields='search_category.name,search_category.slug,search_category.subtitle';
    const categoryMatches=[`search_category.name ILIKE ${pattern} ESCAPE E'\\\\'`,`search_category.slug ILIKE ${pattern} ESCAPE E'\\\\'`,`search_category.subtitle ILIKE ${pattern} ESCAPE E'\\\\'`,`to_tsvector('english',concat_ws(' ',${categoryFields})) @@ plainto_tsquery('english',${text})`];
    if(relatedText)categoryMatches.push(`to_tsvector('english',concat_ws(' ',${categoryFields})) @@ to_tsquery('english',${relatedText})`);
    clauses.push(`EXISTS(SELECT 1 FROM marketplace_categories search_category WHERE search_category.name=${category} AND (${categoryMatches.join(' OR ')}))`);
    return '('+clauses.join(' OR ')+')';
  };
  if(kind==='shop')return matching([alias+'.name',alias+'.category',alias+'.location',alias+'.description'],alias+'.category');
  const own=matching([alias+'.title',alias+'.category',alias+'.subcategory',alias+'.location',alias+'.description'],alias+'.category');
  const parent=matching(['search_shop.name','search_shop.category','search_shop.location'],'search_shop.category');
  return `(${own} OR EXISTS(SELECT 1 FROM shops search_shop WHERE search_shop.id=${alias}.shop_id AND ${parent}))`;
}

// A shop's city still locates its products when an item's optional location is
// blank or records only a neighbourhood. Parent visibility stays enforced by
// the caller's public catalogue policy.
export function catalogueLocationSql(location,values,{kind='shop',alias=kind==='shop'?'s':'l'}={}){
  if(!['shop','listing'].includes(kind)||!/^[_a-z][_a-z0-9]*$/i.test(alias))throw Error('Use a fixed catalogue SQL alias.');
  const place=String(location||'').trim().slice(0,180);
  if(!place)return 'true';
  values.push('%'+escapeLike(place)+'%');const pattern='$'+values.length;
  const own=`${alias}.location ILIKE ${pattern} ESCAPE E'\\\\'`;
  if(kind==='shop')return own;
  return `(${own} OR EXISTS(SELECT 1 FROM shops search_location_shop WHERE search_location_shop.id=${alias}.shop_id AND search_location_shop.location ILIKE ${pattern} ESCAPE E'\\\\'))`;
}
