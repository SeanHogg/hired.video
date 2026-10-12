/**
 * State + service wiring for the posting agent tab (#2300 / #2814 / #2826).
 */
import { useCallback, useEffect, useState } from "react";
import { serverErrorCode } from "@/lib/errors";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { prepareAgentClip } from "@/lib/studio/prepare-agent-clip";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import {
  distributionService,
  type PostingAgentDraftDto,
  type PostingAgentSettingsDto,
} from "@/lib/services/distribution-service";

function settingsPatch(form: PostingAgentSettingsDto) {
  return {
    mode: form.mode,
    cadence: form.cadence,
    postMinute: form.postMinute,
    destinations: form.destinations,
    quietStartMinute: form.quietStartMinute,
    quietEndMinute: form.quietEndMinute,
    emailDigest: form.emailDigest,
  };
}

export function usePostingAgent() {
  const { isPro, loading: subLoading } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  const [settings, setSettings] = useState<PostingAgentSettingsDto | null>(null);
  const [drafts, setDrafts] = useState<PostingAgentDraftDto[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [outOfTokens, setOutOfTokens] = useState(false);
  const [proRequired, setProRequired] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [nextSettings, nextDrafts] = await Promise.all([
        distributionService.getPostingAgentSettings(),
        distributionService.listPostingAgentDrafts(),
      ]);
      setSettings(nextSettings);
      setDrafts(nextDrafts);
      setCaptions(Object.fromEntries(nextDrafts.map((d) => [d.id, d.caption])));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setSaveError(false);
      setOutOfTokens(false);
      setProRequired(false);
      try {
        await fn();
        await load();
      } catch (err) {
        const code = serverErrorCode(err);
        if (code === "INSUFFICIENT_TOKENS") setOutOfTokens(true);
        else if (code === "PRO_REQUIRED") setProRequired(true);
        else setSaveError(true);
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const save = useCallback(() => {
    if (!settings) return;
    void run("save", async () => {
      setSettings(await distributionService.savePostingAgentSettings(settingsPatch(settings)));
    });
  }, [run, settings]);

  const start = useCallback(() => {
    if (!settings) return;
    void run("start", async () => {
      setSettings(await distributionService.startPostingAgent(settingsPatch(settings)));
    });
  }, [run, settings]);

  const pause = useCallback(() => {
    void run("pause", async () => {
      setSettings(await distributionService.pausePostingAgent());
    });
  }, [run]);

  const toggleEnabled = useCallback(
    (on: boolean) => {
      if (!settings) return;
      void run(on ? "start" : "pause", async () => {
        if (on) {
          setSettings(await distributionService.startPostingAgent(settingsPatch(settings)));
        } else {
          setSettings(await distributionService.pausePostingAgent());
        }
      });
    },
    [run, settings],
  );

  const setCaption = useCallback((id: string, value: string) => {
    setCaptions((prev) => ({ ...prev, [id]: value }));
  }, []);

  const approve = useCallback(
    (draft: PostingAgentDraftDto) => {
      void run(`approve-${draft.id}`, async () => {
        const next = captions[draft.id] ?? draft.caption;
        if (next !== draft.caption) {
          await distributionService.rewritePostingAgentDraft(draft.id, next);
        }
        // Omit the optional variant id so callers (and tests) see a 1-arg call.
        if (draft.renderVariantId) {
          await distributionService.approvePostingAgentDraft(draft.id, draft.renderVariantId);
        } else {
          await distributionService.approvePostingAgentDraft(draft.id);
        }
      });
    },
    [captions, run],
  );

  const prepareClips = useCallback(() => {
    void run("prepare", async () => {
      const pending = drafts.filter((d) => d.needsClip && d.variantKey);
      if (pending.length === 0) return;
      const includeBranding = shouldShowBranding({ isPro, removeBrandingFlag: removeBranding });
      for (let i = 0; i < pending.length; i++) {
        const draft = pending[i]!;
        setPrepareProgress(Math.round((i / pending.length) * 100));
        const variantId = await prepareAgentClip({
          projectId: draft.projectId,
          variantKey: draft.variantKey!,
          includeBranding,
          onProgress: (p) => {
            setPrepareProgress(Math.round(((i + p) / pending.length) * 100));
          },
        });
        await distributionService.preparePostingAgentDraft(draft.id, variantId);
      }
      setPrepareProgress(100);
    });
  }, [drafts, isPro, removeBranding, run]);

  const skip = useCallback((id: string) => {
    void run(`skip-${id}`, async () => {
      await distributionService.skipPostingAgentDraft(id);
    });
  }, [run]);

  const rewrite = useCallback((id: string) => {
    // R13: wrap so run() receives Promise<void>, not Promise<{ rewritten }>.
    void run(`rewrite-${id}`, async () => {
      await distributionService.rewritePostingAgentDraft(id);
    });
  }, [run]);

  const undo = useCallback((id: string) => {
    void run(`undo-${id}`, async () => {
      await distributionService.undoPostingAgentDraft(id);
    });
  }, [run]);

  const approveAll = useCallback(() => {
    void run("approve-all", async () => {
      await distributionService.approveAllPostingAgentDrafts();
    });
  }, [run]);

  return {
    isPro,
    subLoading,
    settings,
    setSettings,
    drafts,
    captions,
    busy,
    loadError,
    saveError,
    outOfTokens,
    proRequired,
    save,
    start,
    pause,
    toggleEnabled,
    setCaption,
    prepareClips,
    prepareProgress,
    approve,
    skip,
    rewrite,
    undo,
    approveAll,
  };
}
