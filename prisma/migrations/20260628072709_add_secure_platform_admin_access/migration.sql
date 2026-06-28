-- CreateEnum
CREATE TYPE "PlatformRoleType" AS ENUM ('platform_owner', 'platform_admin', 'platform_support');

-- CreateEnum
CREATE TYPE "PlatformRoleStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "AdminDeviceStatus" AS ENUM ('pending', 'active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('admin_challenge_created', 'admin_challenge_verified', 'admin_challenge_failed', 'admin_session_started', 'admin_session_expired', 'admin_session_revoked', 'device_enrolled', 'device_revoked', 'staff_invited', 'role_assigned', 'role_changed', 'staff_disabled', 'tenant_viewed', 'impersonation_started', 'impersonation_ended', 'impersonation_destructive_action', 'subscription_changed', 'integration_action', 'email_job_retried', 'email_job_paused', 'email_job_resumed', 'system_setting_changed');

-- CreateEnum
CREATE TYPE "StaffInvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "platform_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "PlatformRoleType" NOT NULL,
    "status" "PlatformRoleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_devices" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "public_key_bytes" BYTEA NOT NULL,
    "public_key_fingerprint" TEXT NOT NULL,
    "key_type" TEXT NOT NULL DEFAULT 'ssh-ed25519',
    "status" "AdminDeviceStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "last_used_ip" TEXT,
    "last_user_agent" TEXT,

    CONSTRAINT "admin_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,

    CONSTRAINT "admin_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "admin_device_id" TEXT NOT NULL,
    "admin_challenge_id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "impersonated_tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_events" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "platform_role" "PlatformRoleType" NOT NULL,
    "admin_device_id" TEXT,
    "admin_device_fingerprint" TEXT,
    "action" "AdminAuditAction" NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "tenant_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PlatformRoleType" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "StaffInvitationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_user_id_key" ON "platform_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_devices_public_key_fingerprint_key" ON "admin_devices"("public_key_fingerprint");

-- CreateIndex
CREATE INDEX "admin_devices_admin_user_id_idx" ON "admin_devices"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_challenges_nonce_key" ON "admin_challenges"("nonce");

-- CreateIndex
CREATE INDEX "admin_challenges_user_id_created_at_idx" ON "admin_challenges"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_admin_challenge_id_key" ON "admin_sessions"("admin_challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_session_token_key" ON "admin_sessions"("session_token");

-- CreateIndex
CREATE INDEX "admin_sessions_user_id_expires_at_idx" ON "admin_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_actor_user_id_created_at_idx" ON "admin_audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_action_created_at_idx" ON "admin_audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_tenant_id_created_at_idx" ON "admin_audit_events"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_key" ON "staff_invitations"("token");

-- CreateIndex
CREATE INDEX "staff_invitations_token_idx" ON "staff_invitations"("token");

-- CreateIndex
CREATE INDEX "staff_invitations_email_status_idx" ON "staff_invitations"("email", "status");

-- AddForeignKey
ALTER TABLE "admin_devices" ADD CONSTRAINT "admin_devices_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "platform_roles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_challenges" ADD CONSTRAINT "admin_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_roles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_roles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_device_id_fkey" FOREIGN KEY ("admin_device_id") REFERENCES "admin_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_challenge_id_fkey" FOREIGN KEY ("admin_challenge_id") REFERENCES "admin_challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
