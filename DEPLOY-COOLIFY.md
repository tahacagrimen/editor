# Coolify ile VPS'e Kurulum — Adım Adım

Editörü kendi VPS'inde yayına almak için baştan sona takip edeceğin liste.
Her adım tek bir iş yapar; sırayla git.

**Kurulumun şekli:** Image **GitHub Actions'ta** build edilip GHCR'a
(GitHub Container Registry) yükleniyor; VPS sadece hazır image'ı çekip
çalıştırıyor. Sunucuda build yapılmıyor — sebebi Adım 0b'de.

```
git push → GitHub Actions (build) → GHCR (image) → Coolify (pull + run) → draw.menartmimarlik.com
```

---

## 0. Neye ihtiyacın var

| Şey | Gereksinim | Not |
|---|---|---|
| VPS | **1 vCPU / 4 GB / 50 GB** (Hostinger KVM 1, IP `72.61.95.127`) | Uygulamayı çalıştırmaya yeter. Build orada yapılmayacak. |
| Domain | `menartmimarlik.com` (WordPress'ten alınmış) | Uygulama **`draw.menartmimarlik.com`** alt alan adında yayınlanacak. Kök domaindeki WordPress sitesine dokunmuyoruz. |
| GitHub | `tahacagrimen/menart-3d` reposu + Actions açık | Build burada çalışacak, image GHCR'a gidecek. Ücretsiz plan yeterli. |
| Google Cloud hesabı | OAuth Client ID | Google ile giriş için. İstemiyorsan atla. |
| Resend hesabı | API key + doğrulanmış gönderen domaini | Magic link / e-posta doğrulama için. İstemiyorsan atla. |

**Önemli mimari kural:** Uygulama `POSTGRES_URL` yoksa SQLite'a düşer, ama o
modda `lib/scene-api-security.ts` veritabanını açamadığı için **`/api/scenes/*`
uçlarının tamamı `404` döner** ve giriş/hesap sistemi hiç çalışmaz. Yani gerçek
bir kurulumda **Postgres zorunlu**. SQLite sadece laptop/MCP senaryosu içindir.

---

## 0b. Kapasite: 1 vCPU / 4 GB bu işi kaldırır mı?

**Çalıştırmaya yeter; sunucuda build almaya yetmez.** Build'i GitHub Actions'a
taşımamızın tek sebebi bu.

### Neden sunucuda build etmiyoruz

`next build` bu monorepo'da tek başına 2–4 GB RAM istiyor (`node_modules` 1.1 GB,
3D bağımlılıkları ağır). 1 vCPU / 4 GB'ta build ya `Killed` (OOM) ile ölür, ya
swap'la 40–70 dakika sürer — ve o süre boyunca tek çekirdeği yediği için canlı
site pratikte yanıt veremez. GitHub Actions runner'ları 4 çekirdek / 16 GB ile
geliyor ve ücretsiz; iş oraya taşınınca sunucunun tek görevi container'ı
çalıştırmak kalıyor.

### Bellek nereye gidiyor

| Bileşen | Yaklaşık RAM |
|---|---|
| Coolify'ın kendi stack'i (Traefik + kendi Postgres + Redis + realtime) | 0.8–1.2 GB |
| Next server (uygulama) | 0.4–0.8 GB |
| Senin Postgres'in | 0.2–0.3 GB |
| Redis | ~0.05 GB |
| **Boştaki toplam** | **~2–2.5 GB** |

4 GB'ta yaklaşık 1.5 GB baş kalıyor — trafik altında yeterli.

### Kaç kullanıcı

| Senaryo | Sonuç |
|---|---|
| 100 kayıtlı kullanıcı, aynı anda 5–15 kişi editörde | ✅ Rahat |
| Aynı anda ~20 kişi aktif çizim yapıyor | ⚠️ Sınırda, tek çekirdek tıkanmaya başlar |
| Aynı anda 100 kişi editör açık | ❌ Yetmez — 2. çekirdek şart |

Asıl yük açık sekme sayısı değil, **aynı anda çizim yapan** kişi sayısı: her
hareket bir `POST /api/scenes/:id/collaboration` batch'i üretiyor ve bunların
JSON işi tek çekirdeğe düşüyor. Açık duran sekmelerin SSE bağlantısı (her sekme
`events` + `presence` = 2 bağlantı) ucuzdur.

**Postgres burada performans meselesi de:** SQLite'ta canlı olay akışı bağlantı
başına 250 ms'de bir poll ediyor (`events/route.ts`, `POLL_MS = 250`). 20 açık
sekme = saniyede 80 sorgu, tek çekirdeği tek başına bitirir. Postgres'te aynı
route `LISTEN/NOTIFY` kullanıyor ve boştaki abone sıfır sorgu üretiyor.

### Disk ve bant genişliği

