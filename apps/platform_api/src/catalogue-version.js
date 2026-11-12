import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {categoryVisible} from './catalogue-visibility.js';

export async function initializeCatalogueVersion(pool) {
  let sql=await readFile(new URL('./catalogue-version-schema.sql',import.meta.url),'utf8');
  sql=sql.replaceAll('__categoryVisible__',categoryVisible);
  await pool.query(sql);
}

// One indexed row, not a catalogue scan, per foreground change check. A revision
// is visible atomically with the catalogue transaction that committed it.
export async function readCatalogueVersion(pool,{family=false}={}) {
  const scope=family?'family':'public';
  const row=(await pool.query('SELECT epoch,revision::text AS revision FROM catalogue_revisions WHERE scope=$1',[scope])).rows[0];
  if(!row)throw Object.assign(new Error('Catalogue refresh is temporarily unavailable.'),{status:503});
  return {version:createHash('sha256').update(`catalogue-v1:${scope}:${row.epoch}:${row.revision}`).digest('hex')};
}

export const catalogueVersionHandler=pool=>async(req,res)=>{
  res.set('Cache-Control','no-store');res.vary('X-AIT-Client');
  if(Object.keys(req.query).length)return res.status(400).json({success:false,message:'Do not include filters with a catalogue version check.'});
  res.json({success:true,data:await readCatalogueVersion(pool)});
};
