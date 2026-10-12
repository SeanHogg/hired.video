/** shared/public-paths: the one builder for each entity's public page. */
import { describe, expect, it } from "vitest";
import {
  publicArticleByIdPath,
  publicArticlePath,
  publicCompanyPath,
  publicJobPath,
  publicProfilePath,
  publicResumePath,
  publicVideoPath,
} from "@shared/public-paths";

describe("public paths", () => {
  it("builds each entity's public route", () => {
    expect(publicVideoPath("maria-alvarez-reel")).toBe("/m/maria-alvarez-reel");
    expect(publicArticlePath("maria-alvarez", "how-i-landed-a-staff-role")).toBe("/articles/maria-alvarez/how-i-landed-a-staff-role");
    expect(publicArticleByIdPath("a1")).toBe("/articles/by-id/a1");
    expect(publicCompanyPath("acme")).toBe("/companies/acme");
    expect(publicJobPath("senior-designer")).toBe("/jobs/senior-designer");
    expect(publicProfilePath("maria-alvarez")).toBe("/people/maria-alvarez");
    expect(publicResumePath("r1")).toBe("/resumes/r1");
  });

  it("encodes each segment so a stray character can't change the route", () => {
    expect(publicVideoPath("a/b?c")).toBe("/m/a%2Fb%3Fc");
    expect(publicArticlePath("x y", "z#1")).toBe("/articles/x%20y/z%231");
  });
});
