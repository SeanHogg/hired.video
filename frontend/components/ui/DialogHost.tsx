import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type DialogRequest,
  resolveDialog,
  useDialogStore,
} from "@/lib/dialogs";

/**
 * Single host for the imperative dialog system (see `lib/dialogs.ts`).
 * Mounted once near `<Toaster />` in `App.tsx`; renders the active request
 * from the queue. This is the branded replacement for `window.alert` /
 * `window.confirm` / `window.prompt`.
 */
export function DialogHost() {
  const { dialogs } = useDialogStore();
  const active = dialogs[0] ?? null;
  if (!active) return null;
  // Key by id so each request mounts a fresh subtree (resets prompt input
  // state and replays the enter animation between queued dialogs).
  return <ActiveDialog key={active.id} request={active} />;
}

function ActiveDialog({ request }: { request: DialogRequest }) {
  if (request.kind === "prompt") {
    return <PromptDialogView request={request} />;
  }

  const isConfirm = request.kind === "confirm";
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        // Closing via overlay/escape counts as cancel (confirm) or
        // acknowledge (alert).
        if (!open) resolveDialog(request.id, isConfirm ? false : null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          {request.description && (
            <AlertDialogDescription>
              {request.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {isConfirm && (
            <AlertDialogCancel onClick={() => resolveDialog(request.id, false)}>
              {request.cancelText ?? "Cancel"}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            className={cn(
              isConfirm &&
                request.destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={() => resolveDialog(request.id, isConfirm ? true : null)}
          >
            {request.confirmText ?? (isConfirm ? "Confirm" : "OK")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PromptDialogView({
  request,
}: {
  request: Extract<DialogRequest, { kind: "prompt" }>;
}) {
  const [value, setValue] = React.useState(request.defaultValue ?? "");
  const trimmed = value.trim();
  const disabled = request.required ? trimmed.length === 0 : false;

  const submit = () => {
    if (disabled) return;
    resolveDialog(request.id, value);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) resolveDialog(request.id, null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          {request.description && (
            <DialogDescription>{request.description}</DialogDescription>
          )}
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {request.label && (
            <Label htmlFor={request.id}>{request.label}</Label>
          )}
          {request.multiline ? (
            <Textarea
              id={request.id}
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
            />
          ) : (
            <Input
              id={request.id}
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => resolveDialog(request.id, null)}
          >
            {request.cancelText ?? "Cancel"}
          </Button>
          <Button type="button" disabled={disabled} onClick={submit}>
            {request.confirmText ?? "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
