// ALUSAF v4. Barcha backend bir faylda. Parollar va maxfiy kalitlar faqat Vercel'da.
import { createClient } from '@supabase/supabase-js';
import { scrypt as scryptCallback, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 7;
const FAIL_LIMIT = 8;

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !process.env.SESSION_SECRET || !process.env.ADMIN_INITIAL_PASSWORD) {
    throw Object.assign(new Error('Vercel sozlamalari to‘liq emas: SUPABASE_URL, SUPABASE_SECRET_KEY, SESSION_SECRET, ADMIN_INITIAL_PASSWORD.'), { status: 503 });
  }
  if (process.env.SESSION_SECRET.length < 32) throw Object.assign(new Error('SESSION_SECRET kamida 32 belgidan iborat bo‘lsin.'), {status:503});
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function fail(message, status=400) { throw Object.assign(new Error(message), {status}); }
function must(result) { if (result.error) { console.error('DB error:', result.error.message); fail('Baza xatosi: SQL kodini va server sozlamalarini tekshiring.', 500); } return result.data; }
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return 'scrypt$' + salt + '$' + hash.toString('hex');
}
async function checkPassword(password, stored) {
  const parts = String(stored||'').split('$');
  if(parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const actual = Buffer.from(parts[2], 'hex');
  if(actual.length !== 64) return false;
  const expected = await scrypt(password, parts[1], actual.length);
  return timingSafeEqual(actual, expected);
}
function signedToken(user) {
  const p = Buffer.from(JSON.stringify({id:user.id, v:user.auth_version, exp:Date.now()+SESSION_DAYS*86400000})).toString('base64url');
  const sig = createHmac('sha256', process.env.SESSION_SECRET).update(p).digest('base64url');
  return p+'.'+sig;
}
function readCookie(req) {
  const cookies = String(req.headers.cookie||'').split(';').map(x=>x.trim());
  return (cookies.find(x=>x.startsWith('alusaf_session='))||'').split('=').slice(1).join('');
}
function parseToken(token) {
  try {
    const [p,s] = token.split('.');
    if(!p || !s) return null;
    const valid = createHmac('sha256', process.env.SESSION_SECRET).update(p).digest();
    const actual = Buffer.from(s,'base64url');
    if(actual.length !== valid.length || !timingSafeEqual(actual, valid)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if(!payload.id || !Number.isInteger(payload.v) || Date.now()>payload.exp) return null;
    return payload;
  } catch { return null; }
}
function cookieHeader(req, user) {
  const secure = (req.headers['x-forwarded-proto']||'https') === 'https';
  return 'alusaf_session='+signedToken(user)+'; HttpOnly; Path=/; SameSite=Strict; Max-Age='+(SESSION_DAYS*86400)+(secure?'; Secure':'');
}
function clearCookie(req) {
  const secure=(req.headers['x-forwarded-proto']||'https')==='https';
  return 'alusaf_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'+(secure?'; Secure':'');
}
function publicUser(u) { return { id:u.id, username:u.username, full_name:u.full_name, phone:u.phone||'', role:u.role, active:u.active }; }
function string(v, max=160) { return String(v??'').trim().slice(0,max); }
function number(v, name, max=1e14) { const x=Number(v); if(!Number.isFinite(x)||x<0||x>max) fail(name+' noto‘g‘ri.'); return x; }
function required(v,name,max=160){ const x=string(v,max); if(!x) fail(name+' kiritilmadi.'); return x; }
function adminBoss(u){if(!['admin','boss'].includes(u.role))fail('Sizda bu bo‘limga ruxsat yo‘q.',403);}
function admin(u){if(u.role!=='admin')fail('Faqat admin bajaradi.',403);}
function dayUz(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
async function ensureAdmin(db) {
  const {data:existing,error} = await db.from('al_users').select('id').eq('role','admin').limit(1);
  if(error){console.error(error);fail('Jadvallar topilmadi. Avval schema.sql ni Supabase’da Run qiling.',503);}
  if(existing.length) return;
  const username=string(process.env.ADMIN_USERNAME||'Asliddin',32).toLowerCase();
  const {data:conflict,error:err} = await db.from('al_users').select('id').eq('username',username).maybeSingle();
  if(err) must({error:err});
  if(conflict) fail('Admin nomi band. Boshqa ADMIN_USERNAME tanlang yoki bazani tekshiring.',503);
  const password=process.env.ADMIN_INITIAL_PASSWORD;
  if(password.length<10) fail('ADMIN_INITIAL_PASSWORD kamida 10 ta belgidan iborat bo‘lsin.',503);
  const {error:insertError}=await db.from('al_users').insert({username, full_name:'Asliddin', role:'admin', password_hash:await hashPassword(password)});
  if(insertError && insertError.code!=='23505'){console.error(insertError);fail('Adminni yaratib bo‘lmadi.',503);}
}
async function userFromCookie(db,req) {
  const token=parseToken(readCookie(req));
  if(!token)fail('Avval tizimga kiring.',401);
  const row=must(await db.from('al_users').select('*').eq('id',token.id).maybeSingle());
  if(!row || !row.active || token.v!==row.auth_version)fail('Sessiya tugagan. Qayta kiring.',401);
  return row;
}
async function assigned(db,u,projectId) {
  if(['admin','boss'].includes(u.role))return;
  if(u.role!=='worker')fail('Admin tasdiqlashini kuting.',403);
  const a=must(await db.from('al_assignments').select('project_id').eq('user_id',u.id).eq('project_id',projectId).maybeSingle());
  if(!a)fail('Bu obyekt sizga biriktirilmagan.',403);
}
async function projectExists(db,id){const p=must(await db.from('al_projects').select('id').eq('id',id).maybeSingle());if(!p)fail('Obyekt topilmadi.',404);}
function checkOrigin(req){
  if(!req.headers.origin)return; // SameSite=Strict cookies ham tekshiriladi
  let originHost; try{originHost=new URL(req.headers.origin).host;}catch{fail('Origin xato.',403);}
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(originHost!==host)fail('Boshqa saytdan so‘rov taqiqlangan.',403);
}
const makeError = (res,error) => {
  const status=Number(error.status)||500;
  if(status>=500)console.error(error);
  return res.status(status).json({error:status>=500 && status!==503?'Server xatosi. Loglarni tekshiring.':error.message});
};

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    const db=client();
    await ensureAdmin(db);
    const method=req.method||'GET';
    if(!['GET','POST'].includes(method))fail('Faqat GET/POST.',405);
    if(method==='POST') {
      checkOrigin(req);
      if(!String(req.headers['content-type']||'').includes('application/json'))fail('JSON talab qilinadi.',415);
    }
    const body=method==='POST' ? (typeof req.body==='object' && req.body!==null?req.body:JSON.parse(String(req.body||'{}'))) : {};
    const action=method==='GET' ? String(req.query?.action||'boot') : string(body.action,40);
    if(method==='POST' && action==='register') {
      const username=required(body.username,'Login',32).toLowerCase();
      if(!/^[a-z0-9_]{3,32}$/.test(username))fail('Login: faqat lotin harflari, raqam va _, kamida 3 ta belgi.');
      const full_name=required(body.full_name,'Ism',80);
      const phone=required(body.phone,'Telefon',30);
      if(!/^\+?[0-9()\s-]{7,24}$/.test(phone))fail('Telefon raqami noto‘g‘ri.');
      if(typeof body.password!=='string'||body.password.length<10||body.password.length>128)fail('Parol 10–128 belgidan iborat bo‘lsin.');
      const result=await db.from('al_users').insert({username,full_name,phone,role:'pending',password_hash:await hashPassword(body.password)});
      if(result.error?.code==='23505')fail('Bu login band.',409);
      must(result);
      return res.json({ok:true,message:'Ro‘yxatdan o‘tdingiz. Admin lavozim berishini kuting.'});
    }
    if(method==='POST' && action==='login') {
      const username=string(body.username,32).toLowerCase();
      const password=String(body.password||'');
      const row=must(await db.from('al_users').select('*').eq('username',username).maybeSingle());
      if(!row || !row.active)fail('Login yoki parol noto‘g‘ri.',401);
      if(row.locked_until && new Date(row.locked_until)>new Date())fail('Ko‘p xato urinish. 15 daqiqadan keyin urinib ko‘ring.',429);
      const ok=await checkPassword(password,row.password_hash);
      if(!ok){const count=(row.failed_attempts||0)+1;must(await db.from('al_users').update({failed_attempts:count>=FAIL_LIMIT?0:count,locked_until:count>=FAIL_LIMIT?new Date(Date.now()+15*60000).toISOString():null}).eq('id',row.id));fail('Login yoki parol noto‘g‘ri.',401);}
      must(await db.from('al_users').update({failed_attempts:0,locked_until:null}).eq('id',row.id));
      res.setHeader('Set-Cookie',cookieHeader(req,row));
      return res.json({ok:true, user:publicUser(row)});
    }
    if(method==='POST' && action==='logout'){
      res.setHeader('Set-Cookie',clearCookie(req));return res.json({ok:true});
    }
    const user=await userFromCookie(db,req);
    if(method==='POST' && action==='password'){
      if(!await checkPassword(String(body.old_password||''),user.password_hash))fail('Eski parol noto‘g‘ri.',401);
      if(typeof body.new_password!=='string'||body.new_password.length<10||body.new_password.length>128)fail('Yangi parol 10–128 belgidan iborat bo‘lsin.');
      const nextVersion=user.auth_version+1;
      must(await db.from('al_users').update({password_hash:await hashPassword(body.new_password),auth_version:nextVersion}).eq('id',user.id));
      res.setHeader('Set-Cookie',cookieHeader(req,{...user,auth_version:nextVersion}));
      return res.json({ok:true});
    }
    if(method==='GET' && action==='boot') {
      if(user.role==='pending')return res.json({me:publicUser(user),projects:[],users:[],assignments:[],expenses:[],payments:[],logs:[]});
      if(user.role==='worker') {
        const assignments=must(await db.from('al_assignments').select('project_id').eq('user_id',user.id));
        const ids=assignments.map(x=>x.project_id);
        const raw=ids.length?must(await db.from('al_projects').select('id,name,address,area_m2,status').in('id',ids)):[];
        const logs=must(await db.from('al_work_logs').select('id,user_id,project_id,work_date,arrived_at,left_at,completed_m2,note').eq('user_id',user.id).order('work_date',{ascending:false}).limit(120));
        return res.json({me:publicUser(user),projects:raw,users:[],assignments:[],expenses:[],payments:[],logs});
      }
      adminBoss(user);
      const [ps,us,as,es,pa,ls]=await Promise.all([
        db.from('al_projects').select('*').order('created_at',{ascending:false}),
        db.from('al_users').select('id,username,full_name,phone,role,active,created_at').order('created_at',{ascending:false}),
        db.from('al_assignments').select('*'),
        db.from('al_expenses').select('*').order('created_at',{ascending:false}).limit(1500),
        db.from('al_payments').select('*').order('created_at',{ascending:false}).limit(1500),
        db.from('al_work_logs').select('*').order('work_date',{ascending:false}).limit(1500)
      ]);
      return res.json({me:publicUser(user),projects:must(ps),users:must(us),assignments:must(as),expenses:must(es),payments:must(pa),logs:must(ls)});
    }
    if(method!=='POST')fail('Noma’lum so‘rov.',404);
    if(action==='project') {
      adminBoss(user);
      const row={name:required(body.name,'Obyekt nomi',140),client_name:string(body.client_name,80),client_phone:string(body.client_phone,30),address:string(body.address,200),area_m2:number(body.area_m2||0,'Kvadrat'),sell_price_m2:number(body.sell_price_m2||0,'Narx'),contract_amount:number(body.contract_amount||0,'Shartnoma'),status:string(body.status||'Yangi',40)};
      const saved=must(await db.from('al_projects').insert(row).select('id').single());
      return res.json({ok:true,id:saved.id});
    }
    if(action==='project_status'){
      adminBoss(user);
      must(await db.from('al_projects').update({status:required(body.status,'Holat',40)}).eq('id',required(body.project_id,'Obyekt ID')));
      return res.json({ok:true});
    }
    if(action==='expense'){
      adminBoss(user);
      const project_id=required(body.project_id,'Obyekt ID'); await projectExists(db,project_id);
      const category=required(body.category,'Tur',40);
      const qty=number(body.qty,'Miqdor',1e8), unit_price=number(body.unit_price,'Narx',1e14);
      if(qty===0)fail('Miqdor 0 bo‘lmasin.');
      const width_m=category==='Alukobond' ? number(body.width_m||1.22,'Eni',100) : null;
      const height_m=category==='Alukobond'?number(body.height_m||2.44,'Bo‘yi',100) : null;
      const row={project_id,category,item_name:required(body.item_name,'Nomi',120),qty,unit:required(body.unit,'Birlik',20),unit_price,width_m,height_m,note:string(body.note,240),created_by:user.id};
      must(await db.from('al_expenses').insert(row));return res.json({ok:true});
    }
    if(action==='payment'){
      adminBoss(user);
      const project_id=required(body.project_id,'Obyekt ID');await projectExists(db,project_id);
      const amount=number(body.amount,'To‘lov');if(amount<=0)fail('To‘lov 0 dan katta bo‘lsin.');
      must(await db.from('al_payments').insert({project_id,amount,note:string(body.note,240),created_by:user.id}));return res.json({ok:true});
    }
    if(action==='role'){
      admin(user);
      const id=required(body.user_id,'Foydalanuvchi ID');
      if(id===user.id)fail('O‘zingizning admin huquqingizni almashtirmang.');
      const target=must(await db.from('al_users').select('id,role').eq('id',id).maybeSingle());
      if(!target||target.role==='admin')fail('Bu akkauntning lavozimini almashtirish mumkin emas.',403);
      if(!['pending','worker','boss'].includes(body.role))fail('Lavozim noto‘g‘ri.');
      must(await db.from('al_users').update({role:body.role}).eq('id',id));
      return res.json({ok:true});
    }
    if(action==='assign'){
      admin(user);
      const user_id=required(body.user_id,'Ishchi ID'),project_id=required(body.project_id,'Obyekt ID');
      const target=must(await db.from('al_users').select('role').eq('id',user_id).maybeSingle());
      if(!target||target.role!=='worker')fail('Faqat ishchiga obyekt biriktiriladi.');
      await projectExists(db,project_id);
      if(body.assigned===false)must(await db.from('al_assignments').delete().eq('user_id',user_id).eq('project_id',project_id));
      else must(await db.from('al_assignments').upsert({user_id,project_id},{onConflict:'user_id,project_id'}));
      return res.json({ok:true});
    }
    if(['work_start','work_end','work_save'].includes(action)){
      if(user.role==='pending')fail('Lavozim berilishini kuting.',403);
      const project_id=required(body.project_id,'Obyekt ID');await assigned(db,user,project_id);
      const work_date=dayUz();
      const log=must(await db.from('al_work_logs').select('*').eq('user_id',user.id).eq('project_id',project_id).eq('work_date',work_date).maybeSingle());
      if(action==='work_start'){
        if(log?.arrived_at)fail('Bugungi ish boshlanishi allaqachon yozilgan.');
        if(log)must(await db.from('al_work_logs').update({arrived_at:new Date().toISOString()}).eq('id',log.id));
        else must(await db.from('al_work_logs').insert({user_id:user.id,project_id,work_date,arrived_at:new Date().toISOString()}));
      }
      if(action==='work_end'){
        if(!log?.arrived_at)fail('Avval kelgan vaqtingizni belgilang.');
        if(log.left_at)fail('Ketish vaqti yozilgan.');
        must(await db.from('al_work_logs').update({left_at:new Date().toISOString()}).eq('id',log.id));
      }
      if(action==='work_save'){
        if(!log?.arrived_at)fail('Avval Ish boshladim tugmasini bosing.');
        must(await db.from('al_work_logs').update({completed_m2:number(body.completed_m2||0,'Bajarilgan m²',1e7),note:string(body.note,400)}).eq('id',log.id));
      }
      return res.json({ok:true});
    }
    fail('Bunday amal topilmadi.',404);
  }catch(error){return makeError(res,error);}
}
