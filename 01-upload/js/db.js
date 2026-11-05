import {STORES,emptyState,initialCatalog,orderedModules,upgradeCatalog} from './model.js';
import {assertGraph} from './integrity.js';
let connection,chain=Promise.resolve();
const channel=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('shijuan-phase1-changes'):null;
export function openDB(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{const request=indexedDB.open('shijuan-papers-v1',1);
    request.onupgradeneeded=()=>{for(const name of STORES)request.result.createObjectStore(name,{keyPath:'id'});};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>{connection=null;reject(request.error);};request.onblocked=()=>reject(Error('请关闭其他旧版标签页后重试'));
  });return connection;
}
export async function snapshot(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,'readonly'),requests=STORES.map(name=>tx.objectStore(name).getAll());tx.oncomplete=()=>{const state=Object.fromEntries(STORES.map((name,i)=>[name,requests[i].result]));state.modules=orderedModules(state.modules);resolve(state);};tx.onerror=()=>reject(tx.error);});}
async function commit(state){upgradeCatalog(state);assertGraph(state);const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,'readwrite');tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('本地存储事务失败'));for(const name of STORES){const store=tx.objectStore(name);store.clear();for(const entry of state[name])store.put(entry);}});}
// Serialize writes, including across tabs. The whole graph commits atomically.
export function update(mutator){
  const job=async()=>{const work=async()=>{const state=await snapshot();const result=await mutator(state);await commit(state);channel?.postMessage({changed:true});return result;};return navigator.locks?navigator.locks.request('shijuan-write-v1',work):work();};
  const promise=chain.then(job,job);chain=promise.catch(()=>{});return promise;
}
export async function initialize(){await openDB();await update(state=>{if(!state.modules.length&&!state.papers.length){const initial=initialCatalog();for(const name of STORES)state[name]=initial[name];}});return snapshot();}
export function onExternalChange(callback){if(channel)channel.onmessage=callback;}
export const resetForTests=()=>update(s=>Object.assign(s,initialCatalog()));
