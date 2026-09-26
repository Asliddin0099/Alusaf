# AluSaf CRM v1

V1: login, admin panel, obyektlar, real narxli xarajatlar (Alukobond/profil/samorez/karkaz/ishchi/transport/rover/boshqa), klient to‘lovlari, obyekt bo‘yicha sof foyda, ishchi kunlik m² va kelish-ketish hisoboti.

## Supabase
1. `supabase/schema.sql` ni SQL Editor'da ishga tushiring.
2. Auth > Users orqali user yarating.
3. Admin qilish: `update public.profiles set role='admin' where id='AUTH_USER_UUID';`

## Environment
`.env.example` nusxasidan `.env.local` yarating va Supabase URL + publishable/anon key kiriting. Secret/service_role key ishlatmang.

## GitHub/Vercel
Repo'ga fayllarni yuklang. Vercel'da Import qiling. Environment Variables'ga `NEXT_PUBLIC_SUPABASE_URL` va `NEXT_PUBLIC_SUPABASE_ANON_KEY` kiriting, deploy qiling.

Bu v1 sinov versiya. Keyingi iteratsiyada ombor qoldig‘i, ishchi maoshi/KPI, obyekt smetasi va chuqur analitika qo‘shiladi.
