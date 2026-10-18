"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { billingResultNavigation, createBillingClientOperation, pollBillingOperation, type BillingClientProps, type BillingClientState, type BillingRequest } from "@/lib/billing/clientOperation"

const initialState: BillingClientState = { intent: null, busy: false, phase: "idle", canReconcile: false, message: null }

export function useBillingOperation(props: BillingClientProps): {
  state: BillingClientState; loading: boolean; start: (request: BillingRequest) => Promise<void>;
  check: () => Promise<void>; reconcile: () => Promise<void>; beginNewIntent: () => void;
} {
  const router = useRouter()
  const [state, setState] = useState(initialState)
  const [ready, setReady] = useState(false)
  const [initializedScope, setInitializedScope] = useState<string | null>(null)
  const operationId = state.intent?.operationId
  const sessionReady = ready && initializedScope === props.billingSessionScope
  const controller = useRef<ReturnType<typeof createBillingClientOperation> | null>(null)
  useEffect(() => {
    // A transient claims failure must not erase a potentially accepted request.
    if (!props.billingSessionScope) return
    let mounted = true
    // Access storage lazily: SSR never reads it. A denied storage getter fails closed.
    const storage = {
      getItem: (key: string) => sessionStorage.getItem(key),
      setItem: (key: string, value: string) => sessionStorage.setItem(key, value),
      removeItem: (key: string) => sessionStorage.removeItem(key),
    }
    const operation = createBillingClientOperation({
      scope: props.billingSessionScope, storage, fetch, uuid: () => crypto.randomUUID(),
      changed: (next) => { if (mounted) setState(next) }, refresh: () => { if (mounted) router.refresh() },
      success: (result) => {
        if (!mounted) return
        const destination = billingResultNavigation(result, window.location.origin)
        if (destination) window.location.assign(destination)
        else router.refresh()
      },
    })
    controller.current = operation
    // Restore only identifiers/intent; successful URLs are fetched again from the own-status API.
    let identity: string | null = null
    let invalidated = false
    const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
      if (!mounted || invalidated) return
      // Decode only for local scope comparison, not identity/authorization. The
      // server derived the expected scope from verified claims; APIs still getUser.
      let nextIdentity: string | null = null
      try {
        if (session) {
          const payload: unknown = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
          if (typeof payload === "object" && payload !== null && "session_id" in payload && typeof payload.session_id === "string") {
            nextIdentity = `billing-client/v1:${session.user.id}:${payload.session_id}`
          }
        }
      } catch { /* Unreadable token scope fails closed, never dispatches. */ }
      if (event === "SIGNED_OUT" || !nextIdentity || (identity !== null && identity !== nextIdentity)) {
        invalidated = true; identity = null
        operation.clearSession(); setReady(false); router.refresh()
        return
      }
      identity = nextIdentity
      // Browser identity is only a storage/lifecycle check, never API authority.
      void crypto.subtle.digest("SHA-256", new TextEncoder().encode(nextIdentity)).then((digest) => {
        if (!mounted || invalidated || identity !== nextIdentity) return
        const scope = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
        if (scope !== props.billingSessionScope) { invalidated = true; operation.clearSession(); setReady(false); router.refresh(); return }
        setState(operation.state()); setInitializedScope(scope); setReady(true)
      }).catch(() => { if (mounted) { operation.clearSession(); setReady(false) } })
    })
    return () => { mounted = false; operation.dispose(); subscription.unsubscribe(); controller.current = null }
  }, [props.billingSessionScope, router])

  // Poll once per newly accepted identity, not per response/status change.
  useEffect(() => {
    const operation = controller.current
    if (!sessionReady || !operationId || !operation) return
    const abort = new AbortController()
    void pollBillingOperation(operation, abort.signal, (signal) => new Promise<void>((resolve) => {
      const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }
      const timer = setTimeout(done, 2000)
      signal.addEventListener("abort", done, { once: true })
    }))
    return () => abort.abort()
  }, [sessionReady, operationId])

  return {
    state: !props.billingSessionScope
      ? { ...initialState, message: "Billing session details are unavailable. Refresh this page or sign in again before making a request. Any saved request has been retained." }
      : initializedScope === props.billingSessionScope ? state : initialState,
    loading: !sessionReady || state.busy,
    start: async (request) => { if (sessionReady) await controller.current?.start(request, props.billingAccessVersion) },
    check: async () => { if (sessionReady) await controller.current?.check() },
    reconcile: async () => { if (sessionReady) await controller.current?.reconcile() },
    beginNewIntent: () => { if (sessionReady) controller.current?.beginNewIntent() },
  }
}