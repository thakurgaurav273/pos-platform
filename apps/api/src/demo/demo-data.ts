import { Unit } from '@fluxen/database';

type DemoVariant = { name: string; price: number; unit: Unit };
export type DemoProduct = {
  name: string;
  category: string;
  hsnCode: string;
  variants: DemoVariant[];
};

/** Small, readable catalog for the demo shop (the full import catalog is too big to browse). */
export const DEMO_CATALOG: DemoProduct[] = [
  {
    name: 'Kaju Katli',
    category: 'Sweets',
    hsnCode: '1704',
    variants: [
      { name: '250g', price: 280, unit: Unit.GM },
      { name: '500g', price: 550, unit: Unit.GM },
    ],
  },
  {
    name: 'Gulab Jamun',
    category: 'Sweets',
    hsnCode: '1704',
    variants: [
      { name: 'Box of 6', price: 150, unit: Unit.PC },
      { name: 'Box of 12', price: 290, unit: Unit.PC },
    ],
  },
  {
    name: 'Rasgulla',
    category: 'Sweets',
    hsnCode: '1704',
    variants: [{ name: 'Tin 500g', price: 220, unit: Unit.PC }],
  },
  {
    name: 'Motichoor Ladoo',
    category: 'Sweets',
    hsnCode: '1704',
    variants: [
      { name: '500g', price: 260, unit: Unit.GM },
      { name: '1kg', price: 500, unit: Unit.KG },
    ],
  },
  {
    name: 'Aloo Bhujia',
    category: 'Snacks',
    hsnCode: '2106',
    variants: [
      { name: '200g', price: 60, unit: Unit.GM },
      { name: '400g', price: 115, unit: Unit.GM },
    ],
  },
  {
    name: 'Namkeen Mix',
    category: 'Snacks',
    hsnCode: '2106',
    variants: [
      { name: '200g', price: 70, unit: Unit.GM },
      { name: '1kg', price: 320, unit: Unit.KG },
    ],
  },
  {
    name: 'Masala Peanuts',
    category: 'Snacks',
    hsnCode: '2106',
    variants: [{ name: '250g', price: 80, unit: Unit.GM }],
  },
  {
    name: 'Butter Cookies',
    category: 'Bakery',
    hsnCode: '1905',
    variants: [{ name: '200g', price: 120, unit: Unit.GM }],
  },
  {
    name: 'Whole Wheat Bread',
    category: 'Bakery',
    hsnCode: '1905',
    variants: [{ name: 'Loaf', price: 55, unit: Unit.PC }],
  },
  {
    name: 'Plum Cake',
    category: 'Bakery',
    hsnCode: '1905',
    variants: [
      { name: 'Slice', price: 40, unit: Unit.PC },
      { name: 'Whole', price: 380, unit: Unit.PC },
    ],
  },
  {
    name: 'Masala Chai Blend',
    category: 'Beverages',
    hsnCode: '0902',
    variants: [{ name: '250g', price: 140, unit: Unit.GM }],
  },
  {
    name: 'Filter Coffee',
    category: 'Beverages',
    hsnCode: '0901',
    variants: [{ name: '200g', price: 210, unit: Unit.GM }],
  },
  {
    name: 'Fresh Paneer',
    category: 'Dairy',
    hsnCode: '0406',
    variants: [{ name: '200g', price: 90, unit: Unit.GM }],
  },
  {
    name: 'Desi Ghee',
    category: 'Dairy',
    hsnCode: '0405',
    variants: [
      { name: '500ml', price: 340, unit: Unit.ML },
      { name: '1L', price: 650, unit: Unit.LTR },
    ],
  },
];

export const DEMO_CUSTOMERS = [
  { name: 'Anita Sharma', phone: '9810000001' },
  { name: 'Rohit Verma', phone: '9810000002' },
  { name: 'Meera Iyer', phone: '9810000003' },
  { name: 'Kabir Khan', phone: '9810000004' },
  { name: 'Sunita Patel', phone: '9810000005' },
  { name: 'Vikram Singh', phone: '9810000006' },
  { name: 'Neha Gupta', phone: '9810000007' },
  { name: 'Arjun Nair', phone: '9810000008' },
];
