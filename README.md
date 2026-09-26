# ALUSAF CRM v3 — COPY/PASTE

Alohida sayt logini + paroli. Eski Supabase Authentication foydalanuvchisi ishlatilmaydi. Supabase faqat yangi `crm_*` jadvallari uchun ma'lumotlar bazasi bo'lib qoladi.

## Muhim: admin login/paroli
Admin foydalanuvchisi ilk muvaffaqiyatli login so'rovida serverda avtomatik yaratiladi. Uning logini `ADMIN_INITIAL_USERNAME` muhit o'zgaruvchisidan, paroli esa `ADMIN_INITIAL_PASSWORD` dan olinadi; **parol kodda saqlanmaydi**. `ADMIN_INITIAL_USERNAME=Asliddin` qilib qo'ying. `ADMIN_INITIAL_PASSWORD` qiymatiga o'zingiz so'ragan vaqtinchalik parolni Vercel Secret maydonida qo'ying. Birinchi kirishdan keyin saytning "Parol" bo'limidan albatta yangilang.

## GitHub: mavjud Asliddin0099/Alusaf repository
Ushbu papkadagi fayllarni aynan bir xil yo'l bilan yarating/almashtiring:

- `package.json` (almashtiring)
- `app/layout.js` (almashtiring)
- `app/page.js` (almashtiring)
- `app/styles.css` (almashtiring)
- `app/api/route.js` (YANGI papka/fayl)
- `app/login/page.js` (almashtiring: `/` ga yuboradi)
- `app/dashboard/page.js` (almashtiring: `/` ga yuboradi)
- `app/auth/callback/page.js` va `app/auth/reset-password/page.js` (oldingi Supabase Auth sahifalarini bosh sahifaga yo'naltiradi)
- `lib/server.js` (YANGI)
- `supabase/upgrade_v3.sql` (YANGI; GitHub saqlaydi, ammo uni faqat Supabase SQL Editor'da alohida Run qilasiz)

Oldingi `lib/supabase-browser.js` kerak emas. Uni GitHub'dan o'chirib tashlashingiz mumkin. `app/auth` ichidagi eski sahifalarni yuqoridagi redirect kodlari bilan almashtiring. Eski Supabase SQL fayllarni qayta Run QILMANG.

## Supabase (FAQAT yangi alusaf-crm loyihasi)
`supabase/upgrade_v3.sql` mazmunini Supabase SQL Editor'ga qo'ying va Run qiling. U yangi crm_* jadvallar yaratadi, oldingi ma'lumotlarni o'chirmaydi. Jadvallarda RLS yoqilgan va brauzerda bevosita ulanish yopilgan.

## Vercel → Project Settings → Environment Variables
Har biri Production va Preview uchun:

`NEXT_PUBLIC_SUPABASE_URL` = yangi loyiha Project URL

`SUPABASE_SERVICE_ROLE_KEY` = yangi Supabase loyihasining `sb_secret_...` SERVER kaliti. Vercel Secret turida. **HECH QACHON NEXT_PUBLIC_ deb nomlamang yoki GitHub'ga qo'ymang.**

`SESSION_SECRET` = tasodifiy kamida 32 belgili maxfiy satr. Vercel Secret turida. Masalan terminalda `openssl rand -hex 32` yordamida hosil qilishingiz mumkin.

`ADMIN_INITIAL_USERNAME` = Asliddin

`ADMIN_INITIAL_PASSWORD` = faqat Vercel'da o'zingiz tanlagan dastlabki parol; Vercel Secret turi.

Eski `NEXT_PUBLIC_SUPABASE_ANON_KEY` yangi v3 kodga kerak emas, xohlasangiz olib tashlang.

Settings o'zgarganidan keyin Vercel'da qayta Deploy qiling. Sayt ochilganda yangi admin logini va Vercel'dagi boshlang'ich parol bilan kiring. Oldingi Supabase Auth paroli bu saytga taalluqli emas.

## Nimalar bor
- Kirish, yangi ro'yxat (pending), parolni almashtirish
- Admin lavozim beradi: pending / worker / boss. Boshliq barcha obyektlar, pul, foyda va ish hisobotlarini ko'radi. Admin qo'shimcha ravishda rollar va biriktirishlarni boshqaradi.
- Ishchi faqat o'ziga biriktirilgan obyektlar va o'z ish tarixini ko'radi, start/finish bilan vaqt qayd qilinadi.
- Obyekt shartnomasi = m² × sotuv narxi. Xarajatlar har safar real birlik narxida. Alukobond uchun en/bo'y va miqdordan m² hisoblanadi.
- Hisoblangan foyda = shartnoma summasi - kiritilgan xarajatlar; pul qoldig'i = olingan to'lov - kiritilgan xarajatlar.

## Sinov talablari / cheklovlar
Bu v3 MVP. Kiritilmagan soliqlar, ijara yoki boshqa xarajatlar foydada aks etmaydi. Yangi foydalanuvchi uchun email/SMS tasdiqlash va parolni qayta tiklash HOSIRCHA yo'q. Admin qo'lda parol tiklashni hali bajara olmaydi. Brute force uchun bir akkauntga 5 marta noto'g'ri urinishdan keyin 15 daqiqa blok qo'yiladi, ammo production oldidan server-wide rate limit, CAPTCHA, audit log va zaxira nusxalarini qo'shing. Admin dastlabki parolini birinchi kirishda darhol kuchli parolga almashtiring. Birinchi admin yaratilgach, `ADMIN_INITIAL_PASSWORD` ni Vercel'dan o'chirishingiz mumkin; dastur mavjud admin uchun uni qayta so'ramaydi. Boshqa admin yaratish uchun dastur kodini mustaqil ravishda qayta sozlash lozim.
