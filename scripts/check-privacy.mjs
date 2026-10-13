import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function privatePath(name) {
  if (name === '.env.example') return false;
  return /(^|\/)(?:\.env(?:\.[^/]+)?|data|backups?|\.vercel|\.netlify|node_modules)(\/|$)/i.test(name)
    || /\.(?:sqlite(?:3)?(?:-(?:wal|shm))?|db|pem|key|pfx|p12|log|zip|bak|dump|sql\.gz)$/i.test(name)
    || /(^|\/)(?:credentials|service[-_]?account)[^/]*\.json$/i.test(name);
}

export function secretTypes(content) {
  const patterns = {
    'private key': /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    'GitHub token': /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    'AWS access key': /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    'Stripe live secret': /\bsk_live_[A-Za-z0-9]{16,}\b/,
    'Supabase secret': /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
    'database password URL': /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/,
    'JWT credential': /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/
  };
  return Object.entries(patterns).filter(([, pattern]) => pattern.test(content)).map(([name]) => name);
}

export function checkRepository() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = execFileSync('git', ['ls-files', '-z'], { cwd:root, encoding:'utf8' }).split('\0').filter(Boolean);
  const problems=[];
  for(const file of files) {
    if(privatePath(file))problems.push(`${file}: private/runtime file must not be tracked`);
    if(/\.(png|jpg|jpeg|webp|woff2?)$/i.test(file))continue;
    for(const type of secretTypes(readFileSync(resolve(root,file),'utf8')))problems.push(`${file}: possible ${type}`);
  }
  if(problems.length)throw new Error(problems.join('\n'));
  console.log(`Privacy check passed for ${files.length} tracked files. This pattern scan is not a guarantee that every secret can be detected.`);
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)checkRepository();
