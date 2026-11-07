const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explicitlyRequests } = require('../dist/personal-data/personal-data.intent');

test('explicit personal-value requests accept supported categories and bilingual phone aliases', () => {
  for (const [field, question] of [
    ['NIK', 'Tampilkan NIK pegawai untuk verifikasi identitas'],
    ['PHONE', 'Can you tell me the mobile number?'],
    ['PHONE', 'Show the cell number for the contact person'],
    ['PHONE', 'Berapa no. HP PIC untuk saya hubungi?'],
    ['PHONE', 'Berikan nomor ponsel PIC'],
    ['EMAIL', 'What is the email address?'],
    ['ADDRESS', 'Tampilkan alamat untuk layanan pengiriman'],
    ['DATE_OF_BIRTH', 'What is the date of birth?'],
    ['BANK_ACCOUNT', 'Berapa nomor rekening untuk reimbursement?'],
    ['NAME', 'Tampilkan nama lengkap pegawai'],
    ['NPWP', 'Berapa NPWP untuk administrasi pajak?'],
    ['PASSPORT_NUMBER', 'What is the passport number?'],
    ['SALARY', 'Tampilkan gaji untuk administrasi payroll'],
    ['HEALTH_INFORMATION', 'Tampilkan informasi kesehatan untuk benefit'],
  ]) assert.equal(explicitlyRequests(question, field), true, question);
});

test('category definitions, policy questions, negations and unrelated requests cannot request disclosure', () => {
  for (const [field, question] of [
    ['NIK', 'Apa aturan penyimpanan NIK?'],
    ['NIK', 'Apa itu NIK?'],
    ['NIK', 'What is NIK?'],
    ['NIK', 'Tampilkan contoh format NIK'],
    ['NIK', 'Show the NIK retention policy'],
    ['NIK', 'What is a national identity number?'],
    ['NIK', 'Explain what the NIK means'],
    ['PHONE', 'What is the phone number storage policy?'],
    ['PHONE', 'Show the phone number but do not show personal data'],
    ['PHONE', "Don't display the mobile number"],
    ['PHONE', 'Tampilkan alamat tanpa nomor telepon'],
    ['PHONE', 'Tampilkan nomor telepon, samarkan datanya'],
    ['PHONE', 'Tidak perlu berikan nomor telepon'],
    ['PHONE', 'Tidak tampilkan nomor telepon'],
    ['PHONE', 'What is the allowance amount?'],
    ['EMAIL', 'The email address is in the document'],
    ['ADDRESS', 'What is the email address?'],
    ['ADDRESS', 'Berikan alamat email pegawai'],
  ]) assert.equal(explicitlyRequests(question, field), false, question);
});
