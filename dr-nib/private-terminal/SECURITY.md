# Confidential terminal boundary

The launcher is trusted, digest-pinned code inside the same confidential VM as
the research worker. It receives no wallet, AI, database or storage credentials.
Its only worker connection is a Unix socket volume. The outer container has no
network, a read-only root, bounded tmpfs, memory/CPU/PID limits, and no host or
Docker socket mounts. Research commands run as UID 1000 with empty capabilities,
no-new-privileges, separate namespaces, and gVisor's own syscall isolation.
Only public binaries, selected job files and a fresh temporary directory are
visible to a command. Shell code cannot access the launcher's application or
control socket. Small selected text artifacts persist through encrypted state.

`--directfs=false` keeps direct filesystem access out of the sentry and avoids
an identity UID mapping that needs additional host privileges. The trusted
launcher needs an outer AppArmor exception for namespace/mount setup and a
Docker seccomp profile with exactly one addition: `pivot_root` is allowed when
CAP_SYS_ADMIN is present. The profile retains Docker's default-deny policy;
seccomp is never disabled. The launcher has the explicit capabilities listed
in the measured compose; commands inside gVisor have none of them.

`seccomp.json` derives from Moby's Apache-2.0 profile at
https://github.com/moby/profiles/blob/main/seccomp/default.json, retrieved
19 October 2026. The license is in `seccomp.LICENSE`. The only modification is
the final SYS_ADMIN-scoped `pivot_root` rule. The complete modified profile is
pinned by SHA-256 in `../tools/private-terminal-release.mjs` and written to the
host by the measured pre-launch script before Compose starts. A profile change
or base pre-launch change requires explicit source review and new boot pins.

The terminal has no unrestricted Internet connection. Exact separately approved
public HTTP responses can seed a per-job HTTPS cache for curl/Python. All new
URLs, methods and request bodies fail closed. Payment authorization stays in
the separate budgeted payment tools. Terminal output is model-selected
computation, not independent source evidence. Operator-funded compute is
reported as unmetered; it is not a fabricated per-run Phala invoice.

The image build and local source contracts do not establish real Phala readiness.
The container acceptance suite and measured Phala/browser workflow must pass.
