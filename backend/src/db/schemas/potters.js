import { z } from 'zod';
import { POTTER_STATUS } from '../enums.js';
import { text, phone, district, hasKeys, NO_FIELDS } from './common.js';

const mutable = {
  name: text(2, 100),
  phone,
  village: text(2, 100),
  district,
  address: text(5, 300).nullable(),
  bio: text(1, 500).nullable(),
  featured: z.boolean(),
};

// `status`, `registrationDate`, `createdBy` are set by the repository, never by callers.
export const potterCreateSchema = z.strictObject({
  name: mutable.name,
  phone: mutable.phone,
  village: mutable.village,
  district: mutable.district,
  address: mutable.address.default(null),
  bio: mutable.bio.default(null),
  featured: mutable.featured.default(false),
});

export const potterUpdateSchema = z.strictObject(mutable).partial().refine(hasKeys, NO_FIELDS);

export const potterStatusSchema = z.enum(POTTER_STATUS);

// What an admin may submit over the API: the full postal address is mandatory (the repository itself stays lenient
// so seed data and scripts keep working).
const adminAddress = text(5, 300);
export const potterAdminCreateSchema = z.strictObject({
  name: mutable.name,
  phone: mutable.phone,
  village: mutable.village,
  district: mutable.district,
  address: adminAddress,
  bio: mutable.bio.optional(),
  featured: mutable.featured.optional(),
});
export const potterAdminUpdateSchema = z
  .strictObject({ ...mutable, address: adminAddress })
  .partial()
  .refine(hasKeys, NO_FIELDS);
