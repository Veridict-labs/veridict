import { z } from 'zod';

export const personalDataKind = z.enum([
  'NIK',
  'PHONE',
  'EMAIL',
  'ADDRESS',
  'DATE_OF_BIRTH',
  'BANK_ACCOUNT',
  'NAME',
  'NPWP',
  'PASSPORT_NUMBER',
  'SALARY',
  'HEALTH_INFORMATION',
]);
export type PersonalDataKind = z.infer<typeof personalDataKind>;
export const personalDataPurpose = z.enum([
  'CONTACT_PERSON',
  'VERIFY_IDENTITY',
  'FULFILL_SERVICE',
  'PROCESS_REIMBURSEMENT',
  'IDENTIFY_PERSON',
  'TAX_ADMINISTRATION',
  'PAYROLL_ADMINISTRATION',
  'BENEFITS_ADMINISTRATION',
]);
export const dataPurposes: Record<
  PersonalDataKind,
  z.infer<typeof personalDataPurpose>
> = {
  NIK: 'VERIFY_IDENTITY',
  PHONE: 'CONTACT_PERSON',
  EMAIL: 'CONTACT_PERSON',
  ADDRESS: 'FULFILL_SERVICE',
  DATE_OF_BIRTH: 'VERIFY_IDENTITY',
  BANK_ACCOUNT: 'PROCESS_REIMBURSEMENT',
  NAME: 'IDENTIFY_PERSON',
  NPWP: 'TAX_ADMINISTRATION',
  PASSPORT_NUMBER: 'VERIFY_IDENTITY',
  SALARY: 'PAYROLL_ADMINISTRATION',
  HEALTH_INFORMATION: 'BENEFITS_ADMINISTRATION',
};
export const personalDataRequest = z
  .strictObject({
    field_type: personalDataKind,
    purpose: personalDataPurpose,
    source_id: z.uuid(),
    chunk_id: z.uuid(),
  })
  .refine(
    (v) => dataPurposes[v.field_type] === v.purpose,
    'Purpose does not match the requested field',
  );
export type PersonalDataRequest = z.infer<typeof personalDataRequest>;
export const personalDataAnnotation = z
  .strictObject({
    field_type: personalDataKind,
    start: z.number().int().min(0),
    end: z.number().int().positive(),
  })
  .refine((v) => v.end > v.start, 'Invalid personal-data span');
export const personalDataGrant = z
  .strictObject({
    field_type: personalDataKind,
    purpose: personalDataPurpose,
    subject_type: z.enum(['USER', 'DEPARTMENT', 'ORGANIZATION']),
    subject_id: z.string().min(1).max(100),
  })
  .refine(
    (v) =>
      dataPurposes[v.field_type] === v.purpose &&
      (v.subject_type === 'DEPARTMENT' ||
        z.uuid().safeParse(v.subject_id).success),
    'Invalid personal-data grant',
  );
