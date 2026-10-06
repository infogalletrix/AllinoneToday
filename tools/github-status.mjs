// Read-only repository and workflow status; authentication stays in memory.
import {execFileSync} from 'node:child_process';
const filled=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});
const token=filled.split(/\r?\n/).find(s=>s.startsWith('password='))?.slice(9);
if(!token)throw new Error('GitHub authentication unavailable.');
const response=await fetch('https://api.github.com/repos/infogalletrix/AllinoneToday',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
if(!response.ok)throw new Error('Repository inspection failed: '+response.status);
const repo=await response.json();console.log(JSON.stringify({repository:repo.full_name,private:repo.private,defaultBranch:repo.default_branch,canPush:repo.permissions?.push}));
