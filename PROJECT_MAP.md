# MARSWEAVE – Proje Haritası (karar vermek için)

Yığın: React 19 + TypeScript + Vite + Tailwind 4 + Three.js + lucide-react. İsteğe bağlı Gemini copilot (yalnızca dev sunucusunda `/api/copilot`). Toplam ≈12,4 bin satır.

## 1. Akış (tek bakışta)

```
data/arcadiaData.ts  ──►  App.tsx (tüm state)  ──►  engine/routeOptimizer.ts (A*, 3 rota)
 (ızgaralar, hedefler,      │                           │
  tehlike bölgeleri,        ├─► MarsMapCanvas ► Mars2DViewport / Mars3DViewport
  LAYER_TRUTH)              ├─► Paneller (MissionSetup, LayerManager, RoutePanel, SimulatorControls)
                            ├─► Modallar (Briefing, WhatIf, ScienceTarget, ScienceDecision, Report, JuryTour)
                            └─► Copilot (yerel kural motoru, varsa Gemini)
```

Sayfalar (`PageId`, HeaderBar.tsx): HOME, THE PROBLEM, HOW IT WORKS, NASA DATA, SCIENCE, SIMULATOR (varsayılan), MISSION REPORT, SOURCES.

## 2. Veri dürüstlüğü modeli

Tek kaynak: `LAYER_TRUTH` (arcadiaData.ts, ~satır 844). Her katman şu 4 durumdan birini taşır: REAL NASA ARCHIVE / DERIVED / MODELLED / SIMULATED. Katman paneli, kaynak tablosu, provenance çekmecesi ve rozetler buradan beslenir. Bir katmanın statüsünü değiştirmek = yalnızca bu tabloyu düzenlemek.

Katman idleri: base, mola_elevation, slope, hirise_texture, themis_thermal, crism_minerals, sharad_ice, atmosphere_dust, radiation_rad, relay_comms, hazards, science_targets.

Gerçek olan tek şey: yükseklik (scripts/fetch_arcadia_dem.py çalıştırılıp `data/arcadia_dem.json` üretilirse; yoksa SENTETİK). Eğim bundan TÜRETİLİR. Diğerleri modelleme/simülasyon.

## 3. Dosya haritası ve “şunu değiştirmek için nereye bakmalı”

