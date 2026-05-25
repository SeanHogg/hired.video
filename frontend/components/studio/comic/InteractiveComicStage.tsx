/**
 * InteractiveComicStage — branching-graph editor surface for
 * `mediaKind: "interactive_comic"` (#929). Mounts ALONGSIDE the
 * existing linear-comic CanvasState authoring (pages = scenes) and
 * adds a graph-overlay view where the user can:
 *   1) See every page as a node
 *   2) Wire branches from one page to another via the "Add branch"
 *      affordance per page
 *   3) Edit the branch labels + required/forbidden flags + flags-to-set
 *
 * Layout: a left-side strip lists every page (ordered by `pageNumber`)
 * + a right-side panel shows the active page's branches. The scene
 * rail on the editor shell still drives page selection — this stage
 * is the BRANCH editor, not the panel editor.
 *
 * Per the DRY rule the underlying graph mutators live ONCE here; the
 * exporter + reader runtime read the same `InteractiveComicState`
 * shape without touching this component.
 */
import { useState } from "react";
import { Plus, Trash2, Flag } from "lucide-react";
import type { ChoiceBranch, InteractiveComicState, InteractiveComicPage } from "@shared/interactive-comic-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InteractiveComicStageProps {
  state: InteractiveComicState;
  onChange: (next: InteractiveComicState) => void;
}

export default function InteractiveComicStage({ state, onChange }: InteractiveComicStageProps) {
  const [activePageId, setActivePageId] = useState<string>(state.startPageId);
  const activePage = state.pages.find((p) => p.id === activePageId) ?? state.pages[0];

  const setBranches = (pageId: string, branches: ChoiceBranch[]): void => {
    onChange({
      ...state,
      pages: state.pages.map((p) => (p.id === pageId ? { ...p, branches } : p)),
    });
  };

  const addBranch = (pageId: string): void => {
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return;
    const next: ChoiceBranch = {
      id: `branch-${Math.random().toString(36).slice(2, 10)}`,
      label: "Continue",
      targetPageId: state.pages[0]?.id ?? "",
    };
    setBranches(pageId, [...(page.branches ?? []), next]);
  };

  const addPage = (): void => {
    const page: InteractiveComicPage = {
      id: `page-${Math.random().toString(36).slice(2, 10)}`,
      pageNumber: state.pages.length + 1,
      spec: null,
    };
    onChange({ ...state, pages: [...state.pages, page] });
    setActivePageId(page.id);
  };

  if (!activePage) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Button onClick={addPage}>Add first page</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-50">
      <div className="w-48 border-r bg-background">
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Pages</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addPage} aria-label="Add page">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1 p-1">
          {state.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePageId(p.id)}
              className={`block w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                p.id === activePageId ? "bg-indigo-600 text-white" : "hover:bg-accent"
              }`}
            >
              Page {p.pageNumber}
              {p.branches && p.branches.length > 1 && (
                <span className="ml-1 inline-block rounded bg-amber-200 px-1 text-[9px] text-amber-900">
                  {p.branches.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Branches from Page {activePage.pageNumber}
          </h2>
          <Button size="sm" onClick={() => addBranch(activePage.id)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add branch
          </Button>
        </div>
        {(activePage.branches ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No branches yet — reader will fall through to the next page by index.
          </p>
        ) : (
          <div className="space-y-2">
            {(activePage.branches ?? []).map((branch, idx) => (
              <BranchEditor
                key={branch.id}
                branch={branch}
                pages={state.pages}
                onChange={(next) => {
                  const all = [...(activePage.branches ?? [])];
                  all[idx] = next;
                  setBranches(activePage.id, all);
                }}
                onDelete={() => {
                  const all = (activePage.branches ?? []).filter((b) => b.id !== branch.id);
                  setBranches(activePage.id, all);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface BranchEditorProps {
  branch: ChoiceBranch;
  pages: InteractiveComicPage[];
  onChange: (next: ChoiceBranch) => void;
  onDelete: () => void;
}

function BranchEditor({ branch, pages, onChange, onDelete }: BranchEditorProps) {
  return (
    <div className="rounded border border-border bg-background p-2">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={branch.label}
          onChange={(e) => onChange({ ...branch, label: e.target.value })}
          placeholder="Choice label (e.g. 'Take the deal')"
          className="flex-1 text-xs"
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} aria-label="Delete branch">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Target page
          <select
            value={branch.targetPageId}
            onChange={(e) => onChange({ ...branch, targetPageId: e.target.value })}
            className="mt-0.5 block h-7 w-full rounded border border-border bg-background px-1 text-xs"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>Page {p.pageNumber}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <Flag className="inline h-3 w-3" /> Flags to set (comma)
          <Input
            value={(branch.flagsToSet ?? []).join(",")}
            onChange={(e) =>
              onChange({
                ...branch,
                flagsToSet: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            className="mt-0.5 h-7 text-xs"
            placeholder="key,key2"
          />
        </label>
      </div>
    </div>
  );
}