- **50 GB disk:** Image büyük (~2.5–4 GB) ve her deploy yeni katman indiriyor —
  Dockerfile tek aşamalı, `COPY . .` satırı her kod değişikliğinde `bun install`
  katmanını da geçersiz kılıyor. Haftalık temizlik cron'u **opsiyonel değil**:

  ```sh
  echo '0 4 * * 0 docker system prune -af' | crontab -
  ```

  (`--volumes` bilerek yok — Postgres verisi volume'da duruyor.)

- **4 TB bant genişliği:** Fazlasıyla yeterli. Katalog GLB'leri ve thumbnail'ler
  varsayılan olarak harici CDN'den geliyor, senin trafiğini yemiyor.

---

## 1. VPS'i hazırla

```sh
ssh root@72.61.95.127
apt update && apt upgrade -y
```

Build sunucuda yapılmadığı için büyük swap'a ihtiyaç yok, ama 2 GB emniyet payı
iyi olur (trafik zirvesinde OOM-killer'ın Postgres'i vurmasını engeller):

```sh
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Firewall: 22, 80, 443 ve Coolify paneli için 8000 açık olsun.

```sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 8000 && ufw enable
```

---

## 2. Coolify'ı kur

```sh
curl -fsSL https://cdn.coolify.io/coolify/install.sh | bash
```

Kurulum bitince tarayıcıdan `http://72.61.95.127:8000` adresine git, ilk admin
hesabını oluştur. Coolify kendi kendini "localhost" sunucusu olarak kaydeder,
ekstra sunucu eklemene gerek yok.

İstersen Coolify paneline de bir alt alan adı ver (Settings → Instance Domain,
örn. `coolify.menartmimarlik.com`) — sonra 8000 portunu firewall'dan kapatabilirsin.

---

## 3. DNS kaydını gir (WordPress tarafında)

Domain WordPress'te kayıtlı, o yüzden A kaydını orada açacağız. Kök domain
(`menartmimarlik.com`) ve `www` **olduğu gibi kalacak** — WordPress siteni
etkilemiyoruz, sadece yeni bir alt alan adı ekliyoruz.

WordPress.com'da: **My Sites → Upgrades → Domains →** `menartmimarlik.com`
**→ DNS Records**. (Kendi sunucunda WordPress varsa aynı kayıtları hosting
panelinin DNS bölümünde aç.)

Eklenecek kayıtlar:

| Tip | Ad / Host | Değer | Zorunlu mu |
|---|---|---|---|
| A | `draw` | `72.61.95.127` | ✅ Uygulama bu adreste yayınlanacak |
| A | `coolify` | `72.61.95.127` | Opsiyonel — Coolify paneli için |

Var olan kayıtlara dokunma: `@` ve `www` WordPress'in IP'sinde kalsın, MX
kayıtları (e-posta) aynen dursun.

> **Dikkat — WordPress.com plan kısıtı:** Ücretsiz/başlangıç planlarında özel
> DNS kaydı ekleme kapalı olabilir. Panelde "Add a record" göremiyorsan iki
> seçeneğin var: planı yükselt, ya da domaini Cloudflare'in ücretsiz DNS'ine
> taşı (nameserver değişikliği — mevcut tüm kayıtları önce Cloudflare'e
> kopyalarsan WordPress sitesi kesintisiz devam eder).
>
> Cloudflare kullanırsan `draw` kaydını **DNS only** (gri bulut) yap. Turuncu
> bulut proxy'si canlı senkron akışını (SSE) kesebilir; sertifikayı da zaten
> Coolify kendisi alıyor.

Yayılmayı bekle — DNS oturmadan Let's Encrypt sertifika vermez:

```sh
dig +short draw.menartmimarlik.com
# 72.61.95.127 dönmeli
```

---

## 4. Postgres servisini ekle

Coolify panelinde:

1. **Projects → + New Project** → adı `menart-3d`.
2. Ortam olarak `production` seç → **+ New Resource → Databases → PostgreSQL**.
3. Sürüm: **17**. Adı: `pascal-postgres`.
4. **Deploy**'a bas.

Deploy bitince servisin sayfasındaki **Postgres URL (internal)** değerini
kopyala. Şuna benzer:

```
postgresql://postgres:PAROLA@pascal-postgres-xxxxx:5432/postgres
```

Bu **internal** adres — aynı Docker ağındaki uygulama container'ı kullanır.
Postgres portunu dışarı açma, gerek yok.

> Not: Uygulama `prepare: false` ile bağlanır, yani ileride PgBouncer koyarsan
> transaction pooling modu sorunsuz çalışır.

---

## 5. Redis ekle (opsiyonel)

Rate limiting için. Yoksa rate limit tamamen devre dışı kalır (fail-open —
istekler reddedilmez), yani başlangıçta atlayabilirsin.

**+ New Resource → Databases → Redis** → deploy → internal URL'i kopyala
(`redis://default:PAROLA@redis-xxxxx:6379`).

---

## 6. GitHub Actions'ta image'ı build et

Workflow dosyası repoda hazır: **`.github/workflows/deploy-image.yml`**.
`main`'e her push'ta çalışır, image'ı build edip
`ghcr.io/tahacagrimen/menart-3d` altına iki tag ile yükler: `latest` ve kısa
commit SHA'sı.

Önce build'in ihtiyaç duyduğu değerleri gir — repo →
**Settings → Secrets and variables → Actions → Variables** sekmesi:

| Variable | Değer |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://draw.menartmimarlik.com` |
| `NEXT_PUBLIC_ASSETS_CDN_URL` | `https://draw.menartmimarlik.com` — malzeme dokularının taban adresi. Boş bırakırsan dokular `editor.pascal.app`'ten çekilir. Ayrı varlık domaini kuracaksan bkz. **Adım 15b** |

Bunlar secret değil **variable** — `NEXT_PUBLIC_*` değerleri zaten tarayıcıya
gidiyor. Ama **build sırasında** bilinmek zorundalar: `next build` bu değerleri
client bundle'ının içine gömüyor, sonradan Coolify'a ortam değişkeni olarak
yazmak işe yaramıyor. (Bu yüzden Dockerfile'da `ARG NEXT_PUBLIC_APP_URL` var.)

Sonra `main`'e push et (ya da Actions sekmesinden **Run workflow** de) ve
workflow'un yeşile dönmesini bekle. İlk build 15–25 dakika sürer; sonrakiler
katman cache'i sayesinde belirgin şekilde kısalır.

Sonuç: repo sayfanda sağ sütunda **Packages** altında `menart-3d` görünür.

---

## 7. Image'ı VPS'in çekebilmesini sağla

GHCR paketi varsayılan olarak private gelir. İki seçenek:

**A) Paketi public yap (en kolay).** GitHub profilin → **Packages → menart-3d
→ Package settings → Change visibility → Public**. Dikkat: image katmanlarında
uygulama kaynak kodu bulunur, yani public yapmak kodu da erişilebilir kılar.

**B) Private bırak, sunucuda bir kez login ol (önerilen).**

