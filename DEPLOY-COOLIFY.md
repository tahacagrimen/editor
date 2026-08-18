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
| `NEXT_PUBLIC_ASSETS_CDN_URL` | Kendi CDN'in varsa; yoksa hiç ekleme |

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

- Image: `ghcr.io/tahacagrimen/menart-3d:latest`
- **Ports Exposes: `3000`**
- Health Check Path: `/api/health`

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
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Sahne kapak görselleri (thumbnail) için. Yoksa thumbnail yüklenmez, gerisi çalışır. |

**`PORT` değişkenini girme.** Container `next start` ile 3000'de dinler;
`PORT=3002` yazarsan Coolify 3000'e proxy'lemeye devam eder ve site açılmaz.

Kota limitlerini değiştirmek istersen (varsayılan: misafir 2 sahne / 20 MB,
doğrulanmış hesap 25 sahne / 500 MB):
`PASCAL_QUOTA_GUEST_MAX_SCENES`, `PASCAL_QUOTA_FREE_MAX_TOTAL_BYTES` vb.

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

## 14. Google OAuth (giriş için)

Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID
→ Web application**.

**Authorized redirect URIs** alanına:

```
https://draw.menartmimarlik.com/api/auth/callback/google
```

Yerelde de test edeceksen ikinci satır olarak:

```
http://localhost:3002/api/auth/callback/google
```

Çıkan Client ID / Secret'ı Adım 9'daki değişkenlere yaz ve Coolify'dan
**Redeploy** de. (Bu ikisi runtime değişkeni, image'ı yeniden build etmeye
gerek yok.)

---

## 15. E-posta gönderimi (Resend) — DNS kayıtları

Magic link, e-posta doğrulama ve parola sıfırlama mailleri Resend üzerinden
gidiyor. `RESEND_API_KEY` yoksa production'da bu akışlar "gönderdim" demeden
yapılandırma hatası döner; `EMAIL_FROM` boşsa Resend'in ortak
`onboarding@resend.dev` adresi kullanılır ve mail yalnızca hesap sahibine ulaşır.

Kendi domaininden göndermek için Resend panelinde **Domains → Add Domain**:

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

E-postayı hiç kullanmayacaksan bu adımı atla — Google ile giriş tek başına
çalışır.

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
| `manifest unknown` | O tag henüz yüklenmemiş | Actions'ın bittiğinden emin ol; repo → Packages altında tag'i gör |
| Deploy geçti ama eski sürüm çalışıyor | Sunucudaki `latest` cache'lenmiş | Coolify'da image'ı `:latest` yerine kısa SHA tag'i ile ver (workflow ikisini de yüklüyor), ya da sunucuda `docker pull ...:latest` deyip redeploy et |
| Site açılıyor ama giriş `localhost:3002`'ye gidiyor | Adım 6'daki `NEXT_PUBLIC_APP_URL` variable'ı eksikken build alınmış | Variable'ı gir ve **image'ı yeniden build et** (Actions → Run workflow). Coolify'a yazmak tek başına yetmez |
| Tüm `/api/scenes/*` çağrıları `404` | Veritabanı açılamıyor → güvenlik katmanı fail-closed | `POSTGRES_URL`'i kontrol et, migration'ı çalıştır |
| `relation "auth_users" does not exist` | Migration çalışmamış | Adım 12 |
| Canlı senkron çalışmıyor, sekmeler ayrışıyor | Proxy SSE akışını kesiyor | Traefik'te idle timeout ≥ 30s olmalı (route her 15 sn `: keepalive` yollar). Cloudflare kullanıyorsan proxy'yi (turuncu bulut) bu yolda kapat |
| `draw.menartmimarlik.com` açılmıyor, WordPress sitesi açılıyor | `draw` A kaydı yok ya da henüz yayılmamış | `dig +short draw.menartmimarlik.com` VPS IP'sini dönmeli |
| SSL alınamıyor / "invalid certificate" | Let's Encrypt doğrulaması DNS oturmadan denendi | DNS yayıldıktan sonra Coolify'da domaini sil-kaydet ile yeniden dene |
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
