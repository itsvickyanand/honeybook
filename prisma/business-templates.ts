/**
 * Seed templates for 5 wedding-cluster business types.
 * Each template defines:
 *  - the business itself (name, icon, color)
 *  - default custom tables ("item master") seeded into a new tenant on signup
 *  - default roles
 *
 * Tables here become real CustomTable + CustomColumn rows on signup.
 * Owners can still add/edit/delete tables and columns from the UI afterwards.
 */

export type ColumnType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'CURRENCY'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'IMAGE_URL';

export interface ColumnDef {
  slug: string;
  name: string;
  type: ColumnType;
  required?: boolean;
  options?: string[];
  helpText?: string;
}

export interface TableDef {
  slug: string;
  name: string;
  icon: string;
  description?: string;
  columns: ColumnDef[];
  sampleRows?: Record<string, string | number | boolean>[];
}

export interface RoleDef {
  name: string;
  description: string;
  permissions: string[];
}

export interface BusinessTemplate {
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  tables: TableDef[];
  roles: RoleDef[];
}

// Permission strings used across the app
export const PERMS = {
  ALL: '*',
  CATALOG_VIEW: 'catalog.view',
  CATALOG_EDIT: 'catalog.edit',
  SCHEMA_EDIT: 'schema.edit', // create/drop tables, add columns
  PROPOSAL_VIEW: 'proposal.view',
  PROPOSAL_CREATE: 'proposal.create',
  PROPOSAL_SEND: 'proposal.send',
  CONTACT_VIEW: 'contact.view',
  CONTACT_EDIT: 'contact.edit',
  TEAM_MANAGE: 'team.manage',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

// Standard role presets — applied to every tenant
const STANDARD_ROLES: RoleDef[] = [
  {
    name: 'Owner',
    description: 'Full access to everything.',
    permissions: [PERMS.ALL],
  },
  {
    name: 'Sales',
    description: 'Create and send proposals, manage clients.',
    permissions: [
      PERMS.CATALOG_VIEW,
      PERMS.PROPOSAL_VIEW,
      PERMS.PROPOSAL_CREATE,
      PERMS.PROPOSAL_SEND,
      PERMS.CONTACT_VIEW,
      PERMS.CONTACT_EDIT,
    ],
  },
  {
    name: 'Coordinator',
    description: 'View proposals and clients, no editing of pricing.',
    permissions: [
      PERMS.CATALOG_VIEW,
      PERMS.PROPOSAL_VIEW,
      PERMS.CONTACT_VIEW,
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access.',
    permissions: [PERMS.CATALOG_VIEW, PERMS.PROPOSAL_VIEW, PERMS.CONTACT_VIEW],
  },
];

// ─── 1. CATERING ────────────────────────────────────────────────────────────
const CATERING: BusinessTemplate = {
  slug: 'catering',
  name: 'Catering & Banquet',
  description: 'Menus, packages, service staff and beverages for events.',
  icon: 'UtensilsCrossed',
  accentColor: '#f59e0b',
  roles: STANDARD_ROLES,
  tables: [
    {
      slug: 'menu-items',
      name: 'Menu Items',
      icon: 'Soup',
      description: 'Individual dishes — starters, mains, desserts.',
      columns: [
        { slug: 'name', name: 'Dish Name', type: 'TEXT', required: true },
        {
          slug: 'category',
          name: 'Category',
          type: 'SELECT',
          required: true,
          options: ['Starter', 'Main Course', 'Dessert', 'Beverage', 'Live Counter', 'Salad'],
        },
        {
          slug: 'cuisine',
          name: 'Cuisine',
          type: 'SELECT',
          options: ['Indian', 'Continental', 'Chinese', 'Italian', 'Mughlai', 'South Indian', 'Pan Asian'],
        },
        {
          slug: 'diet',
          name: 'Diet',
          type: 'SELECT',
          required: true,
          options: ['Veg', 'Non-Veg', 'Vegan', 'Jain'],
        },
        { slug: 'pricePerPlate', name: 'Price / Plate', type: 'CURRENCY', required: true },
        { slug: 'minOrder', name: 'Min Pax', type: 'NUMBER' },
        { slug: 'description', name: 'Description', type: 'LONG_TEXT' },
        { slug: 'imageUrl', name: 'Image', type: 'IMAGE_URL' },
      ],
      sampleRows: [
        { name: 'Paneer Tikka', category: 'Starter', cuisine: 'Indian', diet: 'Veg', pricePerPlate: 180, minOrder: 30, description: 'Marinated cottage cheese in tandoor', imageUrl: '' },
        { name: 'Dal Makhani', category: 'Main Course', cuisine: 'Indian', diet: 'Veg', pricePerPlate: 220, minOrder: 30, description: 'Slow-cooked black lentils', imageUrl: '' },
        { name: 'Murgh Tikka', category: 'Starter', cuisine: 'Mughlai', diet: 'Non-Veg', pricePerPlate: 260, minOrder: 30, description: 'Tandoori chicken tikka', imageUrl: '' },
        { name: 'Gulab Jamun', category: 'Dessert', cuisine: 'Indian', diet: 'Veg', pricePerPlate: 90, minOrder: 30, description: 'Warm milk dumplings in syrup', imageUrl: '' },
        { name: 'Live Pasta Counter', category: 'Live Counter', cuisine: 'Italian', diet: 'Veg', pricePerPlate: 350, minOrder: 50, description: 'Chef-tossed pasta with 3 sauces', imageUrl: '' },
      ],
    },
    {
      slug: 'packages',
      name: 'Catering Packages',
      icon: 'Boxes',
      description: 'Pre-built combos by price tier.',
      columns: [
        { slug: 'name', name: 'Package Name', type: 'TEXT', required: true },
        { slug: 'tier', name: 'Tier', type: 'SELECT', options: ['Silver', 'Gold', 'Platinum', 'Diamond'], required: true },
        { slug: 'pricePerPlate', name: 'Price / Plate', type: 'CURRENCY', required: true },
        { slug: 'includes', name: 'Includes', type: 'LONG_TEXT' },
        { slug: 'minPax', name: 'Min Pax', type: 'NUMBER' },
      ],
      sampleRows: [
        { name: 'Wedding Silver', tier: 'Silver', pricePerPlate: 850, includes: '4 starters · 6 mains · 2 desserts · soft drinks', minPax: 100 },
        { name: 'Wedding Gold', tier: 'Gold', pricePerPlate: 1450, includes: '6 starters · 8 mains · 4 desserts · 1 live counter · mocktails', minPax: 100 },
        { name: 'Wedding Platinum', tier: 'Platinum', pricePerPlate: 2200, includes: '8 starters · 10 mains · 6 desserts · 3 live counters · mocktails · welcome drink', minPax: 150 },
      ],
    },
    {
      slug: 'service-staff',
      name: 'Service Staff',
      icon: 'Users',
      description: 'Captains, waiters, chefs.',
      columns: [
        { slug: 'role', name: 'Role', type: 'SELECT', options: ['Captain', 'Waiter', 'Chef', 'Helper', 'Bartender'], required: true },
        { slug: 'ratePerEvent', name: 'Rate / Event', type: 'CURRENCY', required: true },
        { slug: 'minHours', name: 'Min Hours', type: 'NUMBER' },
      ],
      sampleRows: [
        { role: 'Captain', ratePerEvent: 1500, minHours: 6 },
        { role: 'Waiter', ratePerEvent: 800, minHours: 6 },
        { role: 'Chef', ratePerEvent: 3500, minHours: 8 },
      ],
    },
  ],
};

// ─── 2. EVENT MANAGEMENT ────────────────────────────────────────────────────
const EVENT_MGMT: BusinessTemplate = {
  slug: 'event-management',
  name: 'Event Management',
  description: 'End-to-end event production: venues, AV, decor, manpower.',
  icon: 'PartyPopper',
  accentColor: '#ec4899',
  roles: STANDARD_ROLES,
  tables: [
    {
      slug: 'venues',
      name: 'Venues',
      icon: 'Building2',
      columns: [
        { slug: 'name', name: 'Venue Name', type: 'TEXT', required: true },
        { slug: 'type', name: 'Type', type: 'SELECT', options: ['Banquet Hall', 'Lawn', 'Resort', 'Hotel', 'Farmhouse', 'Convention Centre'] },
        { slug: 'capacity', name: 'Capacity', type: 'NUMBER', required: true },
        { slug: 'city', name: 'City', type: 'TEXT' },
        { slug: 'rentPerDay', name: 'Rent / Day', type: 'CURRENCY', required: true },
        { slug: 'amenities', name: 'Amenities', type: 'LONG_TEXT' },
      ],
      sampleRows: [
        { name: 'Royal Orchid Banquet', type: 'Banquet Hall', capacity: 500, city: 'Mumbai', rentPerDay: 250000, amenities: 'AC · stage · parking · in-house catering' },
        { name: 'Sunset Lawns', type: 'Lawn', capacity: 800, city: 'Pune', rentPerDay: 180000, amenities: 'Open lawn · backup generator · valet' },
      ],
    },
    {
      slug: 'av-equipment',
      name: 'AV & Lighting',
      icon: 'Speaker',
      columns: [
        { slug: 'item', name: 'Equipment', type: 'TEXT', required: true },
        { slug: 'category', name: 'Category', type: 'SELECT', options: ['Sound', 'Lighting', 'Video', 'Staging'] },
        { slug: 'ratePerDay', name: 'Rate / Day', type: 'CURRENCY', required: true },
        { slug: 'specs', name: 'Specs', type: 'TEXT' },
      ],
      sampleRows: [
        { item: 'JBL Line Array PA System', category: 'Sound', ratePerDay: 35000, specs: '8x JBL VRX932 · sub bass · 32-ch mixer' },
        { item: 'LED Par Cans (set of 20)', category: 'Lighting', ratePerDay: 18000, specs: 'RGBW · DMX controlled' },
        { item: 'LED Wall 12x8 ft', category: 'Video', ratePerDay: 60000, specs: 'P3.9 · indoor · processor included' },
      ],
    },
    {
      slug: 'manpower',
      name: 'Manpower',
      icon: 'Users',
      columns: [
        { slug: 'role', name: 'Role', type: 'SELECT', options: ['Event Manager', 'Coordinator', 'Anchor', 'Bouncer', 'Usher', 'Tech Crew'], required: true },
        { slug: 'ratePerDay', name: 'Rate / Day', type: 'CURRENCY', required: true },
      ],
      sampleRows: [
        { role: 'Event Manager', ratePerDay: 5000 },
        { role: 'Coordinator', ratePerDay: 2500 },
        { role: 'Anchor', ratePerDay: 25000 },
      ],
    },
  ],
};

// ─── 3. WEDDING PHOTOGRAPHY ─────────────────────────────────────────────────
const PHOTOGRAPHY: BusinessTemplate = {
  slug: 'wedding-photography',
  name: 'Wedding Photography',
  description: 'Photography & videography packages, albums, add-ons.',
  icon: 'Camera',
  accentColor: '#6366f1',
  roles: STANDARD_ROLES,
  tables: [
    {
      slug: 'packages',
      name: 'Shoot Packages',
      icon: 'Camera',
      columns: [
        { slug: 'name', name: 'Package Name', type: 'TEXT', required: true },
        { slug: 'durationHours', name: 'Duration (hrs)', type: 'NUMBER', required: true },
        { slug: 'photographers', name: 'Photographers', type: 'NUMBER', required: true },
        { slug: 'videographers', name: 'Videographers', type: 'NUMBER' },
        { slug: 'deliverables', name: 'Deliverables', type: 'LONG_TEXT' },
        { slug: 'price', name: 'Price', type: 'CURRENCY', required: true },
      ],
      sampleRows: [
        { name: 'Wedding Day Essentials', durationHours: 10, photographers: 2, videographers: 1, deliverables: '500 edited photos · 5-min highlight reel', price: 145000 },
        { name: 'Full Wedding Coverage', durationHours: 24, photographers: 3, videographers: 2, deliverables: '1000 edited photos · 30-min film · 5-min trailer · drone', price: 285000 },
        { name: 'Pre-Wedding Shoot', durationHours: 6, photographers: 1, videographers: 1, deliverables: '80 edited photos · 2-min reel', price: 45000 },
      ],
    },
    {
      slug: 'addons',
      name: 'Add-ons',
      icon: 'Plus',
      columns: [
        { slug: 'name', name: 'Add-on', type: 'TEXT', required: true },
        { slug: 'category', name: 'Category', type: 'SELECT', options: ['Album', 'Print', 'Drone', 'Extra Day', 'Same-Day Edit'] },
        { slug: 'price', name: 'Price', type: 'CURRENCY', required: true },
      ],
      sampleRows: [
        { name: 'Premium Leather Album (40 pages)', category: 'Album', price: 28000 },
        { name: 'Drone Coverage (per day)', category: 'Drone', price: 18000 },
        { name: 'Same-Day Edit Reel', category: 'Same-Day Edit', price: 35000 },
      ],
    },
  ],
};

// ─── 4. WEDDING PLANNER ─────────────────────────────────────────────────────
const PLANNER: BusinessTemplate = {
  slug: 'wedding-planner',
  name: 'Wedding Planner',
  description: 'Multi-day weddings: planning, design, coordination, on-ground delivery.',
  icon: 'Crown',
  accentColor: '#a855f7',
  roles: STANDARD_ROLES,
  tables: [
    {
      slug: 'services',
      name: 'Planning Services',
      icon: 'Sparkles',
      columns: [
        { slug: 'name', name: 'Service', type: 'TEXT', required: true },
        { slug: 'tier', name: 'Tier', type: 'SELECT', options: ['Day-of Coordination', 'Partial Planning', 'Full Planning', 'Destination'] },
        { slug: 'fee', name: 'Fee', type: 'CURRENCY', required: true },
        { slug: 'deliverables', name: 'Deliverables', type: 'LONG_TEXT' },
      ],
      sampleRows: [
        { name: 'Day-of Coordination', tier: 'Day-of Coordination', fee: 75000, deliverables: 'Single-day on-ground coordination · vendor management · timeline' },
        { name: 'Full Wedding Planning (3 days)', tier: 'Full Planning', fee: 850000, deliverables: 'Mehendi · Sangeet · Wedding · vendor sourcing · design · coordination' },
        { name: 'Destination Wedding (5 days)', tier: 'Destination', fee: 2500000, deliverables: 'End-to-end planning, travel, accommodation, multi-event design' },
      ],
    },
    {
      slug: 'events',
      name: 'Event Types',
      icon: 'CalendarHeart',
      columns: [
        { slug: 'name', name: 'Event', type: 'TEXT', required: true },
        { slug: 'type', name: 'Type', type: 'SELECT', options: ['Mehendi', 'Haldi', 'Sangeet', 'Wedding', 'Reception', 'Cocktail'] },
        { slug: 'durationHours', name: 'Duration (hrs)', type: 'NUMBER' },
        { slug: 'guestCount', name: 'Typical Guest Count', type: 'NUMBER' },
      ],
      sampleRows: [
        { name: 'Sangeet Night', type: 'Sangeet', durationHours: 5, guestCount: 200 },
        { name: 'Wedding Ceremony', type: 'Wedding', durationHours: 6, guestCount: 400 },
        { name: 'Reception', type: 'Reception', durationHours: 4, guestCount: 500 },
      ],
    },
    {
      slug: 'design-elements',
      name: 'Design Elements',
      icon: 'Palette',
      columns: [
        { slug: 'name', name: 'Element', type: 'TEXT', required: true },
        { slug: 'category', name: 'Category', type: 'SELECT', options: ['Mandap', 'Stage', 'Entrance', 'Tablescape', 'Lighting'] },
        { slug: 'startingPrice', name: 'Starting Price', type: 'CURRENCY', required: true },
      ],
      sampleRows: [
        { name: 'Floral Mandap (Premium)', category: 'Mandap', startingPrice: 350000 },
        { name: 'LED Stage Backdrop', category: 'Stage', startingPrice: 120000 },
        { name: 'Grand Entrance Arch', category: 'Entrance', startingPrice: 85000 },
      ],
    },
  ],
};

// ─── 5. FLORIST & DECOR ─────────────────────────────────────────────────────
const FLORIST: BusinessTemplate = {
  slug: 'florist-decor',
  name: 'Florist & Decor',
  description: 'Floral installations, decor packages, rentals.',
  icon: 'Flower2',
  accentColor: '#10b981',
  roles: STANDARD_ROLES,
  tables: [
    {
      slug: 'flowers',
      name: 'Flowers',
      icon: 'Flower',
      columns: [
        { slug: 'name', name: 'Flower', type: 'TEXT', required: true },
        { slug: 'color', name: 'Color', type: 'TEXT' },
        { slug: 'unit', name: 'Unit', type: 'SELECT', options: ['per stem', 'per bunch', 'per kg'], required: true },
        { slug: 'pricePerUnit', name: 'Price / Unit', type: 'CURRENCY', required: true },
        { slug: 'seasonal', name: 'Seasonal Only', type: 'BOOLEAN' },
      ],
      sampleRows: [
        { name: 'Rose (Imported)', color: 'Red', unit: 'per stem', pricePerUnit: 45, seasonal: false },
        { name: 'Marigold', color: 'Orange', unit: 'per kg', pricePerUnit: 120, seasonal: false },
        { name: 'Orchids (Phalaenopsis)', color: 'White', unit: 'per stem', pricePerUnit: 180, seasonal: true },
        { name: 'Hydrangea', color: 'Blue', unit: 'per stem', pricePerUnit: 250, seasonal: true },
      ],
    },
    {
      slug: 'installations',
      name: 'Floral Installations',
      icon: 'Sparkles',
      columns: [
        { slug: 'name', name: 'Installation', type: 'TEXT', required: true },
        { slug: 'type', name: 'Type', type: 'SELECT', options: ['Mandap', 'Backdrop', 'Centerpiece', 'Entrance', 'Hanging', 'Aisle'] },
        { slug: 'sizeSqft', name: 'Size (sqft)', type: 'NUMBER' },
        { slug: 'price', name: 'Price', type: 'CURRENCY', required: true },
        { slug: 'description', name: 'Description', type: 'LONG_TEXT' },
      ],
      sampleRows: [
        { name: 'Floral Mandap — Romance', type: 'Mandap', sizeSqft: 100, price: 285000, description: 'Roses, peonies, hydrangea with chiffon drapes' },
        { name: 'Hanging Floral Cloud', type: 'Hanging', sizeSqft: 60, price: 120000, description: 'Suspended mixed floral arrangement above mandap' },
        { name: 'Aisle Petal Carpet (30ft)', type: 'Aisle', sizeSqft: 30, price: 35000, description: 'Fresh rose petal aisle path' },
      ],
    },
    {
      slug: 'rentals',
      name: 'Decor Rentals',
      icon: 'Armchair',
      columns: [
        { slug: 'name', name: 'Item', type: 'TEXT', required: true },
        { slug: 'category', name: 'Category', type: 'SELECT', options: ['Furniture', 'Linen', 'Tableware', 'Props', 'Lighting'] },
        { slug: 'ratePerDay', name: 'Rate / Day', type: 'CURRENCY', required: true },
        { slug: 'inStock', name: 'Quantity in Stock', type: 'NUMBER' },
      ],
      sampleRows: [
        { name: 'Velvet Lounge Sofa', category: 'Furniture', ratePerDay: 1200, inStock: 12 },
        { name: 'Crystal Chandelier', category: 'Lighting', ratePerDay: 3500, inStock: 6 },
        { name: 'Gold Charger Plate', category: 'Tableware', ratePerDay: 35, inStock: 800 },
      ],
    },
  ],
};

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  CATERING,
  EVENT_MGMT,
  PHOTOGRAPHY,
  PLANNER,
  FLORIST,
];
