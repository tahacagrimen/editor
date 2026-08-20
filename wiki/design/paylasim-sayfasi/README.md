# Paylaşım sayfası — tasarım kaynağı

Q6 (**Paylaşım / Sharing**) milestone'unun görsel kaynağı. Epic: [#71](https://github.com/tahacagrimen/menart-3d/issues/71).

Bu klasör, Claude Design projesindeki `Paylasim Sayfasi` canvas'ının **repo içindeki kopyası**. Kaynak proje
[claude.ai/design](https://claude.ai/design/p/931e1c59-15ca-4705-aefe-f432bc7866bf) altında ve hesaba bağlı —
yani CI, Codex ya da bir başkası oraya erişemez. Tasarımı burada tutmanın sebebi bu: `globals.css`'in başındaki
yorum bugün `Menart 3D.dc.html` diye bir dosyayı işaret ediyor ve o dosya **repoda yok**. Aynı hatayı ikinci kez
yapmamak için canvas kaynağı burada duruyor.

| Dosya | Ne |
|---|---|
| `paylasim-sayfasi.dc.html` | Sayfanın kendisi — düzen, kopya, durum makinesi, örnek veri |
| `paylasim-sayfasi-iphone.dc.html` | Aynı sayfanın dört durumu, 440 × 956 pt çerçevede |
| `modernist-tokens.css` | Tasarımın kullandığı design-system token'ları (eşleme tablosu aşağıda) |

## Nasıl okunur

`.dc.html` bir Claude Design canvas dosyası. Tarayıcıda tek başına açılmaz — `x-dc`, `sc-if`, `sc-for`,
`dc-import` etiketleri ve `{{ … }}` bağlamaları canvas çalışma zamanına ait. **Kaynak olarak okunur, kopyalanmaz.**
Karşılıkları:

| Canvas | React |
|---|---|
| `<sc-if value="{{ isMetraj }}">` | `{isMetraj && …}` |
| `<sc-for list="{{ rows }}" as="row">` | `rows.map((row) => …)` |
| `style="{{ s.style }}"` | Tailwind sınıfı (aşağıya bak) |
| `<script type="text/x-dc">` içindeki `class Component` | Bileşenin durumu ve türetmeleri |

Dosyanın sonundaki `data-props` bloğu, tasarımın **paylaşım izinlerini** sayıyor:
`allowComments`, `passwordProtected`, `password`, `showCost`, `initialTab`, `initialMode`. Bunların üçü bugün
token'da yok — [#78](https://github.com/tahacagrimen/menart-3d/issues/78) ve
[#84](https://github.com/tahacagrimen/menart-3d/issues/84) bunu kapatıyor.

## Neyi bağlar, neyi bağlamaz

**Bağlar:**

- Ekran hiyerarşisi ve bölüm sırası (künye → sahne → kat şeridi → sekmeler)
- Sekme kümesi: Özet / Metraj / Konum / Yorum
- Kopyanın kendisi — uyarı cümleleri, boş durum metinleri, rozet etiketleri birebir kullanılır
- Etkileşim akışı: "Yorum ekle" → noktaya dokun → ad + not
- Dokunma hedefleri: sekme ve mod düğmeleri 48 px, birincil eylemler 44 px
- 440 pt'ta tek sütun, geniş ekranda iki sütun — **tek ağaç**, `flex-wrap` ile

**Bağlamaz:**

- **Veri sahtedir.** "Menart Villa · B Blok", Ada 214/7, üç kat, oda kutuları, birim fiyatlar — hepsi yer tutucu.
  Gerçek değerler sahneden ve `readSiteZoning` / `takeoffForSubtree` türetmelerinden okunur.
- **Kat planı kutuları temsilîdir.** Tasarımdaki dikdörtgenler yüzde konumlu kutular; gerçek sayfa seçili katın
  gerçek geometrisini çizer ([#75](https://github.com/tahacagrimen/menart-3d/issues/75)).
- **Inline `style` nesneleri.** Tasarım canvas olduğu için her şey satır içi yazılmış. Uygulamada Tailwind
  sınıfları ve `globals.css` token'ları kullanılır — yeni bir `.css` dosyası eklenmez.
- **`onDownload` / `onDownloadCsv` / `onOpenMap` boş.** Tasarımda düğmenin yerini gösteriyorlar, davranışı değil.

## Token eşlemesi — buradaki tek gerçek tuzak

`globals.css` **zaten bu design system**: `--radius: 0rem`, ground `#f3f2f2`, ink `#201e1d`, kırmızı `#ec3013`.
Yani renk seçmek gerekmiyor, sadece doğru isme çevirmek gerekiyor.

| Tasarım (`modernist-tokens.css`) | Uygulama | Tailwind |
|---|---|---|
| `--color-bg` `#f3f2f2` | `--background` | `bg-background` |
| `--color-text` `#201e1d` | `--foreground` | `text-foreground` |
| `--color-surface` `#eae9e9` | `--accent` (açık) / `--secondary` | `bg-accent` |
| **`--color-accent` `#ec3013`** | **`--primary` / `--ring`** | **`bg-primary` / `text-primary`** |
| `--color-accent-700` `#ae1800` | — | `text-primary` (koyu tonu yok) |
| `--color-accent-200` `#ffe0d9` | — | `bg-destructive/15` ya da açık literal + `dark:` eşi |
| `--color-divider` (ink %40) | `--border` (ink %22) | `border-border` |
| `--color-neutral-500..700` | `--muted-foreground` | `text-muted-foreground` |
| `--color-neutral-100/200` | `--muted` | `bg-muted` |
| `--shadow-sm/md/lg` | — | `shadow-sm` / `shadow-md` / `shadow-lg` |
| `Archivo` | `--font-sans` → **DM Sans** | `font-sans` |
| `--font-heading` + `font-weight: 800` | aynı aile, ağırlıkla ayrışır | `font-sans font-extrabold` |

> **İsim çakışması.** Tasarımda `--color-accent` **kırmızıdır**; uygulamada `--accent` **soluk gri bir yüzeydir**.
> `var(--color-accent)` gördüğün her yeri `bg-accent`'e çevirmek, bütün birincil düğmeleri griye boyar.
> Kırmızı `--primary`'dir. `globals.css:73` bu çakışmayı zaten not ediyor.

Tasarım Archivo ile çizildi, uygulama DM Sans kullanıyor. **Font değiştirilmez** — tipografi `--font-sans`
anahtarının işi, sayfanın değil.

## Tema

Tasarım tek temalı (açık) çizildi. Uygulamada **iki tema da gerçek** ve chrome koyu-first yazılmış. Üç yazım
açıkta bozulur ve tasarımdan birebir kopyalanırsa bu sayfaya da taşınır:

- Token metin altında sabit koyu yüzey (`bg-[#2C2C2E]`) → koyu üstüne koyu
- Token yüzey üstünde çıplak `text-white` → beyaz üstüne beyaz
- Yükseltilmiş yüzey olarak `bg-white/10` → açık temada kaybolur

Yerine `bg-accent` ve `foreground/N`; açık tonları `dark:` eşiyle çiftle (`text-red-700 dark:text-red-400`).
Koyu temada göz kararı yapmak açık tema hakkında hiçbir şey söylemez — ikisi de açılıp bakılır.

## Ekranlar → issue'lar

| Tasarımdaki bölüm | Issue |
|---|---|
| Sayfa iskeleti, iki sütun / tek sütun | [#72](https://github.com/tahacagrimen/menart-3d/issues/72) |
| Kilit ekranı ("Bu paylaşım şifreli") | [#73](https://github.com/tahacagrimen/menart-3d/issues/73) |
| Künye (proje adı, parsel, rev, geçerlilik, SALT OKUNUR) | [#74](https://github.com/tahacagrimen/menart-3d/issues/74) |
| Mod şeridi, sahne, rozetler, kat şeridi | [#75](https://github.com/tahacagrimen/menart-3d/issues/75) |
| Özet sekmesi | [#76](https://github.com/tahacagrimen/menart-3d/issues/76) |
| Metraj sekmesi + CSV | [#77](https://github.com/tahacagrimen/menart-3d/issues/77) |
| `showCost` ile fiyat sütunlarının düşmesi | [#78](https://github.com/tahacagrimen/menart-3d/issues/78) |
| Konum sekmesi | [#79](https://github.com/tahacagrimen/menart-3d/issues/79) |
| Pin akışı, taslak pin, yorum listesi, yanıtlar | [#80](https://github.com/tahacagrimen/menart-3d/issues/80) |
| — (yorum ucu, tasarımda karşılığı yok) | [#81](https://github.com/tahacagrimen/menart-3d/issues/81) |
| Künyedeki PDF düğmesi | [#82](https://github.com/tahacagrimen/menart-3d/issues/82) |
| — (bağlantı iptali, tasarımda karşılığı yok) | [#83](https://github.com/tahacagrimen/menart-3d/issues/83) |
| `data-props` paylaşım izinleri | [#84](https://github.com/tahacagrimen/menart-3d/issues/84) |
| Tüm kopya | [#85](https://github.com/tahacagrimen/menart-3d/issues/85) |

## Tasarımın söylemediği, kodun söylediği

Bu sayfayı yazarken `AGENTS.md`'deki üç madde tasarımdan daha bağlayıcı:

1. **Sayfa Server Component olarak sahneyi doğrudan store'dan okur** (`server-components-avoid-self-fetch.test.ts`
   bunu sabitliyor) ve o süreçte `nodeRegistry` **boştur**. Kind başına bilgi bir `definition`'dan okunamaz —
   `core`'dan gelmeli.
2. **2B ve 3B iki ayrı render'dır.** Sayfa 2B modda açılırsa R3F kökü hiç oluşmaz, `sceneRegistry` boş kalır ve
   kamera yoktur. Çerçeveleme/ölçme gerektiren her şeyin iki modda ayrı cevabı olmalı.
3. **Hiçbir paket CSS taşımaz.** Yeni bir stylesheet eklenmez; düz CSS Tailwind katmanlarını yener ve
   `.foo button { background: none }` gibi bir kural altındaki tüm `bg-*`'leri sessizce siler.
