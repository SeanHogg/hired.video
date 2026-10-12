/** /articles/by-id/:id resolves an article id to its public page (#2312). */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const getPublicPath = vi.hoisted(() => vi.fn<(id: string) => Promise<string | null>>());
vi.mock("@/lib/services/article-service", () => ({ articleService: { getPublicPath } }));

import ArticleByIdRedirect from "@/components/article/ArticleByIdRedirect";

function at(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/articles/by-id/${id}`]}>
      <Routes>
        <Route path="/articles/by-id/:id" element={<ArticleByIdRedirect />} />
        <Route path="/articles/:authorSlug/:slug" element={<p>article page</p>} />
        <Route path="/articles" element={<p>articles index</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ArticleByIdRedirect", () => {
  it("redirects to the published article's public page", async () => {
    getPublicPath.mockResolvedValueOnce("/articles/maria-alvarez/how-i-landed-a-staff-role");
    at("a1");
    expect(await screen.findByText("article page")).toBeTruthy();
    expect(getPublicPath).toHaveBeenCalledWith("a1");
  });

  it("lands on the articles index when the article isn't public", async () => {
    getPublicPath.mockResolvedValueOnce(null);
    at("draft-1");
    expect(await screen.findByText("articles index")).toBeTruthy();
  });
});
