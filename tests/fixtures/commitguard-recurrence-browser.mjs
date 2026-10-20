// Synthetic real-workspace harness: no Next server, auth, DB, or external APIs.
import { build } from "esbuild"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { CommitGuardWorkspace } from "@/components/dashboard/commitguard/CommitGuardWorkspace";
    import { validateCommitmentScheduleWrite } from "@/lib/commitguard/commitmentSchedule";
    let commitment = {id: "legacy-1", name: "Legacy custom expense", category: "software",
      amountCents: 1000, frequency: "custom", nextDueDate: "2026-10-20T00:00:00.000Z",
      confidence: "confirmed", status: "active"};
    const writes = [];
    globalThis.fetch = async (url, init) => {
      if (url === "/api/commitguard/commitments/legacy-1" && init?.method === "PATCH") {
        const patch = JSON.parse(init.body);
        writes.push(patch);
        document.getElementById("writes").textContent = JSON.stringify(writes);
        if (patch.frequency === "custom") throw new Error("Custom must never be submitted");
        try {
          validateCommitmentScheduleWrite({...patch, nextDueDate: patch.nextDueDate ? new Date(patch.nextDueDate) : undefined}, {
            startDate: new Date("2026-10-19Z"), endDate: new Date("2026-10-25Z"), nextDueDate: new Date(commitment.nextDueDate)
          });
        } catch (error) {
          return Response.json({error: error.flatten()}, {status: 400});
        }
        commitment = {...commitment, ...patch};
        return Response.json({commitment});
      }
      if (url === "/api/commitguard/commitments" && !init?.method) return Response.json({commitments: [commitment]});
      throw new Error("Unexpected synthetic request: " + url);
    };
    createRoot(document.getElementById("root")).render(createElement(CommitGuardWorkspace, {
      initialCommitments: [commitment], initialDetectedCandidates: [], detectionEnabled: false
    }));
  ` },
})
createServer((request, response) => {
  if (request.url === "/component.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents)
    return
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic legacy recurrence editor</title></head><body><p>SYNTHETIC COMPONENT ONLY — no real API or database.</p><output id="writes" aria-label="Synthetic writes">[]</output><main id="root"></main><script type="module" src="/component.js"></script></body></html>`)
}).listen(4181, "127.0.0.1", () => console.log("Synthetic workspace: http://127.0.0.1:4181"))