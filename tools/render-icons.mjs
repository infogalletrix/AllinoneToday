import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'apps/web_app/package.json')),{Resvg}=require('@resvg/resvg-js');
const svg=await readFile(resolve(root,'apps/web_app/public/brand.svg'),'utf8');
for(const app of ['mobile_app','merchant_app']){
  const directory=resolve(root,`apps/${app}/ios/Runner/Assets.xcassets/AppIcon.appiconset`);
  const content=JSON.parse(await readFile(resolve(directory,'Contents.json'),'utf8'));
  for(const item of content.images){if(!item.filename)continue;const size=Math.round(Number(item.size.split('x')[0])*Number(item.scale.replace('x','')));await writeFile(resolve(directory,item.filename),new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng());}
}
console.log('iOS icon PNGs rendered from the repository SVG.');