```sh
ssh root@72.61.95.127
docker login ghcr.io -u tahacagrimen
# Parola alanına GitHub Personal Access Token (classic) yapıştır
# — `read:packages` yetkisi yeterli
```

Doğrula:

```sh
docker pull ghcr.io/tahacagrimen/menart-3d:latest
```

---

## 8. Coolify'da uygulamayı ekle

Aynı proje içinde: **+ New Resource → Docker Image** (Git repository **değil**).

- **Image:** `ghcr.io/tahacagrimen/menart-3d` — **tag yazma!**
- **Tag:** `latest` (ayrı alan)
- **Ports Exposes: `3000`**
- Health Check Path: `/api/health`

> Image ve Tag ayrı alanlar; Coolify ikisini `image:tag` diye birleştiriyor.
> Image alanına `...menart-3d:latest` yazarsan sonuç `menart-3d:latest:latest`
> olur ve deploy `invalid reference format` ile düşer.

Henüz deploy etme — önce ortam değişkenlerini gir.

---

## 9. Ortam değişkenlerini gir

Uygulamanın **Environment Variables** sekmesi. Hepsi runtime değişkeni;
Coolify'daki "Build Variable" anahtarına bu kurulumda hiç dokunmuyorsun —
build GitHub'da yapıldı.

