// Never print secrets. Values travel through SSH stdin, not process arguments.
import {readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const values=JSON.parse(await readFile(resolve(root,'.local/marketplace-credentials.json'),'utf8'));
const allowed=['OWNER_EMAIL','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','GOOGLE_WEB_CLIENT_ID','GOOGLE_IOS_PUBLIC_CLIENT_ID','GOOGLE_IOS_BUSINESS_CLIENT_ID','OPENAI_API_KEY','PRICING_AI_MODEL'];
const configuration={};
for(const name of allowed){const value=values[name];if(value){if(typeof value!=='string'||!/^[A-Za-z0-9_./:+@=-]+$/.test(value)||value.length>1000)throw new Error('Invalid private configuration field: '+name);configuration[name]=value;}}
if(configuration.OWNER_EMAIL!=='kgaravind1998@gmail.com')throw new Error('The designated owner email must match the user-approved account.');
const billing=allowed.slice(1,4).filter(name=>configuration[name]);
if(billing.length && billing.length!==3)throw new Error('Fill all three Razorpay fields together before enabling payments.');
if(configuration.RAZORPAY_KEY_ID&&!/^rzp_(test|live)_\w+$/.test(configuration.RAZORPAY_KEY_ID))throw new Error('Invalid Razorpay Key ID.');
const ownerFile=resolve(root,'.local/owner-setup.json');
let owner;
try{await access(ownerFile);owner=JSON.parse(await readFile(ownerFile,'utf8'));}catch{owner={email:configuration.OWNER_EMAIL,setupCode:randomBytes(32).toString('base64url'),url:'https://allinonetoday.galletrix.com/admin'};await writeFile(ownerFile,JSON.stringify(owner,null,2),{flag:'wx',mode:0o600});}
configuration.OWNER_SETUP_TOKEN_HASH=createHash('sha256').update(owner.setupCode).digest('hex');
// A fixed remote command validates field names again and preserves unrelated
// configuration. Backups and environment files remain root-readable only.
const remote=`cd /opt/allinonetoday && node --input-type=module -e 'import {readFileSync,writeFileSync,copyFileSync,chmodSync} from "node:fs";let input="";for await(const chunk of process.stdin)input+=chunk;const data=JSON.parse(input);const allowed=new Set(${JSON.stringify([...allowed,'OWNER_SETUP_TOKEN_HASH'])});const path="deployment/.env";const original=readFileSync(path,"utf8");const backup=path+".backup-"+Date.now();copyFileSync(path,backup);chmodSync(backup,384);let lines=original.split("\\n");for(const [key,value]of Object.entries(data)){if(!allowed.has(key)||typeof value!=="string"||!/^[A-Za-z0-9_./:+@=-]+$/.test(value))throw Error("Invalid configuration");lines=lines.filter(line=>!line.startsWith(key+"="));lines.push(key+"="+JSON.stringify(value));}writeFileSync(path,lines.join("\\n")+"\\n",{mode:384});chmodSync(path,384);console.log("Private marketplace configuration saved; values hidden.");'`;
const transport=resolve(root,'../Galletrix ERP/tools/vps-release.mjs');
const child=spawn(process.execPath,[transport,'runstdin',remote],{cwd:root,stdio:['pipe','pipe','pipe']});
let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',()=>{});child.stdin.end(JSON.stringify(configuration));
const code=await new Promise(done=>child.on('close',done));
if(code!==0)throw new Error('Private configuration transport failed. No secret values were printed.');
console.log(output.trim());console.log('Owner setup code is in the ignored local file .local/owner-setup.json. Never share or commit it.');
