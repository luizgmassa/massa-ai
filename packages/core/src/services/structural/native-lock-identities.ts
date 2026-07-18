/**
 * Canonical native grammar identity pins shared by the offline verifier
 * (`scripts/verify-tree-sitter-grammars.ts`) and the runtime load-time
 * integrity check (`grammar-integrity.ts`).
 *
 * Keep this module free of filesystem, crypto, and runtime-only imports so the
 * pinned data has exactly one owner and both the verifier script and the
 * structural runtime import from the same source of truth.
 *
 * ABI-rebuild safety: the runtime integrity basis is `sourceIntegrity`, a
 * sha512 over the installed package's ABI-independent source files
 * (`package.json`, root `grammar.js`, and `src/**`). The compiled `.node`
 * artifacts under `prebuilds/`, `build/`, and `bindings/node/build` are
 * intentionally excluded so a legitimate Bun/Node ABI rebuild cannot flip the
 * hash; only a change to the grammar source itself (a real version drift or
 * tampering) fails the check.
 */

export const TREE_SITTER_PATCH = Object.freeze({
  package: "tree-sitter@0.25.0",
  path: "patches/tree-sitter@0.25.0.patch",
  sha256: "e79aec7b96eb8114e85ebcb90f0a8b12076bcd8aa08c09bb88929621e1c1446d",
} as const);

export const NATIVE_DEPENDENCIES = {
  "@tree-sitter-grammars/tree-sitter-kotlin": "1.1.0",
  "@tree-sitter-grammars/tree-sitter-lua": "0.4.1",
  "@tree-sitter-grammars/tree-sitter-markdown": "0.3.2",
  "@tree-sitter-grammars/tree-sitter-yaml": "0.7.1",
  "@tree-sitter-grammars/tree-sitter-zig": "1.1.2",
  "tree-sitter": "0.25.0",
  "tree-sitter-c": "0.24.1",
  "tree-sitter-c-sharp": "0.23.5",
  "tree-sitter-clojure-orchard": "0.2.5",
  "tree-sitter-cpp": "0.23.4",
  "tree-sitter-dart": "github:UserNobody14/tree-sitter-dart#be07cf7118d3dba06236a3f19541685a68209934",
  "tree-sitter-elixir": "0.3.5",
  "tree-sitter-erlang": "github:WhatsApp/tree-sitter-erlang#836aa2b6c3af2c7cef3f84049b0ed6d44485a870",
  "tree-sitter-go": "0.25.0",
  "tree-sitter-haskell": "0.23.1",
  "tree-sitter-html": "0.23.2",
  "tree-sitter-java": "0.23.5",
  "tree-sitter-javascript": "0.25.0",
  "tree-sitter-json": "0.24.8",
  "tree-sitter-ocaml": "0.24.2",
  "tree-sitter-php": "0.24.2",
  "tree-sitter-python": "0.25.0",
  "tree-sitter-ruby": "0.23.1",
  "tree-sitter-rust": "0.24.0",
  "tree-sitter-scala": "0.24.0",
  "tree-sitter-swift": "0.7.1",
  "tree-sitter-typescript": "0.23.2",
} as const;

/**
 * Per-grammar pinned identity.
 *
 * - `resolved` / `sri` / `gitIdentity`: frozen fields mirrored from
 *   `bun.lock`. Asserted by the offline verifier so lockfile drift is caught
 *   before publish.
 * - `sourceIntegrity`: sha512 over the ABI-independent installed package
 *   source (`package.json` + root `grammar.js` + `src/**`). Asserted at
 *   runtime load so a tampered or wrong-version grammar fails loud at parser
 *   init. This basis survives legitimate Bun/Node native rebuilds because the
 *   compiled `.node` artifacts are excluded.
 */
export interface NativeLockIdentity {
  resolved: string;
  /** sha512 SRI recorded in bun.lock (registry packages only). */
  sri?: `sha512-${string}`;
  /** bun.lock git identity token (git deps only). */
  gitIdentity?: string;
  /** sha512 over the installed package source; ABI-rebuild-stable. */
  sourceIntegrity: `sha512-${string}`;
}

export const NATIVE_LOCK_IDENTITIES: Record<
  keyof typeof NATIVE_DEPENDENCIES,
  NativeLockIdentity
