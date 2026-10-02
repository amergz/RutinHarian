# Rutin Harian: Android App (Capacitor 8)

Projek ini menukar web app Rutin Harian menjadi **APK Android** yang boleh dipasang terus di telefon.
APK dibina secara automatik dan percuma oleh **GitHub Actions**. Anda tak perlu pasang Android Studio.

---

## A. Dapatkan APK (cara paling mudah, ±15 minit kali pertama)

1. Daftar / log masuk di <https://github.com>.
2. Klik **New repository** → nama: `rutin-harian` → pilih **Private** → **Create repository**.
3. Klik **uploading an existing file**. Ekstrak zip ini dahulu, kemudian seret **semua isi** folder
   `rutin-harian-android` (bukan folder itu sendiri) ke halaman tersebut → **Commit changes**.
   > ⚠️ Pastikan folder `.github` turut dimuat naik. Di Windows/Mac, folder bermula dengan titik
   > kadang-kadang tersembunyi. Jika tab **Actions** tidak menunjukkan "Build APK", lihat bahagian **D**.
4. Buka tab **Actions** → **Build APK**. Build bermula sendiri (atau tekan **Run workflow**).
   Tunggu sehingga tanda ✅ hijau (±6–10 minit).
5. Klik build tersebut → bahagian **Artifacts** → muat turun **RutinHarian-APK** (fail .zip).
6. Hantar zip itu ke telefon, ekstrak, kemudian ketik fail `.apk`.
   Benarkan **"Install unknown apps"** untuk Files/Chrome apabila diminta.
   Play Protect mungkin beri amaran "unknown developer". Pilih **Install anyway** (ini app anda sendiri).

### Kemas kini app kemudian
Ubah fail dalam `www/` di GitHub → commit → APK baru dibina automatik.
Pasang terus di atas versi lama. **Data anda kekal** kerana semua build ditandatangani dengan kunci yang sama
(`keystore/release.p12`, dijana sekali sahaja pada build pertama).

> 🔐 Kunci tandatangan disimpan dalam repo. **Kekalkan repo Private.** Untuk keselamatan tambahan,
> tetapkan secret `RH_KEYSTORE_PASSWORD` (Settings → Secrets → Actions) **sebelum build pertama**.

---

## B. Selepas pasang: tetapan penting di telefon

1. Buka app → benarkan **Notifications** apabila diminta.
2. **Profile → Android App → Send Test Notification**: notifikasi patut muncul dalam 5 saat.
3. Samsung / Xiaomi / Oppo sering melambatkan notifikasi app yang ditutup. Untuk reminder tepat masa:
   **Settings → Apps → Rutin Harian → Battery → Unrestricted**.

---

## C. Ciri Android baharu

| Ciri | Penerangan |
|---|---|
| ⏱ **Notifikasi timer live** | Semasa puasa: `🕒 04:12:33 Remaining` + peringkat semasa (cth. ⚡ Metabolic Switch) + ikon peringkat. Jam berdetik sendiri walaupun app ditutup, tanpa menghabiskan bateri. Bila sasaran tercapai, ia bertukar kepada `16:05:10 Fasted` 🏆. Timer aktiviti pula dikira naik (`00:12:40 Elapsed`). |
| 🔔 **Reminder sistem** | Reminder aktiviti, To-Do, puasa (mula / hampir tamat / selesai) dan ringkasan mingguan dijadual sebagai notifikasi Android, jadi ia tetap berbunyi walaupun app ditutup. Butang terus pada notifikasi: **▶ Start**, **✓ Done**, **Snooze 10 min**, **Start Fast**, **Finish Fast**. |
| ◀ **Butang Back** | Tutup popup/sheet dahulu → kembali ke tab Today → minimize app (tidak keluar mengejut). |
| 📳 **Getaran haptik** | Getaran ringan setiap kali butang ditekan (boleh dimatikan). |
| 🎨 **Status bar ikut tema** | Ikon status bar gelap/terang mengikut tema app. |
| 💾 **Export backup** | Guna Share sheet Android. Simpan ke Drive/Files, atau hantar melalui WhatsApp/Email. |
| 🔄 **Auto-refresh** | Data dikemas kini bila app dibuka semula atau melepasi tengah malam. |
| 🖼 **Ikon & splash** | Ikon adaptif (termasuk themed icon Android 13+) dan skrin pembuka. |

Semua ciri ini boleh dihidup/matikan di **Profile → Android App**.

---

## D. Masalah biasa

- **Tab Actions kosong / tiada "Build APK":** folder `.github` tidak termuat naik. Dalam repo, klik
  **Add file → Create new file**, taip nama `.github/workflows/build-apk.yml`, tampal isi fail
  tersebut dari zip, kemudian **Commit**.
- **Build gagal (❌):** buka log langkah yang merah. Jika berlaku pada langkah *Apply native code*,
  mesej `✖ patch-android:` akan menerangkan punca.
- **"App not installed" semasa kemas kini:** APK lama ditandatangani dengan kunci lain (contohnya
  dari alat lain). Backup data dahulu (**Export Data**), uninstall, pasang semula, kemudian **Import Data**.

---

## E. Struktur projek

```
www/                     Web app (HTML/CSS/JS), boleh juga dibuka terus dalam browser
  js/native.js           Jambatan ke Android (no-op dalam browser)
native/java/             Plugin native LiveTimer (Java)
native/res/              Layout notifikasi, ikon, splash
scripts/patch-android.mjs  Salin kod native + tampal manifest/gradle selepas `cap add`
.github/workflows/       Build APK automatik
capacitor.config.json    appId: com.rutinharian.app
```

### Bina sendiri di komputer (pilihan, untuk pembangun)
Keperluan: Node 22, JDK 21, Android SDK (Android Studio Otter atau lebih baharu).
```bash
npm install
npx cap add android && npx cap sync android
keytool -genkeypair -storetype PKCS12 -keystore keystore/release.p12 -alias rutinharian \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass rutinharian -keypass rutinharian \
  -dname "CN=Rutin Harian, C=MY"
node scripts/patch-android.mjs
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
