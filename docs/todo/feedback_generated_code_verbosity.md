---
name: feedback-generated-code-verbosity
description: "For generated code in this monorepo, prioritize solidity/completeness over line-count compression — verbose generated output is fine"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fcd105ef-dfd6-48f9-a4bd-3519a8356db4
---

For generated code (scaffolders, codegen output, `.d.ts` sidecars, provider files in `packages/api-provider/providers/generated/**`, `_map.json` reflection dumps, etc.), do not try to keep the output terse. Verbose, fully-expanded, explicitly-typed generated files are preferred over compact loops or `...args: any[]` shortcuts.

**Why:** User stated explicitly that "the increased number of lines is not a problem in generated one as long the code is solid." Generated artifacts are read by tools, editors, and humans debugging — completeness, full type signatures, and explicit per-method functions give better DX (autocomplete, hover docs, diagnostic error messages) than minified output. This applies specifically to *generated* code; hand-authored code still follows the usual concision rules.

**How to apply:**
- `.d.ts` emission from the api-provider scaffolder → emit full per-method signatures with real parameter names parsed from the source API descriptor, not `(...args: any[]) => Promise<any>`.
- Provider files → keep one named function per endpoint method (current shape), don't compress into a generic dispatcher.
- Reflection/map JSON → include every derivable field (uid, file, export, methods, args, HTTP method, path, controller action) so downstream tooling never has to re-parse.
- Runtime guards (e.g. Proxy wrappers in `___core__.js`) → carry full allowlists and produce diagnostic error messages listing valid names on typos.
- Does **not** apply to hand-authored code — that still follows the project's normal concision conventions.

Related: [[project_strapi_api_pro_scope]], [[project_pos_strapi_contracts]].
