# Checkpoint Person 1

Pembaruan 6 November 2026: runtime utama **AgentService NestJS + Gemini**; HF tetap tersedia melalui pilihan provider eksplisit. WorkBuddy/MCP menjadi konektor eksternal opsional. Ini keputusan implementasi tim; ketentuan teknologi lomba masih perlu dicocokkan dengan handbook.

## Tahapan dan bukti aktual

| Checkpoint                   | Implementasi                                                                            | Status penerimaan                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CP0 — Handoff                | Checklist Person 2, pembagian tim, contracts, corpus sintetis                           | Dokumentasi tersedia                                                                                      |
| CP1 — Fondasi MCP            | Client smoke, template WorkBuddy, pemeriksaan tool                                      | Tes lokal lulus; WorkBuddy nyata belum diuji                                                              |
| CP2 — Provider model         | Gemini default; HF eksplisit; timeout, batas respons, error aman, signature tool Gemini | Adapter dan tes lulus; preflight Gemini HTTP 200; HF sebelumnya 402                                       |
| CP3 — Inquiry sampai jawaban | Owner-only /run, sesi terikat inquiry, tools, persistensi dan trace                     | Regresi PostgreSQL lulus; Gemini Flash pernah HTTP 201 dengan abstention, belum jawaban bensin yang lolos |
| CP4 — Reasoning/grounding    | Pencarian lintas bahasa, policy/practice, metadata bukti dalam support check            | Kode dan tes lokal tersedia; kualitas model nyata belum diterima                                          |
| CP5 — Hardening/evaluasi     | Strict tools, fabricated citations, revocation, batas konteks, runner live              | 36 tes agen + 46 backend lulus; evaluasi lima kasus tertahan HTTP 429                                     |

- [x] Gemini dipasang sebagai provider utama; key lokal tidak dimasukkan Git/frontend.
- [x] Provider tidak berganti otomatis ketika error; HF perlu dipilih eksplisit.
- [x] Identitas/inquiry ditentukan server; tool model dibatasi ke layanan yang diizinkan.
- [x] Bukti terekspos diperiksa ulang izinnya, termasuk sebelum pemeriksaan dukungan dan penyimpanan.
- [x] Metadata hasil tool ikut pemeriksaan dukungan; payload verifikasi dibatasi.
- [x] Panggilan nyata Gemini, tool backend, penyimpanan dan trace pernah selesai HTTP 201.
- [ ] Minimal satu jawaban bensin Rp750000 dengan kutipan yang lolos pemeriksaan dukungan.
- [ ] Lima skenario live sintetis lulus dan setiap jawaban ditinjau manusia.
- [ ] AT-01 sampai AT-12 diuji dengan agen nyata, termasuk multibahasa dan injection.
- [ ] Embedding provider nyata/ranking diuji bila dibutuhkan; default masih lexical.
- [ ] Fixture resmi, handbook lomba dan kontribusi alat Tencent dikonfirmasi tim.

## Hasil cloud dan langkah berikutnya

Model lama gemini-2.5-flash-lite mendapat 404 untuk akun baru walaupun masih muncul pada daftar model. API menyarankan gemini-3.5-flash-lite; preflight kecilnya berhasil. Model Lite belum menyelesaikan skenario aplikasi selama pengujian (termasuk error 503 dan pelanggaran/batas kontrak).

Model terpilih sekarang **gemini-3.5-flash**, yang juga tercantum pada Free Tier Google. [Percobaan aplikasi HTTP 201](evaluation/gemini-live-2026-11-06T12-13-03-584Z.json) menghasilkan INSUFFICIENT_EVIDENCE setelah draft ditolak support check, sehingga uji jumlah bensin tetap gagal. Pemeriksaan kemudian diperbaiki agar tidak kehilangan metadata tool seperti status/tanggal/hasil policy. [Evaluasi setelah perbaikan](evaluation/gemini-live-2026-11-06T12-15-03-878Z.json) berhenti pada skenario pertama karena HTTP 429; perbaikan ini belum terbukti melalui model nyata. Tidak ada klaim lima skenario sudah lulus.

Lihat [setup Gemini](gemini.md). Setelah limit proyek mengizinkan, jalankan satu skenario dahulu dengan AI_LIVE_TEST=1 dan npm run test:ai:live; tinjau jawaban, kutipan dan trace sebelum --all. Jangan membuat key baru untuk mengatasi kuota, menyalakan billing tanpa sengaja, atau menonaktifkan pemeriksaan dukungan agar demo terlihat lulus.

Person 3 tetap memakai POST /v1/inquiries/:id/run dengan sesi pengguna, lalu membaca hasil dan trace. Gunakan [corpus sintetis bersama](demo-fixtures.md). Person 1 memvalidasi makna jawaban/trace, Person 2 keamanan/ingestion, Person 3 UI/demo. Uji lokal bukan skor penyelenggara atau bukti ketahanan injection menyeluruh.

Commit dibuat unsigned dan di-push ke main per tahap sesuai instruksi pengguna. Implementasi, hasil scripted dan penerimaan model nyata tetap dicatat terpisah.