> = {
  "@tree-sitter-grammars/tree-sitter-kotlin": {
    resolved: "@tree-sitter-grammars/tree-sitter-kotlin@1.1.0",
    sri: "sha512-vlVXaxEE8t2kpJgfZpa8XVvxcnKw9AYtRTgy7KWjsDmAsadk06RxAT80IXOgGQnmM9i/orQn1nD84gPNUHu6DQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-TvnLKtoe1ADOLljHufwXbjtJpAOdW+p6BhSZDHBQYFIX3uoeMx3v0ta1CI2ShSuTSHrF17xINpVcd0ZeSg+ETA==" as `sha512-${string}`,
  },
  "@tree-sitter-grammars/tree-sitter-lua": {
    resolved: "@tree-sitter-grammars/tree-sitter-lua@0.4.1",
    sri: "sha512-EwagFaU6ZveVk18/Y8qUhZkkiBKnQ7dSCHbm//TUroLVKy3i1rOYGy/cNHtSkAb1eDvS1HhCLybH2S541Cya/g==" as `sha512-${string}`,
    sourceIntegrity: "sha512-JZV4+hyBcF5yF6K+fQGaiibgz5v1O4VhQYypEoor9NStjKxNTC4zmHXm3ZyqgwXrR+JsbLzk1haiVW+QUkB++g==" as `sha512-${string}`,
  },
  "@tree-sitter-grammars/tree-sitter-markdown": {
    resolved: "@tree-sitter-grammars/tree-sitter-markdown@0.3.2",
    sri: "sha512-hQXCcDVvg2t4E8cn7zz6jjIBerzk9E9ZlHxJp5IrUOpY4s1YVpXJbMeWZks2/V7lmkPRnnkM8IrTbQ5ltwEOnA==" as `sha512-${string}`,
    sourceIntegrity: "sha512-Np1hV4aWXhgplr2Gu1imYtXA/uxWfbXnLiCB4iZ6QS61IOaYtMts8ae8CbecdY0s9AuMlntqKazB8LKIElsq6g==" as `sha512-${string}`,
  },
  "@tree-sitter-grammars/tree-sitter-yaml": {
    resolved: "@tree-sitter-grammars/tree-sitter-yaml@0.7.1",
    sri: "sha512-AynBwkIoQCTgjDR33bDUp9Mqq+YTco0is3n5hRApMqG9of/6A4eQsfC1/uSEeHSUyMQSYawcAWamsexnVpIP4Q==" as `sha512-${string}`,
    sourceIntegrity: "sha512-GpLXgnJq8NziRqAbm8BzHCK/1qaOnj675z3bRxK6X8FbnrUnBzUDeIt++bq6CEvhbsBt5/Jet2W2LRPDcJc4yQ==" as `sha512-${string}`,
  },
  "@tree-sitter-grammars/tree-sitter-zig": {
    resolved: "@tree-sitter-grammars/tree-sitter-zig@1.1.2",
    sri: "sha512-J0L31HZ2isy3F5zb2g5QWQOv2r/pbruQNL9ADhuQv2pn5BQOzxt80WcEJaYXBeuJ8GHxVT42slpCna8k1c8LOw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-CJiu42fWL+cvrzdmVuYiV/qOJrZaLKneIIb9bKamGtb+IYQnanGaNBNnEi+JtlW6CvUkLJ8B9NaQYJOrmx1Yvg==" as `sha512-${string}`,
  },
  "tree-sitter": {
    resolved: "tree-sitter@0.25.0",
    sri: "sha512-PGZZzFW63eElZJDe/b/R/LbsjDDYJa5UEjLZJB59RQsMX+fo0j54fqBPn1MGKav/QNa0JR0zBiVaikYDWCj5KQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-dUm5bDgJETEMVMtAUPyBm8gz30K2RT8GJV9cu/2iF6snKW8mtS2oCLEiBKq9xqtHl/iiOOgfzu1BGWZ39Us4bw==" as `sha512-${string}`,
  },
  "tree-sitter-c": {
    resolved: "tree-sitter-c@0.24.1",
    sri: "sha512-lkYwWN3SRecpvaeqmFKkuPNR3ZbtnvHU+4XAEEkJdrp3JfSp2pBrhXOtvfsENUneye76g889Y0ddF2DM0gEDpA==" as `sha512-${string}`,
    sourceIntegrity: "sha512-hKT8TxIgML0Yc2NYIvCipU0vcwkD2NGHSMhpUvxuXskovoHKc/gEN8Pj76k0jcCllRBeEKT854gMd/bwBA/p4Q==" as `sha512-${string}`,
  },
  "tree-sitter-c-sharp": {
    resolved: "tree-sitter-c-sharp@0.23.5",
    sri: "sha512-xJGOeXPMmld0nES5+080N/06yY6LQi+KWGWV4LfZaZe6srJPtUtfhIbRSN7EZN6IaauzW28v6W4QHFwmeUW6HQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-bm2VaW3ckRz9ghTEka7q7se4jgYtDSev6YaTVs8JwT+QOInkpiFpRhgKM7DWCvsXOY+YLDSevMTrCXL/KsSIKQ==" as `sha512-${string}`,
  },
  "tree-sitter-clojure-orchard": {
    resolved: "tree-sitter-clojure-orchard@0.2.5",
    sri: "sha512-X+JaSnqY9hNYDA/hsQ40My47qoG+J26y11VAZ4YUzH3u8ggs+b9sFRQuxE6pNnlgwqWtJUycxnB0cOomtOIvAw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-B5tgKfWIsWd2nPTS6kDBg7F38zAv9833qcPzXKd2nMQ3mr9E+xfZ1sbEOYOn/lWjzQJP9mSh3Ai1Ud9wzcqZbA==" as `sha512-${string}`,
  },
  "tree-sitter-cpp": {
    resolved: "tree-sitter-cpp@0.23.4",
    sri: "sha512-qR5qUDyhZ5jJ6V8/umiBxokRbe89bCGmcq/dk94wI4kN86qfdV8k0GHIUEKaqWgcu42wKal5E97LKpLeVW8sKw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-DWHKvc7tze4NMM+aJSMCECv5sKvOqK9346ljeQVl6Tc6dQTBSai5VkBaH6+QksTaK/GBxGOzLSLvI93v3W+ERA==" as `sha512-${string}`,
  },
  "tree-sitter-dart": {
    resolved: "tree-sitter-dart@github:UserNobody14/tree-sitter-dart#be07cf7",
    gitIdentity: "UserNobody14-tree-sitter-dart-be07cf7",
    sourceIntegrity: "sha512-8kUB+x7poKS1aS+yMAbQL8+vWq+IereTjcAA77fKHNq/lsAOdoOeXsX2JyWHQfk9tZCJVFN5Dt/hbD8BihAiZw==" as `sha512-${string}`,
  },
  "tree-sitter-elixir": {
    resolved: "tree-sitter-elixir@0.3.5",
    sri: "sha512-xozQMvYK0aSolcQZAx2d84Xe/YMWFuRPYFlLVxO01bM2GITh5jyiIp0TqPCQa8754UzRAI7A83hZmfiYub5TZQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-ZcnD5J31m+fCl/pVDXmAYsQL/J3d7Q1y7RRp+gNaWgVAgN1f8bMSs9t1oDCQhxkxXERVVKP3cmqyedSKY5okHA==" as `sha512-${string}`,
  },
  "tree-sitter-erlang": {
    resolved: "tree-sitter-erlang@github:WhatsApp/tree-sitter-erlang#836aa2b",
    gitIdentity: "WhatsApp-tree-sitter-erlang-836aa2b",
    sourceIntegrity: "sha512-Kv7J8TouuOzxrdRD83vNbPjhMC1wpVbsfWWtRqDU/PySDVI8EwuV6OjfQ5fTLZZ6eDBKVQHs2n1GQPaQPARNmw==" as `sha512-${string}`,
  },
  "tree-sitter-go": {
    resolved: "tree-sitter-go@0.25.0",
    sri: "sha512-APBc/Dq3xz/e35Xpkhb1blu5UgW+2E3RyGWawZSCNcbGwa7jhSQPS8KsUupuzBla8PCo8+lz9W/JDJjmfRa2tw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-SStrwJmN+tGdgfO5yTohmMuN5qTjOsvYWfFOdm3lefQpEu0j4mNP+yQv/VbXxmoWhRwG+FB4g/Es4HVU3YeaPA==" as `sha512-${string}`,
  },
  "tree-sitter-haskell": {
    resolved: "tree-sitter-haskell@0.23.1",
    sri: "sha512-qG4CYhejveu9DLMLEGBz/n9/TTeGSFLC6wniwOgG6m8/v7Dng8qR0ob0EVG7+XH+9WiOxohpGA23EhceWuxY4w==" as `sha512-${string}`,
    sourceIntegrity: "sha512-yyNNWjAVvKgj3ZuCfuhzpRYSfWkwasJ36eNtMrsYXwSZ6LWBiQzvBoR4Y+iqM8NoyGPYvpGkoVjiz2I5xXsbtA==" as `sha512-${string}`,
  },
  "tree-sitter-html": {
    resolved: "tree-sitter-html@0.23.2",
    sri: "sha512-TN+l+7cCeLx9db/1RhRSqMAZO/266Oh2BHb8J8hMSSFLuzYvFTYP/UnD3S0mny5awzw05KzFNgu2vnwzN9wVJg==" as `sha512-${string}`,
    sourceIntegrity: "sha512-tiBblp/EAaBuHhP8DhA9oVZGJkim6RPspQkh19BPR+d8WX0sdioL4WItc2RDQe8PBxtVRZpi1txl3Yd84tBDQg==" as `sha512-${string}`,
  },
  "tree-sitter-java": {
    resolved: "tree-sitter-java@0.23.5",
    sri: "sha512-Yju7oQ0Xx7GcUT01mUglPP+bYfvqjNCGdxqigTnew9nLGoII42PNVP3bHrYeMxswiCRM0yubWmN5qk+zsg0zMA==" as `sha512-${string}`,
    sourceIntegrity: "sha512-FCkFiXqyvIBdOHdo/liD2gg/NtnJvOW2SwbE6wp+4nUmKpiruAW20DOSq/nLPCF2abQdQnHvYKcX4+uNcDOxbQ==" as `sha512-${string}`,
  },
  "tree-sitter-javascript": {
    resolved: "tree-sitter-javascript@0.25.0",
    sri: "sha512-1fCbmzAskZkxcZzN41sFZ2br2iqTYP3tKls1b/HKGNPQUVOpsUxpmGxdN/wMqAk3jYZnYBR1dd/y/0avMeU7dw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-LAttNiBUFECGQ/d+lOTczdoQF07VOAXhWoTJq88ZCjGsMrFt9GpZDe18ERGpgW6iT5cI6+cZsBwu9mkSoBY6/A==" as `sha512-${string}`,
  },
  "tree-sitter-json": {
    resolved: "tree-sitter-json@0.24.8",
    sri: "sha512-Tc9ZZYwHyWZ3Tt1VEw7Pa2scu1YO7/d2BCBbKTx5hXwig3UfdQjsOPkPyLpDJOn/m1UBEWYAtSdGAwCSyagBqQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-7doz1LNnVoIzxrnAK3siRBE0MpIvS+vipXqIJSSj1Fh5LW/FZO55vRCu8sRWrazU0Dj2MjjQQ8veoYmFNsVXhA==" as `sha512-${string}`,
  },
  "tree-sitter-ocaml": {
    resolved: "tree-sitter-ocaml@0.24.2",
    sri: "sha512-H0RAeCepIyXyTPCQra6yMd7Bn5ZBYkIaddzdLNwVZpM9mCe2e8av+3O6Ojl7Z8YHrV/kYsfHvI2y+Hh7qzcYQQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-OTHuD87aafwG71eAp64fBaB4oKf1Z5fC9zhDo3tGKY7PzQh2n7gRHLnoFyJevAcikVPsI9CrekefIZjuflcROw==" as `sha512-${string}`,
  },
  "tree-sitter-php": {
    resolved: "tree-sitter-php@0.24.2",
    sri: "sha512-zwgAePc/HozNaWOOfwRAA+3p8yhuehRw8Fb7vn5qd2XjiIc93uJPryDTMYTSjBRjVIUg/KY6pM3rRzs8dSwKfw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-OZqmUAF8wVSNBjuEBZ+x8yE+3YBu7fdaMH2xPBrscq9NDGuQ7olM1LXGiUxCpUy3tZjkj/xaV+7vJrdUW/oqiQ==" as `sha512-${string}`,
  },
  "tree-sitter-python": {
    resolved: "tree-sitter-python@0.25.0",
    sri: "sha512-eCmJx6zQa35GxaCtQD+wXHOhYqBxEL+bp71W/s3fcDMu06MrtzkVXR437dRrCrbrDbyLuUDJpAgycs7ncngLXw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-rQtq2NOV1WgE+wSeeMQP5i9EIcCz/eOchf6OUn0kPCLAVc92U/n/tpgSjj7XFXBiPXM3OXHr6BiphIjcDzkTGQ==" as `sha512-${string}`,
  },
  "tree-sitter-ruby": {
    resolved: "tree-sitter-ruby@0.23.1",
    sri: "sha512-d9/RXgWjR6HanN7wTYhS5bpBQLz1VkH048Vm3CodPGyJVnamXMGb8oEhDypVCBq4QnHui9sTXuJBBP3WtCw5RA==" as `sha512-${string}`,
    sourceIntegrity: "sha512-5waH6SaHBtS+kdHNyDKD/1R/+QcEf60//1+38igZIoeAIpdqLStAqKfllYFqPWhMHk3jDeHicytNEZQ9tjxrQA==" as `sha512-${string}`,
  },
  "tree-sitter-rust": {
    resolved: "tree-sitter-rust@0.24.0",
    sri: "sha512-NWemUDf629Tfc90Y0Z55zuwPCAHkLxWnMf2RznYu4iBkkrQl2o/CHGB7Cr52TyN5F1DAx8FmUnDtCy9iUkXZEQ==" as `sha512-${string}`,
    sourceIntegrity: "sha512-Vkk40DHkyu+HfTJ7E/MuP0UFI+1bKzZWtIMDhvtCxvIuegon05ZG4SVA8S+EKznXp9goPqi1y7cbT6/XoLuVzA==" as `sha512-${string}`,
  },
  "tree-sitter-scala": {
    resolved: "tree-sitter-scala@0.24.0",
    sri: "sha512-vkMuAUrBZ1zZz2XcGDQk18Kz73JkpgaeXzbNVobPke0G35sd9jH32aUxG6OLRKM7et0TbsfqkWf4DeJoGk4K1g==" as `sha512-${string}`,
    sourceIntegrity: "sha512-aAR0VCFVGZTb4wNZxT3wSY/DIqGBAri6P/W4+l0hUm9lb5R121qA86ZBzhtM2WOlHjXCJoTB9B8DcaIWvt4opQ==" as `sha512-${string}`,
  },
  "tree-sitter-swift": {
    resolved: "tree-sitter-swift@0.7.1",
    sri: "sha512-pneKVTuGamaBsqqqfB9BvNQjktzh/0IVPR54jLB5Fq/JTDQwYHd0Wo6pVyZ5jAYpbztzq+rJ/rpL9ruxTmSoKw==" as `sha512-${string}`,
    sourceIntegrity: "sha512-+ecUvgXX/f5IuzKyr2GeCEkfvg/ZSz12z3UzsBZgbwPGp7C1BM/ANeX1rQdXsTEKxUNfeFAyh3KyK2cOogtBEw==" as `sha512-${string}`,
  },
  "tree-sitter-typescript": {
    resolved: "tree-sitter-typescript@0.23.2",
    sri: "sha512-e04JUUKxTT53/x3Uq1zIL45DoYKVfHH4CZqwgZhPg5qYROl5nQjV+85ruFzFGZxu+QeFVbRTPDRnqL9UbU4VeA==" as `sha512-${string}`,
    sourceIntegrity: "sha512-fW0nTaW2eLU+hG5GvVQbQ4S8lg4d7ksXt0Df8oBP2XvPZGkM5kGnjRn7gFg16PfHHp4Cae7+RC6UubvsIyhsIw==" as `sha512-${string}`,
  },
};

export const TRUSTED_NATIVE_PACKAGES = Object.freeze(
  Object.keys(NATIVE_DEPENDENCIES).sort(),
);

/** Count of pinned identities; used to guard drift against the dependency set. */
export const NATIVE_LOCK_IDENTITY_COUNT = TRUSTED_NATIVE_PACKAGES.length;
