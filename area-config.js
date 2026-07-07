// area-config.js
// UAE emirates and known areas/neighborhoods within each, used to populate
// the cascading Emirate -> Area dropdowns on the customer profile.
// Add more areas here any time — nothing else needs to change.
// Staff can also type a custom area if it's not in the list (handled in customer.js).

export const EMIRATES = {
  "Dubai": [
    "Deira", "Bur Dubai", "Al Barsha", "Dubai Marina", "Jumeirah",
    "Al Qusais", "Al Rashidiya", "Business Bay", "Discovery Gardens", "International City",
  ],
  "Abu Dhabi": [
    "Al Khalidiyah", "Al Reem Island", "Al Muroor", "Al Mushrif",
    "Khalifa City", "Al Bateen", "Al Nahyan", "Mussafah",
  ],
  "Al Ain": [
    "Al Jimi", "Al Muwaiji", "Al Towayya", "Al Yahar", "Al Foah", "Zakher", "Al Mutarad",
  ],
  "Sharjah": [
    "Al Nahda", "Al Qasimia", "Al Majaz", "Al Taawun", "Al Khan", "Muweilah",
  ],
  "Ajman": [
    "Al Nuaimiya", "Al Rashidiya", "Al Rawda", "Al Jurf",
  ],
  "Fujairah": [],
  "Ras Al Khaimah": [],
  "Umm Al Quwain": [],
};

// Sentinel value used in dropdowns to trigger a free-text input instead of a fixed choice.
export const OTHER_VALUE = "__other__";
