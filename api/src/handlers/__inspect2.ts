import { eq, and, ne, inArray, or, isNull, lte } from "drizzle-orm";
import { schema } from "../db/index.js";

const r = schema.resumeInformation;

function dump(label: string, cond: any) {
  console.log("===", label);
  console.log("chunks:");
  for (const c of cond.queryChunks) {
    const ctor = c?.constructor?.name;
    if (ctor === "StringChunk") {
      console.log("  Str:", JSON.stringify(c.value));
    } else if (ctor === "SQL") {
      console.log("  SQL (nested):");
      for (const cc of c.queryChunks) {
        const cctor = cc?.constructor?.name;
        if (cctor === "StringChunk") console.log("    Str:", JSON.stringify(cc.value));
        else if (cctor === "Param") console.log("    Param:", JSON.stringify(cc.value));
        else if (cc?.name !== undefined) console.log("    Col:", cc.name);
        else if (cctor === "SQL") {
          console.log("    SQL(nested2):");
          for (const ccc of cc.queryChunks) {
            const cctor2 = ccc?.constructor?.name;
            console.log("      ", cctor2, ccc?.value ?? ccc?.name);
          }
        }
        else console.log("    ??:", cctor, cc);
      }
    } else if (ctor === "Param") {
      console.log("  Param:", JSON.stringify(c.value));
    } else if (c?.name !== undefined) {
      console.log("  Col:", c.name);
    } else {
      console.log("  ??:", ctor, c);
    }
  }
}

dump("inArray(userId, [u1,u2])", inArray(r.userId, ["u1", "u2"]));
dump("lte(privacyLevel, 1)", lte(r.privacyLevel, 1));
dump("isNull(parentId)", isNull(r.parentId));
dump("and(eq,eq)", and(eq(r.userId, "u1"), eq(r.slug, "x")));
dump("or(eq,eq)", or(eq(r.userId, "u1"), eq(r.userId, "u2")));
