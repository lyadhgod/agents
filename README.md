# Agents

In the era of Agentic programming we often see agents building sphagetti code with less regards to maintainability. Even though the code works, debugging it becomes a nightmare during those repeated inifinite iterations of hallucinations where only adding a single `;` could fix the problem. Yes one can add their own custom *AGENTS.md* or *CLAUDE.md* file but often a times a lot of the guidances are common for a specific toolset. This repo is a collection of all such toolset based common agentic rules.

## Installation

### NPM

#### global machine cli

```sh
npm i -g @lyadh_god/lyag
lyag gen -s <source path> -o <output path>
```

#### npx

```sh
npx lyag gen -s <source path> -o <output path>
```

### Source

Clone this repo locally:

```sh
git clone https://github.com/lyadhgod/agents.git
```

and then run:

##### Shell

```sh
./agents/scripts/lyag.sh gen -s <source path> -o <output path>
```

##### Nodejs

```sh
./agents/scripts/lyag.js gen -s <source path> -o <output path>
```