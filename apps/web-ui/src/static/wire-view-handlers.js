/**
 * Binds every `data-action` / `data-filter` element in the freshly rendered
 * markup to its handler.
 *
 * Called after each `render()`, against markup that was just replaced, so it
 * re-binds from scratch every time rather than tracking listeners.
 *
 * Split from `start-app.js` at 678 lines: dispatching a view and wiring its
 * controls are two subjects, and the repo's coding guidelines flag anything over
 * ~600 lines. Everything here is one shape — find elements, attach a listener,
 * call a `views/` handler with `ctx` — and nothing here decides what to render.
 *
 * The confirm() calls for destructive actions live at these wiring sites rather
 * than inside the handlers, so a handler called directly is never silently
 * gated by a dialog a test cannot see.
 */

import { handleProjectIndex, handleProjectReset } from "./views/projects.js";
import {
  handleMemoryEdit,
  handleMemoryDelete,
  handleMemoryCreate,
  handleMemoryDeleteProjectOpen,
  handleMemoryDeleteProjectCancel,
  handleMemoryDeleteProject,
} from "./views/memory.js";
import { handleHandoffCreate, handleHandoffAction } from "./views/handoffs.js";
import { handleProposalAction } from "./views/proposals.js";
import { handleCheckpointCreate, handleCheckpointDelete } from "./views/checkpoints.js";
import { handleLogsLiveToggle, handleLogsExport } from "./views/logs.js";
import { handleConfigSave, handleConfigReveal, handleServerRestart } from "./views/config.js";
import { handleProfilesTabSwitch, handleProfileSwitch } from "./views/profiles.js";
import { joinModelId } from "./views/registry.js";
import {
  handleRegistryCellEdit,
  handleRegistryHostDefaultEdit,
  handleRegistryAgentTierEdit,
  handleRegistryWorkflowTierEdit,
  handleRegistryFormToggle,
  handleRegistryFormCancel,
  handleRegistryWorkflowTierAdd,
  handleRegistryWorkflowTierRemove,
  handleRegistryAddProfile,
  handleRegistryDuplicateProfile,
  handleRegistryDeleteProfile,
  handleRegistryRestore,
  handleRegistryClearOverlay,
  handleRegistrySaveAndApply,
} from "./views/registry-state.js";

