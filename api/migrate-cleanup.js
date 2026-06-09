import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
// TEMPORARY one-shot cleanup: merge duplicate Network + sink Nico Ideas. Removed after run.
function getDb(){ if(!getApps().length){ initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))}) } return getFirestore() }
const DUP_NETWORK='id-1772489672103-1'      // merge -> 'network'
const NICO_IDEAS='id-1772471887374-9'
export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'})
    if((req.headers['x-api-key']||req.query?.apiKey)!==process.env.API_SECRET) return res.status(401).json({error:'Unauthorized'})
    const db=getDb(); const userRef=db.collection('users').doc(process.env.OWNER_UID)
    const report={networkReassigned:0,dupDeleted:false,nicoIdeasSorted:false}
    // 1) merge dup Network into canonical 'network'
    const dupTasks=await userRef.collection('tasks').where('projectId','==',DUP_NETWORK).get()
    if(!dupTasks.empty){ const b=db.batch(); dupTasks.forEach(d=>b.set(d.ref,{projectId:'network'},{merge:true})); await b.commit(); report.networkReassigned=dupTasks.size }
    const dupDoc=await userRef.collection('projects').doc(DUP_NETWORK).get()
    if(dupDoc.exists){ await userRef.collection('projects').doc(DUP_NETWORK).delete(); report.dupDeleted=true }
    // 2) sink Nico Ideas to the bottom
    const ni=await userRef.collection('projects').doc(NICO_IDEAS).get()
    if(ni.exists){ await userRef.collection('projects').doc(NICO_IDEAS).set({sortOrder:99},{merge:true}); report.nicoIdeasSorted=true }
    // proof
    const fs=await userRef.collection('projects').get(); const final=[]
    fs.forEach(p=>{const d=p.data(); final.push({id:p.id,name:d.name,sortOrder:d.sortOrder})})
    final.sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999))
    return res.status(200).json({ok:true,report,finalProjects:final})
  }catch(e){ return res.status(500).json({error:e.message}) }
}
