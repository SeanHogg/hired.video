/** Postgres identifier quoting for the few places that build DDL/DML from
 *  registry data (table/column names are code constants, never user input —
 *  quoting still guards reserved words and mixed case). */
export const quoteIdent = (id: string): string => `"${id.replaceAll('"', '""')}"`;

/** `"schema"."table"` */
export const quoteQualified = (schemaName: string, table: string): string =>
  `${quoteIdent(schemaName)}.${quoteIdent(table)}`;
