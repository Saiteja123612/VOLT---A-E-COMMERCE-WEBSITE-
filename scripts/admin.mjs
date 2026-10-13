import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateOperations } from '../operations.js';

let input=process.argv[2]||'';
if(input==='--interactive'){const {createInterface}=await import('node:readline/promises');const prompt=createInterface({input:process.stdin,output:process.stdout});try{input=await prompt.question('Your existing VOLT account email: ');}finally{prompt.close();}}
const email=input.trim().toLowerCase();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){console.error('Usage: npm run admin -- your-existing-account@example.com');process.exit(1);}
const file=process.env.DB_PATH||resolve(dirname(fileURLToPath(import.meta.url)),'../data/store.sqlite');
if(!existsSync(file)){console.error('Start VOLT and create your account first. No database was changed.');process.exit(1);}
const db=new DatabaseSync(file);migrateOperations(db);
const user=db.prepare('SELECT id FROM users WHERE email=?').get(email);
if(!user){console.error('Create this account in VOLT first, then run this command again.');db.close();process.exit(1);}
db.exec('BEGIN IMMEDIATE');
try{
  db.prepare("UPDATE users SET role='admin',status='active' WHERE id=?").run(user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  db.prepare('INSERT INTO audit_log(actor_id,action,target,detail,created_at) VALUES(NULL,?,?,?,?)').run('admin.granted_by_owner',user.id,'{}',new Date().toISOString());
  db.exec('COMMIT');console.log('Administrator access granted. Sign in again, then open Admin console.');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
