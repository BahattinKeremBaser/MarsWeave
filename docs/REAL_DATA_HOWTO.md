# Gerçek veri ürünlerini bağlama (data/real/*.json)

Uygulama bir ürünü yalnızca `data/real/<id>.json` varsa **ve** `data/realProducts.ts` doğrulamasını geçerse "REAL NASA ARCHIVE" gösterir.
Dosya yoksa eski durum (SIMULATED/MODELLED) görünür. Kaynak/atıf/lisans alanları olmayan dosya reddedilir.
Betikler internete erişen kendi bilgisayarınızda çalışır (`scripts/fetch_real_products.py`; `pip install numpy rasterio pyproj netCDF4 spiceypy` — hangi alt komut için ne gerekiyorsa).

| id | Neyi değiştirir | Alt komut | Girdi (nereden) | Doğrulama durumu |
|---|---|---|---|---|
| dust_tau | Toz optik derinliği (sis, fırtına tau) | `dust` | LMD toz klimatolojisi NetCDF, bir Mars Yılı (MY) dosyası: https://www-mars.lmd.jussieu.fr/mars/dust_climatology | Sayfa ve format (NetCDF, 610 Pa'a normalize 9.3 µm emilim tau) doğrulandı. Dosya içindeki değişken adları doğrulanmadı: betik değişken listesini yazdırır, gerekirse `--var` verin. |
| rad | Doz hızı (µSv/h) | `table --product rad` | PDS PPI MSL RAD RDR tablosu (CSV/ASCII) | Dosya yolu ve sütun adı doğrulanmadı; `--column` ve `--factor` sizin vereceğiniz değerler. Gale referansıdır, Arcadia ölçümü değildir. |
| meda | Sıcaklık/basınç/rüzgâr özeti | `table --product meda` | PDS Atmospheres Node MEDA CSV | Doğrulanmadı. Jezero referansıdır. |
| themis_ti | THEMIS termal eylemsizlik grid'i (tiu) | `raster --product themis_ti` | USGS Astrogeology "THEMIS Thermal Inertia Mosaic Quantitative" ilgili karo GeoTIFF'i | Karo sayfalarının varlığı doğrulandı (qualitative 30N120E vb.); Arcadia'yı kapsayan quantitative karonun tam URL'i doğrulanmadı. |
| hirise_albedo | Gerçek yer parlaklığı (görüntüde zemin) | `raster --product hirise_albedo` | Bölgeyi kapsayan bir HiRISE RDR (JP2/GeoTIFF) | Bölgeyi kapsayan gözlem ID'si doğrulanmadı (ODE sorgusu gerekir). Kaya haritası DEĞİL, görüntüdür. |
| swim_ice | SWIM2 buz tutarlılık haritası (0–100) | `raster --product swim_ice --vmin --vmax` | PDS Geosciences SWIM2 ürünü | Doğrulanmadı; `--vmin/--vmax` ürün belgesine göre sizin vereceğiniz ölçek. |
| crism_hydration | CRISM özet parametresi (örn. BD1900) | `raster --product crism_hydration` | CRISM MRDR özet parametre karosu | Doğrulanmadı. Bant derinliği hidrasyon kanıtıdır, tek başına mineral kimliği değildir. |
| relay_passes | Orbiter geçişleri | `relay` | NAIF meta-kernel (MRO/MAVEN SPK + LSK + PCK) | Betik mantığı (yükseklik açısı) testli; çekirdek dosya adları doğrulanmadı. Yalnızca geometrik görünürlük, bağlantı bütçesi değil. |

## Örnek komutlar
```
python scripts/fetch_real_products.py dust --file mcd_dust_MY34.nc --my 34 \
  --source-name "LMD Mars dust climatology MY34" --citation "Montabone et al. (2015, 2020), LMD" --license "CC BY-SA 3.0"
python scripts/fetch_real_products.py raster --product themis_ti --url <GeoTIFF URL> --unit tiu \
  --source-name "USGS THEMIS Thermal Inertia Mosaic" --citation "Fergason et al. (2006); USGS" --license "Public domain"
python scripts/fetch_real_products.py table --product rad --file RAD.csv --column <DOZ_SUTUNU> --factor <ÇARPAN> \
  --source-name "MSL RAD RDR (PDS PPI)" --citation "Hassler et al. 2014; Berger et al. 2020" --license "NASA PDS open data"
```
Her komut `data/real/<id>.json` yazar; `npm run dev` yeniden başlatınca durum etiketleri kendiliğinden güncellenir.

## Varsayımlar (JSON'da ve uygulamada işaretli)
- Toz: LMD tau'su 9.3 µm emilimidir, 610 Pa'a normalizedir. Sis için görünür tau'ya çevirmek `--vis-scale` (varsayılan 2.6) ve yüzey basıncı oranıyla (ölçek yüksekliği 10.8 km) yapılır; ikisi de VARSAYIM.
- Fırtına senaryosunun zamanı (2700. saniye) hâlâ senaryodur; tau değeri gerçek serinin maksimumudur.

## Tek komutla toplama (collect_real_data.py)
```
python3 scripts/collect_real_data.py --init     # real_inputs.json şablonu
# indirdiğiniz dosyaların yollarını "file" alanlarına yazın, bulamadıklarınızı boş bırakın
python3 scripts/collect_real_data.py            # marsweave_real_data.zip + notlar.txt
```
Koordinat/pencere betiğe gömülü (Arcadia 39.30°N, 171.40°W, 16 km). Boş bırakılan ürünler "bulamadım" olarak
notlara yazılır ve uygulamada SIMULATED kalır.


## Yayınlanmış referans değerler (2026-11-14)
`data/real/rad.json` ve `data/real/meda.json` literatürden alınmış değerlerdir (`kind: published_literature`). Uygulamada REAL NASA ARCHIVE değil, MODELLED + 'PUBLISHED REFERENCE VALUE' etiketiyle görünür. MEDA yalnızca öğleden sonra rüzgâr medyanını (5 örnek) ve Jezero hava sıcaklığını referans satırı olarak kullanır; yüzey sıcaklığı modeli değişmez. Toz, THEMIS, HiRISE, SWIM, CRISM ve röle için gerçek veri bulunamadı, SIMULATED/MODELLED kalır.