| İstek | Dosya / yer |
|---|---|
| Gerçek DEM'e geçmek | `python scripts/fetch_arcadia_dem.py` → `data/arcadia_dem.json` (rasterio+numpy gerekir). Henüz gerçek USGS dosyasıyla denenmedi. |
| Bölge sınırları, ızgara boyutu | `MISSION_BOUNDS`, `GRID_COLS/ROWS` (arcadiaData.ts ~satır 41–58) |
| Habitat konumu | `HABITAT_ALPHA` (x12, y82) |
| Bilim hedefleri (SCI-07, 04, 02, 09, 11) | `ARCADIA_SCIENCE_TARGETS` (~satır 280), yüzde koordinatları |
| Varsayılan hedef | `DEFAULT_TARGET_ID = 'SCI-04'` |
| Tehlike bölgeleri (HAZ-01..04) | `ARCADIA_HAZARD_ZONES` (~satır 449). El ile yerleştirilmiş, gerçek arazide uymayabilir |
| Radyasyon temeli | `RAD_BASELINE_MICROSV_H = 26.7` (MSL RAD ≈0,64 mSv/gün, Gale proxy'si) |
| Buz / iletişim ızgarası | `generateSubsurfaceIceGrid`, `generateCommsGrid` (modellenmiş) |
| Rota maliyeti, risk toleransı, hedef ağırlıkları | `getCostWeights` (routeOptimizer.ts ~satır 63): slope 2.4, hazard 3.0, science 1.8, ice 1.5, comms 1.6; LOW risk max eğim 18°, orta 25°, HIGH 29° |
| Yük etkisi (varsayım) | `PAYLOAD_SPEED_LOSS_PER_KG=0.004` (zemin 0,6×), `PAYLOAD_SLOPE_LOSS_DEG_PER_KG=0.1`; doğrulanmamış |
| Rota üretimi (3 aday) | `planEvaRoutes` (~satır 502), `evaluateRouteCandidate` (doz, bütçe aşımı) |
| Toz fırtınası yeniden planlama | App.tsx ~satır 315, `calculateReplanningDelta` |
| Varsayılan EVA süresi (150 dk), yük (10 kg) | App.tsx `profile` state (~satır 65) |
| Kullanıcı arayüzü sayfaları | `components/Pages/*` |
| Haritada hücre denetleyici | `components/MarsMap/CellSourceTable.tsx` |
| Perseverance varış görüntüsü | `components/Panels/PovImageCard.tsx` (belgelenmemiş JSON akışı; CORS/boş olabilir, yedek bağlantı var) |
| Copilot | `components/Copilot/MissionCopilot.tsx` (yerel motor) + `vite.config.ts` (Gemini, `GEMINI_API_KEY`, `GEMINI_MODEL`) |
| Atıf / lisans | `REFERENCES.md`, `DATA_SOURCES.md`, SourcesPage |
| Jüri turu, brifing | `JuryTourModal`, `MissionBriefingModal`, `DEMO_SCRIPT.md` |

Çalıştırma: `npm install`, `npm run dev` (port 3000), `npm run build`, `npm run lint` (tsc). `.env`: GEMINI_API_KEY (isteğe bağlı).

## 4. Bilinen sınırlar (dürüst liste)

1. Gerçek DEM hiç indirilmedi/test edilmedi. 200 m/px küresel DEM bölgesel; gerçek “hiper-yerel” için HiRISE/CTX DTM gerekir (`--dtm` modu denenmedi, pyproj gerekir).
2. Bilim hedefleri ve tehlike bölgeleri gerçek arazi yüklenince hizalanmayabilir. Öneri: tehlikeleri gerçek eğimden türetmek.
3. Kaya (boulder) kaçınması modellenmiş, gözlemsel değil.
4. Yük/uzay giysisi katsayıları varsayım; kaynak yok.
5. Copilot sunucusu yalnızca dev'de; yayında anahtarı gizleyen bir backend gerekir. Anahtarsız yerel motor çalışır.
6. A* açık kümesi dizi (doğrusal tarama); küçük ızgarada sorun yok, min-heap iyileştirme olur.
7. `MissionReplayModal.tsx` silindi. Copilot: `server/copilotHandler.ts` (ortak), `api/copilot.ts` (sunucusuz), dev'de Vite middleware.
8. Kayıt defterindeki PDS kimlikleri doğrulanmadı (DATA_SOURCES.md'de belirtildi).
9. 3D görünüm yalnızca CDN ile önizlemede denendi; yerelde `three` paketiyle çalışır.
10. REFERENCES.md'deki “AI desteği / önceden yapılmış iş” bölümünü ekip doldurmalı; yarışma öncesi kodu Local Lead'e bildirin.
11. HRSC verisi CC BY-SA 3.0 IGO: atıf + aynı lisansla paylaşım.

## 5. Olası değişiklik yönleri (seçim için)

- A. Gerçek DEM'i çalıştırıp hazard'ı eğimden türetmek (en çok “gerçeklik” puanı).
- B. Hedefleri gerçek arazide gerçek morfolojiye (kráter, tepe) oturtmak.
- C. Demo videosu (≤3 dk, İngilizce altyazı) ve tek sayfalık proje kartı.
- D. Visor-HUD (astronot bakışı) modu.
- E. Copilot'u yayına uygun backend'e taşımak.
- F. Küçük temizlik: min-heap A*, kullanılmayan modal.

## Güncelleme (Task 1-2)
- Hazard: `deriveHazardsFromSlope` (gerçek DEM varsa), `HAZARD_ZONE_ORIGIN`; hedefler: `snapScienceTargets`; DEM doğrulaması: `validateRealDem`.
- A*: `MinHeap` sınıfı; yük/yürüyüş modeli: `engine/evaPhysiology.ts` (Minetti 2002, Mars yerçekimi oranı 0.87, NASA PLSS 350 W); notlar `PAYLOAD_MODEL_NOTES` (çekmecede gösterilir).
- Eğim limiti katsayısı (0.1°/kg) ve takım kütlesi (160 kg) hâlâ VARSAYIM.

## Modlar (v11)
- EASY (varsayılan): `components/Easy/EasyHome.tsx`, `EasySimulator.tsx` — sade dil, büyük düğmeler, aynı rota planlayıcı.
- ADVANCED: tüm sayfalar (THE PROBLEM, HOW IT WORKS, NASA DATA, SCIENCE), What-If Lab, Jury Tour, Briefing, bilimsel karar penceresi, Assistant, haritada GRID/CONTOURS/REGIONS/ALT-ROUTES ve 3D.
- Anahtar: üst sağdaki EASY | ADVANCED (App.tsx `advanced` durumu).

## Astronot gözü (v12)
- `engine/visorRender.ts`: gerçek DEM'den (Catmull-Rom) yazılım yükseklik-haritası ışın izleyici. Gerçek: arazi şekli. Prosedürel (uydurma): ince kabartı, kayalar, zemin dokusu. Modellenen: sis (tau/11 km), gökyüzü, güneş, gölge.
- `components/MarsMap/VisorView.tsx`: görünüm + rota noktaları + hedef işareti; ADVANCED'de VisorHud, EASY'de kısa mesaj.
- Simülatör durumunu (konum, rota, toz tau, yerel saat) izler; ayrıca kurulum gerekmez.

## Gerçek veri ürünleri (v13)
- `data/realProducts.ts` + `data/real/*.json` + `scripts/fetch_real_products.py` + `docs/REAL_DATA_HOWTO.md`.
- Dosya yoksa durumlar eskisi gibi (SIMULATED/MODELLED); var ve geçerliyse REAL. Astronot gözü varsayılan olarak yalnızca gerçek DEM'i gösterir; uydurma kaya/doku "ILLUSTRATIVE DETAIL (INVENTED)" anahtarının arkasında (Advanced).
