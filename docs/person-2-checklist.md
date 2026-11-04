# Checklist Person 2 dan handoff ke Person 1

**Pembaruan implementasi:** branch `feat/veridict-backend` menambahkan routing owner ber-ACL, audit per inquiry, disclosure berizin untuk 11 kategori personal data, dan fixture/seed bersama. Setelah integrasi main terbaru, 42 tes backend dan 10 tes client agent lulus, beserta build/lint/typecheck seluruh workspace. Lihat [kontrak terbaru](backend.md), [fixture demo](demo-fixtures.md), dan [verifikasi](verification.md). Baseline di bawah tetap menjadi catatan historis; penerimaan WorkBuddy nyata dan evaluasi end-to-end masih memerlukan tim.

Tanggal penyusunan: 4 November 2026. Baseline kode: `f15bbed`.

Sumber pembagian tugas: [Team Task Division & Implementation Plan](team-task-division.md), salinan identik dokumen `Knowledge_Guardian_Team_Task_Division.md` yang diberikan pengguna. Dokumen sumber masih menggunakan nama Knowledge Guardian dan berstatus proposed implementation plan. Checklist berikut memetakan rencana tersebut ke implementasi Veridict yang tersedia; checkbox kosong pada dokumen sumber tidak otomatis membuktikan bahwa suatu fitur belum dibuat.

Corpus demo dapat dikurasi tim sendiri dan diberi label sintetis, sesuai pembahasan lanjutan. Person 2 menyiapkan data/metadata/ACL dan ingestion; Person 1 membantu isi serta pertanyaan uji. Fixture resmi, jika tersedia atau diwajibkan penyelenggara, diperiksa terpisah. Penyebutan official samples dalam rencana asal tidak berarti tim harus berhenti menunggu data untuk memulai demo.

**Status: implementasi fondasi backend tersedia untuk memulai integrasi Person 1. Verifikasi lokal ulang dan integrasi WorkBuddy nyata masih terbuka.** Dokumen ini disusun dari pembacaan kode dan dokumentasi repository, bukan persetujuan penyelesaian dari anggota tim.

Tanda `[x]` pada checklist implementasi berarti kode fitur ditemukan. Hasil pengujian terdahulu dicatat terpisah; tidak ada pengujian yang dijalankan ulang saat menyusun dokumen ini. Tanda `[ ]` berarti pekerjaan atau bukti penyelesaian masih diperlukan.

## 1. Checklist implementasi Person 2

### Pemetaan ke 11 tugas asli Person 2

Status **tersedia** berarti implementasi ditemukan, **sebagian** berarti ada bagian requirement yang belum terpenuhi, dan seluruhnya tetap memerlukan penerimaan lokal di bagian 2.

| No. | Tugas dalam pembagian tim                                                          | Status berdasarkan repository    | Bukti / sisa pekerjaan                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NestJS application dan shared API schemas                                          | Tersedia                         | [API modules](../apps/api/src/app.module.ts) dan [contracts](../packages/contracts/src/index.ts)                                                                                                  |
| 2   | PostgreSQL, Prisma migrations, pgvector                                            | Tersedia                         | [Compose](../compose.yaml), [schema](../apps/api/prisma/schema.prisma), dan [migrasi](../apps/api/prisma/migrations/)                                                                             |
| 3   | Model user, source, chunk, permission, policy, precedent, inquiry, feedback, audit | Tersedia                         | [Schema Prisma](../apps/api/prisma/schema.prisma); precedent direpresentasikan oleh `DecisionCase`                                                                                                |
| 4   | Parse dan ingest official sample documents, chat exports, tasks                    | Sebagian                         | Jalur teks/records JSON tersedia; sampel resmi belum tersedia dan belum di-ingest. Parser file PDF/DOCX tidak tersedia; tentukan kebutuhan parser berdasarkan format corpus aktual                |
| 5   | Authorization filtering sebelum retrieval                                          | Tersedia                         | ACL pada materialized candidate set di [KnowledgeService](../apps/api/src/knowledge/knowledge.service.ts)                                                                                         |
| 6   | Permissions saat membuka evidence, inquiry history, precedents                     | Tersedia                         | [KnowledgeService](../apps/api/src/knowledge/knowledge.service.ts), [InquiriesService](../apps/api/src/inquiries/inquiries.service.ts), [PolicyService](../apps/api/src/policy/policy.service.ts) |
| 7   | Metadata versi, tanggal efektif, scope, authority                                  | Tersedia                         | Metadata sumber dan predicate/domain PolicyClaim; periksa kecocokan metadata dengan corpus resmi saat diterima                                                                                    |
| 8   | Authorized keyword/vector search dan source citations                              | Tersedia pada backend            | Embedding harus disediakan pemanggil; integrasi provider dan ranking dengan data nyata merupakan kolaborasi Person 1/2                                                                            |
| 9   | Lima MCP tools dalam rencana                                                       | Tersedia dengan penyesuaian nama | Pemetaan nama ada di bagian 3; backend juga menambah `submit_feedback` dan `complete_inquiry`                                                                                                     |
| 10  | Audit, revocation, safe feedback validation                                        | Tersedia                         | [Audit](../apps/api/src/audit/), [SecurityService](../apps/api/src/auth/security.service.ts), [FeedbackService](../apps/api/src/feedback/feedback.service.ts)                                     |
| 11  | Automated permission dan access-revocation tests                                   | Tersedia                         | [Backend integration tests](../apps/api/test/backend.test.cjs); hasil terdokumentasi ada di bagian 2, belum dijalankan ulang                                                                      |

