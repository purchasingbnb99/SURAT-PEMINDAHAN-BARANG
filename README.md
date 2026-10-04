# SURAT PEMINDAHAN BARANG — V1.0.38

## Release note V1.0.41
- TTD otomatis pada print Continuous Form dinormalisasi saat dicetak: crop rapat, tinta hitam biner, stroke diperkuat ringan, dan resolusi print diperbesar.
- Snapshot TTD di Firestore tidak diubah; peningkatan dilakukan hanya pada jalur print sehingga proteksi UID + password tetap sama.
- Disarankan menggunakan PNG TTD bersih sebagai sumber upload.

Aplikasi web SPB berbasis HTML/JavaScript + Tailwind CSS + Firebase Authentication + Firestore. Tidak menggunakan Firebase Cloud Storage.

## Fitur utama
- Admin login email/password; Staff login tanpa password melalui Anonymous Authentication.
- Nomor SPB otomatis untuk Jasa (JS), Retur (R), dan Umum (U) dengan counter Firestore Transaction.
- Kode Tahun dapat memiliki banyak pasangan per tahun, misalnya 2026A, 2026B, 2026I.
- Master Tujuan dengan dua baris tujuan.
- Master Barang untuk pengisian Kode/Nama otomatis.
- Qty/Satuan fleksibel: satu item dapat memiliki beberapa pasangan Qty + Satuan, misalnya 19.65 KG dan 1154.50 MTR.
- Master Satuan: default PCS, KG, ROL, MTR dan satuan tambahan.
- Qty Order + Qty Retur + Presentase otomatis.
- Print SPB formal A4, TTD Admin otomatis, No PO, Note sebagai bagian tabel, dan multi-page.
- Laporan detail per barang dengan filter tanggal, jenis, prefix, kategori Retur, dan No SPB.
- Laporan Retur dapat dicetak per kategori atau semua kategori terpisah.
- Sample kosong pada laporan untuk pemasangan sampel fisik 5 cm x 2 cm.
- Hapus SPB untuk Admin; nomor SPB tidak dipakai ulang.
- Laporan: Export Laporan Excel sesuai filter dan Export Data SPB yang kompatibel untuk backup/import.
- Import SPB Excel: satu baris = satu barang; baris dengan No. SPB yang sama digabung; duplikat No. SPB ditolak sebelum penulisan.
- Template Import SPB tersedia dari menu Laporan.
- Master Barang: Import Excel, Export Excel, dan Template Excel.
- Library Excel (SheetJS) dimuat hanya saat fitur Excel digunakan agar startup tetap ringan.

## Firebase
Aktifkan Authentication Email/Password dan Anonymous. Buat Cloud Firestore. Publish `firestore.rules`. Tidak perlu Cloud Storage untuk V1.0.23.

## File
- index.html
- app.js
- firebase-config.js (isi dengan Web App config Anda; jangan memasukkan service account/private key)
- firebase.json
- firestore.rules
- START-SPB.bat

## Lokal
Dari folder project:
```cmd
npx http-server . -p 5510 -c-1
```
Buka `http://127.0.0.1:5510`.

## Catatan kompatibilitas
Data SPB lama yang masih memiliki `qtyPcs`, `qtyKg`, `qtyRol`, atau `satuan` dimigrasikan saat dibuka/print ke tampilan Qty/Satuan. Field legacy tetap disimpan saat SPB baru ditulis untuk menjaga kompatibilitas laporan lama.


## V1.0.23 — No. PO bersama
- Mode default: satu No. PO untuk semua barang pada satu SPB.
- Mode opsional: No. PO berbeda per barang.
- Saat mode satu PO aktif, No. PO di setiap baris mengikuti No. PO utama dan tidak perlu diketik ulang.
- Dokumen menyimpan `poMode` dan `sharedNoPo`; item tetap menyimpan `noPo` efektif untuk kompatibilitas laporan/print/import/export.

## V1.0.37 — Cari SPB: Nama Barang + Qty/Satuan
- Tabel Cari SPB menampilkan kolom Nama Barang dan Qty / Satuan berdampingan.
- Setiap item menampilkan seluruh Qty/Satuan yang tersimpan, misalnya 620 PCS dan 2 KG.
- Data lama memakai normalisasi Qty/Satuan yang sama sehingga tetap terbaca.


### Proteksi TTD Otomatis
Setiap penggunaan TTD otomatis pada Print SPB wajib melalui re-authentication Firebase dengan password Admin. Verifikasi dilakukan setiap kali print, tidak disimpan di localStorage/Firestore, dan aplikasi memeriksa owner UID TTD sebelum digunakan. SPB baru juga menyimpan signatureOwnerUid/signatureOwnerName.


V1.0.37: Reordered item inputs (Keterangan → Qty/Satuan → Qty Order → Qty Retur → %), added password-optional printing without automatic signature, enlarged print name column and typography, and established a minimum half-A4 print table area (148.5 mm) that expands when content requires more space.


V1.0.37 notes: Detail input order is Keterangan → Qty/Satuan → Qty Order → Qty Retur → %. SPB print supports “Print Tanpa TTD” without password; automatic TTD still requires owner UID plus Firebase password re-authentication. The print table has a 148.5 mm minimum (half of A4 height), with larger typography and a wider Nama Barang column.