| Değişken | Değer / açıklama |
|---|---|
| `POSTGRES_URL` | Adım 4'teki internal URL. **Zorunlu.** |
| `NEXT_PUBLIC_APP_URL` | `https://draw.menartmimarlik.com` — sonda `/` yok. **Zorunlu** (sunucu tarafında better-auth `baseURL` için okunuyor; tarayıcı tarafına zaten Adım 6'da gömüldü). |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` çıktısı. **Zorunlu.** |
| `PASCAL_SHARE_LINK_SECRET` | `openssl rand -base64 32` çıktısı. Paylaşım linkleri için; yoksa Share butonu 503 döner. |
| `NODE_ENV` | `production` |
| `REDIS_URL` | Adım 5'teki URL. Opsiyonel. |
| `POSTGRES_POOL_SIZE` | Varsayılan 10. `replika × bu sayı` < Postgres `max_connections` olmalı. |
| `GOOGLE_CLIENT_ID` | Adım 14. |
| `GOOGLE_CLIENT_SECRET` | Adım 14. |
| `RESEND_API_KEY` | E-posta gönderimi için. Yoksa magic link akışı hata verir. |
| `EMAIL_FROM` | `Menart 3D <hesap@send.menartmimarlik.com>` — bkz. Adım 15. |
| `NEXT_PUBLIC_ASSETS_CDN_URL` | Adım 6'daki değerin **aynısı**. Sunucu tarafında thumbnail URL'i üretirken de okunuyor. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Sahne kapak görselleri için — bkz. **Adım 15b**. Yoksa thumbnail yüklenmez, gerisi çalışır. |

**`PORT` değişkenini girme.** Container `next start` ile 3000'de dinler;
`PORT=3002` yazarsan Coolify 3000'e proxy'lemeye devam eder ve site açılmaz.

Kota limitlerini değiştirmek istersen (varsayılan: misafir 2 sahne / 20 MB,
doğrulanmış hesap 25 sahne / 500 MB):
`PASCAL_QUOTA_GUEST_MAX_SCENES`, `PASCAL_QUOTA_FREE_MAX_TOTAL_BYTES` vb.

---

## 9b. Bu değerleri nereden alacağım? Hesap açmam gerekiyor mu?

Özet tablo — detaylar altında:

| Değişken | Hesap gerekir mi | Nereden gelir | Yoksa ne olur |
|---|---|---|---|
| `POSTGRES_URL` | Hayır | Coolify'daki Postgres servisi (Adım 4) | Uygulama çalışmaz, tüm API `404` |
| `REDIS_URL` | Hayır | Coolify'daki Redis servisi (Adım 5) | Rate limit kapalı, gerisi normal |
| `BETTER_AUTH_SECRET` | **Hayır — kendin üretiyorsun** | `openssl rand -base64 32` | Herkes oturum çerezi taklit edebilir |
| `PASCAL_SHARE_LINK_SECRET` | **Hayır — kendin üretiyorsun** | `openssl rand -base64 32` | Share butonu 503 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Evet — Google hesabın yeterli, ücretsiz | Google Cloud Console (Adım 14) | "Google ile giriş" butonu çıkmaz; e-posta ile giriş çalışır |
| `RESEND_API_KEY` / `EMAIL_FROM` | Evet — Resend'e kayıt, ücretsiz katman var | resend.com (Adım 15) | Magic link ve parola sıfırlama hata verir |
| `S3_*` | Evet — bir obje depolama sağlayıcısı | Adım 15b | Sahne kapak görselleri kaydedilmez, gerisi çalışır |

### Kendi ürettiklerin — hiçbir yere kayıt olmuyorsun

`BETTER_AUTH_SECRET` ve `PASCAL_SHARE_LINK_SECRET` bir servisten alınan anahtar
değil; **rastgele üretilmiş uzun birer metin**. Kendi bilgisayarında ya da
sunucuda üret, Coolify'a yapıştır, bitti:

```sh
openssl rand -base64 32   # BETTER_AUTH_SECRET için
openssl rand -base64 32   # PASCAL_SHARE_LINK_SECRET için — ikisi farklı olsun
```

Ne işe yarıyorlar:

- **`BETTER_AUTH_SECRET`**: Oturum çerezlerini imzalar. Değeri bilen biri
  istediği kullanıcı adına oturum üretebilir, o yüzden gerçekten rastgele olmalı
  ve gizli kalmalı. **Değiştirirsen herkesin oturumu kapanır** (yeniden giriş
  yaparlar, veri kaybı olmaz). Kod, değer boşsa
  `development-secret-key-do-not-use-in-prod` varsayılanına düşüyor — production'da
  bunu asla bırakma.
- **`PASCAL_SHARE_LINK_SECRET`**: `/share/<token>` linklerini imzalar.
  **Değiştirmek, dağıtılmış tüm paylaşım linklerini geçersiz kılar** — bir linki
  iptal etmenin tek yolu da zaten budur.

İkisini de bir yere not et (parola yöneticisi). Kaybedersen yenisini üretirsin,
sonucu yukarıdaki iki satır.

### Hesap açmadan da uygulama çalışır mı?

Evet. Giriş sistemi dört yol sunuyor ve hepsi aynı anda açık:

1. **Misafir (anonim)** — hiç kayıt olmadan çizim yapılır. Kota: 2 sahne / 20 MB.
2. **E-posta + parola** — hiçbir dış servis gerektirmez.
3. **Magic link** — Resend gerekir.
4. **Google ile giriş** — Google OAuth gerekir.

Yani Google ve Resend'i hiç kurmadan da site yayına girer; sadece 3. ve 4. yollar
görünmez/çalışmaz olur.

> Resend yokken bir uyarı: kayıt sırasında gönderilmesi gereken **doğrulama
> maili** gönderilemez (kayıt yine de başarılı olur, hata "best-effort" olarak
> loglanır). Ama parola sıfırlama akışı hata verir — kullanıcı parolasını
> unutursa elinden bir şey gelmez. Gerçek kullanıcı alacaksan Resend'i kur.

---

## 10. Domain ve SSL

Uygulamanın **General** sekmesinde **Domains** alanına
`https://draw.menartmimarlik.com` yaz ve kaydet. Coolify, Traefik üzerinden
Let's Encrypt sertifikasını kendisi alır — WordPress tarafında sertifikayla
ilgili hiçbir şey yapmana gerek yok.

Buradaki adres, Adım 6'daki `NEXT_PUBLIC_APP_URL` variable'ı ve Adım 9'daki
runtime değişkeni **üçü birebir aynı** olmalı. Biri `www`'lu diğeri `www`'suz
olursa giriş çerezleri tutmaz.

Kök domain (`menartmimarlik.com`) WordPress'te kalmaya devam eder; ikisi
birbirinden tamamen bağımsız çalışır. İstersen WordPress menüsüne
`draw.menartmimarlik.com`'a giden bir link koyarsın.

---

## 11. İlk deploy

**Deploy**'a bas. Sunucu image'ı çekip container'ı başlatır — build olmadığı
için 1–3 dakika sürer. Loglarda beklenen son satır: `Ready in ...`.

---

## 12. Veritabanı migration'larını çalıştır

Migration'lar **uygulama açılışında çalışmaz** — bilerek. Deploy adımı olarak
elle çalıştırılır.

Coolify'da uygulamanın sayfasındaki **Terminal** (ya da sunucuda `docker exec`)
ile container'a gir ve:

```sh
cd /app/packages/db && bun run db:migrate
```

Beklenen çıktı: `[db] migrations applied`.

Image içinde `packages/db` kaynağı duruyor, yani bu komut her sürümde çalışır.
Her deploy'da elle uğraşmamak için Coolify'ın **Pre/Post Deployment Command**
alanına aynı komutu yazabilirsin; şema değişmediğinde zaten uygulanmış
migration'ları atlar, tekrar çalışması zararsız.

---

## 13. Otomatik deploy'u bağla

Şu an akış yarım: GitHub image'ı yüklüyor ama Coolify'ın haberi olmuyor.
Bağlamak için:

1. Coolify → uygulamanın sayfası → **Webhooks** → **Deploy Webhook** URL'sini kopyala.
2. Coolify → **Keys & Tokens → API tokens** → yeni token üret.
3. GitHub repo → **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Değer |
|---|---|
| `COOLIFY_WEBHOOK_URL` | Kopyaladığın deploy webhook URL'si |
| `COOLIFY_API_TOKEN` | Ürettiğin Coolify API token'ı |

Bundan sonra `main`'e her push tam otomatik: build → GHCR → Coolify pull →
container değişimi.

Secret'lar tanımlı değilken workflow yine yeşil kalır, sadece son adımı atlar
(image push'lanır, deploy'u Coolify'dan elle tetiklersin).

---

## 14. Google ile giriş (opsiyonel)

**Kayıt olman gereken yer:** Google Cloud Console — mevcut Gmail hesabınla
giriş yapıyorsun, ayrı bir üyelik yok. **Ücretsiz**; OAuth için kredi kartı
istemiyor.

### 14.1 Proje oluştur

1. [console.cloud.google.com](https://console.cloud.google.com) → Google
   hesabınla gir.
2. Üstteki proje seçiciden **New Project** → ad: `menart-3d` → **Create**.
3. Proje seçili hale gelsin (üstteki kutuda adı görünmeli).

### 14.2 OAuth consent screen (izin ekranı)

Credentials'tan önce bu doldurulmak zorunda — atlarsan bir sonraki adımda
form açılmaz.

1. Sol menü → **APIs & Services → OAuth consent screen**.
2. User Type: **External** → Create.
3. Zorunlu alanlar:
   - App name: `Menart 3D`
   - User support email: kendi adresin
   - App logo: opsiyonel
   - **Authorized domains**: `menartmimarlik.com`
   - Developer contact: kendi adresin
4. Scopes ekranında bir şey ekleme, **Save and continue**.
5. Test users ekranında kendi adresini ekle → **Save**.

> **Önemli — "Testing" modu:** Uygulama yayına alınana kadar sadece test
> kullanıcıları listesindekiler Google ile girebilir. Herkese açmak için aynı
> ekrandaki **Publish app** düğmesine bas. Sadece e-posta/profil bilgisi
> istediğin için Google'ın doğrulama (verification) sürecine girmene gerek
> yok — "Publish" yeterli.

### 14.3 Client ID üret

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
2. Application type: **Web application**. Ad: `menart-3d-web`.
3. **Authorized JavaScript origins**:

   ```
   https://draw.menartmimarlik.com
   ```

4. **Authorized redirect URIs** — buradaki yol birebir bu olmalı:

   ```
   https://draw.menartmimarlik.com/api/auth/callback/google
   ```

   Yerelde de test edeceksen ikinci satır olarak:

   ```
   http://localhost:3002/api/auth/callback/google
   ```

5. **Create** → açılan kutuda **Client ID** ve **Client secret** görünür.
   Secret'ı sonra bir daha göremezsin, hemen kopyala.

### 14.4 Uygulamaya gir

Çıkan iki değeri Adım 9'daki `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
değişkenlerine yaz ve Coolify'dan **Redeploy** de. İkisi de runtime değişkeni —
image'ı yeniden build etmene gerek yok.

Kod, bu ikisi birden doluysa Google sağlayıcısını açıyor; biri eksikse buton
hiç görünmüyor. Yani yarım bırakmak hata üretmez, sadece özellik kapalı kalır.

> Hesap birleştirme açık: aynı e-posta ile önce parolayla, sonra Google ile
> girersen ikisi tek hesapta buluşur (`trustedProviders: ['google', 'email']`).

---

## 15. E-posta gönderimi (Resend) — opsiyonel

**Kayıt olman gereken yer:** [resend.com](https://resend.com) — GitHub veya
e-posta ile kayıt. Ücretsiz katman ayda 3.000 mail / günde 100 mail; bu iş için
fazlasıyla yeter, kredi kartı istemiyor.

Uygulamanın gönderdiği dört mail var: magic link, e-posta doğrulama, parola
sıfırlama, hoş geldin. Hepsi Resend'in REST API'sine tek bir POST ile gidiyor
(SDK yok).

`RESEND_API_KEY` yoksa production'da bu akışlar "gönderdim" demeden yapılandırma
hatası döner — bilerek, çünkü sessizce başarılı olan bir gönderici kullanıcıya
hiç gitmemiş mail için "gelen kutunu kontrol et" gösterirdi. `EMAIL_FROM` boşsa
Resend'in ortak `onboarding@resend.dev` adresi kullanılır ve mail **yalnızca
Resend hesabının sahibine** ulaşır (test için iyi, gerçek kullanıcı için işe
yaramaz).

### 15.1 API key al

Resend → **API Keys → Create API Key** → izin: **Sending access** → değeri
kopyala (`re_...`). Adım 9'daki `RESEND_API_KEY` değişkenine yaz.

Bu haliyle bile magic link çalışır — ama gönderen adres `onboarding@resend.dev`
olduğu için sadece kendine mail gidebilir. Gerçek kullanım için 15.2'yi yap.

### 15.2 Kendi domaininden gönder — DNS kayıtları

Resend panelinde **Domains → Add Domain**:

- Domain olarak `menartmimarlik.com` yerine **`send.menartmimarlik.com`** gibi
  bir alt alan adı ver. Böylece WordPress'in mevcut e-posta kayıtlarına
  (kök domaindeki MX) hiç dokunmamış olursun.
- Resend sana 3 kayıt verir: bir **MX**, bir **TXT (SPF)** ve bir **TXT
  (DKIM)**. Üçünü de Adım 3'teki DNS panelinde, verildiği ad ile aynen ekle.
- Panelde **Verify**'a bas, yeşile dönmesini bekle.

Sonra `EMAIL_FROM` değerini doğruladığın alt alan adıyla uyumlu yaz:

```
EMAIL_FROM=Menart 3D <hesap@send.menartmimarlik.com>
```

E-postayı hiç kullanmayacaksan bu adımı atla — Google ile giriş ve
e-posta+parola tek başına çalışır (parola sıfırlama hariç).

---

## 15b. Kapak görselleri ve varlık CDN'i (S3 / Garage) — opsiyonel

Kullanıcı bir sahneyi kaydettiğinde editör ekran görüntüsü üretip
`POST /api/scenes/:id/thumbnail` ucuna yolluyor; route bunu 1024 px WebP'e
küçültüp obje deposuna yüklüyor ve URL'i `scenes.thumbnail_url` alanına yazıyor.
Sahne listesindeki önizlemeler bu URL'den geliyor.

**Hiç kurmazsan bir şey bozulmaz** — `s3Client` `null` kalır, thumbnail
yüklenmez, listede kapak görseli görünmez.

### Önce `NEXT_PUBLIC_ASSETS_CDN_URL`'i doğru anlamak gerekiyor

Bu değişken iki işi birden yapıyor ve ikisi birbirine bağlı:

1. **Malzeme dokularının taban adresi.** Malzeme kütüphanesi dokuları
   `/material/wood/...ktx2` gibi **göreli** yollarla tanımlı
   (`packages/core/src/material-library.ts`) ve bu değişkene ekleniyor.
   Varsayılan: `https://editor.pascal.app`.
2. **Thumbnail URL'inin taban adresi.** Doluysa thumbnail adresi
   `{CDN}/{key}`; boşsa `{S3_ENDPOINT}/{S3_BUCKET}/{key}`.

Kritik ayrıntı: bu dokular (17 MB, `apps/editor/public/material`) **zaten
image'ının içinde** ve uygulaman onları kendi domaininden servis edebiliyor.
Yani değişkeni boş bırakırsan uygulaman, kendi elindeki dosyaları başkasının
sunucusundan (`editor.pascal.app`) çekiyor.

Katalog item'ları (GLB'ler, thumbnail'leri) mutlak Supabase adresleriyle
tanımlı, bu değişkenden etkilenmiyorlar.

Üç geçerli kurulum var:

| Kurulum | Dokular | Thumbnail | Kime uygun |
|---|---|---|---|
| **A.** Değişken boş, S3 yok | `editor.pascal.app`'ten (dış bağımlılık) | Yok | Hızlı başlangıç |
| **B.** `NEXT_PUBLIC_ASSETS_CDN_URL=https://draw.menartmimarlik.com`, S3 yok | Kendi sunucundan ✅ | Yok | **Önerilen başlangıç** — dış bağımlılık yok, tek satır |
| **C.** Ayrı bir varlık domaini (Garage) + S3 | Garage'dan | Garage'dan ✅ | Kapak görseli isteyenler |

B ile C'nin ortası yok: değişken tek, ikisini birden aynı adrese bakmaya
zorluyor. Değişkeni uygulama domainine verip S3'ü de açarsan thumbnail'ler
uygulama domaininde aranır ve 404 olur.

> Önceki sürümde bu bölüm "değişkeni boş bırak" diyordu; doğrusu yukarıdaki
> tablo — kendi sunucundan servis etmek (B) daha iyi.

### Hangi depolama servisi (Coolify'ın listesinden)

Uygulamanın ihtiyacı dar: **S3 API ile yazma** + **imzasız (public) GET ile
okuma**. Coolify'ın servis listesindeki seçenekler bu ölçüte göre:

| Servis | Uygun mu | Neden |
|---|---|---|
| **SeaweedFS** | ✅ En uygun | Gerçek S3 API. Anonim okuma, config'e `{"name":"anonymous","actions":["Read:<kova>"]}` kimliği eklenerek açılıyor — kodun beklediği `{S3_ENDPOINT}/{kova}/{key}` path-style adresi doğrudan çalışır, ekstra domain kurgusu gerekmez |
| **Garage** | ✅ Çalışır, kurgusu farklı | S3 ucunda anonim okuma yok; public erişim ayrı web ucundan (aşağıda) |
| **MinIO** | ✅ Listede yok ama kurulabilir | Coolify'da **Docker Compose** kaynağı olarak elle eklenebilir. Tek tık listesinden düşmesi lisans/konsol değişikliklerinden, teknik bir engelden değil |
| Nextcloud / ownCloud / Seafile / Pydio Cells / Cloudreve / Chibisafe / Filebrowser | ❌ | Bunlar insan yüzlü dosya yönetim uygulamaları; uygulama-uygulama S3 arayüzü sunmuyorlar |
| SFTPGo / Syncthing / Duplicati | ❌ | Sırasıyla SFTP sunucusu, dosya senkronizasyonu ve yedekleme aracı — obje deposu değil |

Sıralama: **SeaweedFS** (en az uğraş) → **MinIO** (compose ile) → **Garage**
(zaten kuruluysa mantıklı).

> Garage "eski" değil — aktif geliştirilen, v1.x bir proje. Farkı, MinIO'nun
> bucket-policy modelini uygulamaması. SeaweedFS'te de anonim kimlik eklemek
> config dosyasına dokunmayı gerektiriyor (ve geçmişte diğer kimlikleri bozan
> bir hata rapor edilmiş), yani "tek tıkla public bucket" hiçbirinde yok.

### Garage kullanılabilir mi? Evet, ama S3 ucundan değil

Coolify'ında MinIO yerine **Garage** varsa iş görür; tek farkı public okumayı
nasıl yaptığı:

- **Garage'ın S3 API ucunda anonim (imzasız) okuma yok.** Bu bilerek böyle:
  Garage, Amazon'un ACL/bucket-policy mekanizmasını uygulamıyor, erişimi
  "anahtar başına kova" mantığıyla yönetiyor. Yani MinIO'daki "bucket'ı public
  yap" adımının Garage'da karşılığı yok.
- **Bunun yerine ayrı bir web ucu var** (varsayılan port **3902**). Bir kovayı
  `garage bucket website --allow <kova>` ile yayına açıyorsun ve kova, **adıyla
  aynı domainden** servis ediliyor. Yani kovanın adını `assets.menartmimarlik.com`
  koyarsan, o domain sunucuna yönlendiğinde içerik doğrudan yayınlanır.

Bu, uygulamanın beklediği URL şablonuna (`{CDN}/{key}`) birebir uyuyor —
dolayısıyla Garage ile **C kurulumu** yapılabilir.

### C kurulumu: Garage ile adım adım

1. **Garage'ı deploy et** (Coolify → Services → Garage).

2. **Kovayı domain adıyla oluştur** — isim tesadüfi değil, web ucu kova adını
   domain olarak kullanıyor:

   ```sh
   garage bucket create assets.menartmimarlik.com
   garage bucket website --allow assets.menartmimarlik.com
   ```

3. **Yazma anahtarı üret ve kovaya bağla:**

   ```sh
   garage key create menart-editor
   garage bucket allow --read --write assets.menartmimarlik.com --key menart-editor
   ```

   Çıktıdaki Key ID / Secret key `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
   olacak.

4. **DNS + reverse proxy:** Adım 3'teki panele `assets` için bir A kaydı ekle
   (`72.61.95.127`). Coolify'da Garage'ın **3902** portunu
   `assets.menartmimarlik.com` domainine bağla (S3 API portu 3900 ayrı kalsın —
   o public olmamalı).

5. **Malzeme dokularını bir kez yükle.** Domain artık uygulamanın değil
   Garage'ın; dokuları oraya taşımazsan malzemeler kaybolur:

   ```sh
   aws s3 sync apps/editor/public/material \
     s3://assets.menartmimarlik.com/material \
     --endpoint-url https://s3.menartmimarlik.com
   ```

   (17 MB, tek seferlik. `rclone` de olur. Malzeme kütüphanesi büyüdükçe
   tekrarlaman gerekir — bu, C kurulumunun bakım maliyeti.)

6. **Değişkenleri gir:**

   | Değişken | Değer | Nerede |
   |---|---|---|
   | `NEXT_PUBLIC_ASSETS_CDN_URL` | `https://assets.menartmimarlik.com` | **Hem** Adım 6'daki GitHub variable **hem** Adım 9'daki Coolify env |
   | `S3_ENDPOINT` | Garage'ın S3 API adresi, örn. `https://s3.menartmimarlik.com` | Coolify env |
   | `S3_BUCKET` | `assets.menartmimarlik.com` | Coolify env |
   | `S3_REGION` | `garage` (Garage'ın config'indeki bölge adı; emin değilsen `auto`) | Coolify env |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 3. adımdaki anahtar | Coolify env |

   `NEXT_PUBLIC_ASSETS_CDN_URL` build-time değişkeni — GitHub'a yazıp **image'ı
   yeniden build etmen** şart, sadece Coolify'a yazmak yetmez.

7. **Doğrula:** bir sahne kaydet, listedeki kapak görselinin yüklendiğini gör;
   sonra bir duvara malzeme ata, dokunun geldiğini kontrol et. İkisi de aynı
   domainden geliyor olmalı.

> Not: Eski thumbnail'ler yenisi yüklenince siliniyor (yalnızca `thumbnails/`
> önekindekiler), yani kova sınırsız büyümüyor.

### Şimdilik ne yapmalısın

**B kurulumu.** Tek iş: Adım 6'daki GitHub variables'a
`NEXT_PUBLIC_ASSETS_CDN_URL=https://draw.menartmimarlik.com` ekle, aynı değeri
Adım 9'daki Coolify env'ine de yaz. Dokular kendi sunucundan gelir, dış
bağımlılık kalmaz, S3 hiç gerekmez.

Kapak görselleri gerçekten lazım olduğunda C'ye geçersin — geçiş sırasında
sadece dokuları Garage'a yüklemen ve iki değişkeni değiştirip yeniden build
alman gerekir.

---

## 16. Çalışıyor mu — kontrol listesi

```sh
curl -s https://draw.menartmimarlik.com/api/health
# {"status":"ok","app":"editor",...}
```

Tarayıcıda:

- [ ] Ana sayfa açılıyor, 3D canvas görünüyor.
- [ ] Giriş yapılabiliyor (Google veya magic link).
- [ ] Yeni sahne kaydediliyor, sayfayı yenileyince geri geliyor.
- [ ] `/api/scenes` `404` **dönmüyor** — dönüyorsa `POSTGRES_URL` yanlış veya migration çalışmamış.
- [ ] İki sekmede aynı sahneyi aç, birinde duvar çiz — diğerine yansıyor mu (SSE canlı senkron).
- [ ] `https://menartmimarlik.com` hâlâ WordPress sitesini açıyor (kök domain etkilenmemiş olmalı).
- [ ] Küçük bir değişikliği `main`'e push et → Actions yeşil → site birkaç dakika içinde güncellendi.

---

## 17. Sık çıkan sorunlar

| Belirti | Sebep | Çözüm |
|---|---|---|
| Actions build'i `--frozen-lockfile` hatasıyla ölüyor | `bun.lock` ile Dockerfile'daki bun sürümü uyuşmuyor | Dockerfile'daki `oven/bun:1.3.14-alpine` ile `package.json`'daki `packageManager` aynı olmalı |
| Coolify `denied` / `unauthorized` diyerek image'ı çekemiyor | GHCR paketi private ve sunucu login değil | Adım 7B'deki `docker login ghcr.io`. Token'ın `read:packages` yetkisi olmalı |
| `invalid reference format` — logda `menart-3d:latest:latest` | Image alanına tag da yazılmış | Image: `ghcr.io/tahacagrimen/menart-3d`, Tag: `latest` — ayrı alanlar |
| `manifest unknown` | O tag henüz yüklenmemiş | Actions'ın bittiğinden emin ol; repo → Packages altında tag'i gör |
| Deploy geçti ama eski sürüm çalışıyor | Sunucudaki `latest` cache'lenmiş | Coolify'da image'ı `:latest` yerine kısa SHA tag'i ile ver (workflow ikisini de yüklüyor), ya da sunucuda `docker pull ...:latest` deyip redeploy et |
| Site açılıyor ama giriş `localhost:3002`'ye gidiyor | Adım 6'daki `NEXT_PUBLIC_APP_URL` variable'ı eksikken build alınmış | Variable'ı gir ve **image'ı yeniden build et** (Actions → Run workflow). Coolify'a yazmak tek başına yetmez |
| Tüm `/api/scenes/*` çağrıları `404` | Veritabanı açılamıyor → güvenlik katmanı fail-closed | `POSTGRES_URL`'i kontrol et, migration'ı çalıştır |
| `relation "auth_users" does not exist` | Migration çalışmamış | Adım 12 |
| Canlı senkron çalışmıyor, sekmeler ayrışıyor | Proxy SSE akışını kesiyor | Traefik'te idle timeout ≥ 30s olmalı (route her 15 sn `: keepalive` yollar). Cloudflare kullanıyorsan proxy'yi (turuncu bulut) bu yolda kapat |
| `draw.menartmimarlik.com` açılmıyor, WordPress sitesi açılıyor | `draw` A kaydı yok ya da henüz yayılmamış | `dig +short draw.menartmimarlik.com` VPS IP'sini dönmeli |
| SSL alınamıyor / "invalid certificate" | Let's Encrypt doğrulaması DNS oturmadan denendi | DNS yayıldıktan sonra Coolify'da domaini sil-kaydet ile yeniden dene |
| Google girişinde `redirect_uri_mismatch` | Console'daki redirect URI ile gerçek adres birebir aynı değil | `https://draw.menartmimarlik.com/api/auth/callback/google` — protokol, alt alan adı ve yol tam eşleşmeli, sonda `/` olmamalı |
| Google girişinde `access_denied` / "app is being tested" | OAuth consent screen hâlâ Testing modunda | Consent screen → **Publish app**, ya da kullanıcıyı Test users'a ekle |
| "Google ile giriş" butonu hiç görünmüyor | `GOOGLE_CLIENT_ID` veya `_SECRET`'tan biri eksik | İkisi birden dolu olmalı; sonra redeploy |
| Magic link gönderilmiyor, "yapılandırılmamış" hatası | `RESEND_API_KEY` yok | Adım 15.1 |
| Mail sadece kendi adresime gidiyor | `EMAIL_FROM` boş → `onboarding@resend.dev` kullanılıyor | Adım 15.2'deki domain doğrulaması |
| Sahne listesinde kapak görselleri kırık | Kova public okunamıyor (Garage'da S3 ucu anonim okuma yapmaz) | Adım 15b, C kurulumu: web ucu (3902) üzerinden domain bağla |
| Malzeme dokuları 404 oluyor | `NEXT_PUBLIC_ASSETS_CDN_URL` dokuların bulunmadığı bir adrese bakıyor | Ya uygulama domainine çevir (Adım 15b, B kurulumu), ya da dokuları o kovaya yükle |
| Share butonu 503 | `PASCAL_SHARE_LINK_SECRET` yok | Değişkeni ekle. **Dikkat:** bu değeri değiştirmek dağıtılmış tüm linkleri geçersiz kılar — link iptalinin tek yolu da budur |
| Disk doldu | Eski image katmanları birikti | Adım 0b'deki prune cron'u; acil durumda `docker image prune -af` |
| Deploy sonrası eski sahneler yok | Postgres'e geçmeden önce SQLite'a kaydedilmişler | `bunx pascal-migrate --from ~/.pascal/data/pascal.db --to "$POSTGRES_URL" --owner <userId>` (önce `--dry-run`) |

---

## 18. Güncelleme akışı

`main`'e push → GitHub Actions image'ı build eder → GHCR'a yükler → Coolify'ı
tetikler → sunucu yeni image'ı çeker. Sunucuda build yok, site deploy sırasında
yavaşlamaz.

İki istisna:

- **`NEXT_PUBLIC_*` değiştiyse** yeni bir build şart (değer bundle'ın içinde).
  Sadece Coolify'da değiştirmek işe yaramaz.
- **Şema değiştiyse** Adım 12'deki migration komutunu deploy'dan sonra çalıştır.

Elle deploy: Actions sekmesi → **Run workflow**, ya da Coolify'da **Redeploy**
(mevcut image'ı yeniden başlatır, yeni build almaz).

---

## 19. Yedekleme

Coolify'ın Postgres servisinde **Backups** sekmesi var: günlük yedek planla ve
S3 hedefi tanımla. Verinin tamamı (sahneler, sürümler, hesaplar) Postgres'te —
uygulama container'ında saklanan kalıcı bir şey yok, image zaten GHCR'da duruyor.

Sahne gövdeleri `scene_versions` tablosunda tutulur; yanlışlıkla bozulan bir
sahne o tablodan geri alınabilir.
