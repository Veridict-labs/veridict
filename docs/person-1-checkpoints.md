# Person 1: checkpoint implementasi AI dan WorkBuddy

**Pembaruan kontrak backend:** server kini menyediakan sembilan tool, termasuk `resolve_domain_owner` dan `get_personal_data`. Smoke client tetap memeriksa tujuh tool inti. Gunakan token terikat inquiry untuk korelasi audit; ikuti [kontrak terbaru](backend.md) dan [fixture demo bersama](demo-fixtures.md). Instruksi WorkBuddy telah diselaraskan dengan routing dan disclosure berizin. Tes client lulus, tetapi tidak membuktikan koneksi WorkBuddy nyata.

Baseline: backend `f15bbed`, 4 November 2026. Pembagian peran mengikuti [rencana tim](team-task-division.md); [checklist Person 2](person-2-checklist.md) memisahkan implementasi backend dan penerimaan integrasinya.

## WorkBuddy dalam proyek ini

WorkBuddy adalah aplikasi agen AI Tencent yang menjadi runtime pilihan dalam PRD. NestJS menyediakan bukti, aturan, izin, dan tool MCP; WorkBuddy memilih tool serta menyusun jawaban berdasarkan hasilnya. MCP adalah protokol penghubung keduanya. Menginstal library MCP atau menjalankan smoke test belum membuktikan bahwa WorkBuddy sudah terhubung.

