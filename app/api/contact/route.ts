import { NextResponse } from "next/server"

// TODO: implement — connect to Resend, CRM, or a Supabase table for form submissions
export async function POST() {
  return NextResponse.json(
    { error: "Contact form not yet implemented" },
    { status: 501 }
  )
}
