import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
// TEMPORARY one-shot manual-override reorder. Removed after run.
function getDb(){ if(!getApps().length){ initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))}) } return getFirestore() }
const ORDER=[
  'hc-admin','hc-content','id-1779739492055-1','hc-revenue', // TNB block
  'life-admin','personal-finance',                           // manual: top of mind
  'from-nico','id-1772142500118-1','network','id-1772471089249-4','id-1772471094681-5',
  'id-1780351450507-1','friends','infra','id-1772480834448-1','georgetown','portfolio',
  'id-1772719720553-1','id-1772471887374-9'
]
export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'})
    if((req.headers['x-api-key']||req.query?.apiKey)!==process.env.API_SECRET) return res.status(401).json({error:'Unauthorized'})
    const db=getDb(); const userRef=db.collection('users').doc(process.env.OWNER_UID)
    const b=db.batch(); ORDER.forEach((id,i)=>b.set(userRef.collection('projects').doc(id),{sortOrder:i},{merge:true})); await b.commit()
    const fs=await userRef.collection('projects').get(); const final=[]
    fs.forEach(p=>{const d=p.data(); final.push({id:p.id,name:d.name,sortOrder:d.sortOrder})})
    final.sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999))
    return res.status(200).json({ok:true,set:ORDER.length,finalProjects:final})
  }catch(e){ return res.status(500).json({error:e.message}) }
}