export function wireViewHandlers(ctx) {
  const { root, state, render } = ctx;
  // memory filters
  root.querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("change", () => {
      state.memoryFilters[el.dataset.filter] = el.value;
    });
  });
  root.querySelector('[data-action="memory-refresh"]')?.addEventListener("click", () => {
    state.memoryOffset = 0;
    render();
  });
  root.querySelector('[data-action="memory-prev"]')?.addEventListener("click", () => {
    state.memoryOffset = Math.max(0, state.memoryOffset - 50);
    render();
  });
  root.querySelector('[data-action="memory-next"]')?.addEventListener("click", () => {
    state.memoryOffset += 50;
    render();
  });
  // logs filters (T14, LOG-13). The Live toggle (`logs-live-toggle`) and
  // Export button (`logs-export`) are wired below, in the ctx-scoped block
  // (T15, LOG-14, LOG-15) — their handlers take `ctx`, like every other
  // admin-portal handler, so they are unit-testable outside this closure.
  root.querySelectorAll("[data-logs]").forEach((el) => {
    el.addEventListener("change", () => {
      const field = el.dataset.logs;
      if (field === "from") state.logsFrom = el.value;
      else if (field === "to") state.logsTo = el.value;
      else if (field === "level") state.logsLevel = el.value;
      else if (field === "q") state.logsQuery = el.value;
    });
  });
  root.querySelector('[data-action="logs-refresh"]')?.addEventListener("click", () => {
    render();
  });
  // write mode: memory edit/delete
  root.querySelectorAll('[data-action="memory-edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      handleMemoryEdit(ctx, id);
    });
  });
  root.querySelectorAll('[data-action="memory-delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (confirm("Delete this memory? This cannot be undone.")) {
        handleMemoryDelete(ctx, id);
      }
    });
  });
  // write mode: proposal approve/reject
  root.querySelectorAll('[data-action="proposal-approve"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      handleProposalAction(ctx, id, "approve");
    });
  });
  root.querySelectorAll('[data-action="proposal-reject"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      handleProposalAction(ctx, id, "reject");
    });
  });
  // search
  const q = root.querySelector('[data-bind="query"]');
  if (q) {
    q.addEventListener("input", () => {
      state.searchQuery = q.value;
    });
  }
  root.querySelector('[data-action="search-run"]')?.addEventListener("click", () => {
    render();
  });
  // write mode: memory create
  root.querySelector('[data-action="memory-create"]')?.addEventListener("click", () => {
    handleMemoryCreate(ctx);
  });
  // write mode: handoff create/accept/cancel
  root.querySelector('[data-action="handoff-create"]')?.addEventListener("click", () => {
    handleHandoffCreate(ctx);
  });
  root.querySelectorAll('[data-action="handoff-accept"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      handleHandoffAction(ctx, id, "accept");
    });
  });
  root.querySelectorAll('[data-action="handoff-cancel"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      if (confirm("Cancel handoff " + id + "? This cannot be undone.")) {
        handleHandoffAction(ctx, id, "cancel");
      }
    });
  });
  // write mode: checkpoint create/edit/delete
  root.querySelector('[data-action="checkpoint-create"]')?.addEventListener("click", () => {
    handleCheckpointCreate(ctx);
  });
  root.querySelectorAll('[data-action="checkpoint-edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const taskId = btn.dataset.task || "";
      const status = btn.dataset.status || "pending";
      const checkpointType = btn.dataset.checkpointType || btn.dataset.type || "manual";
      const description = btn.dataset.description || "";
      const progress = btn.dataset.progress || "0";
      const step = btn.dataset.step || "";
      const total = btn.dataset.total || "";
      const completed = btn.dataset.completed || "";
      const form = root.querySelector('[data-form="checkpoint-create"]');
      if (!form) return;
      const setField = (name, value) => {
        const el = form.querySelector('[data-create="' + name + '"]');
        if (el) el.value = value;
      };
      setField("taskId", taskId);
      setField("status", status);
      setField("checkpointType", checkpointType);
      setField("description", description);
      setField("progressPercent", progress);
      setField("currentStep", step);
      setField("totalSteps", total);
      setField("completedSteps", completed);
      const header = form.querySelector("h3");
      if (header) header.textContent = "Edit Checkpoint (create new to save)";
    });
  });
  root.querySelectorAll('[data-action="checkpoint-delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const task = btn.dataset.task || "";
      if (!id) return;
      if (confirm("Delete checkpoint " + id + " (task: " + task + ")? This cannot be undone.")) {
        handleCheckpointDelete(ctx, id);
      }
    });
  });
  // write mode: project index/reset
  root.querySelector('[data-action="project-index"]')?.addEventListener("click", () => {
    handleProjectIndex(ctx);
  });
  root.querySelectorAll('[data-action="project-reset"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const project = btn.dataset.project;
      if (!project) return;
      if (confirm("Delete project " + project + "? This removes its indexed vectors, symbols and memories permanently. This cannot be undone.")) {
        handleProjectReset(ctx, project);
      }
    });
  });
  // admin-portal-enhancements: config save/reveal
  // ctx is this function's parameter — the handlers below all take it.
  // admin-portal-ops-suite (T2, MBD-03..06): memory bulk-delete open/confirm/cancel
  root.querySelectorAll('[data-action="memory-delete-project"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      handleMemoryDeleteProjectOpen(ctx);
    });
  });
  root.querySelectorAll('[data-action="memory-delete-project-confirm"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      handleMemoryDeleteProject(ctx);
    });
  });
  root.querySelectorAll('[data-action="memory-delete-project-cancel"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      handleMemoryDeleteProjectCancel(ctx);
    });
  });
  // admin-portal-ops-suite (T15, LOG-14, LOG-15): Logs tab Live toggle +
  // Export. `change`, not `click` — a checkbox's real signal — and the
  // handler re-reads `.checked` from the DOM rather than trusting the
  // event, so the fake-DOM harness's synthetic firing (a generic child
  // whose `checked` is always falsy) can only ever turn Live off.
  root.querySelector('[data-action="logs-live-toggle"]')?.addEventListener("change", () => {
    handleLogsLiveToggle(ctx);
  });
  root.querySelector('[data-action="logs-export"]')?.addEventListener("click", () => {
    handleLogsExport(ctx);
  });
  root.querySelectorAll('[data-action="config-save"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      if (!section) return;
      handleConfigSave(ctx, section);
    });
  });
  root.querySelectorAll('[data-action="config-reveal"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (!target) return;
      handleConfigReveal(ctx, target, btn.dataset.section, btn.dataset.field);
    });
  });
  // admin-portal-restart (APR-04): server restart button
  root.querySelectorAll('[data-action="server-restart"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      handleServerRestart(ctx);
    });
  });
  // admin-portal-enhancements: profiles tab switcher + switch
  root.querySelectorAll('[data-action="profiles-tab"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      handleProfilesTabSwitch(ctx, tab);
    });
  });
  root.querySelectorAll('[data-action="profile-switch"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const profile = btn.dataset.profile;
      const host = btn.dataset.host;
      if (!profile) return;
      handleProfileSwitch(ctx, profile, host);
    });
  });
  // admin-portal-enhancements: registry in-memory CRUD + save/clear
  root.querySelectorAll('[data-action="registry-effort"]').forEach((el) => {
    el.addEventListener("change", () => {
      handleRegistryCellEdit(ctx, el.dataset.profile, el.dataset.host, el.dataset.tier, "effort", el.value);
    });
  });
  // Provider + Model split fields (design D-4.2, APUX-14): either input's
  // change reads BOTH sibling fields from their shared .registry-cell and
  // joins them into the one string the overlay stores. `closest` is guarded
  // (absent/no-match in the test fake DOM) rather than assumed present.
  root.querySelectorAll('[data-action="registry-provider"], [data-action="registry-model"]').forEach((el) => {
    el.addEventListener("change", () => {
      const cell = typeof el.closest === "function" ? el.closest(".registry-cell") : null;
      const sibling = cell && cell.querySelectorAll
        ? cell.querySelectorAll('[data-action="' + (el.dataset.action === "registry-provider" ? "registry-model" : "registry-provider") + '"]')[0]
        : null;
      const providerVal = el.dataset.action === "registry-provider" ? el.value : (sibling ? sibling.value : "");
      const modelVal = el.dataset.action === "registry-model" ? el.value : (sibling ? sibling.value : "");
      handleRegistryCellEdit(ctx, el.dataset.profile, el.dataset.host, el.dataset.tier, "model", joinModelId(providerVal, modelVal));
    });
  });
  root.querySelectorAll('[data-action="registry-hostDefault"]').forEach((el) => {
    el.addEventListener("change", () => {
      handleRegistryHostDefaultEdit(ctx, el.dataset.host, el.value);
    });
  });
  root.querySelectorAll('[data-action="registry-agentTier"]').forEach((el) => {
    el.addEventListener("change", () => {
      handleRegistryAgentTierEdit(ctx, el.dataset.agent, el.dataset.host, el.value);
    });
  });
  root.querySelectorAll('[data-action="registry-workflowTier"]').forEach((el) => {
    el.addEventListener("change", () => {
      handleRegistryWorkflowTierEdit(ctx, el.dataset.workflow, el.value);
    });
  });
  // T7 (APUX-12, D-4.4): trigger buttons toggle the corresponding inline
  // form instead of invoking the prompt()-driven handler directly.
  root.querySelector('[data-action="registry-workflowTier-add"]')?.addEventListener("click", () => {
    handleRegistryFormToggle(ctx, "add-workflow");
  });
  root.querySelectorAll('[data-action="registry-workflowTier-remove"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      handleRegistryWorkflowTierRemove(ctx, btn.dataset.workflow);
    });
  });
  root.querySelector('[data-action="registry-add-profile"]')?.addEventListener("click", () => {
    handleRegistryFormToggle(ctx, "add-profile");
  });
  root.querySelector('[data-action="registry-duplicate-profile"]')?.addEventListener("click", () => {
    handleRegistryFormToggle(ctx, "duplicate-profile");
  });
  root.querySelector('[data-action="registry-delete-profile"]')?.addEventListener("click", () => {
    handleRegistryFormToggle(ctx, "delete-profile");
  });
  root.querySelector('[data-action="registry-form-cancel"]')?.addEventListener("click", () => {
    handleRegistryFormCancel(ctx);
  });
  root.querySelector('[data-action="registry-form-submit"]')?.addEventListener("click", () => {
    const kind = ctx.state.registryForm && ctx.state.registryForm.kind;
    if (kind === "add-workflow") {
      const workflow = root.querySelector('[data-action="registry-form-workflow"]')?.value;
      const tier = root.querySelector('[data-action="registry-form-tier"]')?.value;
      handleRegistryWorkflowTierAdd(ctx, workflow, tier);
    } else if (kind === "duplicate-profile") {
      const source = root.querySelector('[data-action="registry-form-source"]')?.value;
      const newName = root.querySelector('[data-action="registry-form-new-name"]')?.value;
      handleRegistryDuplicateProfile(ctx, source, newName);
    } else if (kind === "delete-profile") {
      const profile = root.querySelector('[data-action="registry-form-profile"]')?.value;
      handleRegistryDeleteProfile(ctx, profile);
    } else if (kind === "add-profile") {
      const name = root.querySelector('[data-action="registry-form-name"]')?.value;
      const description = root.querySelector('[data-action="registry-form-description"]')?.value;
      handleRegistryAddProfile(ctx, name, description);
    }
  });
  root.querySelectorAll('[data-action="registry-restore"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const profile = btn.dataset.profile;
      if (!profile) return;
      handleRegistryRestore(ctx, profile);
    });
  });
  root.querySelector('[data-action="registry-save-apply"]')?.addEventListener("click", () => {
    handleRegistrySaveAndApply(ctx);
  });
  root.querySelector('[data-action="registry-clear-overlay"]')?.addEventListener("click", () => {
    handleRegistryClearOverlay(ctx);
  });
}
