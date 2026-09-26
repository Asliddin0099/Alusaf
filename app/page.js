"use client";

import { useEffect, useState } from "react";
const money = v => new Intl.NumberFormat("uz-UZ", {maximumFractionDigits:2}).format(Number(v||0)) + " so‘m";
const num = v => new Intl.NumberFormat("uz-UZ", {maximumFractionDigits:3}).format(Number(v||0));
const stamp = v => v ? new Date(v).toLocaleString("uz-UZ", {timeZone:"Asia/Tashkent"}) : "—";
const types = ["Alukobond","Profil","Samorez","Karkas","Ishchi haqi","Transport","Rover/bukish","Elektr","Boshqa"];
const statuses = ["yangi","jarayonda","tayyor","topshirildi"];

export default function Home() {
  const [data,setData] = useState(null);
  const [screen,setScreen] = useState("login");
  const [tab,setTab] = useState("summary");
  const [error,setError] = useState("");
  const [info,setInfo] = useState("");
  const [busy,setBusy] = useState(false);
  const [chosenProject,setChosenProject] = useState("");
  const [chosenUser,setChosenUser] = useState("");

  async function request(action, values = {}) {
    const r = await fetch("/api", { method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action,...values}) });
    const result = await r.json();
    if (!r.ok || result.error) throw new Error(result.error || "Xatolik");
    return result;
  }
  async function load() {
    const r = await fetch("/api", {cache:"no-store"});
    const result = await r.json();
    if (result.error) throw new Error(result.error);
    setData(result);
    setTab(current => current === "summary" && result.me?.role === "worker" ? "projects" : current);
  }
  useEffect(() => { load().catch(e=>setError(e.message)); }, []);

  async function run(action, values = {}, form = null, message = "Saqlandi") {
    setBusy(true); setError(""); setInfo("");
    try {
      const reply = await request(action,values);
      if (action === "login") { setScreen("login"); await load(); }
      else if (action === "logout") { setData({me:null}); setScreen("login"); }
      else if (action === "register") { setScreen("login"); setInfo("Ro‘yxatdan o‘tdingiz. Endi login qiling."); }
      else { await load(); setInfo(reply.message || message); }
      if (form) form.reset();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function submit(e,action) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    run(action,values,form);
  }
  const me = data?.me;
  const projects = data?.projects || [];
  const expenses = data?.expenses || [];
  const payments = data?.payments || [];
  const logs = data?.logs || [];
  const people = data?.people || [];
  const assignments = data?.assignments || [];
  const boss = me && ["admin","boss"].includes(me.role);
  const openShift = logs.find(l=>l.user_id === me?.id && !l.left_at) || (me?.role === "worker" ? logs.find(l=>!l.left_at) : null);
  const projectName = id => projects.find(p=>p.id===id)?.name || "Obyekt";
  const personName = id => people.find(p=>p.id===id)?.full_name || (id===me?.id ? me.name : "Xodim");
  const projectStats = project => {
    const contract = Number(project.area_m2||0) * Number(project.sell_price_m2||0);
    const paid = payments.filter(x=>x.project_id===project.id).reduce((n,x)=>n+Number(x.amount),0);
    const cost = expenses.filter(x=>x.project_id===project.id).reduce((n,x)=>n+Number(x.total),0);
    const panels = expenses.filter(x=>x.project_id===project.id && x.category==="Alukobond");
    return {contract,paid,cost,profit:contract-cost,debt:contract-paid,
      sheets:panels.reduce((n,x)=>n+Number(x.quantity),0),
      sheetsM2:panels.reduce((n,x)=>n+Number(x.material_area_m2||0),0)};
  };
  const totals = projects.reduce((s,p)=>{const x=projectStats(p);
    for(const key of ["contract","paid","cost","profit","debt"])s[key]+=x[key];
    return s;
  },{contract:0,paid:0,cost:0,profit:0,debt:0});

  if (data === null) return <main className="center"><div className="panel">AluSaf yuklanmoqda... {error}</div></main>;
  if (!me) return <main className="center"><section className="panel auth">
    <div className="brand">ALUSAF</div><h1>{screen==="register"?"Ro‘yxatdan o‘tish":"Tizimga kirish"}</h1>
    <p className="muted">Obyektlar, materiallar, ishchilar va moliyaviy nazorat</p>
    <div className="tabs"><button className={screen==="login"?"selected":""} onClick={()=>setScreen("login")}>Kirish</button>
      <button className={screen==="register"?"selected":""} onClick={()=>setScreen("register")}>Ro‘yxatdan o‘tish</button></div>
    {screen==="login" ? <form onSubmit={e=>submit(e,"login")} className="form">
      <label>Login<input name="username" autoComplete="username" placeholder="Login" required/></label>
      <label>Parol<input name="password" type="password" autoComplete="current-password" required/></label>
      <button className="primary" disabled={busy}>Kirish</button>
    </form> : <form onSubmit={e=>submit(e,"register")} className="form">
      <label>Ism va familiya<input name="name" maxLength={100} required/></label>
      <label>Telefon<input name="phone" type="tel" maxLength={32}/></label>
      <label>Yangi login<input name="username" minLength={3} maxLength={32} required/></label>
      <label>Parol (kamida 10 belgi)<input name="password" type="password" minLength={10} required/></label>
      <button className="primary" disabled={busy}>Ro‘yxatdan o‘tish</button>
      <p className="muted">Yangi akkaunt dastlab bo‘sh. Lavozimni admin beradi.</p>
    </form>}
    {error&&<p className="error">{error}</p>}{info&&<p className="success">{info}</p>}
  </section></main>;

  return <main className="shell">
    <header className="top"><div><div className="brand">ALUSAF</div>
      <span className="muted">{me.name} · {me.role==="boss"?"Boshliq":me.role==="admin"?"Admin":me.role==="worker"?"Ishchi":"Kutilmoqda"}</span></div>
      <div className="buttons"><button onClick={()=>load().catch(e=>setError(e.message))}>Yangilash</button>
        <button onClick={()=>run("logout")}>Chiqish</button></div></header>
    <nav className="tabs">
      {me.role!=="pending"&&<>
        {boss&&<button className={tab==="summary"?"selected":""} onClick={()=>setTab("summary")}>Umumiy hisobot</button>}
        <button className={tab==="projects"?"selected":""} onClick={()=>setTab("projects")}>Obyektlar</button>
        {boss&&<><button className={tab==="expense"?"selected":""} onClick={()=>setTab("expense")}>Xarajatlar</button>
          <button className={tab==="payment"?"selected":""} onClick={()=>setTab("payment")}>To‘lovlar</button></>}
        <button className={tab==="work"?"selected":""} onClick={()=>setTab("work")}>Ish hisoboti</button>
        {me.role==="admin"&&<button className={tab==="team"?"selected":""} onClick={()=>setTab("team")}>Xodimlar</button>}
      </>}
      <button className={tab==="settings"?"selected":""} onClick={()=>setTab("settings")}>Parol</button>
    </nav>
    {error&&<p className="error">{error}</p>}{info&&<p className="success">{info}</p>}

    {me.role==="pending"&&tab!=="settings"&&<section className="panel centerText">
      <h2>Admin tasdiqlashi kutilmoqda</h2>
      <p>Sizning akkauntingiz yaratildi. Admin lavozim va obyekt biriktirgach, bu yerda ishlaringiz ko‘rinadi.</p>
      <button onClick={()=>load().catch(e=>setError(e.message))}>Yangilash</button>
    </section>}

    {tab==="settings"&&<section className="panel limit"><h2>Parolni almashtirish</h2>
      <form className="form" onSubmit={e=>submit(e,"password")}>
        <label>Eski parol<input name="oldPassword" type="password" required/></label>
        <label>Yangi parol<input name="newPassword" type="password" minLength={10} required/></label>
        <button className="primary" disabled={busy}>Parolni o‘zgartirish</button>
      </form><p className="muted">Yangi parol kamida 10 belgi bo‘lsin. O‘zgartirganda eski sessiyalar bekor qilinadi.</p>
    </section>}

    {boss&&tab==="summary"&&<>
      <section className="stats">
        <div className="stat"><small>Shartnomalar</small><strong>{money(totals.contract)}</strong></div>
        <div className="stat"><small>Klientdan olingan</small><strong>{money(totals.paid)}</strong></div>
        <div className="stat"><small>Jami xarajat</small><strong>{money(totals.cost)}</strong></div>
        <div className="stat"><small>Hisoblangan obyekt foydasi</small><strong>{money(totals.profit)}</strong></div>
        <div className="stat"><small>Klientlar qarzi</small><strong>{money(totals.debt)}</strong></div>
        <div className="stat"><small>Pul qoldig‘i (kassa hisobida)</small><strong>{money(totals.paid-totals.cost)}</strong></div>
      </section>
      <p className="muted">Foyda = shartnoma summasi − kiritilgan barcha xarajatlar. Soliq, ijara va boshqa xarajatlar kiritilmasa, bu yakuniy sof foyda emas.</p>
      <section className="panel"><h2>Har bir obyekt hisoboti</h2>
        <div className="overflow"><table><thead><tr><th>Obyekt</th><th>Shartnoma</th><th>Olingan</th><th>Xarajat</th><th>Foyda</th><th>Qarz</th><th>ACP list</th><th>ACP m²</th></tr></thead>
        <tbody>{projects.map(p=>{const s=projectStats(p);return <tr key={p.id}><td>{p.name}</td>
          <td>{money(s.contract)}</td><td>{money(s.paid)}</td><td>{money(s.cost)}</td>
          <td>{money(s.profit)}</td><td>{money(s.debt)}</td><td>{num(s.sheets)}</td><td>{num(s.sheetsM2)}</td></tr>})}</tbody></table></div>
      </section>
    </>}

    {tab==="projects"&&me.role!=="pending"&&<div className="grid">
      {boss&&<section className="panel"><h2>Yangi obyekt</h2><form className="form" onSubmit={e=>submit(e,"project")}>
        <label>Obyekt nomi<input name="name" required/></label>
        <label>Mijoz<input name="customer_name"/></label><label>Telefon<input name="customer_phone" type="tel"/></label>
        <label>Manzil<input name="address"/></label>
        <label>Obyekt m²<input name="area_m2" type="number" step="0.01" defaultValue="0" min="0" required/></label>
        <label>Klient bilan kelishilgan 1 m² narxi<input name="sell_price_m2" type="number" step="0.01" defaultValue="0" min="0" required/></label>
        <button className="primary" disabled={busy}>Obyektni saqlash</button></form></section>}
      <section className="panel"><h2>{boss?"Barcha obyektlar":"Menga biriktirilgan obyektlar"}</h2>
        {projects.length===0&&<p className="muted">Hozircha obyekt yo‘q.</p>}
        {projects.map(p=><div className="item" key={p.id}><b>{p.name}</b><span>{p.address||"Manzil yo‘q"} · {num(p.area_m2)} m²</span>
          {boss?<><span>Mijoz: {p.customer_name||"—"} · {p.customer_phone||"—"}</span>
            <span>Hisoblangan foyda: {money(projectStats(p).profit)}</span>
            <select defaultValue={p.status} onChange={e=>run("status",{project_id:p.id,status:e.target.value})}>
              {statuses.map(s=><option key={s} value={s}>{s}</option>)}
            </select></>:<span>Holat: {p.status}</span>}</div>)}
      </section>
    </div>}

    {boss&&tab==="expense"&&<div className="grid">
      <section className="panel"><h2>Material yoki xarajat</h2><form className="form" onSubmit={e=>submit(e,"expense")}>
        <label>Obyekt<select name="project_id" required><option value="">Tanlang</option>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>Xarajat turi<select name="category" defaultValue="Alukobond">{types.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Material / ish nomi<input name="item_name" placeholder="Masalan: oq ACP yoki 20×40 profil" required/></label>
        <label>Miqdor<input name="quantity" type="number" step="0.001" min="0.001" required/></label>
        <label>Birlik<select name="unit"><option>list</option><option>dona</option><option>metr</option><option>m²</option><option>kg</option><option>kun</option><option>xizmat</option></select></label>
        <label>Shu safargi birlik narxi (so‘m)<input name="unit_price" type="number" step="0.01" min="0" required/></label>
        <div className="twocol"><label>ACP list eni (m)<input name="sheet_width_m" type="number" step="0.001" defaultValue="1.22" min="0.001"/></label>
          <label>ACP list bo‘yi (m)<input name="sheet_height_m" type="number" step="0.001" defaultValue="2.44" min="0.001"/></label></div>
        <p className="muted">List o‘lchamlari faqat “Alukobond” turi tanlanganda hisobga olinadi. Boshqa xarajatlar uchun e’tiborsiz qoldiriladi.</p>
        <label>Izoh<input name="note"/></label><button className="primary" disabled={busy}>Xarajatni saqlash</button>
      </form></section>
      <section className="panel"><h2>Oxirgi xarajatlar</h2>{expenses.map(e=><div className="item" key={e.id}>
        <b>{projectName(e.project_id)} · {e.item_name}</b>
        <span>{e.category} · {num(e.quantity)} {e.unit} × {money(e.unit_price)}</span>
        <b>{money(e.total)} {e.material_area_m2!=null?`· ${num(e.material_area_m2)} m²`:""}</b>
        {e.note&&<small>{e.note}</small>}</div>)}</section>
    </div>}

    {boss&&tab==="payment"&&<div className="grid"><section className="panel"><h2>Klient to‘lovi</h2>
      <form className="form" onSubmit={e=>submit(e,"payment")}>
        <label>Obyekt<select name="project_id" required><option value="">Tanlang</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Qabul qilingan summa<input name="amount" type="number" step="0.01" min="0.01" required/></label>
        <label>Izoh<input name="note" placeholder="Avans / yakuniy to‘lov"/></label>
        <button className="primary" disabled={busy}>To‘lovni saqlash</button>
      </form></section><section className="panel"><h2>To‘lovlar tarixi</h2>
        {payments.map(p=><div className="item" key={p.id}><b>{projectName(p.project_id)}</b>
          <span>{money(p.amount)} · {p.note||"To‘lov"}</span><small>{stamp(p.created_at)}</small></div>)}
      </section></div>}

    {tab==="work"&&me.role!=="pending"&&<div className="grid">
      <section className="panel"><h2>Mening bugungi ishim</h2>
        {openShift ? <form className="form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;
          run("finish",{...Object.fromEntries(new FormData(form).entries()),id:openShift.id},form,"Smena yakunlandi");}}>
          <p className="success">Ish boshlangani: {stamp(openShift.arrived_at)} · {projectName(openShift.project_id)}</p>
          <label>Bajarilgan m²<input name="m2" type="number" min="0" step="0.01" defaultValue="0" required/></label>
          <label>Bugun nima ish qildingiz?<textarea name="note" rows="4" required/></label>
          <button className="primary" disabled={busy}>Ishdan ketish va hisobotni yuborish</button>
        </form> : <form className="form" onSubmit={e=>submit(e,"start")}>
          <label>Obyekt<select name="project_id" required><option value="">Tanlang</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="primary" disabled={busy||!projects.length}>Ishga keldim — vaqtni yozish</button>
        </form>}
        <p className="muted">Kelish va ketish vaqti server tomonidan avtomatik saqlanadi.</p>
      </section>
      <section className="panel"><h2>{boss?"Jamoaning barcha hisobotlari":"Mening hisobotlarim"}</h2>
        {logs.map(l=><div className="item" key={l.id}><b>{projectName(l.project_id)}{boss?` · ${personName(l.user_id)}`:""}</b>
          <span>Kelgan: {stamp(l.arrived_at)} · Ketgan: {stamp(l.left_at)}</span>
          <span>{num(l.completed_m2)} m² · {l.left_at?"Yakunlangan":"Ishda"}</span>
          {l.note&&<span>{l.note}</span>}</div>)}
      </section>
    </div>}

    {me.role==="admin"&&tab==="team"&&<div className="grid"><section className="panel"><h2>Xodimlar va lavozimlar</h2>
      <p className="muted">Yangi ro‘yxatdan o‘tganlarning roli “Kutilmoqda”. Siz tasdiqlaysiz.</p>
      {people.map(p=><div className="item" key={p.id}><b>{p.full_name}</b><span>@{p.username} · {p.phone||""}</span>
        {p.role==="admin"?<span>Asosiy admin</span>:<select value={p.role} onChange={e=>run("role",{user_id:p.id,role:e.target.value})}>
          <option value="pending">Kutilmoqda</option><option value="worker">Ishchi</option>
          <option value="boss">Boshliq (barcha hisobotlar va foyda)</option></select>}
        {p.role==="worker"&&<small>Obyektlari: {assignments.filter(a=>a.user_id===p.id).map(a=>projectName(a.project_id)).join(", ")||"Hali biriktirilmagan"}</small>}
      </div>)}</section>
      <section className="panel"><h2>Ishchini obyektga biriktirish</h2>
        <form className="form" onSubmit={e=>submit(e,"assign")}>
          <label>Ishchi<select name="user_id" required><option value="">Tanlang</option>
            {people.filter(p=>p.role==="worker").map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select></label>
          <label>Obyekt<select name="project_id" required><option value="">Tanlang</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="primary" disabled={busy}>Biriktirish</button>
        </form><h3>Hozirgi biriktirishlar</h3>
        {assignments.map(a=><div className="item" key={a.project_id+a.user_id}>
          <span>{personName(a.user_id)} → {projectName(a.project_id)}</span>
          <button disabled={busy} onClick={()=>run("unassign",a)}>Olib tashlash</button>
        </div>)}
      </section></div>}
  </main>;
}