Panduan vendor mendokumentasikan transport `streamableHttp` dan konfigurasi header autentikasi. Konfigurasi contoh tersedia di [mcp.example.json](../integrations/workbuddy/mcp.example.json). Gunakan aplikasi dari [situs resmi WorkBuddy](https://www.workbuddy.ai/), lalu periksa dukungan konektor pada versi/akun yang benar-benar dipakai. Sumber konfigurasi: [WorkBuddy connector documentation](https://open.workbuddy.cn/en/docs/connector) dan [MCP integration guide](https://www.codebuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide), diperiksa 4 November 2026. Antarmuka dan dukungan runtime aktual tetap perlu diuji.

## Checkpoint dan syarat selesai

| Checkpoint                    | Hasil                                                                                  | Syarat selesai                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CP0 — Handoff                 | Pembagian tugas, status backend, nama tool, dan pekerjaan tersisa                      | Dokumen tersedia dan konsisten dengan kode                                                                |
| CP1 — Fondasi agen            | Instruksi agen, contoh konektor, dan CLI pemeriksa MCP                                 | Build/typecheck dan pengujian client lulus; hasil client tidak diklaim sebagai hasil WorkBuddy            |
| CP2 — Koneksi WorkBuddy nyata | WorkBuddy menjalankan tool backend dengan token delegasi                               | Trace/screenshot dari aplikasi aktual, versi runtime, waktu, dan identitas pengujian tercatat tanpa token |
| CP3 — Satu jawaban tersimpan  | Inquiry -> pencarian bukti -> jawaban -> `complete_inquiry` -> pembacaan inquiry       | Pengguna yang benar menerima jawaban dengan kutipan yang mendukungnya; gagal/expired ditangani            |
| CP4 — Rekonsiliasi            | Intent/konteks, otoritas/waktu, perbandingan preseden, dan official/operational output | Skenario bensin serta Director-vs-VP bekerja melalui agen nyata; tidak ada operational override           |
| CP5 — Hardening dan evaluasi  | Multibahasa, injection, abstention, revocation, multi-source, embedding bila tersedia  | Hasil aktual AT-01 sampai AT-12 dan kegagalan dicatat bersama Person 2/3                                  |

Status per 4 November 2026:

- [x] CP0: dokumen handoff disiapkan dari kode dan pembagian tugas pengguna.
- [x] CP1: instruksi, template konektor, dan client smoke test tersedia; build paket agen, typecheck, lint, serta 10 pengujian client lulus. Koneksi ke backend pengguna dan WorkBuddy nyata tetap menjadi penerimaan CP2.
- [ ] CP2: WorkBuddy belum diuji pada lingkungan pengguna.
- [ ] CP3: belum ada satu siklus inquiry melalui WorkBuddy nyata.
- [ ] CP4: service backend tersedia, perilaku agen belum dievaluasi.
- [ ] CP5: evaluasi end-to-end belum dijalankan.

Checkpoint diselesaikan berdasarkan bukti, bukan berdasarkan jumlah file atau instruksi prompt. Commit dilakukan tanpa tanda tangan dengan `git -c commit.gpgsign=false commit ...`; push menggunakan `git push origin main` setelah pemeriksaan checkpoint. Jangan force-push untuk melewati perubahan anggota tim.

## CP1: fondasi yang tersedia

- [Instruksi agen](../integrations/workbuddy/agent-instructions.md): batas identitas, intent/konteks, pemilihan tool, otoritas/waktu, grounding, abstention, dan jawaban terstruktur.
- [Konfigurasi konektor](../integrations/workbuddy/mcp.example.json): template Streamable HTTP dan token delegasi, tanpa kredensial nyata.
- [Client smoke test](../packages/agent/src/index.ts): memeriksa sesi `AGENT`, discovery tujuh tool, dan satu pencarian lexical tanpa menyelesaikan inquiry.
- [Pengujian client](../packages/agent/test/smoke.test.cjs): HTTP/MCP lokal, autentikasi, redirect, tool gagal, dan keluaran tanpa token, query mentah, atau excerpt.

CLI hanya melaporkan metadata pemeriksaan. `workbuddy_verified` selalu `false`, termasuk ketika endpoint bekerja. Hasil kosong dapat sah; smoke test tidak membuktikan kelengkapan corpus, kualitas ranking, kebenaran jawaban, ataupun seluruh invariant ACL backend.

### Hasil pemeriksaan CP1

Lingkungan: Windows, Node.js 24.19.0, npm 11.12.1. Pemeriksaan berikut dilakukan pada 4 November 2026 setelah implementasi fondasi:

| Pemeriksaan                                                    | Hasil aktual                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Build contracts, API, dan paket agen                           | Lulus                                                                                                             |
| `npm run lint`                                                 | Lulus seluruh workspace; lint paket agen menggunakan TypeScript seperti paket contracts                           |
| `npm run typecheck`                                            | Lulus seluruh workspace                                                                                           |
| `npm run test:agent`                                           | 10 lulus, 0 gagal; fixture HTTP/MCP lokal dengan SDK nyata                                                        |
| Unit test backend `content.test.cjs` dan `password.test.cjs`   | 3 lulus, 0 gagal                                                                                                  |
| `npm run build`                                                | Gagal pada frontend: Turbopack tidak berhasil menjalankan worker PostCSS, termasuk pada percobaan di luar sandbox |
| `npm run build -w @veridict/web -- --webpack`                  | Lulus; tidak mengubah konfigurasi bundler repository                                                              |
| Regresi PostgreSQL backend lengkap                             | Belum dijalankan ulang: Docker engine belum tersedia                                                              |
| Smoke terhadap backend pengguna dan pemanggilan dari WorkBuddy | Belum dijalankan; membutuhkan lingkungan aplikasi dan token pengguna                                              |

Pengujian HTTP lokal dijalankan di luar sandbox karena koneksi loopback di dalam sandbox ditolak (`EACCES`). Kegagalan build Turbopack dan Docker di atas tetap terbuka; hasil sebelumnya dalam [verification.md](verification.md) merupakan laporan terpisah dan tidak ditimpa oleh hasil CP1 ini.

## Menjalankan CP1 dan menyiapkan CP2

Ikuti setup dependency, environment, database, migrasi, dan bootstrap di [README](../README.md#getting-started). Gunakan akun pengguna demo yang telah dibuat admin serta sumber yang memang boleh dibaca pengguna itu. Jangan berikan token admin ke agen.

Jalankan pemeriksaan fondasi:

```powershell
npm run test:agent
npm run typecheck
```

Jalankan API di terminal terpisah:

```powershell
npm run dev:api
```

Login dan buat satu inquiry memakai sesi pengguna. Contoh ini untuk terminal lokal pengguna; password dan token tidak ditulis ke repository:

```powershell
$veridictApi = 'http://localhost:3001'
$veridictOrg = Read-Host 'Organization slug'
$veridictEmail = Read-Host 'Demo user email'
$veridictPassword = Read-Host 'Password' -MaskInput
$veridictLogin = Invoke-RestMethod -Method Post -Uri "$veridictApi/v1/auth/login" -ContentType 'application/json' -Body (@{
  org_slug = $veridictOrg
  email = $veridictEmail
  password = $veridictPassword
} | ConvertTo-Json)
Remove-Variable veridictPassword
$veridictHeaders = @{ Authorization = "Bearer $($veridictLogin.access_token)" }
$veridictQuestion = Read-Host 'Question for Veridict'
$veridictInquiry = Invoke-RestMethod -Method Post -Uri "$veridictApi/v1/inquiries" -Headers $veridictHeaders -ContentType 'application/json' -Body (@{
  question = $veridictQuestion
} | ConvertTo-Json)
$veridictDelegation = Invoke-RestMethod -Method Post -Uri "$veridictApi/v1/auth/tool-token" -Headers $veridictHeaders
$env:VERIDICT_API_URL = $veridictApi
$env:VERIDICT_AGENT_TOKEN = $veridictDelegation.access_token
$env:VERIDICT_SMOKE_QUERY = 'onboarding'
npm run agent:smoke
```

CLI memerlukan URL origin API tanpa path, query, atau userinfo. HTTP hanya diterima untuk `localhost`, `127.0.0.1`, atau `::1`; gunakan HTTPS untuk host lain. `MCP_PUBLIC_URL` backend harus cocok dengan alamat host koneksi. Template WorkBuddy menambahkan `/mcp` sendiri; jangan menambahkan path itu ke `VERIDICT_API_URL`.

Untuk CP2, tambahkan custom MCP connector lewat antarmuka WorkBuddy sesuai versi yang dipakai. Gunakan template konfigurasi dengan URL API dan token delegasi aktual di konfigurasi lokal WorkBuddy. Jika editor tidak mendukung placeholder pada instalasi tersebut, masukkan nilai melalui pengaturan lokalnya; jangan mengubah file contoh repository menjadi berisi token. Variabel environment terminal di atas dipakai CLI dan tidak otomatis memperbarui proses WorkBuddy yang sudah berjalan.

Token delegasi berlaku 15 menit. Perbarui token melalui sesi pengguna jika kedaluwarsa dan reconnect konektor. Jangan memperpanjang masa berlaku atau mengganti identitas dengan akun admin demi melewati pengujian. Backend saat ini belum menyediakan OAuth atau refresh token.

Setelah koneksi aktif, terapkan instruksi agen dan berikan `inquiry_id` dari `$veridictInquiry.inquiry_id`, pertanyaan yang sama, konteks eksplisit, dan tanggal referensi bila diperlukan. Minta WorkBuddy mencari bukti melalui `search_authorized_knowledge` terlebih dahulu. Simpan trace nyata dari aplikasi untuk CP2. Jangan menyamakan laporan CLI dengan trace WorkBuddy.

Setelah agen menyelesaikan CP3, periksa hasil sebagai pemilik inquiry:

```powershell
Invoke-RestMethod -Uri "$veridictApi/v1/inquiries/$($veridictInquiry.inquiry_id)" -Headers $veridictHeaders
Remove-Item Env:VERIDICT_AGENT_TOKEN -ErrorAction SilentlyContinue
Remove-Variable veridictLogin, veridictDelegation, veridictHeaders
```

Environment dan variabel dibersihkan dari terminal ini; jika token disalin ke WorkBuddy, hapus/perbarui juga konfigurasi lokal tersebut. Logout sesi pengguna tidak otomatis mencabut token delegasi yang sudah terbit. Penonaktifan pengguna mencabut seluruh sesinya.

## Bukti CP2 sampai CP5

Untuk setiap pengujian catat tanggal, commit, versi WorkBuddy, skenario, status inquiry, tool yang benar-benar dipanggil, hasil yang diharapkan/aktual, serta kegagalan. Bukti harus membedakan metadata client, trace WorkBuddy, pengujian sintetis, dan fixture resmi. Jangan menyimpan bearer token, password, isi sumber privat, atau screenshot konfigurasi kredensial.

Corpus demo bisa dikurasi tim sendiri dan diberi label sintetis. Corpus resmi, jika kemudian tersedia atau diwajibkan penyelenggara, dievaluasi terpisah. Person 1 membantu menentukan isi serta pertanyaan uji; Person 2 menyiapkan data, metadata otoritas/waktu, ACL, dan ingestion. Person 3 memimpin tracker, harness, screenshot, laporan, dan demo.

Hasil backend yang sudah tersedia dapat dipakai melalui tool; belum ada worker yang otomatis mengambil inquiry baru. Pada spike ini operator menyerahkan inquiry ke percakapan WorkBuddy. Otomasi pemicu baru dirancang setelah kemampuan runtime yang dipakai telah terbukti. Instruksi prompt bukan jaminan kebenaran atau pertahanan injection; klaim kemampuan memerlukan evaluasi aktual.
