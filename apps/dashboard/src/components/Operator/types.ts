export type OrgState = "TRIAL" | "ACTIVE" | "EXPIRED";
export type EnquiryStatus = "OPEN" | "CONTACTED" | "CLOSED";

export type OrgRow = {
  id: string;
  name: string;
  createdAt: string;
  shopCount: number;
  userCount: number;
  orders30d: number;
  revenue30d: number;
  owner: { email: string; name: string | null; phone: string | null } | null;
  isDemo: boolean;
  state: OrgState;
  daysLeft: number | null;
  planName: string | null;
  paidUntil: string | null;
  trialEndsAt: string | null;
};

export type EnquiryRow = {
  id: string;
  createdAt: string;
  contactName: string;
  email: string;
  phone: string | null;
  plan: string | null;
  message: string | null;
  status: EnquiryStatus;
  organization: { id: string; name: string };
};

export type Overview = {
  totals: {
    businesses: number;
    trial: number;
    active: number;
    expired: number;
    newLast7: number;
    newLast30: number;
    openEnquiries: number;
  };
  expiringSoon: {
    id: string;
    name: string;
    state: OrgState;
    daysLeft: number | null;
    endsAt: string | null;
  }[];
  recentSignups: { id: string; name: string; createdAt: string; state: OrgState }[];
  recentEnquiries: EnquiryRow[];
};

export type ShopDetail = {
  id: string;
  shopCode: string;
  name: string;
  isFactory: boolean;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
  createdAt: string;
  users: number;
  products: number;
  customers: number;
  orders: number;
  revenue: number;
  lastOrderAt: string | null;
  orders30d: number;
  revenue30d: number;
};

export type UserDetail = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  shopCode: string;
  createdAt: string;
};

export type OrgDetail = {
  id: string;
  name: string;
  createdAt: string;
  onboardingCompletedAt: string | null;
  isDemo: boolean;
  subscription: {
    state: OrgState;
    readOnly: boolean;
    trialEndsAt: string | null;
    paidUntil: string | null;
    planName: string | null;
    daysLeft: number | null;
  };
  owner: UserDetail | null;
  totals: {
    shops: number;
    users: number;
    products: number;
    customers: number;
    orders: number;
    revenue: number;
    orders30d: number;
    revenue30d: number;
  };
  shops: ShopDetail[];
  users: UserDetail[];
  enquiries: Omit<EnquiryRow, "organization">[];
};

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat("en-IN").format(n);
