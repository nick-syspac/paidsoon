import type { UserProfile } from "@/lib/generated/prisma/client"

interface Props {
  profile: UserProfile
  supabaseEmail: string
  supabaseLastSignIn: string | null
}

export function IdentitySection({ profile, supabaseEmail, supabaseLastSignIn }: Props) {
  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Identity</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-gray-500">Display name</dt>
          <dd className="text-gray-100">{profile.displayName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Email</dt>
          <dd className="text-gray-100">{supabaseEmail || "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">User ID</dt>
          <dd className="text-gray-400 font-mono text-xs break-all">{profile.userId}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Account created</dt>
          <dd className="text-gray-100">{new Date(profile.createdAt).toLocaleString("en-AU")}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Last sign-in</dt>
          <dd className="text-gray-100">
            {supabaseLastSignIn
              ? new Date(supabaseLastSignIn).toLocaleString("en-AU")
              : "—"}
          </dd>
        </div>
      </dl>
    </section>
  )
}