Dengan demikian, seluruh tugas asli Person 2 belum dapat ditandai selesai: ingestion sampel resmi dan pembuktian pada corpus tersebut masih terbuka. Definition of done Person 2 mengenai pembatasan retrieval dan pencabutan akses memiliki pengujian backend terdokumentasi; penerimaan ulang di lingkungan Person 1 tetap belum dilakukan.

### Deliverable tambahan Person 2 dari matriks PIC

- [x] Dokumentasi arsitektur dan trust boundaries tersedia di [architecture.md](architecture.md).
- [ ] Ekspor accountability sheet satu halaman; materi tersedia di [accountability.md](accountability.md), tetapi artefak satu halaman belum ditemukan.
- [ ] Konfirmasi repository publik atau workflow export siap diserahkan; keberadaan checkout lokal belum membuktikan status publik atau kelengkapan paket submission.
- [ ] Lengkapi bukti keamanan/performa untuk milestone M4; hasil regresi backend tersedia, sedangkan pengukuran performa belum terdokumentasi.
- [ ] Siapkan URL demo jika tim memilih deliverable opsional tersebut.

### Identitas dan akses

- [x] Login organisasi, pemeriksaan password scrypt, serta sesi pengguna dengan token yang disimpan sebagai hash.
- [x] Token delegasi `AGENT` untuk pengguna yang sedang login; masa berlaku 15 menit.
- [x] Pengelolaan pengguna oleh admin, perlindungan admin aktif terakhir, dan pencabutan sesi saat pengguna dinonaktifkan.
- [x] Pemeriksaan identitas dari database serta pemisahan organisasi pada operasi terlindungi.
- [x] ACL eksplisit untuk pengguna, departemen, atau organisasi; `READ` dan `REVIEW` terpisah.
- [x] Pemeriksaan ulang sesi dalam transaksi dan penguncian organisasi untuk mengoordinasikan perubahan akses dengan operasi terlindungi.

Bukti: [auth](../apps/api/src/auth/), terutama [SecurityService](../apps/api/src/auth/security.service.ts).

### Database dan knowledge retrieval

- [x] Schema Prisma, migrasi PostgreSQL, dan inisialisasi ekstensi pgvector.
- [x] Bootstrap organisasi dan admin melalui CLI; tidak ada akun bawaan atau registrasi publik.
- [x] Ingestion dokumen berupa teks serta ekspor chat/task berupa records JSON.
- [x] Chunk maksimal 1.600 UTF-16 code units, overlap 200, span asal, dan hash integritas.
- [x] Masking pola NIK dan nomor telepon pada keluaran bukti serta preview chunk untuk embedding.
- [x] Pencarian lexical dengan ACL sebelum retrieval.
- [x] Dukungan pencarian hybrid dengan embedding dari pemanggil, pemeriksaan model/dimensi, dan reciprocal rank fusion.
- [x] Pembukaan evidence dengan pemeriksaan pasangan source/chunk dan akses terkini.

Bukti: [schema](../apps/api/prisma/schema.prisma), [migrasi](../apps/api/prisma/migrations/), [KnowledgeService](../apps/api/src/knowledge/knowledge.service.ts), dan [pengolahan konten](../apps/api/src/knowledge/content.ts).

### Aturan resmi dan preseden

