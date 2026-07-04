import { NextResponse } from "next/server"
import { z } from "zod/v4"
import { sendContactEnquiryEmail } from "@/lib/email/send"
import { CONTACT_ENQUIRY_TYPES } from "@/lib/email/contactEnquiryRouting"

const ContactRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email(),
    enquiryType: z.enum(CONTACT_ENQUIRY_TYPES),
    message: z.string().trim().min(1).max(5000),
  })
  .strict()

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ContactRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const requestId = crypto.randomUUID()
  const payload = parsed.data

  console.info("Contact enquiry send attempt", {
    requestId,
    enquiryType: payload.enquiryType,
  })

  const messageId = await sendContactEnquiryEmail(payload)
  if (!messageId) {
    console.error("Contact enquiry send failed", {
      requestId,
      enquiryType: payload.enquiryType,
    })
    return NextResponse.json(
      { error: "Unable to send contact enquiry" },
      { status: 502 }
    )
  }

  console.info("Contact enquiry sent", {
    requestId,
    enquiryType: payload.enquiryType,
    messageId,
  })

  return NextResponse.json({ success: true })
}
