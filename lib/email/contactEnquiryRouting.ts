export const CONTACT_ENQUIRY_TYPES = [
  "Sales",
  "Support",
  "Accounting Partnerships",
] as const

export type ContactEnquiryType = (typeof CONTACT_ENQUIRY_TYPES)[number]

export const CONTACT_ENQUIRY_RECIPIENTS: Record<ContactEnquiryType, string> = {
  Sales: "sales@paidsoon.com.au",
  Support: "support@paidsoon.com.au",
  "Accounting Partnerships": "partnerships@padisoon.com.au",
}
