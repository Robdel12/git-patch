# git-patch

Non-interactive hunk staging for LLMs. Stage, unstage, and discard git changes by hunk or line — no interactive prompts required.

Every visual git tool (magit, lazygit, Fork) does hunk staging via `git apply --cached`, but there's no standalone CLI for it. LLMs can't drive `git add -p` (interactive), so they're stuck with all-or-nothing `git add <file>`. This tool bridges that gap.

## Install

```bash
npm install -g git-patch
```

Or use directly with npx:

```bash
npx git-patch list
```

## Usage

### List hunks

```bash
git-patch list                    # Human-readable hunk list
git-patch list --summary          # One line per hunk (id + file/range + counts)
git-patch list --json             # Structured JSON output
git-patch list --json --summary   # Flat hunk summaries for scripts/LLMs
git-patch list --staged           # Show staged hunks
git-patch list -- src/main.rs     # Filter to specific files
```

Each hunk gets a sequential ID. Change lines within each hunk are numbered too — these are what you use for line-level selection.

### Stage hunks

```bash
git-patch stage 1                 # Stage hunk 1
git-patch stage 1,3,5             # Stage multiple hunks
git-patch stage 1-5               # Stage a range
git-patch stage 1:2-4             # Stage lines 2-4 of hunk 1
git-patch stage 1:3,5,8           # Stage specific lines of hunk 1
git-patch stage --all             # Stage everything
git-patch stage --matching "TODO" # Stage hunks matching a regex
```

### Unstage hunks

Same selectors, operates on staged diff:

```bash
git-patch unstage 2               # Unstage hunk 2
git-patch unstage --all           # Unstage everything
git-patch unstage --matching "fn" # Unstage hunks matching regex
```

### Discard changes

Removes changes from the working tree (destructive — requires `--yes`):

```bash
git-patch discard 3 --dry-run     # Preview what would be discarded
git-patch discard 3 --yes         # Actually discard hunk 3
git-patch discard --all --yes     # Discard all unstaged changes
```

### Status

```bash
git-patch status                  # Summary of staged/unstaged/untracked
git-patch status --json           # JSON output
```

## Selector syntax

| Selector | Meaning |
|----------|---------|
| `1` | Single hunk by ID |
| `1,3,5` | Multiple hunk IDs |
| `1-5` | Range of hunk IDs |
| `1-3,7,9` | Mixed range and individual IDs |
| `1:2-4` | Lines 2-4 within hunk 1 |
| `1:3,5,8` | Specific lines within hunk 1 |
| `--all` | Everything |
| `--matching "regex"` | Hunks where any change line matches |

Line indices are 1-based and count only change lines (`+`/`-`), not context lines. This matches what you see in `git-patch list` output.

## LLM workflow

```bash
# 1. See what changed
git-patch list --json

# 2. Stage related changes together
git-patch stage 1,3        # These two hunks are related
git commit -m "feat: add validation"

# 3. Stage the rest
git-patch stage --all
git commit -m "refactor: clean up helpers"
```

## How it works

Under the hood, git-patch:
1. Parses `git diff` output into structured hunks
2. Reconstructs valid unified diff patches for your selection
3. Pipes them to `git apply --cached` (stage), `git apply --cached --reverse` (unstage), or `git apply --reverse` (discard)

Zero dependencies — Node.js builtins only. Requires Node 22+.

## License

MIT