- [x] Pembuatan PolicyClaim oleh manusia dengan otoritas domain dan akses `READ` + `REVIEW`.
- [x] Pemeriksaan sumber approved, otoritas issuer, serta hasil aturan yang mengutip supporting chunk.
- [x] Resolusi berdasarkan konteks, rentang waktu efektif, dan supersession eksplisit.
- [x] Konflik aturan approved menghasilkan `NEEDS_REVIEW`.
- [x] Pembuatan dan pencarian kasus tervalidasi dengan pemeriksaan akses seluruh evidence.
- [x] Perbandingan faktor konteks dan perbedaan yang menggugurkan kesebandingan kasus.
- [x] Rekonsiliasi official truth dan operational truth, termasuk gap flag dan batas sampel.

Bukti: [PolicyService](../apps/api/src/policy/policy.service.ts).

### Inquiry, feedback, audit, dan MCP

- [x] Inquiry baru disimpan sebagai `PENDING` dengan `orchestration: AWAITING_AGENT`.
- [x] Penyelesaian inquiry hanya oleh sesi agen delegasi milik penanya.
- [x] Penyimpanan jawaban, asumsi, keterbatasan, official/operational truth, konflik, dan decision trail.
- [x] Pemeriksaan identitas serta akses kutipan, termasuk evidence di dalam statement dan trail.
- [x] Riwayat inquiry dibatasi pemilik dan disembunyikan ketika evidence kehilangan akses.
- [x] Penandaan revalidasi akibat penggantian sumber, termasuk pemeriksaan pengganti yang mulai berlaku saat inquiry dibuka.
- [x] Feedback pending dan validasi oleh reviewer manusia independen sebelum promosi menjadi preseden.
- [x] Audit per organisasi, hash teks query/jawaban pada audit, serta endpoint prune untuk operator.
- [x] Endpoint MCP Streamable HTTP `POST /mcp` dengan pemeriksaan bearer token, host, dan origin.
- [x] Tujuh tool MCP menggunakan service backend yang sama dengan REST.
- [x] Schema input bersama dan tipe TypeScript tersedia di `@veridict/contracts`.

Bukti: [InquiriesService](../apps/api/src/inquiries/inquiries.service.ts), [FeedbackService](../apps/api/src/feedback/feedback.service.ts), [audit](../apps/api/src/audit/), [McpController](../apps/api/src/mcp/mcp.controller.ts), dan [contracts](../packages/contracts/src/index.ts).

## 2. Bukti pengujian dan penerimaan lokal

[Laporan verifikasi backend](verification.md) mencatat hasil berikut pada 4 November 2026 dengan Node.js 22.22.0 dan npm 10.2.3:

| Pemeriksaan                   | Hasil terdokumentasi                     |
| ----------------------------- | ---------------------------------------- |
| `npm run build`               | Lulus untuk contracts, API, dan frontend |
| `npm run lint`                | Lulus seluruh workspace                  |
| `npm run typecheck`           | Lulus seluruh workspace                  |
| `npm run test:api`            | 30 lulus, 0 gagal, 0 dilewati            |
| `npm audit --omit=dev --json` | 0 kerentanan runtime dilaporkan          |

Kode pengujian berada di [apps/api/test](../apps/api/test/). Integration test menggunakan container PostgreSQL sementara dan client HTTP/MCP nyata. Hasil tersebut belum membuktikan konektivitas WorkBuddy, kualitas jawaban agen, atau keberhasilan pengujian resmi penyelenggara.

Checklist penerimaan pada lingkungan Person 1:

