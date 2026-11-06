# Checkpoint Person 1

Pembaruan 6 November 2026 setelah sinkronisasi backend `a043785`. Rancangan sekarang memakai **AgentService NestJS + Hugging Face Inference Providers** sesuai pilihan pengguna. WorkBuddy/MCP tetap menjadi konektor opsional dan alat bantu tim. CP2 lama yang mewajibkan WorkBuddy tidak lagi menjadi prasyarat runtime web. Ini keputusan tim; persyaratan teknologi lomba masih perlu dicocokkan dengan handbook.

## Tahapan dan status

| Checkpoint                   | Implementasi dan bukti                                                                             | Penerimaan                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| CP0 — Handoff                | Checklist Person 2, pembagian tim, contracts dan corpus sintetis                                   | Dokumentasi tersedia                                                         |
| CP1 — Fondasi MCP            | Client smoke, instruksi dan template WorkBuddy; tujuh tool inti dicek, server menyediakan sembilan | Tes client lulus; WorkBuddy nyata belum diuji                                |
| CP2 — Adapter HF             | Router, kredensial server-side, pilihan model, timeout dan error                                   | Kode dan tes fixture tersedia; percobaan nyata mendapat 402                  |
| CP3 — Inquiry sampai jawaban | POST /v1/inquiries/:id/run, sesi terikat inquiry, tools, pemeriksaan bukti, penyimpanan dan trace  | Alur scripted lulus dengan PostgreSQL nyata; jawaban HF nyata belum diterima |
| CP4 — Reasoning/grounding    | Intent/konteks, otoritas/waktu, preseden, rekonsiliasi dan pemeriksaan dukungan terpisah           | Implementasi tersedia; kualitas semantik model nyata belum diukur            |
| CP5 — Hardening/evaluasi     | Revocation, actor override, kutipan palsu, tool injection, abstention dan runner live              | Regresi lokal lulus; suite live dan fixture resmi masih terbuka              |

- [x] Adapter HF dan endpoint runtime backend diimplementasikan.
- [x] Identitas dan inquiry tidak dapat dipilih oleh model.
- [x] Kutipan harus berasal dari bukti berizin; semua konteks terekspos ikut revocation/history.
- [x] Instruksi bahasa, intent/konteks, authority/time, preseden dan output rekonsiliasi tersedia.
- [x] Pemeriksaan dukungan model terpisah, abstention dan eskalasi terverifikasi tersedia.
- [x] Regresi backend dengan model scripted dan PostgreSQL sementara lulus.
- [x] Percobaan nyata memakai token pengguna dilakukan dan kegagalan dicatat.
- [ ] HF menyelesaikan minimal satu inquiry dengan kutipan yang didukung bukti.
- [ ] Lima skenario live sintetis lulus dan setiap jawaban ditinjau manusia.
- [ ] AT-01 sampai AT-12 dievaluasi dengan agen nyata, termasuk multibahasa dan injection.
- [ ] Embedding provider nyata serta ranking diuji bila dibutuhkan; pencarian default tetap lexical.
- [ ] Fixture resmi, kriteria lomba dan kontribusi alat Tencent dikonfirmasi tim.

## Cara melanjutkan

Ikuti [setup HF dan kontrak runtime](huggingface.md). Token lokal berada di `apps/api/.env`; jangan kirim lewat chat atau frontend. Person 3 membuat inquiry, memanggil `/run` dengan sesi pengguna, lalu mengambil hasil dan trace.

Uji nyata pertama mendapat HTTP 402. Periksa saldo inference serta akun/organisasi billing sebelum mengulang. Tidak ada top-up, retry berbayar, atau perpindahan provider otomatis. Lihat [laporan aktual](evaluation/hf-live-2026-11-06T11-30-48-588Z.json).

Gunakan [corpus sintetis bersama](demo-fixtures.md) untuk demo. Person 3 memimpin tracker, screenshot, laporan dan demo; Person 1 memvalidasi makna jawaban dan trace AI; Person 2 memvalidasi keamanan/ingestion. Pemeriksaan berbasis model dan penolakan tool terlarang tidak membuktikan jawaban selalu benar atau injection-proof.

Commit checkpoint dibuat unsigned dan di-push ke `main` sesuai instruksi pengguna setelah pemeriksaan relevan. Implementasi, hasil scripted dan bukti live tetap dibedakan.
