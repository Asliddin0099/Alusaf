import bcrypt from "bcryptjs";
import {
  db, usernameOf, ensureFirstAdmin, currentUser, setSession, clearSession,
  isBoss, requireNumber, result
} from "../../lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x));
const short = (v, max = 140) => String(v ?? "").trim().slice(0, max);

function throwIfError(reply) {
  if (reply.error) throw reply.error;
  return reply.data || [];
}

async function projectAllowed(user, projectId) {
  if (!uuid(projectId)) return false;
  if (isBoss(user)) return true;
  if (user.role !== "worker") return false;
  const { data, error } = await db().from("crm_assignments")
    .select("project_id").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function GET() {
  try {
    const me = await currentUser();
    if (!me) return result({ me: null });
    const publicMe = { id: me.id, username: me.username, name: me.full_name, role: me.role };
    if (me.role === "pending") return result({ me: publicMe, projects: [], logs: [] });

    if (me.role === "worker") {
      const memberships = throwIfError(await db().from("crm_assignments")
        .select("project_id").eq("user_id", me.id));
      const ids = memberships.map(m => m.project_id);
      const projects = ids.length ? throwIfError(await db().from("crm_projects")
        .select("id,name,address,status,area_m2")
        .in("id", ids).order("created_at", { ascending: false })) : [];
      const logs = throwIfError(await db().from("crm_work_logs")
        .select("id,project_id,arrived_at,left_at,completed_m2,note")
        .eq("user_id", me.id).order("arrived_at", { ascending: false }).limit(100));
      return result({ me: publicMe, projects, logs });
    }

    const [p,e,pay,l,people,a] = await Promise.all([
      db().from("crm_projects").select("*").order("created_at",{ascending:false}),
      db().from("crm_expenses").select("*").order("created_at",{ascending:false}).limit(1000),
      db().from("crm_payments").select("*").order("created_at",{ascending:false}).limit(1000),
      db().from("crm_work_logs").select("*").order("arrived_at",{ascending:false}).limit(1000),
      db().from("crm_users").select("id,username,full_name,role,phone,active,created_at")
        .order("created_at", {ascending:false}),
      db().from("crm_assignments").select("project_id,user_id")
    ]);
    return result({
      me: publicMe, projects: throwIfError(p), expenses: throwIfError(e),
      payments: throwIfError(pay), logs: throwIfError(l),
      people: throwIfError(people), assignments: throwIfError(a)
    });
  } catch (error) {
    console.error("GET /api", error);
    return result({ error: "Server/baza xatosi. Vercel loglarini tekshiring." }, 500);
  }
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && new URL(origin).host !== host) return result({error:"Noto'g'ri manba"},403);
  try {
    const body = await request.json();
    const action = body.action;

    if (action === "register") {
      const username = usernameOf(body.username);
      const password = String(body.password || "");
      if (!/^[a-z0-9_.-]{3,32}$/.test(username))
        return result({error:"Login 3–32 belgi: lotin harflari va raqamlar"},400);
      if (username === usernameOf(process.env.ADMIN_INITIAL_USERNAME || "Asliddin"))
        return result({error:"Bu login administrator uchun ajratilgan"},400);
      if (password.length < 10 || password.length > 128)
        return result({error:"Parol kamida 10 belgi bo'lsin"},400);
      const name = short(body.name,100);
      if (name.length < 2) return result({error:"Ismni kiriting"},400);
      const hash = await bcrypt.hash(password,12);
      const {error} = await db().from("crm_users").insert({
        username,full_name:name,phone:short(body.phone,32),password_hash:hash,role:"pending"
      });
      if (error?.code === "23505") return result({error:"Bunday login bor"},409);
      if (error) throw error;
      return result({ok:true,message:"Ro'yxatdan o'tdingiz. Endi login qiling."});
    }

    if (action === "login") {
      await ensureFirstAdmin();
      const username = usernameOf(body.username);
      const password = String(body.password || "");
      const {data:user,error} = await db().from("crm_users")
        .select("*").eq("username",username).maybeSingle();
      if (error) throw error;
      if (!user || !user.active) return result({error:"Login yoki parol noto'g'ri"},401);
      if (user.locked_until && new Date(user.locked_until) > new Date())
        return result({error:"Ko'p noto'g'ri urinish. 15 daqiqadan so'ng urinib ko'ring."},429);
      if (!(await bcrypt.compare(password,user.password_hash))) {
        const attempts = Number(user.failed_attempts || 0) + 1;
        throwIfError(await db().from("crm_users").update({
          failed_attempts: attempts >= 5 ? 0 : attempts,
          locked_until: attempts >= 5 ? new Date(Date.now()+15*60*1000).toISOString() : null
        }).eq("id",user.id));
        return result({error:"Login yoki parol noto'g'ri"},401);
      }
      throwIfError(await db().from("crm_users")
        .update({failed_attempts:0,locked_until:null}).eq("id",user.id));
      await setSession(user);
      return result({ok:true});
    }

    if (action === "logout") {
      await clearSession();
      return result({ok:true});
    }

    const me = await currentUser();
    if (!me) return result({error:"Qayta kiring"},401);

    if (action === "password") {
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 10 || newPassword.length > 128)
        return result({error:"Yangi parol kamida 10 belgi bo'lsin"},400);
      const {data:user,error} = await db().from("crm_users")
        .select("password_hash,session_version").eq("id",me.id).single();
      if (error) throw error;
      if (!(await bcrypt.compare(String(body.oldPassword || ""),user.password_hash)))
        return result({error:"Eski parol noto'g'ri"},400);
      const hash = await bcrypt.hash(newPassword,12);
      const version = user.session_version + 1;
      throwIfError(await db().from("crm_users")
        .update({password_hash:hash,session_version:version,failed_attempts:0,locked_until:null})
        .eq("id",me.id));
      await setSession({...me,session_version:version});
      return result({ok:true});
    }

    if (me.role === "pending") return result({error:"Admin ruxsatini kuting"},403);

    if (action === "start") {
      if (!(await projectAllowed(me,body.project_id))) return result({error:"Obyekt sizga biriktirilmagan"},403);
      const existing = throwIfError(await db().from("crm_work_logs")
        .select("id").eq("user_id",me.id).is("left_at",null).limit(1));
      if (existing.length) return result({error:"Avval ochiq smenangizni yakunlang"},400);
      throwIfError(await db().from("crm_work_logs")
        .insert({project_id:body.project_id,user_id:me.id}));
      return result({ok:true});
    }

    if (action === "finish") {
      if (!uuid(body.id)) return result({error:"Smena topilmadi"},400);
      const {data:shift,error} = await db().from("crm_work_logs")
        .select("id,project_id").eq("id",body.id).eq("user_id",me.id).is("left_at",null).maybeSingle();
      if (error) throw error;
      if (!shift) return result({error:"Ochiq smena topilmadi"},404);
      const m2 = requireNumber(body.m2,"Kvadrat",true);
      const update = await db().from("crm_work_logs").update({
        left_at:new Date().toISOString(),completed_m2:m2,note:short(body.note,1000)
      }).eq("id",shift.id).eq("user_id",me.id).is("left_at",null).select("id");
      if (update.error) throw update.error;
      if (!update.data?.length) return result({error:"Smena avval yakunlangan"},409);
      return result({ok:true});
    }

    if (!isBoss(me)) return result({error:"Ruxsat yo'q"},403);

    if (action === "project") {
      const name = short(body.name,140);
      if (!name) return result({error:"Obyekt nomini kiriting"},400);
      throwIfError(await db().from("crm_projects").insert({
        name, customer_name:short(body.customer_name,100),
        customer_phone:short(body.customer_phone,32),address:short(body.address,250),
        area_m2:requireNumber(body.area_m2,"Maydon",true),
        sell_price_m2:requireNumber(body.sell_price_m2,"Kvadrat narxi",true)
      }));
      return result({ok:true});
    }

    if (action === "status") {
      if (!uuid(body.project_id) || !["yangi","jarayonda","tayyor","topshirildi"].includes(body.status))
        return result({error:"Noto'g'ri obyekt/holat"},400);
      throwIfError(await db().from("crm_projects")
        .update({status:body.status}).eq("id",body.project_id));
      return result({ok:true});
    }

    if (action === "expense") {
      if (!uuid(body.project_id)) return result({error:"Obyektni tanlang"},400);
      const item = short(body.item_name,120);
      if (!item) return result({error:"Material nomini kiriting"},400);
      throwIfError(await db().from("crm_expenses").insert({
        project_id:body.project_id,category:short(body.category,50) || "Boshqa",
        item_name:item,quantity:requireNumber(body.quantity,"Miqdor"),
        unit:short(body.unit,20)||"dona",unit_price:requireNumber(body.unit_price,"Narx",true),
        note:short(body.note,400),
        sheet_width_m: body.category === "Alukobond" ? requireNumber(body.sheet_width_m || 1.22,"List eni") : null,
        sheet_height_m: body.category === "Alukobond" ? requireNumber(body.sheet_height_m || 2.44,"List bo'yi") : null
      }));
      return result({ok:true});
    }

    if (action === "payment") {
      if (!uuid(body.project_id)) return result({error:"Obyektni tanlang"},400);
      throwIfError(await db().from("crm_payments").insert({
        project_id:body.project_id,amount:requireNumber(body.amount,"To'lov"),
        note:short(body.note,400)
      }));
      return result({ok:true});
    }

    if (me.role !== "admin") return result({error:"Bu amal faqat adminda"},403);

    if (action === "role") {
      if (!uuid(body.user_id) || !["pending","worker","boss"].includes(body.role))
        return result({error:"Lavozim xato"},400);
      const {data:target,error} = await db().from("crm_users")
        .select("role,session_version").eq("id",body.user_id).maybeSingle();
      if (error) throw error;
      if (!target || target.role === "admin") return result({error:"Bu akkauntga ruxsat yo'q"},403);
      throwIfError(await db().from("crm_users").update({
        role:body.role,session_version:target.session_version+1
      }).eq("id",body.user_id));
      return result({ok:true});
    }

    if (action === "assign") {
      if (!uuid(body.user_id) || !uuid(body.project_id)) return result({error:"Xodim/obyektni tanlang"},400);
      const {data:worker,error} = await db().from("crm_users")
        .select("role").eq("id",body.user_id).maybeSingle();
      if (error) throw error;
      if (!worker || worker.role !== "worker") return result({error:"Avval Ishchi lavozimini bering"},400);
      throwIfError(await db().from("crm_assignments")
        .upsert({project_id:body.project_id,user_id:body.user_id},{onConflict:"project_id,user_id"}));
      return result({ok:true});
    }

    if (action === "unassign") {
      if (!uuid(body.user_id) || !uuid(body.project_id)) return result({error:"Xodim/obyektni tanlang"},400);
      throwIfError(await db().from("crm_assignments")
        .delete().eq("project_id",body.project_id).eq("user_id",body.user_id));
      return result({ok:true});
    }

    return result({error:"Noma'lum amal"},400);
  } catch (error) {
    console.error("POST /api",error);
    return result({error:"Server/baza xatosi. Vercel logini tekshiring."},500);
  }
}