- [ ] Pasang dependency dan siapkan environment mengikuti [README](../README.md#getting-started).
- [ ] Jalankan database dan committed migrations, lalu bootstrap organisasi/admin.
- [ ] Jalankan ulang build, lint, typecheck, dan `npm run test:api`; catat hasil aktual serta versi runtime.
- [ ] Pastikan `/health`, login, `/v1/auth/me`, dan penerbitan token delegasi bekerja secara lokal.
- [ ] Siapkan sumber demo dengan ACL yang memberi pengguna demo akses yang diperlukan.

Saat dokumen ini disusun, `node_modules` dan Prisma Client hasil generate belum tersedia di checkout. Checklist penerimaan lokal di atas belum dilakukan.

## 3. Kontrak handoff untuk Person 1

Urutan integrasi yang disediakan backend:

1. Pengguna login melalui `POST /v1/auth/login`.
2. Dengan token pengguna, buat pertanyaan melalui `POST /v1/inquiries` dan simpan `inquiry_id`.
3. Dengan token pengguna, panggil `POST /v1/auth/tool-token` untuk memperoleh token `AGENT`.
4. Konektor WorkBuddy menggunakan token delegasi pengguna tersebut untuk mengakses `/mcp`. Set `MCP_PUBLIC_URL` dan `WEB_ORIGIN` sesuai lingkungan aktual.
5. Agen memilih tool, mengambil bukti berizin, dan memeriksa dukungan bukti terhadap setiap klaim jawaban.
6. Agen memanggil `complete_inquiry`, atau `POST /v1/inquiries/:id/answer`, untuk menyimpan hasil.
7. Frontend Person 3 melakukan polling `GET /v1/inquiries/:id` dengan sesi pemilik inquiry.

Token delegasi tidak boleh diganti dengan satu token admin bersama. Sesi agen tidak dapat menerbitkan delegasi baru atau melakukan operasi administrasi/review manusia. Masa berlakunya terpisah dari sesi pengguna induk; logout pengguna tidak otomatis mencabut token delegasi, sedangkan penonaktifan pengguna mencabut seluruh sesinya.

| Tool MCP                      | Kegunaan                                               |
| ----------------------------- | ------------------------------------------------------ |
| `search_authorized_knowledge` | Mencari bukti yang boleh dibaca pengguna               |
| `resolve_policy_claims`       | Menentukan aturan formal berdasarkan konteks dan waktu |
| `find_validated_precedents`   | Mencari kasus historis tervalidasi dan perbandingannya |
| `reconcile_truth`             | Membandingkan aturan formal dengan praktik historis    |
| `get_evidence`                | Membuka chunk dengan pemeriksaan akses ulang           |
| `submit_feedback`             | Mengirim feedback berstatus pending review             |
| `complete_inquiry`            | Menyimpan jawaban agen untuk inquiry pemilik token     |

Nama tool yang dipakai konektor harus mengikuti implementasi aktual berikut:

| Nama dalam rencana pembagian tugas | Nama aktual di backend        |
| ---------------------------------- | ----------------------------- |
| `search_knowledge`                 | `search_authorized_knowledge` |
| `resolve_policy`                   | `resolve_policy_claims`       |
| `find_precedents`                  | `find_validated_precedents`   |
| `reconcile_truth`                  | `reconcile_truth`             |
| `get_evidence`                     | `get_evidence`                |

`submit_feedback` dan `complete_inquiry` merupakan tool tambahan. Backend tidak menyediakan alias untuk tiga nama lama di atas.

Payload minimum tool `complete_inquiry`:

```json
{
  "inquiry_id": "<UUID inquiry>",
  "status": "ANSWERED",
  "answer": "<jawaban yang didukung bukti>",
  "citations": [
    {
      "source_id": "<UUID source dari hasil tool>",
      "chunk_id": "<UUID chunk dari hasil tool>"
    }
  ]
}
```

Ganti placeholder dengan UUID nyata. Untuk endpoint REST jawaban, letakkan ID inquiry di URL dan hilangkan `inquiry_id` dari body. Status lain yang diterima adalah `NEEDS_CLARIFICATION`, `INSUFFICIENT_EVIDENCE`, dan `UNAVAILABLE`. Status `ANSWERED` wajib memiliki kutipan tingkat atas. Statement pada `official_truth`, `operational_truth`, `conflicts`, serta setiap node `decision_trail` harus memiliki evidence sendiri jika disertakan. Schema lengkap ada di [contracts](../packages/contracts/src/index.ts).

## 4. Checklist lanjutan Person 1

- [ ] Buktikan akses runtime WorkBuddy dan dukungan custom MCP; simpan bukti satu pemanggilan tool nyata dengan identitas pengguna yang benar.
- [ ] Definisikan instruksi agen dan kebijakan penggunaan tool sesuai kontrak backend serta batas otoritas sumber.
- [ ] Tentukan cara konektor memperoleh pertanyaan dan `inquiry_id`, mengikat token pengguna, serta menangani kedaluwarsa token dan kegagalan proses.
- [ ] Implementasikan ekstraksi intent/konteks dan orkestrasi pemilihan tool; gunakan retrieval lexical untuk spike awal bila embedding belum tersedia.
- [ ] Bersama Person 2, validasi ranking retrieval, logika otoritas/waktu, serta matching dan penjelasan kesebandingan preseden. Service deterministik tersedia; integrasi reasoning agen tetap perlu dibuktikan.
- [ ] Implementasikan output Organizational Truth Reconciliation yang memisahkan aturan resmi, praktik historis, konflik, dan ketidakpastian berdasarkan hasil tool.
- [ ] Implementasikan jawaban Bahasa Indonesia, Inggris, dan campuran dengan kutipan yang relevan.
- [ ] Validasi dukungan semantik setiap klaim; gunakan klarifikasi atau abstention ketika bukti tidak cukup.
- [ ] Perlakukan konten sumber sebagai data; uji prompt injection terhadap agen nyata.
- [ ] Kirim jawaban terstruktur melalui `complete_inquiry` dan buktikan hasilnya dapat dibaca pemilik inquiry.
- [ ] Integrasikan embedding provider: preview masked chunks, buat embedding, ingest dengan `embedding_model`, dan gunakan model/dimensi yang sama saat query.
- [ ] Koordinasikan polling, error, dan tampilan jawaban/evidence dengan Person 3.
- [ ] Dokumentasikan kontribusi nyata WorkBuddy dan simpan tool traces untuk demo serta product sharing.
- [ ] Bersama Person 3, jalankan skenario PRD AT-01 sampai AT-12 dan tiga skenario demo A/B/C pada pembagian tugas. Person 1 memvalidasi jawaban dan injection/abstention; Person 2 memvalidasi keamanan; Person 3 memimpin tracker, harness, screenshot, dan laporan. Jalankan fixture resmi ketika tersedia.

Definition of done Person 1 dari pembagian tim: WorkBuddy memanggil tool backend dengan otorisasi yang benar, menghasilkan respons terstruktur dengan kutipan, dan alurnya dapat didemonstrasikan melalui bukti pemanggilan nyata. Backend yang tersedia belum memenuhi definition of done agen ini dengan sendirinya.

Prioritas awal adalah satu alur nyata: login pengguna -> inquiry -> tool WorkBuddy -> `complete_inquiry` -> hasil inquiry. Alur ini membuktikan titik integrasi sebelum memperluas orkestrasi dan evaluasi.

## 5. Batas implementasi dan pekerjaan terbuka

| Area                                                             | Status dan penanggung jawab                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WorkBuddy, pemicu pemrosesan inquiry, dan validasi makna jawaban | Belum diimplementasikan di backend; Person 1                                                                                                                                                     |
| Embedding provider                                               | Belum dikonfigurasi; Person 1, dengan dukungan kontrak backend Person 2                                                                                                                          |
| UI login, inquiry, evidence trail, dan reviewer                  | Frontend masih starter; Person 3                                                                                                                                                                 |
| Queue dan answer streaming                                       | Belum tersedia; Person 1/2/3 menyepakati kebutuhan sesuai runtime aktual; alur terdokumentasi menggunakan polling                                                                                |
| Parser PDF/DOCX dan konektor SaaS langsung                       | Belum tersedia; ingestion saat ini menerima teks/records JSON; sepakati pemilik jika dibutuhkan                                                                                                  |
| Evaluasi dan laporan hasil                                       | Person 3 memimpin harness/tracker, screenshot, laporan, dan paket demo; Person 1 menangani kebenaran AI, injection/abstention, serta trace WorkBuddy; Person 2 menangani bukti keamanan/performa |
| Corpus dan ingestion sampel resmi                                | Belum tersedia/dijalankan; tugas Person 2 setelah data diterima, dengan validasi retrieval bersama Person 1                                                                                      |
| Masking PII                                                      | Pola NIK/telepon saja; bukan pendeteksi seluruh PII                                                                                                                                              |
| Produksi dan skala                                               | TLS, pengiriman sesi produksi, kredensial database minimum, distributed throttling, pengukuran beban/timing, dan retensi data masih memerlukan pekerjaan tim/operator                            |

Backend memeriksa struktur referensi dan aksesnya, tetapi keberadaan kutipan tidak membuktikan kebenaran makna jawaban. Pencarian vector memakai exact scans; jumlah kandidat policy/case juga dibatasi. Lihat [panduan backend](backend.md) dan [batas tanggung jawab](accountability.md) sebelum memperluas klaim kemampuan produk.

## 6. Penerimaan handoff

- [x] Kode backend dan kontrak integrasi tersedia di repository.
- [x] Laporan verifikasi backend terdahulu tersedia dan batasnya dinyatakan.
- [x] Tugas lanjutan Person 1 serta ketergantungan Person 3 dipetakan dalam dokumen ini.
- [ ] Person 1 mengonfirmasi baseline lokal berhasil dijalankan dan diuji ulang.
- [ ] Person 1 membuktikan satu siklus inquiry melalui WorkBuddy nyata.
- [ ] Person 2 dan Person 1 mencatat penerimaan handoff serta masalah yang masih tersisa.

Checklist ini memungkinkan pekerjaan Person 1 dimulai, dengan penerimaan integrasi tetap menunggu bukti pada lingkungan aktual.
