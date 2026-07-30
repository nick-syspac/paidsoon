import type { EmailSettings } from "@/lib/generated/prisma/client"

interface Props {
  emailSettings: EmailSettings | null
}

export function EmailSettingsSection({ emailSettings }: Props) {
  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Email Settings</h2>
      {!emailSettings ? (
        <p className="text-sm text-gray-500">No email settings configured (system defaults apply).</p>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-500">Custom From address</dt>
            <dd className="text-gray-100">{emailSettings.fromEmail ?? <span className="text-gray-500">Not set</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500">From name</dt>
            <dd className="text-gray-100">{emailSettings.fromName ?? <span className="text-gray-500">Not set</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Reply-to</dt>
            <dd className="text-gray-100">{emailSettings.replyTo ?? <span className="text-gray-500">Not set</span>}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Domain verified (Resend)</dt>
            <dd className={emailSettings.resendVerified ? "text-green-400" : "text-red-400"}>
              {emailSettings.resendVerified ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}
