// Generate new-project Android signing material locally. Never commit .local/signing.
import {randomBytes} from 'node:crypto';import {mkdir,writeFile,access} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'.local/signing'),keystore=resolve(directory,'allinonetoday-release.jks');
await mkdir(directory,{recursive:true});
try{await access(keystore);console.log('Existing signing material preserved.');process.exit(0);}catch{}
const password=randomBytes(32).toString('base64url');
const keytool='C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe';
execFileSync(keytool,['-genkeypair','-keystore',keystore,'-storetype','JKS','-alias','allinonetoday','-keyalg','RSA','-keysize','4096','-validity','10000','-storepass:env','AIT_SIGNING_PASSWORD','-keypass:env','AIT_SIGNING_PASSWORD','-dname','CN=All in One Today, O=Galletrix, C=IN'],{env:{...process.env,AIT_SIGNING_PASSWORD:password},stdio:'pipe'});
await writeFile(resolve(directory,'credentials.json'),JSON.stringify({storePassword:password,keyPassword:password,keyAlias:'allinonetoday',storeFile:keystore},null,2),{flag:'wx'});
for(const app of ['mobile_app','merchant_app'])await writeFile(resolve(root,`apps/${app}/android/key.properties`),`storePassword=${password}\nkeyPassword=${password}\nkeyAlias=allinonetoday\nstoreFile=${keystore.replaceAll('\\','/')}\n`,{flag:'wx'});
console.log('New Android release key created locally. Back up .local/signing securely before distributing updates. Secret values were not printed.');
