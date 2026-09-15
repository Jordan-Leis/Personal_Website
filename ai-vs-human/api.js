import {SUPABASE_URL,PUBLIC_KEY} from './config.js';
export async function rpc(name,args={}){
 const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok)throw new Error(data.message||'Request failed');return data;
}
