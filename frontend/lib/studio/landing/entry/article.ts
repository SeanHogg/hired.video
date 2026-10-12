/** `?editArticle=<id>` — open one of the viewer's articles on the document canvas. */
import { articleService } from "@/lib/services/article-service";
import { articleToDocumentState } from "@/lib/studio/document/document-from-article";
import { documentEditEntry } from "./document";

export const articleEditEntry = documentEditEntry("article", async (id, { t }) => {
  const article = await articleService.getMine(id);
  return {
    name: article.title || t("labels.studioLanding.articleFallbackName"),
    documentState: articleToDocumentState(
      { id: article.id, title: article.title, bodyMd: article.bodyMd, bodyJson: article.bodyJson },
      () => crypto.randomUUID(),
    ),
  };
});
