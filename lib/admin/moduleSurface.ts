export interface AdminModuleSurfaceEntry {
  label: string
  href: string
  description: string
  status: string
}

const ADMIN_MODULE_SURFACE: AdminModuleSurfaceEntry[] = [
  {
    label: "Tenants",
    href: "/admin/tenants",
    description: "Customer accounts, trial state, and account-level diagnostics.",
    status: "Customer view",
  },
  {
    label: "Subscriptions",
    href: "/admin/subscriptions",
    description: "Billing tiers, renewals, and current customer subscription health.",
    status: "Billing",
  },
  {
    label: "Customers",
    href: "/admin/customers",
    description: "Search customer records and support issue workflows from one entry point.",
    status: "Support",
  },
  {
    label: "Integrations",
    href: "/admin/integrations",
    description: "Accounting-provider health, sync status, and operational connections.",
    status: "Health",
  },
  {
    label: "Email Jobs",
    href: "/admin/email-jobs",
    description: "Recent email sending activity, delivery health, and follow-up operations.",
    status: "Operations",
  },
  {
    label: "Devices",
    href: "/admin/admin-devices",
    description: "Admin session and device review for support and security operations.",
    status: "Security",
  },
  {
    label: "Staff",
    href: "/admin/staff",
    description: "Admin user access, platform roles, and staffing operations.",
    status: "Access",
  },
  {
    label: "Audit Log",
    href: "/admin/audit-log",
    description: "Review the action trail across customer, billing, and operational events.",
    status: "Traceability",
  },
  {
    label: "Training",
    href: "/admin/training",
    description: "Guide and help content lifecycle, review flow, and publication state.",
    status: "Content",
  },
  {
    label: "Runbooks",
    href: "/admin/runbooks",
    description: "Operational runbooks and platform guidance for on-call support workflows.",
    status: "Operations",
  },
]

export function getAdminModuleSurface(): AdminModuleSurfaceEntry[] {
  return ADMIN_MODULE_SURFACE
}
