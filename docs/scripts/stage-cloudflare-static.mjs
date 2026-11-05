import { writeFile } from "node:fs/promises";
await writeFile("out/_headers", `/og-image
  Content-Type: image/png
/llms.txt
  Content-Type: text/markdown; charset=utf-8
/sitemap.xml
  Content-Type: application/xml; charset=utf-8
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
`);
