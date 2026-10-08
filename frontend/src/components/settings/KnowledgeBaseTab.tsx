"use client";

import { useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useLocale } from "@/context/LocaleContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ApiError } from "@/lib/apiClient";
import {
  deleteKnowledgeDocument,
  getKnowledgeStatus,
  KNOWLEDGE_FILE_TYPES,
  listKnowledgeDocuments,
  reindexKnowledge,
  uploadKnowledgeDocument,
  type KnowledgeDocument,
} from "@/lib/assistant";
import { resolveImageUrl } from "@/lib/images";
import { listLedgerEntities } from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/Spinner";
import { SettingsCard, SettingsField } from "./SettingsCard";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Settings > "Knowledge base" — the company documents the assistant
 * searches (supplier contracts, price lists, policies). Business records
 * (suppliers, products, expenses…) are indexed automatically; this is for
 * what isn't already in the system.
 */
export function KnowledgeBaseTab() {
  const { t } = useLocale();
  const { brand, brands } = useWorkspace();
  const status = useSWR("knowledge-status", getKnowledgeStatus);
  const documents = useSWR("knowledge-documents", listKnowledgeDocuments);
  const suppliers = useSWR(["ledger-entities", brand.id], () => listLedgerEntities(brand.id));

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"workspace" | "all">("workspace");
  const [supplierId, setSupplierId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);

  const recordCount = Object.values(status.data?.records ?? {}).reduce((sum, count) => sum + count, 0);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("File must be 8MB or smaller"));
      return;
    }
    setUploading(true);
    try {
      const document = await uploadKnowledgeDocument(file, {
        title,
        // A supplier's document belongs to that supplier's workspace.
        brandId: scope === "workspace" || supplierId ? brand.id : null,
        ledgerEntityId: supplierId || null,
      });
      toast.success(`${t("Added to the knowledge base")}: ${document.title}`);
      setFile(null);
      setTitle("");
      setSupplierId("");
      void documents.mutate();
      void status.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setUploading(false);
    }
  }

  async function reindex() {
    setReindexing(true);
    try {
      const result = await reindexKnowledge();
      toast.success(t(result.indexed || result.removed ? "Knowledge base updated" : "Knowledge base is already up to date"));
      void status.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setReindexing(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteKnowledgeDocument(deleting.id);
      toast.success(t("Document removed"));
      void documents.mutate();
      void status.mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Something went wrong — please try again"));
    } finally {
      setDeleting(null);
    }
  }

  const scopeLabel = (doc: KnowledgeDocument) =>
    doc.brandId ? (brands.find((candidate) => candidate.id === doc.brandId)?.code ?? "—") : t("All workspaces");

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        title={t("What the assistant knows")}
        description={t("The assistant searches these documents and every business record before answering, in Arabic or English.")}
        footer={
          <Button type="button" variant="outline" size="sm" onClick={() => void reindex()} disabled={reindexing || status.data?.enabled === false}>
            {reindexing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t("Re-index records now")}
          </Button>
        }
      >
        {status.isLoading ? (
          <Spinner label={t("Loading...")} />
        ) : status.data?.enabled === false ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{t("The knowledge base is turned off on the server (KNOWLEDGE_ENABLED=false).")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{t("Documents")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{status.data?.documents ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{t("Business records indexed")}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{recordCount}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-slate-500 dark:text-slate-400">{t("Updated")}</dt>
              <dd className="text-sm text-slate-700 dark:text-slate-300">{t("Automatically, every few minutes")}</dd>
            </div>
          </dl>
        )}
      </SettingsCard>

      <SettingsCard
        as="form"
        onSubmit={(event) => void upload(event)}
        title={t("Add a document")}
        description={t("Supplier contracts, price lists, policies — a PDF, a text file, or a photo of the page (it will be transcribed).")}
        footer={
          <Button type="submit" size="sm" disabled={!file || uploading}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {uploading ? t("Reading and indexing…") : t("Add to knowledge base")}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label={t("File")} className="sm:col-span-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <FileText className="size-3.5" />
                {t("Choose file")}
              </Button>
              <span dir="auto" className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-300">
                {file ? file.name : t("PDF, TXT, MD, CSV, JPEG, PNG or WEBP — up to 8MB")}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={KNOWLEDGE_FILE_TYPES}
                hidden
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </div>
          </SettingsField>
          <SettingsField label={t("Title")} htmlFor="kb-title" hint={t("Optional — defaults to the file name")}>
            <Input id="kb-title" dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} disabled={uploading} />
          </SettingsField>
          <SettingsField label={t("Applies to")} htmlFor="kb-scope">
            <Select id="kb-scope" value={supplierId ? "workspace" : scope} onChange={(event) => setScope(event.target.value as "workspace" | "all")} disabled={uploading || Boolean(supplierId)}>
              <option value="workspace">{brand.name}</option>
              <option value="all">{t("All workspaces")}</option>
            </Select>
          </SettingsField>
          <SettingsField label={t("About a supplier")} htmlFor="kb-supplier" hint={t("Optional — links e.g. a contract to the supplier it's with")} className="sm:col-span-2">
            <Select id="kb-supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={uploading}>
              <option value="">{t("None")}</option>
              {(suppliers.data ?? []).map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </Select>
          </SettingsField>
        </div>
      </SettingsCard>

      <SettingsCard title={t("Documents")}>
        {documents.isLoading ? (
          <Spinner label={t("Loading...")} />
        ) : !documents.data?.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("No documents yet. Add a supplier contract or a price list above.")}</p>
        ) : (
          <ul aria-label={t("Documents")} className="divide-y divide-slate-100 dark:divide-slate-800">
            {documents.data.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {doc.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {scopeLabel(doc)}
                    {doc.ledgerEntityName ? <span dir="auto"> · {doc.ledgerEntityName}</span> : null} · {doc.chunkCount} {t(doc.chunkCount === 1 ? "section" : "sections")} ·{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {doc.fileUrl ? (
                  <Button variant="ghost" size="icon" asChild>
                    <a href={resolveImageUrl(doc.fileUrl)!} target="_blank" rel="noopener noreferrer" aria-label={`${t("Open")}: ${doc.title}`} title={t("Open")}>
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleting(doc)}
                  aria-label={`${t("Delete")}: ${doc.title}`}
                  title={t("Delete")}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("Remove this document?")}
        description={t("The assistant will no longer find anything from it. This can't be undone.")}
        confirmLabel={t("Remove")}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
