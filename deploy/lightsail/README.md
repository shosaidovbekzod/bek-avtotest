# AWS Lightsail deploy

Bu yo'l Ubuntu Lightsail instance ichida FastAPI + Nginx + PostgreSQL bilan ishlaydi. Eng kam xarajat va kamroq bosh og'riq uchun database sifatida Neon Free yoki Supabase Free Postgres tavsiya qilinadi.

## 1. AWS xarajatdan himoya

AWS Console ichida avval billing nazoratini yoqing:

1. Billing and Cost Management -> Budgets.
2. `Create budget`.
3. Monthly cost budget yarating.
4. Limitni masalan `$1` yoki o'zingiz xohlagan kichik summa qiling.
5. Email alert qo'shing.

AWS CLI ishlatsangiz:

```bash
export AWS_ACCOUNT_ID=123456789012
export ALERT_EMAIL=you@example.com
export BUDGET_AMOUNT=5
bash deploy/lightsail/create-budget-alert.sh
```

AWS yuborgan email tasdiqlash xabarini bosish shart, aks holda alert ishlamaydi.

## 2. Lightsail instance

1. Lightsail -> Create instance.
2. Platform: Linux/Unix.
3. Blueprint: Ubuntu 24.04 LTS yoki Ubuntu 22.04 LTS.
4. Instance plan: eng kichik Linux plan.
5. Instance yaratilgach Static IP attach qilish tavsiya qilinadi.
6. Networking bo'limida 80 va 443 portlarini oching. 22 SSH uchun qoladi.

## 3. Database varianti A: tashqi Neon/Supabase

Neon yoki Supabase Postgres connection string oling. U taxminan shunday bo'ladi:

```text
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Shu qiymat keyin `/etc/bek-avtotest.env` ichiga yoziladi.

## 4. Database varianti B: Lightsail ichida PostgreSQL

Instance ichida PostgreSQL o'rnatish:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo -u postgres psql
```

`psql` ichida:

```sql
CREATE USER bek_avtotest WITH PASSWORD 'JUDA_MUSTAHKAM_PAROL';
CREATE DATABASE bek_avtotest OWNER bek_avtotest;
\q
```

`DATABASE_URL`:

```text
postgresql://bek_avtotest:JUDA_MUSTAHKAM_PAROL@127.0.0.1:5432/bek_avtotest
```

## 5. Appni serverga qo'yish

GitHub repository URL bilan:

```bash
sudo mkdir -p /opt/bek_avtotest
sudo chown ubuntu:ubuntu /opt/bek_avtotest
git clone YOUR_GITHUB_REPO_URL /opt/bek_avtotest
cd /opt/bek_avtotest
bash deploy/lightsail/install.sh
```

Birinchi ishga tushirish `/etc/bek-avtotest.env` yaratib to'xtaydi. Uni to'ldiring:

```bash
sudo nano /etc/bek-avtotest.env
```

Namuna:

```text
DATABASE_URL=postgresql://bek_avtotest:JUDA_MUSTAHKAM_PAROL@127.0.0.1:5432/bek_avtotest
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YANGI_ADMIN_PAROL
TOKEN_TTL_HOURS=168
PYTHONUNBUFFERED=1
```

Keyin yana ishga tushiring:

```bash
cd /opt/bek_avtotest
bash deploy/lightsail/install.sh
```

Tekshirish:

```bash
sudo systemctl status bek-avtotest
sudo journalctl -u bek-avtotest -f
```

Brauzerda:

```text
http://YOUR_LIGHTSAIL_PUBLIC_IP
```

## 6. Domain ulash

1. Lightsail Static IP oling va instancega ulang.
2. Domain DNS panelida `A` record qiling:
   - `@` -> Static IP
   - `www` -> Static IP
3. Nginx configdagi `server_name _;` ni domen bilan almashtiring:

```bash
sudo nano /etc/nginx/sites-available/bek-avtotest
sudo nginx -t
sudo systemctl reload nginx
```

Masalan:

```nginx
server_name example.uz www.example.uz;
```

## 7. HTTPS

Domain DNS ishlagandan keyin:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.uz -d www.example.uz
```

## 8. Yangilash

Kod o'zgarganda:

```bash
cd /opt/bek_avtotest
git pull
bash deploy/lightsail/install.sh
```
