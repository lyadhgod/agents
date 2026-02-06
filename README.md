# Agents

In the era of Agentic programming we often see agents building sphagetti code with less regards to maintainability. Even though the code works, debugging it becomes a nightmare during those repeated inifinite iterations of hallucinations where only adding a single `;` could fix the problem. Yes one can add their own custom *AGENTS.md* or *CLAUDE.md* file but often a times a lot of the guidances are common for a specific toolset. This repo is a collection of all such toolset based common agentic rules.

## Rule bundle generator

The [scripts/run.sh](scripts/run.sh) script scans a project tree, detects relevant file types, resolves rule dependencies, and emits bundled rule files by filename into a target directory.

### Usage

```sh
./scripts/run.sh gen [-s|--source <path>] [-o|--output <path>]
```

### Options

- `-s`, `--source <path>`: Project root to scan (default: current directory).
- `-o`, `--output <path>`: Output directory for bundles (default: source path).
- `-h`, `--help`: Show help.

### Example

```sh
./scripts/run.sh gen -s ../my-project -o ./bundles
```