## Print Continuous Form V1.0.37
Print SPB dirancang untuk continuous form 9.5 x 11 inch yang dibagi dua secara horizontal, sehingga setiap form SPB berukuran 9.5 x 5.5 inch (241.3 x 139.7 mm). Print laporan tetap menggunakan A4 landscape.

## V1.0.37 — Continuous Form SPB
Print SPB menggunakan ukuran fisik 9.5 x 5.5 inch per form, sebagai setengah dari continuous form 9.5 x 11 inch. Dalam satu setengah form: lebar 241.3 mm dan tinggi 139.7 mm. Print laporan tetap menggunakan A4 landscape. Disarankan memilih/menambahkan custom paper size 9.5 x 5.5 inch pada driver printer continuous form bila printer/driver tidak otomatis mengikuti CSS page size.


## V1.0.37 — Fixed Print Table
- Print SPB continuous form tetap 9.5 x 5.5 inch per form.
- Tinggi tabel barang dibakukan menjadi 66 mm, sehingga 1, 2, atau beberapa item memakai frame tabel yang sama selama masih berada pada kapasitas satu form.
- Jika item melebihi kapasitas aman, data dibagi ke lembar lanjutan; font tidak dipaksa mengecil.
- Tampilan Qty/Satuan dan Note tetap dipertahankan.


## V1.0.37 Print Continuous Form
- Continuous Form SPB tetap 9.5 x 5.5 inch per form.
- Maksimal 6 item per form; item ke-7 otomatis ke halaman berikutnya.
- Setiap item memakai slot tinggi baku untuk maksimum 3 baris Nama Barang/Keterangan.
- Slot kosong tetap dicetak agar posisi NOTE, TTD, dan footer konsisten.
- NOTE hanya tampil pada halaman terakhir dan mempunyai area tetap; ada spacer sebelum NOTE agar tidak menempel pada item terakhir.


## V1.0.37 Print Fixed 6 Item Slots
- Setiap form continuous 9.5 x 5.5 inch memiliki 6 slot item tetap.
- Item ke-7 pindah ke halaman berikutnya.
- Slot nama barang dan keterangan dibatasi maksimal 3 baris secara visual agar tinggi item konsisten.
- NOTE hanya dirender pada halaman terakhir, setelah 6 slot item dan spacer tetap.
- NOTE dan TTD tetap berada pada posisi yang konsisten pada halaman terakhir.


## Catatan V1.0.37

Print continuous form dikalibrasi untuk hasil fisik: area aman kanan diperbesar, Nama Barang diperjelas, footer waktu cetak diperbesar, metadata lembar lanjutan diperbesar, dan area NOTE diperbesar serta tetap berada hanya pada lembar terakhir. Struktur data dan fitur Firebase tetap dipertahankan.


V1.0.37: print calibration for physical continuous form, safer right margin, larger readable item text, and larger fixed NOTE area.


## V1.0.38 — Continuous Form Print Calibration
- Removed the extra continuation title/meta block from pages 2+ while retaining the repeated SPB identity block (Kepada, No LRB, No SPB, Tanggal, Kategori, No PO).
- Narrowed the continuous-form table frame slightly to protect the right print edge and Qty column on physical tractor-feed forms.
- Kept the fixed 6-item layout, NOTE on the last page only, and signature/footer behavior unchanged.


## TTD exact snapshot (V1.0.41)

The verified `signatureSnapshotData` stored in Firestore is used directly for Preview and Print. The application does not threshold, thicken, crop, or redraw the signature at print time.


## V1.0.43 — Admin productivity tools
- Audit Log (`auditLogs`) untuk aktivitas login/logout, SPB, print, import, master, dan backup.
- Riwayat Revisi SPB (`spbRevisions`) melalui detail SPB; snapshot sebelumnya disimpan tanpa gambar TTD besar.
- Backup & Restore JSON untuk SPB, Master Tujuan, Kode Tahun, Master Barang, Master Satuan, dan counters. Restore bersifat merge/upsert dan tidak menghapus data.
- Fitur print Continuous Form 9.5" × 5.5", maksimum 6 item, Note/TTD di halaman terakhir, dan proteksi TTD tetap dipertahankan.


## V1.0.44 — Login parser-error repair
- Reworked Activity/Audit Log rendering to avoid deeply nested template literals that can be fragile in some browser-served copies.
- Added `app.js?v=1044` cache-busting to ensure the browser does not reuse an older `app.js`.
- No database schema changes.


## V1.0.46
- Aktivitas Sistem: filter tanggal, pengguna, aksi, pencarian detail, dan Export CSV.
- PWA: manifest + service worker untuk instalasi sebagai aplikasi di perangkat yang mendukung.
- Layout Print Continuous Form tidak diubah pada versi ini.


## V1.0.47 — Pengaturan Print Continuous Form
- Menambahkan menu Admin **Pengaturan Print** untuk kalibrasi perangkat/browser per printer.
- Parameter: jarak atas/kanan/bawah/kiri, safe area kanan tabel, dan lebar maksimum TTD.
- Nilai default mengikuti layout fisik SPB yang sudah diuji dan tidak mengubah tampilan input/data Firebase.
- Pengaturan disimpan lokal pada perangkat (`localStorage`), sehingga printer tiap komputer dapat dikalibrasi tanpa memengaruhi pengguna lain.
- Tersedia Preview Kalibrasi dan Kembalikan Default.
