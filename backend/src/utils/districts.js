// The 64 districts of Bangladesh (canonical English spellings, as used by the national government).
export const BD_DISTRICTS = Object.freeze([
  'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur',
  'Chapainawabganj', 'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla', 'Dhaka', 'Dinajpur', 'Faridpur',
  'Feni', 'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore', 'Jhalokathi',
  'Jhenaidah', 'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur',
  'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar', 'Munshiganj', 'Mymensingh',
  'Naogaon', 'Narail', 'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona', 'Nilphamari', 'Noakhali',
  'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari', 'Rajshahi', 'Rangamati', 'Rangpur',
  'Satkhira', 'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet', 'Tangail', 'Thakurgaon',
]);

const squash = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const BY_KEY = new Map(BD_DISTRICTS.map((d) => [squash(d), d]));

// Older/alternative spellings people actually type.
const ALIASES = {
  chittagong: 'Chattogram', comilla: 'Cumilla', jessore: 'Jashore', bogra: 'Bogura', barisal: 'Barishal',
  chapainawabganj: 'Chapainawabganj', nawabganj: 'Chapainawabganj', maulvibazar: 'Moulvibazar',
  jhalakathi: 'Jhalokathi', jhalokati: 'Jhalokathi', khagrachari: 'Khagrachhari', netrakona: 'Netrokona',
  coxbazar: "Cox's Bazar", brahmanbaria: 'Brahmanbaria', munshigonj: 'Munshiganj', narayangonj: 'Narayanganj',
};

/** Canonical district name for user input ("dhaka", "Comilla", "cox bazar"), or null if it is not a district. */
export function canonicalDistrict(input) {
  if (typeof input !== 'string') return null;
  const key = squash(input);
  return BY_KEY.get(key) ?? (ALIASES[key] ? ALIASES[key] : null);
}
