# bek_avtotest

FastAPI + SQLAlchemy asosidagi avtomaktab imtihoniga tayyorlov websayti. Frontend mobil ilova skrinshotlariga yaqin: asosiy menyu, biletlar panjarasi, quiz, natija, xato savollar va admin panel bor.

`Imtihon Yangi 20` 1235 ta savolni 20 talik biletlar qilib ko'rsatadi: 62 ta bilet. `Imtihon Yangi 50` esa 50 talik qilib ko'rsatadi: 25 ta bilet. Oxirgi biletlarda qolgan savollar chiqadi.

Qolgan bo'limlar ham faol:
- `Belgilar` 379 ta yo'l belgisi rasmini katalog va filtr bilan ko'rsatadi.
- `Qidirmoq` savol, javob, mavzu va izohlar ichidan qidiradi.
- `Mavzulashtirilgan testlar` topic bo'yicha test boshlaydi.
- `Sozlamalar` matn kattaligi, zich rejim, tema va profil boshqaruvini beradi.
- Admin login oynasida kamera orqali Face ID kirish mavjud; reference rasmlar private `rasmlar` papkasidan olinadi.

Face ID kamera oqimi productionda faqat HTTPS domen orqali ishlaydi. `rasmlar` ichidagi biometrik suratlar GitHub'ga commit qilinmaydi va serverga alohida private tarzda ko'chiriladi. Bu oddiy kamera-rasm solishtirish bo'lib, bank darajasidagi liveness tekshiruvi emas; yuqori xavfsizlik uchun admin paroli yoki WebAuthn/Windows Hello ikkinchi himoya sifatida saqlanishi kerak.

## Ishga tushirish

```powershell
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Sayt: `http://127.0.0.1:8000`

Admin login:

```text
login: admin
parol: admin123
```

## PostgreSQL

Default holatda tez tekshirish uchun SQLite ishlaydi. PostgreSQL ishlatish uchun `DATABASE_URL` bering:

```powershell
$env:DATABASE_URL="postgresql+psycopg://postgres:password@localhost:5432/eavtotest"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Tekin deploy

Eng sodda bepul yo'l:

1. GitHub repository oching va shu papkani push qiling.
2. Neon yoki Supabase Free planida Postgres database yarating.
3. Render Free Web Service yarating va GitHub repositoryni ulang.
4. Render env variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
ADMIN_USERNAME=admin
ADMIN_PASSWORD=mustahkam-parol
TOKEN_TTL_HOURS=168
```

Render `render.yaml` faylini avtomatik o'qiydi. Deploy bo'lganda bo'sh Postgres bazaga `assets/quiz/question_uzl.txt` faylidan savollar avtomatik import qilinadi.

Render Free service trafik bo'lmasa uxlab qoladi; birinchi ochishda 30-60 soniya sekinroq uyg'onishi mumkin.

## AWS Lightsail deploy

AWS Lightsail uchun tayyor fayllar:

- `deploy/lightsail/install.sh`
- `deploy/lightsail/create-budget-alert.sh`
- `deploy/lightsail/bek-avtotest.service`
- `deploy/lightsail/nginx-bek-avtotest.conf`
- `deploy/lightsail/bek-avtotest.env.example`

Ubuntu Lightsail instance ichida:

```bash
sudo mkdir -p /opt/bek_avtotest
sudo chown ubuntu:ubuntu /opt/bek_avtotest
git clone YOUR_GITHUB_REPO_URL /opt/bek_avtotest
cd /opt/bek_avtotest
bash deploy/lightsail/install.sh
```

Birinchi ishga tushirish `/etc/bek-avtotest.env` yaratadi. `DATABASE_URL` va `ADMIN_PASSWORD`ni yozib, scriptni qayta ishga tushiring. To'liq qo'llanma: `deploy/lightsail/README.md`.

AWSda billing alarm/budget qo'yish shart. Lightsail free trial muddati tugasa yoki limitdan oshsa pul yechishi mumkin.

## Savollar importi

`assets/quiz/question_uzl.txt`, `question_uzk.txt`, `question_ru.txt` fayllari Android ilovasida shifrlangan ko'rinishda. Import skripti shu formatni ham, oddiy JSON formatni ham o'qiydi. Hozir `question_uzl.txt` dan 1235 ta savol bazaga import qilingan.

Android bazani qayta import qilish:

```powershell
python -X utf8 scripts/import_questions.py assets\quiz\question_uzl.txt --replace
```

JSON namunasi:

```json
[
  {
    "ticket": 1,
    "text": "Savol matni",
    "answers": ["A javob", "B javob", "C javob", "D javob"],
    "correct_index": 1,
    "explanation": "Izoh",
    "topic": "Belgilar",
    "image": "/drawables/i100_3.jpg"
  }
]
```

Import:

```powershell
python -X utf8 scripts/import_questions.py questions.json --category-slug bilet-50 --category-title "Imtihon Biletlari 50"
```
